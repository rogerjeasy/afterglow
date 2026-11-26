import { createHash } from 'node:crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { handlePublic, warmPlacesNow } from './handler.js';
import { type Vapid, confirmSubscription, message, sendPage } from './push.js';
import { dynamoCrowdStore } from './store.js';

/**
 * Lambda entry for the public HTTP API (payload 2.0). Logs carry the route, status
 * and duration only: no body, no query (which holds a cell), no address.
 */

const lambda = new LambdaClient({});
const self = process.env.AWS_LAMBDA_FUNCTION_NAME ?? '';
const deps = {
  store: null as unknown as ReturnType<typeof dynamoCrowdStore>,
  confirmPush: async (sub: import('./push.js').PushSubscriptionJson) => {
    const vapid = await loadVapid();
    return vapid ? confirmSubscription(sub, vapid) : ('error' as const);
  },
  /** Invoke this same function asynchronously to send a cell's notifications. */
  notifyCell: async (cell: string, kind: 'outage' | 'restoration', deviceCount: number) => {
    await lambda.send(
      new InvokeCommand({
        FunctionName: self,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify({ notifyCell: cell, kind, deviceCount })),
      }),
    );
  },
  nowMs: () => Date.now(),
  /** Invoke this same function asynchronously to fetch places off the request path. */
  warmPlaces: async (cell: string) => {
    await lambda.send(
      new InvokeCommand({
        FunctionName: self,
        InvocationType: 'Event',
        Payload: new TextEncoder().encode(JSON.stringify({ warmPlaces: cell })),
      }),
    );
  },
};

interface HttpEvent {
  /** Set only on the asynchronous self-invocation that warms a cell's places. */
  readonly warmPlaces?: string;
  /** Set only on the asynchronous self-invocation that notifies a cell's followers. */
  readonly notifyCell?: string;
  readonly kind?: 'outage' | 'restoration';
  readonly deviceCount?: number;
  /** Where the next page of followers starts, for large cells; and how many runs so far. */
  readonly cursor?: string | null;
  readonly hop?: number;
  readonly routeKey?: string;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
  readonly requestContext?: { readonly http?: { readonly sourceIp?: string } };
}

/**
 * A coarse requester bucket for fair rate limits: 16 bits of the source address's
 * hash. Thousands of addresses share each bucket, so it cannot identify anyone; it
 * is never logged and lives two minutes in the cache table.
 */
function requesterBucket(ip: string | undefined): string {
  if (!ip) return 'none';
  return createHash('sha256').update(`afterglow-bucket:${ip}`).digest('hex').slice(0, 4);
}

const store = dynamoCrowdStore({
  reports: process.env.REPORTS_TABLE ?? '',
  device: process.env.DEVICE_TABLE ?? '',
  cache: process.env.CACHE_TABLE ?? '',
  push: process.env.PUSH_TABLE ?? '',
});
deps.store = store;

/** The VAPID key pair from Parameter Store (a SecureString), read once per container. */
const ssm = new SSMClient({});
let vapidCache: Vapid | null = null;
async function loadVapid(): Promise<Vapid | null> {
  if (vapidCache) return vapidCache;
  const name = process.env.VAPID_PARAM;
  if (!name) return null;
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    const v = JSON.parse(out.Parameter?.Value ?? 'null') as {
      publicKey?: string;
      privateKey?: string;
    } | null;
    if (!v?.publicKey || !v.privateKey) return null;
    vapidCache = {
      publicKey: v.publicKey,
      privateKey: v.privateKey,
      subject: process.env.VAPID_SUBJECT ?? 'https://afterglow-flax.vercel.app',
    };
    return vapidCache;
  } catch {
    return null;
  }
}

export async function handler(event: HttpEvent) {
  const started = Date.now();
  if (
    typeof event.notifyCell === 'string' &&
    (event.kind === 'outage' || event.kind === 'restoration')
  ) {
    const vapid = await loadVapid();
    if (!vapid) {
      console.log(JSON.stringify({ route: 'notify', error: 'no VAPID key' }));
      return { ok: false };
    }
    const hop = Math.max(0, Math.floor(event.hop ?? 0));
    const deviceCount = Math.max(0, Math.floor(event.deviceCount ?? 0));
    const r = await sendPage(
      store,
      event.notifyCell,
      message(event.kind, deviceCount),
      vapid,
      Math.floor(Date.now() / 1000),
      typeof event.cursor === 'string' ? event.cursor : null,
    );
    // The next page in a fresh run (bounded, in case of a loop: 200 pages is 100 000 followers).
    if (r.next && hop < 200) {
      await lambda.send(
        new InvokeCommand({
          FunctionName: self,
          InvocationType: 'Event',
          Payload: new TextEncoder().encode(
            JSON.stringify({
              notifyCell: event.notifyCell,
              kind: event.kind,
              deviceCount,
              cursor: r.next,
              hop: hop + 1,
            }),
          ),
        }),
      );
    }
    // Counts only: never the cell or an endpoint.
    console.log(
      JSON.stringify({
        route: 'notify',
        kind: event.kind,
        sent: r.sent,
        gone: r.gone,
        failed: r.failed,
        more: r.next !== null,
        hop,
        ms: Date.now() - started,
      }),
    );
    return { ok: true };
  }
  if (typeof event.warmPlaces === 'string') {
    const ok = await warmPlacesNow(event.warmPlaces, deps);
    console.log(JSON.stringify({ route: 'warm places', ok, ms: Date.now() - started }));
    return { ok };
  }
  const routeKey = event.routeKey ?? '';
  const body =
    event.body === undefined || event.body === null
      ? null
      : event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
  const res = await handlePublic(
    {
      routeKey,
      query: event.queryStringParameters ?? {},
      body,
      requester: requesterBucket(event.requestContext?.http?.sourceIp),
    },
    deps,
  );
  console.log(JSON.stringify({ route: routeKey, status: res.status, ms: Date.now() - started }));
  return {
    statusCode: res.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': res.maxAge > 0 ? `public, max-age=${res.maxAge}` : 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: res.body,
  };
}
