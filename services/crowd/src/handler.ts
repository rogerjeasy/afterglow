import { cells, restoration, sensing } from '@afterglow/core';
import { DEFAULT_CONFIG, type Neighbourhood, buildNeighbourhood } from '@afterglow/simulator';
import { type PlacesResult, type WeatherResult, fetchPlaces, fetchWeather } from './publicData.js';
import type { CrowdStore } from './store.js';

/**
 * The public, anonymous API (crowd-reports spec, CR-01..CR-10).
 *
 *   POST /v1/devices        register today's device key (ECDSA P-256 public JWK)
 *   POST /v1/reports        a signed crowd report; stored only if signature and fields check
 *   GET  /v1/cells          k-anonymous cells around a cell (scope=demo: the simulated night)
 *   GET  /v1/places         public places around a cell (OpenStreetMap)
 *   GET  /v1/weather        hourly forecast for a cell (Open-Meteo)
 *   GET  /v1/health         upstream health
 *
 * No account, no IP address, no coordinates. A device key lives one day, so reports on
 * different days cannot be linked (privacy-aggregation.md).
 */

export interface PublicRequest {
  readonly routeKey: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: string | null;
}

export interface PublicResponse {
  readonly status: number;
  readonly body: string;
  /** Seconds a browser or CDN may cache this answer; 0 for never. */
  readonly maxAge: number;
}

export interface PublicDeps {
  readonly store: CrowdStore;
  readonly nowMs: () => number;
  readonly places?: (g: string) => Promise<PlacesResult | null>;
  /** Start fetching a cell's places in the background (an asynchronous self-invocation). */
  readonly warmPlaces?: (g: string) => Promise<void>;
  readonly weather?: (g: string) => Promise<WeatherResult | null>;
}

const json = (status: number, value: unknown, maxAge = 0): PublicResponse => ({
  status,
  body: JSON.stringify(value),
  maxAge,
});
const err = (status: number, message: string): PublicResponse => json(status, { message });

const B64URL = /^[A-Za-z0-9_-]+$/;
const DAY_S = 86_400;
const MAX_REPORT_BYTES = 2048;

const b64urlToBytes = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64url'));

async function deviceIdOf(x: string, y: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${x}.${y}`));
  return Buffer.from(digest).toString('base64url').slice(0, 22);
}

function parseJwk(raw: unknown): { x: string; y: string } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).some((k) => !['kty', 'crv', 'x', 'y', 'ext', 'key_ops'].includes(k)))
    return null;
  if (o.kty !== 'EC' || o.crv !== 'P-256') return null;
  if (typeof o.x !== 'string' || typeof o.y !== 'string') return null;
  if (o.x.length !== 43 || o.y.length !== 43 || !B64URL.test(o.x) || !B64URL.test(o.y)) return null;
  return { x: o.x, y: o.y };
}

function parseBody(body: string | null): Record<string, unknown> | null {
  if (body === null || body.length > 8192) return null;
  try {
    const x: unknown = JSON.parse(body);
    return typeof x === 'object' && x !== null && !Array.isArray(x)
      ? (x as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const toMinute = (ms: number): number => Math.floor(ms / 60_000);

/** One cell as published: never a count below k, and unknown below k (re-checked here, CE-01). */
function publish(state: cells.CellState) {
  const ok = state.state !== 'unknown' && state.deviceCount >= cells.K_ANONYMITY;
  return {
    geohash6: state.geohash6,
    state: ok ? state.state : 'unknown',
    deviceCount: ok ? state.deviceCount : 0,
    provenance: ok ? state.provenance : [],
    windowStart: state.windowStart,
  };
}

/** The state now, given the state of the window before (so "coming back" needs a dark predecessor). */
function stateNow(g: string, reports: readonly cells.CellReport[], now: number): cells.CellState {
  const prior = cells.cellStateAt(g, reports, now - 5);
  return cells.cellStateAt(g, reports, now, prior.state);
}

// The demo night is a pure function of its start; keep the latest few.
const demoCache = new Map<number, Neighbourhood>();
function demoNight(start: number): Neighbourhood {
  const hit = demoCache.get(start);
  if (hit) return hit;
  const nbh = buildNeighbourhood({ ...DEFAULT_CONFIG, outageStartMinute: start });
  if (demoCache.size > 8) demoCache.clear();
  demoCache.set(start, nbh);
  return nbh;
}

async function cellsRoute(q: PublicRequest['query'], deps: PublicDeps): Promise<PublicResponse> {
  const now = toMinute(deps.nowMs());
  if (q.scope === 'demo') {
    // The simulated night, served through the same endpoint and the same aggregation.
    const start = Number(q.start);
    const at = Number(q.at ?? now);
    if (!Number.isInteger(start) || !Number.isInteger(at) || Math.abs(start - now) > 7 * 24 * 60) {
      return err(400, 'demo needs start (and at) as whole minutes near now');
    }
    const nbh = demoNight(start);
    const grid = nbh.cells.map((c) => ({
      row: c.row,
      col: c.col,
      ...publish(stateNow(c.geohash6, nbh.reports, at)),
    }));
    const user = grid.find((c) => c.geohash6 === nbh.userCell);
    const estimate = restoration.estimateRestoration({
      nowMinute: at,
      promisedEndMinute: nbh.provider.promisedEndMinute,
      history: nbh.history,
      crowdState: (user?.state ?? 'unknown') as cells.CellStateValue,
    });
    return json(200, {
      scope: 'demo',
      asOfMinute: at,
      userCell: nbh.userCell,
      cells: grid,
      estimate,
    });
  }

  const center = q.center ?? '';
  if (!cells.isGeohash6(center)) return err(400, 'center must be a geohash-6 cell');
  const cols = Math.min(7, Math.max(1, Number(q.cols ?? 5) | 0));
  const rows = Math.min(7, Math.max(1, Number(q.rows ?? 5) | 0));
  const grid = sensing.cellsAround(center, cols, rows);
  const nowS = Math.floor(deps.nowMs() / 1000);
  const out = await Promise.all(
    grid.flatMap((row, r) =>
      row.map(async (g, c) => {
        const reports = await deps.store.reportsSince(
          g,
          now - cells.DEVICE_COUNT_WINDOW_MINUTES - 5,
          nowS,
        );
        return { row: r, col: c, ...publish(stateNow(g, reports, now)) };
      }),
    ),
  );
  return json(
    200,
    { scope: 'live', asOfMinute: now, userCell: center, cols, rows, cells: out },
    20,
  );
}

/** The background half of places: fetch from OpenStreetMap and cache for a week. */
export async function warmPlacesNow(g: string, deps: PublicDeps): Promise<boolean> {
  if (!cells.isGeohash6(g)) return false;
  const nowS = Math.floor(deps.nowMs() / 1000);
  const fresh = await (deps.places ?? fetchPlaces)(g);
  if (!fresh) return false;
  await deps.store.putCache(`places:v2:${g}`, JSON.stringify(fresh), nowS + 7 * DAY_S);
  return true;
}

async function cachedPublic<T>(
  deps: PublicDeps,
  key: string,
  ttlS: number,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const nowS = Math.floor(deps.nowMs() / 1000);
  const hit = await deps.store.getCache(key, nowS);
  if (hit) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      // fall through to a fresh load
    }
  }
  const fresh = await load();
  if (fresh !== null) await deps.store.putCache(key, JSON.stringify(fresh), nowS + ttlS);
  return fresh;
}

export async function handlePublic(req: PublicRequest, deps: PublicDeps): Promise<PublicResponse> {
  const nowMs = deps.nowMs();
  const nowS = Math.floor(nowMs / 1000);
  try {
    switch (req.routeKey) {
      case 'POST /v1/devices': {
        const body = parseBody(req.body);
        const jwk = parseJwk(body?.publicKey);
        if (!jwk) return err(400, 'publicKey must be a P-256 public JWK');
        const deviceId = await deviceIdOf(jwk.x, jwk.y);
        const stored = JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y });
        await deps.store.putDevice(deviceId, stored, nowS + 2 * DAY_S);
        return json(201, { deviceId, expiresAt: (nowS + 2 * DAY_S) * 1000 });
      }

      case 'POST /v1/reports': {
        const body = parseBody(req.body);
        const deviceId = body?.deviceId;
        const report = body?.report;
        const signature = body?.signature;
        if (typeof deviceId !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(deviceId)) {
          return err(400, 'bad device');
        }
        if (typeof report !== 'string' || report.length > MAX_REPORT_BYTES)
          return err(400, 'bad report');
        if (typeof signature !== 'string' || !B64URL.test(signature) || signature.length > 128) {
          return err(400, 'bad signature');
        }
        const jwk = await deps.store.getDevice(deviceId, nowS);
        if (!jwk) return err(401, 'unknown or expired device; register today’s key');
        const key = await crypto.subtle.importKey(
          'jwk',
          JSON.parse(jwk) as JsonWebKey,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify'],
        );
        const ok = await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          key,
          b64urlToBytes(signature),
          new TextEncoder().encode(report),
        );
        if (!ok) return err(401, 'signature does not match');
        let parsed: unknown;
        try {
          parsed = JSON.parse(report);
        } catch {
          return err(400, 'report is not JSON');
        }
        const checked = sensing.validateCrowdReport(parsed, deviceId, toMinute(nowMs));
        if (typeof checked === 'string') return err(400, checked);
        const fresh = await deps.store.putReport(checked, nowS + 2 * 3600);
        // 202 either way: a duplicate is not an error for a client that retried.
        return json(202, { accepted: true, duplicate: !fresh });
      }

      case 'GET /v1/cells':
        return await cellsRoute(req.query, deps);

      case 'GET /v1/places': {
        const g = req.query.cell ?? '';
        if (!cells.isGeohash6(g)) return err(400, 'cell must be a geohash-6 cell');
        const hit = await deps.store.getCache(`places:v2:${g}`, nowS);
        if (hit) return { status: 200, body: hit, maxAge: 3600 };
        // OpenStreetMap's public server can take a minute: fetch in the background and
        // let the app ask again, instead of holding a request past API Gateway's limit.
        const warming = await deps.store.getCache(`warming:${g}`, nowS);
        if (!warming && deps.warmPlaces) {
          // Long enough to cover Lambda's own retries of the background run.
          await deps.store.putCache(`warming:${g}`, '1', nowS + 600);
          await deps.warmPlaces(g);
        }
        if (!deps.warmPlaces) {
          const fresh = await (deps.places ?? fetchPlaces)(g);
          if (!fresh) return err(503, 'Public places are unreachable right now.');
          await deps.store.putCache(`places:v2:${g}`, JSON.stringify(fresh), nowS + 7 * DAY_S);
          return json(200, fresh, 3600);
        }
        return json(202, { status: 'loading', retryAfterS: 20 });
      }

      case 'GET /v1/weather': {
        const g = req.query.cell ?? '';
        if (!cells.isGeohash6(g)) return err(400, 'cell must be a geohash-6 cell');
        // One forecast per ~5 km area (a geohash-5): neighbouring cells share it, so the
        // forecast service sees an even coarser position. 'h' is a cell near the area's middle.
        const area = `${g.slice(0, 5)}h`;
        const result = await cachedPublic(deps, `weather:${g.slice(0, 5)}`, 1800, () =>
          (deps.weather ?? fetchWeather)(area),
        );
        return result ? json(200, result, 900) : err(503, 'The forecast is unreachable right now.');
      }

      case 'GET /v1/health':
        return json(200, { ok: true, at: new Date(nowMs).toISOString() });

      default:
        return err(404, 'Not found.');
    }
  } catch {
    return err(503, 'The service is unavailable. Everything on your phone still works.');
  }
}
