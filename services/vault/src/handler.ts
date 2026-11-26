import { isVaultRecord } from './envelope.js';

/**
 * The vault API as a pure function of a request, the verified claims and a store
 * (`.kiro/specs/cloud-accounts`, CA-01..CA-06).
 *
 *   GET    /v1/vault   -> 200 { record, version, updatedAt } | 404
 *   PUT    /v1/vault   -> 200 { version } | 409 { version } | 400
 *   DELETE /v1/vault   -> 204
 *
 * The account id is the verified `sub` and nothing else: no route, query or body
 * field can name an account, so no request can reach another person's record.
 */

export interface StoredVault {
  readonly record: string;
  readonly version: number;
  readonly updatedAt: number;
}

export type PutResult =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly current: number | null };

/** Storage keyed by account id. Implementations must make `put` atomic on the version (CA-04). */
export interface VaultStore {
  get(accountId: string): Promise<StoredVault | null>;
  put(accountId: string, record: string, expected: number | null, now: number): Promise<PutResult>;
  delete(accountId: string): Promise<void>;
}

/** Claims from API Gateway's JWT authorizer. Values arrive as strings. */
export type Claims = Readonly<Record<string, unknown>> | null | undefined;

export interface VaultRequest {
  /** API Gateway's route key, for example "GET /v1/vault". */
  readonly routeKey: string;
  readonly body: string | null;
}

export interface VaultResponse {
  readonly status: number;
  readonly body: string | null;
}

export interface HandlerConfig {
  /** The Cognito app client the token must have been issued to. */
  readonly clientId: string;
  readonly now: () => number;
}

const json = (status: number, value: unknown): VaultResponse => ({
  status,
  body: JSON.stringify(value),
});
const error = (status: number, message: string): VaultResponse => json(status, { message });

/** The account id from verified claims, or null when any condition fails (CA-01). */
export function accountIdFrom(claims: Claims, clientId: string): string | null {
  if (!claims || typeof claims !== 'object') return null;
  const sub = claims.sub;
  if (typeof sub !== 'string' || !/^[0-9a-f-]{36}$/i.test(sub)) return null;
  if (claims.token_use !== 'access') return null;
  if (claims.client_id !== clientId || clientId === '') return null;
  return sub.toLowerCase();
}

function parsePut(body: string | null): { record: string; expected: number | null } | null {
  if (body === null) return null;
  let x: unknown;
  try {
    x = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if (Object.keys(o).some((k) => k !== 'record' && k !== 'expectedVersion')) return null;
  const e = o.expectedVersion;
  const expected =
    e === null ? null : typeof e === 'number' && Number.isInteger(e) && e >= 1 ? e : undefined;
  if (expected === undefined || !isVaultRecord(o.record)) return null;
  return { record: o.record, expected };
}

export async function handle(
  req: VaultRequest,
  claims: Claims,
  store: VaultStore,
  config: HandlerConfig,
): Promise<VaultResponse> {
  const accountId = accountIdFrom(claims, config.clientId);
  if (accountId === null) return error(401, 'Sign in again.');

  try {
    switch (req.routeKey) {
      case 'GET /v1/vault': {
        const v = await store.get(accountId);
        if (v === null) return error(404, 'No vault yet.');
        return json(200, { record: v.record, version: v.version, updatedAt: v.updatedAt });
      }
      case 'PUT /v1/vault': {
        const put = parsePut(req.body);
        if (put === null) return error(400, 'That is not a vault record.');
        const r = await store.put(accountId, put.record, put.expected, config.now());
        return r.ok ? json(200, { version: r.version }) : json(409, { version: r.current });
      }
      case 'DELETE /v1/vault': {
        await store.delete(accountId);
        return { status: 204, body: null };
      }
      default:
        return error(404, 'Not found.');
    }
  } catch {
    // CA-06: never a partial answer, never the reason.
    return error(
      503,
      'The vault is unavailable. Your data is safe on your device; try again later.',
    );
  }
}

/** An in-memory store with the same contract as the DynamoDB one; used in tests. */
export function memoryStore(): VaultStore & { dump(): ReadonlyMap<string, StoredVault> } {
  const m = new Map<string, StoredVault>();
  return {
    async get(id) {
      return m.get(id) ?? null;
    },
    async put(id, record, expected, now) {
      const cur = m.get(id) ?? null;
      const curVersion = cur?.version ?? null;
      if (curVersion !== expected) return { ok: false, current: curVersion };
      const version = (curVersion ?? 0) + 1;
      m.set(id, { record, version, updatedAt: now });
      return { ok: true, version };
    },
    async delete(id) {
      m.delete(id);
    },
    dump: () => m,
  };
}
