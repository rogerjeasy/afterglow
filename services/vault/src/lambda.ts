import { dynamoStore } from './dynamo.js';
import { type Claims, handle } from './handler.js';

/**
 * Lambda entry for API Gateway HTTP API (payload format 2.0) with a JWT authorizer.
 * Logs carry the route, status and duration only: never a body, a token or an
 * account id (CA-03).
 */

interface HttpEvent {
  readonly routeKey?: string;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestContext?: {
    readonly authorizer?: { readonly jwt?: { readonly claims?: Claims } };
  };
}

const tableName = process.env.TABLE_NAME ?? '';
const clientId = process.env.CLIENT_ID ?? '';
const store = dynamoStore(tableName);

export async function handler(event: HttpEvent) {
  const started = Date.now();
  const routeKey = event.routeKey ?? '';
  const body =
    event.body === undefined || event.body === null
      ? null
      : event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
  const res = await handle(
    { routeKey, body },
    event.requestContext?.authorizer?.jwt?.claims,
    store,
    { clientId, now: () => Date.now() },
  );
  console.log(JSON.stringify({ route: routeKey, status: res.status, ms: Date.now() - started }));
  return {
    statusCode: res.status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    ...(res.body === null ? {} : { body: res.body }),
  };
}
