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

/** A Beacon advisory as a notification (7.16 "advisories"). */
export function advisoryMessage(title: string, body: string) {
  return {
    kind: 'advisory' as const,
    title: title.slice(0, 80),
    body: body.slice(0, 240),
    tag: 'advisory',
    path: '#/lantern',
  };
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

type Outcome = 'sent' | 'gone' | 'retry';

async function sendOne(
  sub: PushSubscriptionJson,
  body: string,
  topic: string,
  vapid: Vapid,
): Promise<Outcome> {
  const webpush = (await import('web-push')).default;
  try {
    await webpush.sendNotification(sub, body, {
      vapidDetails: vapid,
      TTL: 3600,
      urgency: 'high',
      topic,
      timeout: 10_000,
    });
    return 'sent';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // Any permanent refusal from the push service (bad, unknown, expired or not ours);
    // only timeouts, 429 and 5xx are worth another try.
    return status !== undefined && status >= 400 && status < 500 && status !== 429
      ? 'gone'
      : 'retry';
  }
}

/**
 * A new subscription is confirmed with a real notification before it is stored, so
 * an address that cannot receive pushes (made up, expired, someone else's) is
 * refused by its own push service and never takes a place.
 */
export async function confirmSubscription(
  sub: PushSubscriptionJson,
  vapid: Vapid,
): Promise<'ok' | 'rejected' | 'error'> {
  const body = JSON.stringify({
    kind: 'info',
    title: 'Afterglow will tell you',
    body: 'You will get one notification when your area goes dark, and one when power comes back.',
    tag: 'follow-confirmed',
    path: '#/lantern',
  });
  const r = await sendOne(sub, body, 'follow-confirmed', vapid);
  return r === 'sent' ? 'ok' : r === 'gone' ? 'rejected' : 'error';
}

export const PAGE_SIZE = 500;

/**
 * Send to one page of a cell's followers. Large cells are covered by chained runs,
 * each with the next cursor, so no follower is ever cut off by a cap.
 */
export async function sendPage(
  store: import('./store.js').CrowdStore,
  cell: string,
  payload: { readonly tag: string; readonly title: string; readonly body: string },
  vapid: Vapid,
  nowS: number,
  cursor: string | null,
): Promise<{ sent: number; gone: number; failed: number; next: string | null }> {
  const { subs, next } = await store.subsPage(cell, nowS, cursor, PAGE_SIZE);
  let sent = 0;
  let gone = 0;
  let failed = 0;
  const body = JSON.stringify(payload);
  // A few at a time: the push services rate-limit bursts from one sender.
  for (let i = 0; i < subs.length; i += 20) {
    await Promise.all(
      subs.slice(i, i + 20).map(async ({ id, sub }) => {
        const r = await sendOne(JSON.parse(sub) as PushSubscriptionJson, body, payload.tag, vapid);
        if (r === 'sent') sent++;
        else if (r === 'gone') {
          await store.deleteSub(cell, id);
          gone++;
        } else failed++;
      }),
    );
  }
  return { sent, gone, failed, next };
}
