import { CloudError } from './auth';

/**
 * The vault API (services/vault). The request never names an account: the server
 * takes it from the token (CA-01). Bodies carry the encrypted record only (CA-03).
 */

export interface RemoteVault {
  readonly record: string;
  readonly version: number;
}

export type PutOutcome =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly version: number | null };

export interface VaultApi {
  get(token: string): Promise<RemoteVault | null>;
  put(token: string, record: string, expectedVersion: number | null): Promise<PutOutcome>;
  delete(token: string): Promise<void>;
}

async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new CloudError('network', 'No connection to the account service right now.');
  }
}

const statusError = (status: number): CloudError =>
  status === 401 || status === 403
    ? new CloudError('signed-out', 'Your session ended. Sign in again.')
    : status === 429
      ? new CloudError('limit', 'Too many requests. Trying again shortly.')
      : new CloudError(
          'unknown',
          'The account service could not do that. Your data is safe on this device.',
        );

export function fetchVaultApi(baseUrl: string): VaultApi {
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/vault`;
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  return {
    async get(token) {
      const r = await call(url, { method: 'GET', headers: auth(token) });
      if (r.status === 404) return null;
      if (!r.ok) throw statusError(r.status);
      const x = (await r.json()) as { record?: unknown; version?: unknown };
      if (typeof x.record !== 'string' || typeof x.version !== 'number') {
        throw new CloudError('unknown', 'The account service sent something unexpected.');
      }
      return { record: x.record, version: x.version };
    },
    async put(token, record, expectedVersion) {
      const r = await call(url, {
        method: 'PUT',
        headers: { ...auth(token), 'content-type': 'application/json' },
        body: JSON.stringify({ record, expectedVersion }),
      });
      if (r.status === 200 || r.status === 409) {
        const x = (await r.json()) as { version?: unknown };
        const v = typeof x.version === 'number' ? x.version : null;
        if (r.status === 200 && v !== null) return { ok: true, version: v };
        if (r.status === 409) return { ok: false, version: v };
      }
      throw statusError(r.status);
    },
    async delete(token) {
      const r = await call(url, { method: 'DELETE', headers: auth(token) });
      if (r.status !== 204 && r.status !== 404) throw statusError(r.status);
    },
  };
}
