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

/** Who is asking: the token's issue time (seconds) and the Cognito session it belongs to. */
export interface Caller {
  readonly iat: number;
  /** `origin_jti`: stays the same across refreshes of one sign-in; empty when absent. */
  readonly origin: string;
}

/**
 * An account's revocation (CA-13): tokens issued before `notBefore` are refused; in the
 * boundary second itself only the session that revoked (`exceptOrigin`) is let through.
 */
export interface Revocation {
  readonly notBefore: number;
  readonly exceptOrigin: string;
}

export function allowed(rev: Revocation | null, c: Caller): boolean {
  if (rev === null || c.iat > rev.notBefore) return true;
  return c.iat === rev.notBefore && rev.exceptOrigin !== '' && c.origin === rev.exceptOrigin;
}

export type PutResult =
  | { readonly kind: 'stored'; readonly version: number }
  | { readonly kind: 'conflict'; readonly current: number | null }
  | { readonly kind: 'revoked' };

/**
 * Storage keyed by account id. Every write checks the caller against the account's
 * revocation in the same atomic step (CA-13), so a revocation can never land between a
 * check and a write; `put` is also atomic on the version (CA-04).
 */
export interface VaultStore {
  get(accountId: string): Promise<StoredVault | null>;
  getRevocation(accountId: string): Promise<Revocation | null>;
  put(
    accountId: string,
    record: string,
    expected: number | null,
    now: number,
    caller: Caller,
  ): Promise<PutResult>;
  /** Refuse every existing token, then delete the vault, atomically, if the caller is allowed. */
  delete(accountId: string, caller: Caller, nowSeconds: number): Promise<'deleted' | 'revoked'>;
  /** Refuse tokens older than the caller's session, atomically, if the caller is allowed. */
  revoke(accountId: string, caller: Caller): Promise<'done' | 'revoked'>;
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
  // CA-13: API Gateway checks signature and expiry, not revocation. The caller's issue
  // time and session are checked here, and again atomically inside every write.
  const iat = Number(claims?.iat);
  if (!Number.isInteger(iat) || iat <= 0) return error(401, 'Sign in again.');
  const origin = typeof claims?.origin_jti === 'string' ? claims.origin_jti : '';
  const caller: Caller = { iat, origin };

  try {
    if (!allowed(await store.getRevocation(accountId), caller)) return error(401, 'Sign in again.');
    switch (req.routeKey) {
      case 'GET /v1/vault': {
        const v = await store.get(accountId);
        if (v === null) return error(404, 'No vault yet.');
        return json(200, { record: v.record, version: v.version, updatedAt: v.updatedAt });
      }
      case 'PUT /v1/vault': {
        const put = parsePut(req.body);
        if (put === null) return error(400, 'That is not a vault record.');
        const r = await store.put(accountId, put.record, put.expected, config.now(), caller);
        if (r.kind === 'revoked') return error(401, 'Sign in again.');
        return r.kind === 'stored'
          ? json(200, { version: r.version })
          : json(409, { version: r.current });
      }
      case 'DELETE /v1/vault': {
        // Every token that exists now is refused, in the same step as the delete, so none
        // can recreate the vault after it.
        const r = await store.delete(accountId, caller, Math.floor(config.now() / 1000));
        return r === 'revoked' ? error(401, 'Sign in again.') : { status: 204, body: null };
      }
      case 'POST /v1/vault/revoke': {
        // After a passphrase change: tokens older than this caller's session are refused.
        const r = await store.revoke(accountId, caller);
        return r === 'revoked' ? error(401, 'Sign in again.') : { status: 204, body: null };
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
  const rev = new Map<string, Revocation>();
  return {
    async get(id) {
      return m.get(id) ?? null;
    },
    async getRevocation(id) {
      return rev.get(id) ?? null;
    },
    async put(id, record, expected, now, caller) {
      if (!allowed(rev.get(id) ?? null, caller)) return { kind: 'revoked' };
      const curVersion = m.get(id)?.version ?? null;
      if (curVersion !== expected) return { kind: 'conflict', current: curVersion };
      const version = (curVersion ?? 0) + 1;
      m.set(id, { record, version, updatedAt: now });
      return { kind: 'stored', version };
    },
    async delete(id, caller, nowSeconds) {
      if (!allowed(rev.get(id) ?? null, caller)) return 'revoked';
      rev.set(id, { notBefore: nowSeconds + 1, exceptOrigin: '' });
      m.delete(id);
      return 'deleted';
    },
    async revoke(id, caller) {
      if (!allowed(rev.get(id) ?? null, caller)) return 'revoked';
      rev.set(id, { notBefore: caller.iat, exceptOrigin: caller.origin });
      return 'done';
    },
    dump: () => m,
  };
}
