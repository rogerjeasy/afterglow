import { randomUUID } from 'node:crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { handleConsole } from './handler.js';
import { dynamoConsoleStore } from './store.js';

/**
 * Lambda entry for the consoles (payload 2.0 behind a Cognito JWT authorizer). Logs
 * carry the route, status and duration only: never a body, a site or an account.
 */
const lambda = new LambdaClient({});
const store = dynamoConsoleStore({
  business: process.env.BUSINESS_TABLE ?? '',
  sites: process.env.SITES_TABLE ?? '',
  advisories: process.env.ADVISORIES_TABLE ?? '',
});

interface HttpEvent {
  readonly routeKey?: string;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly pathParameters?: Record<string, string | undefined> | null;
  readonly queryStringParameters?: Record<string, string | undefined> | null;
  readonly requestContext?: {
    readonly authorizer?: { readonly jwt?: { readonly claims?: Record<string, unknown> } };
  };
}

function claimsOf(event: HttpEvent) {
  const c = event.requestContext?.authorizer?.jwt?.claims;
  const sub = typeof c?.sub === 'string' ? c.sub : '';
  if (!sub) return null;
  // API Gateway passes a list claim as "[a b]" text.
  const raw = c?.['cognito:groups'];
  const groups = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw
          .replace(/^\[|\]$/g, '')
          .split(/[\s,]+/)
          .filter(Boolean)
      : [];
  return { sub, groups };
}

export async function handler(event: HttpEvent) {
  const started = Date.now();
  const routeKey = event.routeKey ?? '';
  const body =
    event.body === undefined || event.body === null
      ? null
      : event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString('utf8')
        : event.body;
  const res = await handleConsole(
    {
      routeKey,
      siteId: event.pathParameters?.siteId ?? null,
      query: event.queryStringParameters ?? {},
      body,
      claims: claimsOf(event),
    },
    {
      store,
      nowMs: () => Date.now(),
      newId: () => randomUUID(),
      notifyAdvisory: async (cell, title, text) => {
        await lambda.send(
          new InvokeCommand({
            FunctionName: process.env.PUBLIC_FUNCTION ?? '',
            InvocationType: 'Event',
            Payload: new TextEncoder().encode(
              JSON.stringify({
                notifyCell: cell,
                kind: 'advisory',
                advTitle: title,
                advBody: text,
              }),
            ),
          }),
        );
      },
    },
  );
  console.log(JSON.stringify({ route: routeKey, status: res.status, ms: Date.now() - started }));
  return {
    statusCode: res.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: res.body,
  };
}
