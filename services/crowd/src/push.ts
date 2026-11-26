/**
 * Web Push for crowd changes (product description 7.13 "channels: push"): a phone
 * may follow up to 3 cells; when the crowd in a followed cell goes dark, or power
 * comes back after it was dark, each follower gets one notification.
 *
 * - Endpoints are accepted only at the browsers' own push services, so a
 *   subscription can never make this server call an arbitrary address.
 * - A subscription is stored under each cell it follows, for 30 days, and renewed
 *   when the app opens; the stored record is the endpoint and its two keys, nothing else.
 * - Payloads are encrypted for the browser (RFC 8291) by web-push, signed with the
 *   VAPID key that lives in Parameter Store, never in code or Terraform state.
 */

export interface PushSubscriptionJson {
  readonly endpoint: string;
  readonly keys: { readonly p256dh: string; readonly auth: string };
}

const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];
const B64URL = /^[A-Za-z0-9_-]+$/;

export function parseSubscription(raw: unknown): PushSubscriptionJson | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const endpoint = o.endpoint;
  const keys = o.keys as Record<string, unknown> | undefined;
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return null;
  if (!PUSH_HOSTS.some((h) => h.test(url.hostname))) return null;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (
    typeof p256dh !== 'string' ||
    !B64URL.test(p256dh) ||
    p256dh.length < 80 ||
    p256dh.length > 100
  )
    return null;
  if (typeof auth !== 'string' || !B64URL.test(auth) || auth.length < 16 || auth.length > 32)
    return null;
  return { endpoint: url.href, keys: { p256dh, auth } };
}

export type Transition = 'outage' | 'restoration' | null;

/** Which notification, if any, a change of the published state calls for. */
export function transition(last: string | null, next: string): Transition {
  if (next === 'dark' && last !== 'dark') return 'outage';
  if ((next === 'comingBack' || next === 'lit') && last === 'dark') return 'restoration';
  return null;
}

export function message(kind: 'outage' | 'restoration', deviceCount: number) {
  return kind === 'outage'
    ? {
        kind,
        title: 'Power out in your area',
        body: `${deviceCount} phones in your area report no mains power. Open Afterglow to start the clocks.`,
        tag: 'crowd-outage',
        path: '#/lantern',
      }
    : {
        kind,
        title: 'Power coming back in your area',
        body: `${deviceCount} phones in your area are charging again.`,
        tag: 'crowd-restoration',
        path: '#/lantern',
      };
}

export interface Vapid {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
}

/** Send one notification to every follower of a cell; forget subscriptions the browser dropped. */
export async function sendToCell(
  store: import('./store.js').CrowdStore,
  cell: string,
  payload: ReturnType<typeof message>,
  vapid: Vapid,
  nowS: number,
  deadlineMs = Date.now() + 80_000,
): Promise<{ sent: number; gone: number; failed: number; unsent: number }> {
  const webpush = (await import('web-push')).default;
  const subs = await store.subsFor(cell, nowS);
  let sent = 0;
  let gone = 0;
  let failed = 0;
  const body = JSON.stringify(payload);
  // A few at a time: the push services rate-limit bursts from one sender.
  for (let i = 0; i < subs.length; i += 20) {
    if (Date.now() > deadlineMs) {
      // Out of time: say how many were not reached, never cut the list quietly.
      return { sent, gone, failed, unsent: subs.length - i };
    }
    await Promise.all(
      subs.slice(i, i + 20).map(async ({ id, sub }) => {
        try {
          await webpush.sendNotification(JSON.parse(sub) as PushSubscriptionJson, body, {
            vapidDetails: vapid,
            TTL: 3600,
            urgency: 'high',
            topic: payload.tag,
            timeout: 10_000,
          });
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // Any permanent refusal from the push service (bad, unknown, expired or not ours)
          // removes the subscription; only timeouts and 429/5xx keep it for next time.
          if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
            await store.deleteSub(cell, id);
            gone++;
          } else failed++;
        }
      }),
    );
  }
  return { sent, gone, failed, unsent: 0 };
}
