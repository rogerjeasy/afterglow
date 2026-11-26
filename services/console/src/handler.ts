import { cells } from '@afterglow/core';

/**
 * The consoles' API (.kiro/specs/consoles). API Gateway has already verified the
 * Cognito access token; the handler takes identity only from its claims:
 * - Business (BC-*): any signed-in account manages its own sites, keyed by `sub`;
 *   a site's public status (open, how it is powered) is published to its cell.
 * - Beacon (BE-*): only members of the `beacon` group, which only an administrator
 *   grants, may publish advisories, which are pushed to followers of each cell.
 */

export interface Claims {
  readonly sub: string;
  readonly groups: readonly string[];
}

export interface ConsoleRequest {
  readonly routeKey: string;
  readonly siteId: string | null;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly body: string | null;
  readonly claims: Claims | null;
}

export interface ConsoleResponse {
  readonly status: number;
  readonly body: string;
}

export const SITE_KINDS = ['pharmacy', 'clinic', 'shop', 'shelter', 'community', 'other'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];
export const POWER = ['mains', 'backup', 'none'] as const;

export interface Fridge {
  readonly id: string;
  readonly name: string;
  readonly minC: number;
  readonly maxC: number;
}
export interface Site {
  readonly siteId: string;
  readonly name: string;
  readonly kind: SiteKind;
  readonly geohash6: string;
  readonly lat: number;
  readonly lng: number;
  readonly fridges: readonly Fridge[];
  readonly status: {
    readonly open: boolean;
    readonly power: (typeof POWER)[number];
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

export interface ConsoleStore {
  listSites(owner: string): Promise<Site[]>;
  getSite(owner: string, siteId: string): Promise<Site | null>;
  putSite(owner: string, site: Site): Promise<void>;
  deleteSite(owner: string, siteId: string): Promise<void>;
  /** The public status record in the site's cell (24 h, renewed on update), or its removal. */
  publishSite(site: Site, expiresAtS: number): Promise<void>;
  unpublishSite(geohash6: string, siteId: string): Promise<void>;
  appendLog(owner: string, siteId: string, entry: LogEntry, expiresAtS: number): Promise<void>;
  logSince(owner: string, siteId: string, fromMs: number): Promise<LogEntry[]>;
  putAdvisory(
    cell: string,
    advisory: object,
    atMs: number,
    id: string,
    expiresAtS: number,
  ): Promise<void>;
  audit(kind: string, actor: string, detail: object, atMs: number): Promise<void>;
}

export interface ConsoleDeps {
  readonly store: ConsoleStore;
  readonly nowMs: () => number;
  readonly newId: () => string;
  /** Push an advisory to a cell's followers (the public API's notify run). */
  readonly notifyAdvisory: (cell: string, title: string, body: string) => Promise<void>;
}

const MAX_SITES = 20;
const MAX_FRIDGES = 20;
const LOG_DAYS = 400;
const DAY_S = 86_400;
const ID = /^[A-Za-z0-9_-]{6,40}$/;

const json = (status: number, value: unknown): ConsoleResponse => ({
  status,
  body: JSON.stringify(value),
});
const err = (status: number, message: string): ConsoleResponse => json(status, { message });

function parse(body: string | null): Record<string, unknown> | null {
  if (body === null || body.length > 16_384) return null;
  try {
    const x: unknown = JSON.parse(body);
    return typeof x === 'object' && x !== null && !Array.isArray(x)
      ? (x as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Printable, single-spaced, bounded: it may be shown to the public. */
export function cleanText(x: unknown, max: number): string | null {
  if (typeof x !== 'string') return null;
  const t = x
    .normalize('NFKC')
    .replace(/[\p{C}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > 0 && t.length <= max ? t : null;
}

const isTemp = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= -80 && x <= 60;

function parseSite(siteId: string, b: Record<string, unknown>, prior: Site | null): Site | string {
  const name = cleanText(b.name, 80);
  if (!name) return 'name must be 1 to 80 characters';
  const kind = b.kind;
  if (typeof kind !== 'string' || !(SITE_KINDS as readonly string[]).includes(kind)) {
    return `kind must be one of ${SITE_KINDS.join(', ')}`;
  }
  const lat = b.lat;
  const lng = b.lng;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return 'lat and lng must be the site’s public position';
  }
  const fridgesRaw = Array.isArray(b.fridges) ? b.fridges : [];
  if (fridgesRaw.length > MAX_FRIDGES) return `at most ${MAX_FRIDGES} fridges`;
  const fridges: Fridge[] = [];
  for (const f of fridgesRaw) {
    const o = (f ?? {}) as Record<string, unknown>;
    const fname = cleanText(o.name, 60);
    const id = typeof o.id === 'string' && ID.test(o.id) ? o.id : null;
    if (!fname || !id || !isTemp(o.minC) || !isTemp(o.maxC) || o.minC >= o.maxC) {
      return 'each fridge needs an id, a name and a range with minC below maxC';
    }
    fridges.push({ id, name: fname, minC: o.minC, maxC: o.maxC });
  }
  return {
    siteId,
    name,
    kind: kind as SiteKind,
    geohash6: cells.encodeGeohash({ lat, lng }),
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    fridges,
    status: prior?.status ?? null,
  };
}

export async function handleConsole(
  req: ConsoleRequest,
  deps: ConsoleDeps,
): Promise<ConsoleResponse> {
  const c = req.claims;
  if (!c || !c.sub) return err(401, 'sign in');
  const nowMs = deps.nowMs();
  const nowS = Math.floor(nowMs / 1000);
  const isBeacon = c.groups.includes('beacon');
  const siteId = req.siteId;
  if (siteId !== null && !ID.test(siteId)) return err(400, 'bad site id');

  switch (req.routeKey) {
    case 'GET /v1/console/me':
      return json(200, { beacon: isBeacon });

    case 'GET /v1/console/sites':
      return json(200, { sites: await deps.store.listSites(c.sub) });

    case 'PUT /v1/console/sites/{siteId}': {
      const b = parse(req.body);
      if (!b || siteId === null) return err(400, 'body must be a site');
      const prior = await deps.store.getSite(c.sub, siteId);
      if (!prior && (await deps.store.listSites(c.sub)).length >= MAX_SITES) {
        return err(400, `at most ${MAX_SITES} sites per account`);
      }
      const site = parseSite(siteId, b, prior);
      if (typeof site === 'string') return err(400, site);
      await deps.store.putSite(c.sub, site);
      // A move takes the public status with it.
      if (prior?.status && prior.geohash6 !== site.geohash6) {
        await deps.store.unpublishSite(prior.geohash6, siteId);
      }
      if (site.status) await deps.store.publishSite(site, nowS + DAY_S);
      return json(200, { site });
    }

    case 'DELETE /v1/console/sites/{siteId}': {
      if (siteId === null) return err(400, 'bad site id');
      const prior = await deps.store.getSite(c.sub, siteId);
      if (!prior) return err(404, 'no such site');
      await deps.store.unpublishSite(prior.geohash6, siteId);
      await deps.store.deleteSite(c.sub, siteId);
      return json(200, { deleted: true });
    }

    case 'POST /v1/console/sites/{siteId}/status': {
      const b = parse(req.body);
      if (!b || siteId === null) return err(400, 'body must be a status');
      const site = await deps.store.getSite(c.sub, siteId);
      if (!site) return err(404, 'no such site');
      const power = b.power;
      if (
        typeof b.open !== 'boolean' ||
        typeof power !== 'string' ||
        !(POWER as readonly string[]).includes(power)
      ) {
        return err(400, 'open must be true or false and power one of mains, backup, none');
      }
      const note = b.note === undefined || b.note === '' ? '' : cleanText(b.note, 140);
      if (note === null) return err(400, 'note must be at most 140 characters');
      const next: Site = {
        ...site,
        status: { open: b.open, power: power as (typeof POWER)[number], note, updatedAtMs: nowMs },
      };
      await deps.store.putSite(c.sub, next);
      await deps.store.publishSite(next, nowS + DAY_S);
      return json(200, { site: next });
    }

    case 'POST /v1/console/sites/{siteId}/log': {
      const b = parse(req.body);
      if (!b || siteId === null) return err(400, 'body must be a log entry');
      const site = await deps.store.getSite(c.sub, siteId);
      if (!site) return err(404, 'no such site');
      const atMs =
        typeof b.atMs === 'number' && b.atMs <= nowMs + 60_000 && b.atMs > nowMs - 7 * DAY_S * 1000
          ? b.atMs
          : nowMs;
      let entry: LogEntry;
      if (b.kind === 'reading') {
        if (
          typeof b.fridgeId !== 'string' ||
          !site.fridges.some((f) => f.id === b.fridgeId) ||
          !isTemp(b.tempC)
        ) {
          return err(400, 'a reading needs one of this site’s fridges and a temperature');
        }
        entry = {
          kind: 'reading',
          fridgeId: b.fridgeId,
          tempC: Math.round(b.tempC * 10) / 10,
          atMs,
        };
      } else if (b.kind === 'generator') {
        const ev = b.event;
        if (ev !== 'start' && ev !== 'stop' && ev !== 'refuel')
          return err(400, 'event must be start, stop or refuel');
        const litres = b.litres === undefined || b.litres === null ? null : b.litres;
        if (litres !== null && (typeof litres !== 'number' || !(litres > 0) || litres > 2000)) {
          return err(400, 'litres must be a positive number');
        }
        entry = { kind: 'generator', event: ev, litres, atMs };
      } else return err(400, 'kind must be reading or generator');
      await deps.store.appendLog(c.sub, siteId, entry, nowS + LOG_DAYS * DAY_S);
      return json(201, { entry });
    }

    case 'GET /v1/console/sites/{siteId}/log': {
      if (siteId === null) return err(400, 'bad site id');
      if (!(await deps.store.getSite(c.sub, siteId))) return err(404, 'no such site');
      const days = Math.min(LOG_DAYS, Math.max(1, Number(req.query.days ?? 30) | 0));
      return json(200, {
        entries: await deps.store.logSince(c.sub, siteId, nowMs - days * DAY_S * 1000),
      });
    }

    case 'POST /v1/console/advisories': {
      if (!isBeacon) return err(403, 'advisories are for Beacon accounts');
      const b = parse(req.body);
      const title = cleanText(b?.title, 80);
      const text = cleanText(b?.body, 240);
      const list = Array.isArray(b?.cells) ? (b?.cells as unknown[]) : [];
      if (!title || !text) return err(400, 'title (up to 80) and body (up to 240) are required');
      if (
        list.length < 1 ||
        list.length > 49 ||
        !list.every((x) => typeof x === 'string' && cells.isGeohash6(x))
      ) {
        return err(400, 'cells must be 1 to 49 geohash-6 cells');
      }
      const id = deps.newId();
      const from = cleanText(b?.from, 60) ?? 'Local authority';
      const advisory = { id, title, body: text, from, atMs: nowMs };
      const targets = [...new Set(list as string[])];
      for (const cell of targets) {
        await deps.store.putAdvisory(cell, advisory, nowMs, id, nowS + 3 * DAY_S);
        await deps.notifyAdvisory(cell, title, text);
      }
      await deps.store.audit('advisory', c.sub, { id, cells: targets.length, title }, nowMs);
      return json(201, { advisory, cells: targets.length });
    }

    default:
      return err(404, 'not found');
  }
}
