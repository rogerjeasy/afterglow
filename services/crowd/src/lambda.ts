import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { handlePublic, warmPlacesNow } from './handler.js';
import { dynamoCrowdStore } from './store.js';

/**
 * Lambda entry for the public HTTP API (payload 2.0). Logs carry the route, status
 * and duration only: no body, no query (which holds a cell), no address.
 */

const lambda = new LambdaClient({});
const self = process.env.AWS_LAMBDA_FUNCTION_NAME ?? '';
const deps = {
  store: null as unknown as ReturnType<typeof dynamoCrowdStore>,
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
  readonly routeKey?: string;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
}

const store = dynamoCrowdStore({
  reports: process.env.REPORTS_TABLE ?? '',
  device: process.env.DEVICE_TABLE ?? '',
  cache: process.env.CACHE_TABLE ?? '',
});
deps.store = store;

export async function handler(event: HttpEvent) {
  const started = Date.now();
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
    { routeKey, query: event.queryStringParameters ?? {}, body },
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
