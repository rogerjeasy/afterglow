import { cells } from '@afterglow/core';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Claims,
  type ConsoleDeps,
  type ConsoleRequest,
  type ConsoleStore,
  type LogEntry,
  SITE_KINDS,
  type Site,
  cleanText,
  handleConsole,
} from './handler.js';
import { dynamoConsoleStore } from './store.js';

/**
 * The Business and Beacon consoles (.kiro/specs/consoles CO-01, BC-01..BC-03, BC-05,
 * BC-06, BE-02), driven through `handleConsole` with an in-memory store keyed by owner.
 */

const NOW_MS = Date.UTC(2026, 10, 27, 12, 0, 0);
const NOW_S = NOW_MS / 1000;
const DAY_S = 86_400;

interface Published {
  readonly owner: string;
  readonly site: Site;
  readonly expiresAtS: number;
}
interface MemoryConsole extends ConsoleStore {
  readonly sites: Map<string, Map<string, Site>>;
  readonly logs: Map<string, { entry: LogEntry; expiresAtS: number }[]>;
  /** The public table: cell → (owner, siteId) → status. */
  readonly published: Map<string, Published>;
  readonly advisories: { cell: string; advisory: object; expiresAtS: number }[];
  readonly audits: { kind: string; actor: string; detail: object }[];
}

function memoryConsole(): MemoryConsole {
  const sites = new Map<string, Map<string, Site>>();
  const logs = new Map<string, { entry: LogEntry; expiresAtS: number }[]>();
  const published = new Map<string, Published>();
  const advisories: MemoryConsole['advisories'] = [];
  const audits: MemoryConsole['audits'] = [];
  const of = (o: string) => {
    let m = sites.get(o);
    if (!m) {
      m = new Map();
      sites.set(o, m);
    }
    return m;
  };
  return {
    sites,
    logs,
    published,
    advisories,
    audits,
    async listSites(o) {
      return [...of(o).values()];
    },
    async getSite(o, id) {
      return of(o).get(id) ?? null;
    },
    async putSite(o, s) {
      of(o).set(s.siteId, s);
    },
    async deleteSite(o, id) {
      of(o).delete(id);
    },
    async publishSite(o, s, exp) {
      if (s.status)
        published.set(`${s.geohash6}|${o}|${s.siteId}`, { owner: o, site: s, expiresAtS: exp });
    },
    async unpublishSite(o, g, id) {
      published.delete(`${g}|${o}|${id}`);
    },
    async appendLog(o, id, entry, exp) {
      const k = `${o}|${id}`;
      logs.set(k, [...(logs.get(k) ?? []), { entry, expiresAtS: exp }]);
    },
    async logSince(o, id, from) {
      return (logs.get(`${o}|${id}`) ?? []).map((x) => x.entry).filter((e) => e.atMs >= from);
    },
    async putAdvisory(cell, advisory, _at, _id, exp) {
      advisories.push({ cell, advisory, expiresAtS: exp });
    },
    async audit(kind, actor, detail) {
      audits.push({ kind, actor, detail });
    },
  };
}

const notified: { cell: string; title: string; body: string }[] = [];
const depsFor = (store: ConsoleStore, nowMs = NOW_MS): ConsoleDeps => ({
  store,
  nowMs: () => nowMs,
  newId: () => 'adv-0001',
  notifyAdvisory: async (cell, title, body) => {
    notified.push({ cell, title, body });
  },
});
const call = (
  deps: ConsoleDeps,
  claims: Claims | null,
  routeKey: string,
  siteId: string | null = null,
  body: unknown = null,
  query: Record<string, string> = {},
) =>
  handleConsole(
    {
      routeKey,
      siteId,
      query,
      body: body === null ? null : typeof body === 'string' ? body : JSON.stringify(body),
      claims,
    } satisfies ConsoleRequest,
    deps,
  );
const parse = (r: { body: string }) => JSON.parse(r.body);

const idArb = fc.stringMatching(/^[A-Za-z0-9_-]{6,12}$/);
const subArb = fc.uuid();
const latArb = fc.double({ min: -89.9, max: 89.9, noNaN: true });
const lngArb = fc.double({ min: -179.9, max: 179.9, noNaN: true });
const fridgeArb = fc
  .record({
    id: idArb,
    name: fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,20}$/),
    minC: fc.integer({ min: -30, max: 10 }),
    span: fc.integer({ min: 1, max: 20 }),
  })
  .map(({ span, ...f }) => ({ ...f, maxC: f.minC + span }));
const siteBodyArb = fc.record({
  name: fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,30}$/),
  kind: fc.constantFrom(...SITE_KINDS),
  lat: latArb,
  lng: lngArb,
  fridges: fc.uniqueArray(fridgeArb, { selector: (f) => f.id, maxLength: 4 }),
});
const ROUTES = [
  'GET /v1/console/me',
  'GET /v1/console/sites',
  'PUT /v1/console/sites/{siteId}',
  'DELETE /v1/console/sites/{siteId}',
  'POST /v1/console/sites/{siteId}/status',
  'POST /v1/console/sites/{siteId}/log',
  'GET /v1/console/sites/{siteId}/log',
  'POST /v1/console/advisories',
];

describe('CO-01 identity comes only from the verified token', () => {
  it('CO-01 without a verified sub every route answers 401 and touches nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ROUTES),
        fc.constantFrom<Claims | null>(null, { sub: '', groups: ['beacon'] }),
        fc.option(idArb, { nil: null }),
        async (route, claims, siteId) => {
          const store = memoryConsole();
          const res = await call(depsFor(store), claims, route, siteId, {
            name: 'x',
            sub: 'someone',
          });
          expect(res.status).toBe(401);
          expect(
            store.sites.size + store.logs.size + store.published.size + store.advisories.length,
          ).toBe(0);
        },
      ),
    );
  });

  it('CO-01 every store access uses the caller’s own sub, whatever the request says', async () => {
    const op = fc.record({
      who: fc.integer({ min: 0, max: 2 }),
      route: fc.constantFrom(...ROUTES),
      site: fc.constantFrom('shared-1', 'shared-2', 'own-xyz'),
      body: fc.oneof(
        siteBodyArb.map((b) => ({ ...b, sub: 'victim', owner: 'victim' })),
        fc.constant({ open: true, power: 'backup', note: 'Open late', sub: 'victim' }),
        fc.constant({ kind: 'generator', event: 'refuel', litres: 20 }),
        fc.constant({ title: 'Water', body: 'Boil water', cells: ['u4pruy'] }),
      ),
    });
    await fc.assert(
      fc.asyncProperty(
        fc.array(subArb, { minLength: 3, maxLength: 3 }),
        fc.array(op, { maxLength: 25 }),
        async (subs, ops) => {
          const mem = memoryConsole();
          let current = '';
          const owners: string[] = [];
          const guard = new Proxy(mem, {
            get(target, prop, recv) {
              const v = Reflect.get(target, prop, recv);
              if (typeof v !== 'function' || ['putAdvisory', 'audit'].includes(String(prop)))
                return v;
              return (owner: string, ...rest: unknown[]) => {
                owners.push(owner);
                expect(owner).toBe(current);
                return (v as (...a: unknown[]) => unknown).call(target, owner, ...rest);
              };
            },
          });
          for (const o of ops) {
            current = subs[o.who] as string;
            await call(depsFor(guard), { sub: current, groups: [] }, o.route, o.site, o.body);
          }
          // Nobody's data sits under a sub other than its writer's.
          for (const [owner] of mem.sites) expect(subs).toContain(owner);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('CO-01 only members of the beacon group may publish advisories', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('admin', 'business', 'Beacon', 'beacons', 'beacon'), {
          maxLength: 3,
        }),
        async (groups) => {
          const store = memoryConsole();
          const res = await call(
            depsFor(store),
            { sub: 'u1', groups },
            'POST /v1/console/advisories',
            null,
            {
              title: 'Water',
              body: 'Boil water before drinking.',
              cells: ['u4pruy'],
            },
          );
          expect(res.status).toBe(groups.includes('beacon') ? 201 : 403);
          expect(store.advisories.length).toBe(groups.includes('beacon') ? 1 : 0);
          expect(
            parse(await call(depsFor(store), { sub: 'u1', groups }, 'GET /v1/console/me')).beacon,
          ).toBe(groups.includes('beacon'));
        },
      ),
    );
  });
});

describe('BC-01 sites and fridges', () => {
  it('BC-01 a valid site is stored with its cell, rounded position and fridges', async () => {
    await fc.assert(
      fc.asyncProperty(idArb, siteBodyArb, async (siteId, body) => {
        const store = memoryConsole();
        const res = await call(
          depsFor(store),
          { sub: 'u1', groups: [] },
          'PUT /v1/console/sites/{siteId}',
          siteId,
          body,
        );
        expect(res.status).toBe(200);
        const site = parse(res).site as Site;
        expect(site.geohash6).toBe(cells.encodeGeohash({ lat: body.lat, lng: body.lng }));
        expect(Math.abs(site.lat - body.lat)).toBeLessThanOrEqual(5.1e-6);
        expect(Math.abs(site.lng - body.lng)).toBeLessThanOrEqual(5.1e-6);
        expect(site.fridges.map((f) => f.id)).toEqual(body.fridges.map((f) => f.id));
        expect(site.status).toBeNull();
        // Compared as JSON, the way it leaves the API (-0 travels as 0).
        expect(JSON.parse(JSON.stringify(await store.getSite('u1', siteId)))).toEqual(site);
      }),
      { numRuns: 60 },
    );
  });

  it('BC-01 at most 20 sites and 20 fridges; a fridge range needs minC below maxC; kinds are a fixed list', async () => {
    const store = memoryConsole();
    const deps = depsFor(store);
    const u = { sub: 'u1', groups: [] };
    const body = { name: 'Clinic', kind: 'clinic', lat: 1, lng: 2, fridges: [] };
    for (let i = 0; i < 20; i++) {
      expect(
        (
          await call(
            deps,
            u,
            'PUT /v1/console/sites/{siteId}',
            `site-${String(i).padStart(2, '0')}`,
            body,
          )
        ).status,
      ).toBe(200);
    }
    expect((await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-20', body)).status).toBe(
      400,
    );
    // Editing one of the twenty is still allowed.
    expect(
      (
        await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-00', {
          ...body,
          name: 'Clinic 2',
        })
      ).status,
    ).toBe(200);
    const fridges = Array.from({ length: 21 }, (_, i) => ({
      id: `fridge-${i}`,
      name: 'F',
      minC: 2,
      maxC: 8,
    }));
    expect(
      (await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-00', { ...body, fridges }))
        .status,
    ).toBe(400);
    expect(
      (
        await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-00', {
          ...body,
          fridges: fridges.slice(0, 20),
        })
      ).status,
    ).toBe(200);
    await fc.assert(
      fc.asyncProperty(
        fc.record({ minC: fc.double({ noNaN: false }), maxC: fc.double({ noNaN: false }) }),
        fc.string(),
        async ({ minC, maxC }, kind) => {
          const ok =
            Number.isFinite(minC) &&
            Number.isFinite(maxC) &&
            minC >= -80 &&
            maxC <= 60 &&
            minC < maxC &&
            maxC >= -80 &&
            minC <= 60;
          const r1 = await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-00', {
            ...body,
            fridges: [{ id: 'fridge-1', name: 'Vaccines', minC, maxC }],
          });
          expect(r1.status).toBe(ok ? 200 : 400);
          const r2 = await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-00', {
            ...body,
            kind,
          });
          expect(r2.status).toBe((SITE_KINDS as readonly string[]).includes(kind) ? 200 : 400);
        },
      ),
    );
  });
});

describe('BC-02 the cold-chain log', () => {
  it('BC-02 a reading is kept 400 days for one of the site’s own fridges, and refused for any other', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fridgeArb, { selector: (f) => f.id, minLength: 1, maxLength: 3 }),
        idArb,
        fc.double({ min: -80, max: 60, noNaN: true }),
        async (fridges, otherId, tempC) => {
          const store = memoryConsole();
          const deps = depsFor(store);
          const u = { sub: 'u1', groups: [] };
          await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-01', {
            name: 'Pharmacy',
            kind: 'pharmacy',
            lat: 0,
            lng: 0,
            fridges,
          });
          const own = fridges[0]?.id as string;
          const ok = await call(deps, u, 'POST /v1/console/sites/{siteId}/log', 'site-01', {
            kind: 'reading',
            fridgeId: own,
            tempC,
          });
          expect(ok.status).toBe(201);
          expect(parse(ok).entry).toEqual({
            kind: 'reading',
            fridgeId: own,
            tempC: Math.round(tempC * 10) / 10 + 0,
            atMs: NOW_MS,
          });
          expect(store.logs.get('u1|site-01')?.[0]?.expiresAtS).toBe(NOW_S + 400 * DAY_S);
          const known = fridges.some((f) => f.id === otherId);
          const other = await call(deps, u, 'POST /v1/console/sites/{siteId}/log', 'site-01', {
            kind: 'reading',
            fridgeId: otherId,
            tempC,
          });
          expect(other.status).toBe(known ? 201 : 400);
          // Another account cannot log against this site at all.
          const stranger = await call(
            deps,
            { sub: 'u2', groups: [] },
            'POST /v1/console/sites/{siteId}/log',
            'site-01',
            { kind: 'reading', fridgeId: own, tempC },
          );
          expect(stranger.status).toBe(404);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('BC-02 generator events are start, stop or refuel with positive litres; out-of-range times use the server clock', async () => {
    const store = memoryConsole();
    const deps = depsFor(store);
    const u = { sub: 'u1', groups: [] };
    await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-01', {
      name: 'Shop',
      kind: 'shop',
      lat: 0,
      lng: 0,
    });
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('start', 'stop', 'refuel', 'explode', ''),
        fc.oneof(fc.constant(undefined), fc.constant(null), fc.double(), fc.constant('5')),
        fc.oneof(
          fc.constant(undefined),
          fc.integer({ min: NOW_MS - 30 * DAY_S * 1000, max: NOW_MS + 3_600_000 }),
        ),
        async (event, raw, atMs) => {
          // What arrives is JSON: NaN and Infinity travel as null.
          const litres: unknown = JSON.parse(JSON.stringify({ l: raw ?? null })).l;
          const res = await call(deps, u, 'POST /v1/console/sites/{siteId}/log', 'site-01', {
            kind: 'generator',
            event,
            litres: raw,
            atMs,
          });
          const goodEvent = ['start', 'stop', 'refuel'].includes(event);
          const goodLitres =
            litres === null || (typeof litres === 'number' && litres > 0 && litres <= 2000);
          expect(res.status).toBe(goodEvent && goodLitres ? 201 : 400);
          if (res.status === 201) {
            const e = parse(res).entry;
            const inRange =
              atMs !== undefined && atMs <= NOW_MS + 60_000 && atMs > NOW_MS - 7 * DAY_S * 1000;
            expect(e.atMs).toBe(inRange ? atMs : NOW_MS);
          }
        },
      ),
    );
  });
});

describe('BC-03 public status', () => {
  it('BC-03 a status is public in the site’s cell for 24 hours, follows a move and goes with a delete', async () => {
    await fc.assert(
      fc.asyncProperty(
        siteBodyArb,
        latArb,
        lngArb,
        fc.boolean(),
        fc.constantFrom('mains', 'backup', 'none'),
        async (body, lat2, lng2, open, power) => {
          const store = memoryConsole();
          const deps = depsFor(store);
          const u = { sub: 'u1', groups: [] };
          await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-01', body);
          expect(store.published.size).toBe(0);
          const st = await call(deps, u, 'POST /v1/console/sites/{siteId}/status', 'site-01', {
            open,
            power,
            note: 'Insulin in stock',
          });
          expect(st.status).toBe(200);
          const g1 = cells.encodeGeohash({ lat: body.lat, lng: body.lng });
          expect([...store.published.values()].map((p) => [p.site.geohash6, p.expiresAtS])).toEqual(
            [[g1, NOW_S + DAY_S]],
          );
          await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-01', {
            ...body,
            lat: lat2,
            lng: lng2,
          });
          const g2 = cells.encodeGeohash({ lat: lat2, lng: lng2 });
          expect([...store.published.values()].map((p) => p.site.geohash6)).toEqual([g2]);
          await call(deps, u, 'DELETE /v1/console/sites/{siteId}', 'site-01');
          expect(store.published.size).toBe(0);
          expect(await store.getSite('u1', 'site-01')).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('BC-05 public texts are printable, single-spaced and bounded', () => {
  it('BC-05 cleanText never returns control characters, angle brackets, doubled spaces or more than max', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.fullUnicodeString({ maxLength: 300 }), fc.string({ maxLength: 300 })),
        fc.integer({ min: 1, max: 240 }),
        (raw, max) => {
          const t = cleanText(raw, max);
          if (t === null) return;
          expect(t.length).toBeGreaterThan(0);
          expect(t.length).toBeLessThanOrEqual(max);
          expect(t).not.toMatch(/[\p{C}<>]/u);
          expect(t).not.toMatch(/\s\s/);
          expect(t).toBe(t.trim());
        },
      ),
    );
    for (const x of [undefined, null, 3, {}, ['a'], '', '   ', '\u0000\u0007'])
      expect(cleanText(x, 80)).toBeNull();
    expect(cleanText('  Open\t\t till   <b>9</b>  ', 80)).toBe('Open till b9/b');
  });

  it('BC-05 cleanText keeps words apart: any run of whitespace between words becomes one space', () => {
    const word = fc.stringMatching(/^[A-Za-z0-9.,:;!?'()-]{1,12}$/);
    const gap = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r\n', ' ', ' ', '　'), {
      minLength: 1,
      maxLength: 4,
    });
    fc.assert(
      fc.property(fc.array(fc.tuple(word, gap), { minLength: 1, maxLength: 12 }), (parts) => {
        const raw = parts.map(([w, g]) => `${w}${g}`).join('');
        expect(cleanText(raw, 1000)).toBe(parts.map(([w]) => w).join(' '));
      }),
    );
  });

  it('BC-05 regression: a line break in a note is a space, not glued words', () => {
    // Shrunk counterexample (2026-11-27): [[".", "\t"], ["A", " "]] came back as ".A".
    expect(cleanText('.\tA ', 80)).toBe('. A');
    expect(cleanText('a\na', 80)).toBe('a a');
    expect(cleanText('Water at the school.\r\nOpen until 18:00', 240)).toBe(
      'Water at the school. Open until 18:00',
    );
  });

  it('BC-05 status notes over 140 characters and advisory texts over their limits are refused', async () => {
    const store = memoryConsole();
    const deps = depsFor(store);
    const u = { sub: 'u1', groups: ['beacon'] };
    await call(deps, u, 'PUT /v1/console/sites/{siteId}', 'site-01', {
      name: 'Shop',
      kind: 'shop',
      lat: 0,
      lng: 0,
    });
    await fc.assert(
      fc.asyncProperty(fc.stringMatching(/^[a-z]{1,300}$/), async (word) => {
        const note = await call(deps, u, 'POST /v1/console/sites/{siteId}/status', 'site-01', {
          open: true,
          power: 'mains',
          note: word,
        });
        expect(note.status).toBe(word.length <= 140 ? 200 : 400);
        const adv = await call(deps, u, 'POST /v1/console/advisories', null, {
          title: word,
          body: word,
          cells: ['u4pruy'],
        });
        expect(adv.status).toBe(word.length <= 80 ? 201 : 400);
      }),
    );
  });
});

describe('BE-02 Beacon advisories', () => {
  it('BE-02 an advisory to 1..49 cells is stored for 3 days and pushed once per distinct cell, with an audit entry', async () => {
    const cellArb = fc.stringOf(fc.constantFrom(...'0123456789bcdefghjkmnpqrstuvwxyz'.split('')), {
      minLength: 6,
      maxLength: 6,
    });
    await fc.assert(
      fc.asyncProperty(fc.array(cellArb, { maxLength: 55 }), async (list) => {
        notified.length = 0;
        const store = memoryConsole();
        const res = await call(
          depsFor(store),
          { sub: 'beacon-user', groups: ['beacon'] },
          'POST /v1/console/advisories',
          null,
          {
            title: 'Water point open',
            body: 'Clean water at the school until 18:00.',
            cells: list,
            from: 'City of Testville',
          },
        );
        if (list.length < 1 || list.length > 49) {
          expect(res.status).toBe(400);
          expect(store.advisories).toEqual([]);
          expect(notified).toEqual([]);
          return;
        }
        expect(res.status).toBe(201);
        const distinct = [...new Set(list)];
        expect(store.advisories.map((a) => a.cell)).toEqual(distinct);
        for (const a of store.advisories) expect(a.expiresAtS).toBe(NOW_S + 3 * DAY_S);
        expect(notified.map((n) => n.cell)).toEqual(distinct);
        expect(store.audits).toEqual([
          {
            kind: 'advisory',
            actor: 'beacon-user',
            detail: { id: 'adv-0001', cells: distinct.length, title: 'Water point open' },
          },
        ]);
      }),
      { numRuns: 60 },
    );
  });
});

describe('BC-06 no account can touch another account’s public status', () => {
  /** A DynamoDB stand-in for the sites table that evaluates the store's owner condition. */
  function fakeSitesTable() {
    const items = new Map<string, Record<string, { S?: string; N?: string }>>();
    const condOk = (
      key: string,
      input: {
        ConditionExpression?: string;
        ExpressionAttributeValues?: Record<string, { S?: string }>;
      },
    ) => {
      const cur = items.get(key);
      if (!input.ConditionExpression) return true;
      expect(input.ConditionExpression).toBe('attribute_not_exists(siteId) OR #o = :o');
      return !cur || cur.owner?.S === input.ExpressionAttributeValues?.[':o']?.S;
    };
    const client = {
      async send(cmd: { constructor: { name: string }; input: Record<string, unknown> }) {
        const input = cmd.input as {
          TableName: string;
          Item?: Record<string, { S?: string; N?: string }>;
          Key?: Record<string, { S?: string }>;
        };
        if (input.TableName !== 'sites') return {};
        const name = cmd.constructor.name;
        const k = (x: Record<string, { S?: string }>) => `${x.geohash6?.S}|${x.siteId?.S}`;
        if (name === 'PutItemCommand' && input.Item) {
          const key = k(input.Item);
          if (!condOk(key, cmd.input))
            throw Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
          items.set(key, input.Item);
        } else if (name === 'DeleteItemCommand' && input.Key) {
          const key = k(input.Key);
          if (!condOk(key, cmd.input))
            throw Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
          items.delete(key);
        }
        return {};
      },
    };
    return { items, client: client as unknown as DynamoDBClient };
  }

  it('BC-06 with the same site id in the same cell, each owner’s record changes only by that owner', async () => {
    const site = (name: string): Site => ({
      siteId: 'same-site',
      name,
      kind: 'pharmacy',
      geohash6: 'u4pruy',
      lat: 1,
      lng: 2,
      fridges: [],
      status: { open: true, power: 'backup', note: '', updatedAtMs: NOW_MS },
    });
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            who: fc.constantFrom('alice', 'bob'),
            op: fc.constantFrom('publish', 'unpublish'),
          }),
          { maxLength: 20 },
        ),
        async (ops) => {
          const { items, client } = fakeSitesTable();
          const store = dynamoConsoleStore(
            { business: 'business', sites: 'sites', advisories: 'advisories' },
            client,
          );
          const live = new Map<string, boolean>([
            ['alice', false],
            ['bob', false],
          ]);
          for (const o of ops) {
            if (o.op === 'publish') await store.publishSite(o.who, site(o.who), NOW_S + DAY_S);
            else await store.unpublishSite(o.who, 'u4pruy', 'same-site');
            live.set(o.who, o.op === 'publish');
            const names = [...items.values()]
              .map((it) => JSON.parse(it.status?.S ?? '{}').name)
              .sort();
            expect(names).toEqual(['alice', 'bob'].filter((w) => live.get(w)));
          }
          // The public record carries a hash of the owner, never the sub itself.
          for (const it of items.values()) {
            expect(it.owner?.S).not.toBe('alice');
            expect(it.owner?.S).not.toBe('bob');
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
