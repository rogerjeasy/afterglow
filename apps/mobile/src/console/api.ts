import raw from '../cloud/config.json';
import { getSpaceController } from '../spaces/useSpace';

/**
 * The consoles' API client (.kiro/specs/consoles). Every call carries the signed-in
 * account's Cognito access token, fetched fresh from memory; nothing is cached on
 * disk. Without a signed-in cloud account the consoles say so instead of calling.
 */
const base =
  typeof (raw as { consoleApiUrl?: unknown }).consoleApiUrl === 'string' &&
  /^https:\/\/[a-z0-9.-]+$/.test((raw as { consoleApiUrl: string }).consoleApiUrl)
    ? (raw as { consoleApiUrl: string }).consoleApiUrl
    : null;

export const consoleAvailable = base !== null;

export interface Fridge {
  readonly id: string;
  readonly name: string;
  readonly minC: number;
  readonly maxC: number;
}
export interface Site {
  readonly siteId: string;
  readonly name: string;
  readonly kind: string;
  readonly geohash6: string;
  readonly lat: number;
  readonly lng: number;
  readonly fridges: readonly Fridge[];
  readonly status: {
    readonly open: boolean;
    readonly power: 'mains' | 'backup' | 'none';
    readonly note: string;
    readonly updatedAtMs: number;
  } | null;
}
export type LogEntry =
  | {
      readonly kind: 'reading';
      readonly fridgeId: string;
      readonly tempC: number;
      readonly atMs: number;
    }
  | {
      readonly kind: 'generator';
      readonly event: 'start' | 'stop' | 'refuel';
      readonly litres: number | null;
      readonly atMs: number;
    };

export type Call<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly message: string };

async function call<T>(method: string, path: string, body?: unknown): Promise<Call<T>> {
  if (!base) return { ok: false, status: 0, message: 'This build has no console service.' };
  const token = await getSpaceController().consoleToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      message: 'Sign in to an Afterglow cloud account to use the consoles.',
    };
  }
  try {
    const r = await fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? null : JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const j = (await r.json().catch(() => null)) as (T & { message?: string }) | null;
    if (r.ok && j) return { ok: true, value: j };
    return {
      ok: false,
      status: r.status,
      message: j?.message ?? `The console answered ${r.status}.`,
    };
  } catch {
    return { ok: false, status: 0, message: 'The console is unreachable. Check the connection.' };
  }
}

export const consoleApi = {
  me: () => call<{ beacon: boolean }>('GET', '/v1/console/me'),
  sites: () => call<{ sites: Site[] }>('GET', '/v1/console/sites'),
  putSite: (siteId: string, site: Omit<Site, 'siteId' | 'geohash6' | 'status'>) =>
    call<{ site: Site }>('PUT', `/v1/console/sites/${siteId}`, site),
  deleteSite: (siteId: string) =>
    call<{ deleted: boolean }>('DELETE', `/v1/console/sites/${siteId}`),
  setStatus: (
    siteId: string,
    status: { open: boolean; power: 'mains' | 'backup' | 'none'; note: string },
  ) => call<{ site: Site }>('POST', `/v1/console/sites/${siteId}/status`, status),
  log: (siteId: string, entry: Record<string, unknown>) =>
    call<{ entry: LogEntry }>('POST', `/v1/console/sites/${siteId}/log`, entry),
  logSince: (siteId: string, days: number) =>
    call<{ entries: LogEntry[] }>('GET', `/v1/console/sites/${siteId}/log?days=${days}`),
  advisory: (a: { cells: string[]; title: string; body: string; from: string }) =>
    call<{ cells: number }>('POST', '/v1/console/advisories', a),
};
