import { createHash, webcrypto } from 'node:crypto';
import { cells, fusion, guidance, sensing } from '@afterglow/core';
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { POW_BITS, type PublicDeps, groundedNumbers, handlePublic, powText } from './handler.js';
import { fetchPlaces, fetchWeather } from './publicData.js';
import { parseSubscription, transition } from './push.js';
import { dynamoCrowdStore } from './store.js';
import { type MemoryCrowdStore, memoryCrowdStore } from './testing.js';

/**
 * The public API (.kiro/specs/crowd-reports CR-03..CR-15, consoles GL-07 and HC-01),
 * driven through `handlePublic` with an in-memory store that keeps DynamoDB's rules
 * (TTL on read, atomic claims, one report per device, cell and minute).
 */

const NOW_MS = Date.UTC(2026, 10, 27, 12, 0, 0);
const NOW_S = NOW_MS / 1000;
const NOW_MIN = Math.floor(NOW_MS / 60_000);
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'.split('');
const cellArb = fc.stringOf(fc.constantFrom(...BASE32), { minLength: 6, maxLength: 6 });
const SENSES = ['chargingEdge', 'hum', 'flicker', 'magnetometer', 'telemetry', 'reported'];

/** A key and a proof of work for it on 2026-11-27, found once offline (about 0.5 s of work). */
const POW_KEY = {
  x: 'pnF5pA0DU3gCFLZPaxDypcWgsZ2q0NVL1x_DiqWzL2E',
  y: 'NsaY1VfGFQK_2RawdMqitoz5tabcXnAD6LbXbFjz1jI',
  nonce: '923492',
};
const PUSH_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/afterglow-test-endpoint';
const PUSH_NONCE = '62585';
const P256DH = `B${'a'.repeat(86)}`;
const AUTH = 'abcdefghijklmnopqrstuv';

const leadingZeroBits = (b: Uint8Array): number => {
  let n = 0;
  for (const x of b) {
    if (x === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(x) - 24;
  }
  return n;
};
const sha = (s: string) => new Uint8Array(createHash('sha256').update(s).digest());
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const depsFor = (store: MemoryCrowdStore, extra: Partial<PublicDeps> = {}): PublicDeps => ({
  store,
  nowMs: () => NOW_MS,
  ...extra,
});
const post = (deps: PublicDeps, routeKey: string, body: unknown, requester = 'r0') =>
  handlePublic(
    {
      routeKey,
      query: {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
      requester,
    },
    deps,
  );
const get = (deps: PublicDeps, routeKey: string, query: Record<string, string>, requester = 'r0') =>
  handlePublic({ routeKey, query, body: null, requester }, deps);

interface Device {
  readonly id: string;
  readonly key: CryptoKey;
}
let deviceCounter = 0;
/** A day key registered straight into the store (registration itself is tested under CR-08). */
async function device(store: MemoryCrowdStore): Promise<Device> {
  const kp = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const jwk = await webcrypto.subtle.exportKey('jwk', kp.publicKey);
  const id = `dev${String(deviceCounter++).padStart(6, '0')}`.padEnd(22, 'A');
  await store.putDevice(
    id,
    JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y }),
    NOW_S + 86_400,
  );
  return { id, key: kp.privateKey };
}
async function signed(d: Device, report: unknown, text = JSON.stringify(report)) {
  const sig = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    d.key,
    new TextEncoder().encode(text),
  );
  return {
    deviceId: d.id,
    report: JSON.stringify(report),
    signature: Buffer.from(sig).toString('base64url'),
  };
}
const reportArb = (cell: fc.Arbitrary<string> = cellArb) =>
  fc.record({
    geohash6: cell,
    minute: fc.integer({ min: NOW_MIN - 10, max: NOW_MIN + 10 }),
    verdict: fc.constantFrom('present', 'absent', 'unknown'),
    // `+ 0` turns -0 into 0, as JSON does.
    confidence: fc.double({ min: 0, max: 1, noNaN: true }).map((c) => c + 0),
    senses: fc.array(fc.constantFrom(...SENSES), { maxLength: 6 }),
    restoreEdge: fc.boolean(),
  });

let logSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => logSpy.mockRestore());

describe('CR-03 the server checks before it stores', () => {
  it('CR-03 a signed, whitelisted report from a registered key is stored once per device, cell and minute', async () => {
    await fc.assert(
      fc.asyncProperty(reportArb(), async (report) => {
        const store = memoryCrowdStore();
        const deps = depsFor(store);
        const d = await device(store);
        const body = await signed(d, report);
        const first = await post(deps, 'POST /v1/reports', body);
        expect(first.status).toBe(202);
        expect(JSON.parse(first.body)).toEqual({ accepted: true, duplicate: false });
        const again = await post(deps, 'POST /v1/reports', body);
        expect(JSON.parse(again.body)).toEqual({ accepted: true, duplicate: true });
        const kept = await store.reportsSince(report.geohash6, NOW_MIN - 60, NOW_S);
        expect(kept).toEqual([
          { deviceEpoch: d.id, ...report, senses: [...new Set(report.senses)].sort() },
        ]);
      }),
      { numRuns: 40 },
    );
  });

  it('CR-03 an unknown key, a wrong signature, an extra field or a skewed minute stores nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportArb(),
        fc.constantFrom('unknownKey', 'otherText', 'otherKey', 'extraField', 'skew', 'badSig'),
        fc.integer({ min: 11, max: 10_000 }),
        async (report, attack, skew) => {
          const store = memoryCrowdStore();
          const deps = depsFor(store);
          const d = await device(store);
          const other = await device(store);
          let body: { deviceId: string; report: string; signature: string };
          if (attack === 'unknownKey')
            body = { ...(await signed(d, report)), deviceId: 'nobodyAAAAAAAAAAAAAAAA' };
          else if (attack === 'otherText')
            body = { ...(await signed(d, report, JSON.stringify({ ...report, verdict: 'x' }))) };
          else if (attack === 'otherKey')
            body = { ...(await signed(other, report)), deviceId: d.id };
          else if (attack === 'extraField') body = await signed(d, { ...report, lat: 51.5 });
          else if (attack === 'skew') body = await signed(d, { ...report, minute: NOW_MIN - skew });
          else body = { ...(await signed(d, report)), signature: 'AAAA' };
          const res = await post(deps, 'POST /v1/reports', body);
          expect([400, 401]).toContain(res.status);
          expect(await store.reportsSince(report.geohash6, NOW_MIN - 20_000, NOW_S)).toEqual([]);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('CR-03 reports are stored for 2 hours and expired items are ignored on read', async () => {
    const store = memoryCrowdStore();
    const seen: number[] = [];
    const spy: MemoryCrowdStore = {
      ...store,
      putReport: (r, exp) => {
        seen.push(exp);
        return store.putReport(r, exp);
      },
    };
    const d = await device(store);
    const report = {
      geohash6: 'u4pruy',
      minute: NOW_MIN,
      verdict: 'absent',
      confidence: 0.8,
      senses: ['hum'],
      restoreEdge: false,
    };
    expect((await post(depsFor(spy), 'POST /v1/reports', await signed(d, report))).status).toBe(
      202,
    );
    expect(seen).toEqual([NOW_S + 2 * 3600]);

    // The DynamoDB store itself skips anything past its expiry (TTL deletes lazily).
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            exp: fc.integer({ min: NOW_S - 7200, max: NOW_S + 7200 }),
            ok: fc.boolean(),
          }),
          { maxLength: 20 },
        ),
        async (items) => {
          const client = {
            send: async () => ({
              Items: items.map((it, i) => ({
                expiresAt: { N: String(it.exp) },
                report: { S: it.ok ? JSON.stringify({ i }) : '{not json' },
              })),
            }),
          } as unknown as DynamoDBClient;
          const ds = dynamoCrowdStore(
            {
              reports: 'r',
              device: 'd',
              cache: 'c',
              push: 'p',
              history: 'h',
              advisories: 'a',
              sites: 's',
            },
            client,
          );
          const out = (await ds.reportsSince('u4pruy', 0, NOW_S)) as unknown as { i: number }[];
          expect(out.map((o) => o.i)).toEqual(
            items.flatMap((it, i) => (it.exp > NOW_S && it.ok ? [i] : [])),
          );
        },
      ),
    );
  });
});

describe('CR-04 cells are k-anonymous, checked again at the API', () => {
  it('CR-04 for any multiset of stored reports, no cell is published with fewer than 5 devices', async () => {
    const center = 'u4pruy';
    const region = sensing.cellsAround(center, 3, 3).flat();
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            device: fc.integer({ min: 0, max: 11 }),
            cell: fc.constantFrom(...region),
            minute: fc.integer({ min: NOW_MIN - 40, max: NOW_MIN }),
            verdict: fc.constantFrom('present', 'absent', 'unknown') as fc.Arbitrary<
              'present' | 'absent' | 'unknown'
            >,
            restoreEdge: fc.boolean(),
          }),
          { maxLength: 80 },
        ),
        async (rs) => {
          const store = memoryCrowdStore();
          for (const r of rs) {
            await store.putReport(
              {
                deviceEpoch: `d${r.device}`,
                geohash6: r.cell,
                minute: r.minute,
                verdict: r.verdict,
                confidence: 0.7,
                senses: ['hum'],
                restoreEdge: r.restoreEdge,
              },
              NOW_S + 7200,
            );
          }
          const res = await get(depsFor(store), 'GET /v1/cells', { center, cols: '3', rows: '3' });
          expect(res.status).toBe(200);
          const out = JSON.parse(res.body) as {
            cells: { geohash6: string; state: string; deviceCount: number; provenance: string[] }[];
          };
          expect(out.cells).toHaveLength(9);
          for (const c of out.cells) {
            const devices = new Set(
              rs
                .filter((r) => r.cell === c.geohash6 && r.minute > NOW_MIN - 30)
                .map((r) => r.device),
            );
            if (c.state === 'unknown') {
              expect(c.deviceCount).toBe(0);
              expect(c.provenance).toEqual([]);
            } else {
              expect(c.deviceCount).toBeGreaterThanOrEqual(cells.K_ANONYMITY);
              expect(devices.size).toBeGreaterThanOrEqual(c.deviceCount);
            }
          }
        },
      ),
      { numRuns: 80 },
    );
  });

  it('CR-04 end to end: four signed dark reports stay unknown, the fifth device makes the cell dark', async () => {
    const store = memoryCrowdStore();
    const deps = depsFor(store);
    const cell = 'u4pruy';
    for (let i = 0; i < 5; i++) {
      const d = await device(store);
      const r = {
        geohash6: cell,
        minute: NOW_MIN,
        verdict: 'absent',
        confidence: 0.8,
        senses: ['chargingEdge', 'hum'],
        restoreEdge: false,
      };
      expect((await post(deps, 'POST /v1/reports', await signed(d, r))).status).toBe(202);
      const res = JSON.parse(
        (await get(deps, 'GET /v1/cells', { center: cell, cols: '1', rows: '1' })).body,
      );
      expect(res.cells[0]).toMatchObject(
        i < 4 ? { state: 'unknown', deviceCount: 0 } : { state: 'dark', deviceCount: 5 },
      );
    }
  });
});

describe('CR-05 the demo goes through the same endpoint and aggregation', () => {
  it('CR-05 scope=demo answers the same shape, and every cell obeys k = 5', async () => {
    const store = memoryCrowdStore();
    const start = NOW_MIN - 120;
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -30, max: 360 }), async (offset) => {
        const res = await get(depsFor(store), 'GET /v1/cells', {
          scope: 'demo',
          start: String(start),
          at: String(start + offset),
        });
        expect(res.status).toBe(200);
        const out = JSON.parse(res.body);
        expect(out.scope).toBe('demo');
        expect(cells.isGeohash6(out.userCell)).toBe(true);
        expect(out.cells.length).toBeGreaterThan(0);
        for (const c of out.cells) {
          expect(Object.keys(c).sort()).toEqual(
            ['col', 'deviceCount', 'geohash6', 'provenance', 'row', 'state', 'windowStart'].sort(),
          );
          if (c.state === 'unknown') expect(c.deviceCount).toBe(0);
          else expect(c.deviceCount).toBeGreaterThanOrEqual(cells.K_ANONYMITY);
        }
      }),
      { numRuns: 20 },
    );
    expect(
      (
        await get(depsFor(store), 'GET /v1/cells', {
          scope: 'demo',
          start: String(NOW_MIN - 8 * 24 * 60),
        })
      ).status,
    ).toBe(400);
  });
});

describe('CR-06 public data leaves only a cell centre behind', () => {
  it('CR-06 the Overpass query carries only the cell centre, and a failing source is "unreachable"', async () => {
    await fc.assert(
      fc.asyncProperty(cellArb, async (cell) => {
        const c = cells.decodeCenter(cell);
        const bodies: string[] = [];
        const fetcher = (async (_url: string, init?: { body?: string }) => {
          bodies.push(decodeURIComponent(String(init?.body ?? '').replace(/^data=/, '')));
          throw new Error('offline');
        }) as unknown as typeof fetch;
        expect(await fetchPlaces(cell, fetcher)).toBeNull();
        expect(bodies.length).toBeGreaterThan(0);
        for (const b of bodies) {
          const coords = [...b.matchAll(/around:\d+,(-?\d+\.\d+),(-?\d+\.\d+)/g)];
          expect(coords.length).toBeGreaterThan(0);
          for (const m of coords) {
            expect(m[1]).toBe(c.lat.toFixed(5));
            expect(m[2]).toBe(c.lng.toFixed(5));
          }
        }
      }),
      { numRuns: 30 },
    );
    const store = memoryCrowdStore();
    const res = await get(depsFor(store, { places: async () => null }), 'GET /v1/places', {
      cell: 'u4pruy',
    });
    expect(res.status).toBe(503);
    expect(res.body).toContain('unreachable');
  });

  it('CR-06 weather is asked for the ~5 km area only, once per area, and names its source', async () => {
    await fc.assert(
      fc.asyncProperty(cellArb, fc.constantFrom(...BASE32), async (cell, last) => {
        const asked: string[] = [];
        const store = memoryCrowdStore();
        const deps = depsFor(store, {
          weather: async (g) => {
            asked.push(g);
            return {
              center: cells.decodeCenter(g),
              hourly: [{ atMs: NOW_MS, tempC: 3, feelsC: 1 }],
              source: 'Open-Meteo forecast (CC BY 4.0)',
              fetchedAt: '',
            };
          },
        });
        const a = await get(deps, 'GET /v1/weather', { cell });
        const b = await get(deps, 'GET /v1/weather', { cell: `${cell.slice(0, 5)}${last}` });
        expect(a.status).toBe(200);
        expect(b.body).toBe(a.body);
        expect(asked).toEqual([`${cell.slice(0, 5)}h`]);
      }),
      { numRuns: 40 },
    );
    await fc.assert(
      fc.asyncProperty(cellArb, async (cell) => {
        const urls: string[] = [];
        const fetcher = (async (url: string) => {
          urls.push(url);
          return new Response('{"hourly":{"time":[],"temperature_2m":[]}}');
        }) as unknown as typeof fetch;
        // No usable hours is "unreachable", never an invented forecast.
        expect(await fetchWeather(cell, fetcher)).toBeNull();
        const c = cells.decodeCenter(cell);
        expect(urls[0]).toContain(`latitude=${c.lat.toFixed(3)}&longitude=${c.lng.toFixed(3)}&`);
      }),
      { numRuns: 30 },
    );
  });
});

describe('CR-08 a day key costs a proof of work', () => {
  const register = (nowMs: number, x: string, y: string, nonce: unknown) =>
    handlePublic(
      {
        routeKey: 'POST /v1/devices',
        query: {},
        body: JSON.stringify({ publicKey: { kty: 'EC', crv: 'P-256', x, y }, nonce }),
      },
      { store: memoryCrowdStore(), nowMs: () => nowMs },
    );
  const oracle = (nowMs: number, x: string, y: string, nonce: string) =>
    /^[0-9]{1,16}$/.test(nonce) &&
    [0, 1].some(
      (d) => leadingZeroBits(sha(powText(dayOf(nowMs - d * 86_400_000), x, y, nonce))) >= POW_BITS,
    );

  it('CR-08 the found nonce is a 20-bit proof for today and is accepted today and tomorrow, not after', async () => {
    expect(oracle(NOW_MS, POW_KEY.x, POW_KEY.y, POW_KEY.nonce)).toBe(true);
    const ok = await register(NOW_MS, POW_KEY.x, POW_KEY.y, POW_KEY.nonce);
    expect(ok.status).toBe(201);
    expect(JSON.parse(ok.body).deviceId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await register(NOW_MS + 86_400_000, POW_KEY.x, POW_KEY.y, POW_KEY.nonce)).status).toBe(
      201,
    );
    expect(
      (await register(NOW_MS + 2 * 86_400_000, POW_KEY.x, POW_KEY.y, POW_KEY.nonce)).status,
    ).toBe(400);
    expect((await register(NOW_MS - 86_400_000, POW_KEY.x, POW_KEY.y, POW_KEY.nonce)).status).toBe(
      400,
    );
  });

  it('CR-08 any other nonce or key is accepted exactly when it is itself a 20-bit proof', async () => {
    const b64 = fc.stringOf(
      fc.constantFrom(
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split(''),
      ),
      { minLength: 43, maxLength: 43 },
    );
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.stringMatching(/^[0-9]{1,16}$/),
          fc.string(),
          fc.constant(POW_KEY.nonce),
          fc.constant(`0${POW_KEY.nonce}`),
          fc.constant(`${POW_KEY.nonce}0`),
        ),
        fc.oneof(fc.constant(POW_KEY.x), b64),
        async (nonce, x) => {
          const res = await register(NOW_MS, x, POW_KEY.y, nonce);
          expect(res.status).toBe(oracle(NOW_MS, x, POW_KEY.y, nonce) ? 201 : 400);
        },
      ),
      { numRuns: 100 },
    );
    expect((await register(NOW_MS, POW_KEY.x, POW_KEY.y, Number(POW_KEY.nonce))).status).toBe(400);
  });
});

describe('CR-09 one day key reports from at most two cells', () => {
  it('CR-09 a key keeps the first two cells it used that day; any third is refused with 429', async () => {
    const pool = ['u4pruy', 'u4pruv', 'u4prvj', 'gcpvj0'];
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom(...pool), { minLength: 1, maxLength: 8 }),
        async (seq) => {
          const store = memoryCrowdStore();
          const deps = depsFor(store);
          const d = await device(store);
          const allowed: string[] = [];
          for (const [i, cell] of seq.entries()) {
            const r = {
              geohash6: cell,
              minute: NOW_MIN - i,
              verdict: 'absent',
              confidence: 0.8,
              senses: ['hum'],
              restoreEdge: false,
            };
            const res = await post(deps, 'POST /v1/reports', await signed(d, r));
            if (!allowed.includes(cell) && allowed.length < 2) allowed.push(cell);
            expect(res.status).toBe(allowed.includes(cell) ? 202 : 429);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

describe('CR-10 background places fetches are bounded', () => {
  it('CR-10 one fetch per cell at a time, at most 2 a minute per requester and 20 in all', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            cell: fc.integer({ min: 0, max: 40 }),
            requester: fc.integer({ min: 0, max: 15 }),
          }),
          { maxLength: 120 },
        ),
        async (reqs) => {
          const store = memoryCrowdStore();
          const started: { cell: string; requester: string }[] = [];
          let requester = '';
          const deps = depsFor(store, {
            warmPlaces: async (g) => {
              started.push({ cell: g, requester });
            },
          });
          for (const r of reqs) {
            requester = `q${r.requester}`;
            const cell = `u4pr${BASE32[Math.floor(r.cell / 32)]}${BASE32[r.cell % 32]}`;
            const res = await get(deps, 'GET /v1/places', { cell }, requester);
            expect(res.status).toBe(202);
          }
          expect(started.length).toBeLessThanOrEqual(20);
          const perReq = new Map<string, number>();
          for (const s of started) perReq.set(s.requester, (perReq.get(s.requester) ?? 0) + 1);
          for (const n of perReq.values()) expect(n).toBeLessThanOrEqual(2);
          // Never two fetches for one cell while the first holds it (nothing completes here).
          expect(new Set(started.map((s) => s.cell)).size).toBe(started.length);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe('CR-11 the crowd alone never switches an outage', () => {
  it('CR-11 no number of neighbour reports makes fusion say "absent" without a sense of the phone', async () => {
    fc.assert(
      fc.property(fc.nat({ max: 10_000 }), (n) => {
        expect(fusion.fuse([], { neighbourAbsentReports: n, k: 5 }).verdict).not.toBe('absent');
        expect(
          fusion.fuse([{ sense: 'hum', direction: 'unknown', confidence: 0 }], {
            neighbourAbsentReports: n,
            k: 5,
          }).verdict,
        ).not.toBe('absent');
      }),
    );
  });
});

describe('CR-12 / CR-15 push subscriptions for a followed cell', () => {
  it('CR-12 only an https endpoint at a browser push service is accepted', () => {
    const hostArb = fc.oneof(
      fc.constantFrom(
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com',
        'wns2-par02p.notify.windows.com',
      ),
      fc.domain(),
      fc.constantFrom(
        'evil.com',
        'fcm.googleapis.com.evil.com',
        'push.apple.com.example',
        '169.254.169.254',
        'localhost',
      ),
    );
    const good =
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/;
    fc.assert(
      fc.property(
        fc.constantFrom('https', 'http'),
        hostArb,
        fc.constantFrom('', ':8443', ':443'),
        fc.constantFrom('', 'user:pw@'),
        fc.webPath(),
        (scheme, host, port, auth, path) => {
          const endpoint = `${scheme}://${auth}${host}${port}${path}`;
          const sub = parseSubscription({ endpoint, keys: { p256dh: P256DH, auth: AUTH } });
          const expected =
            scheme === 'https' &&
            (port === '' || port === ':443') &&
            auth === '' &&
            good.test(host);
          expect(sub !== null).toBe(expected);
          if (sub) expect(Object.keys(sub).sort()).toEqual(['endpoint', 'keys']);
        },
      ),
    );
    expect(
      parseSubscription({ endpoint: PUSH_ENDPOINT, keys: { p256dh: 'short', auth: AUTH } }),
    ).toBeNull();
    expect(
      parseSubscription({ endpoint: PUSH_ENDPOINT, keys: { p256dh: P256DH, auth: 'x' } }),
    ).toBeNull();
  });

  const subscribeBody = (cellsList: unknown, keys = { p256dh: P256DH, auth: AUTH }) => ({
    subscription: { endpoint: PUSH_ENDPOINT, keys },
    cells: cellsList,
    nonce: PUSH_NONCE,
  });

  it('CR-12 a subscription is stored under 1 to 3 cells for 30 days and deleted on unsubscribe', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(cellArb, { minLength: 0, maxLength: 5 }), async (follow) => {
        const store = memoryCrowdStore();
        const deps = depsFor(store, { confirmPush: async () => 'ok' });
        const res = await post(deps, 'POST /v1/push/subscribe', subscribeBody(follow));
        if (follow.length < 1 || follow.length > 3) {
          expect(res.status).toBe(400);
          expect(store.written().filter((w) => w.includes('fcm.googleapis.com'))).toEqual([]);
          return;
        }
        expect(res.status).toBe(201);
        const out = JSON.parse(res.body);
        expect(out.following.sort()).toEqual([...new Set(follow)].sort());
        expect(out.expiresAt).toBe((NOW_S + 30 * 86_400) * 1000);
        for (const c of follow) {
          const page = await store.subsPage(c, NOW_S, null, 500);
          expect(page.subs).toHaveLength(1);
          expect(JSON.parse(page.subs[0]?.sub ?? '{}')).toEqual({
            endpoint: PUSH_ENDPOINT,
            keys: { p256dh: P256DH, auth: AUTH },
          });
          expect((await store.subsPage(c, NOW_S + 30 * 86_400, null, 500)).subs).toHaveLength(0);
        }
        await post(deps, 'POST /v1/push/unsubscribe', { endpoint: PUSH_ENDPOINT, cells: follow });
        for (const c of follow)
          expect((await store.subsPage(c, NOW_S, null, 500)).subs).toHaveLength(0);
      }),
      { numRuns: 40 },
    );
  });

  it('CR-15 the proof of work is required, a new subscription is confirmed first, and a refused one is never stored', async () => {
    const store = memoryCrowdStore();
    const confirms: string[] = [];
    let answer: 'ok' | 'rejected' | 'error' = 'rejected';
    const deps = depsFor(store, {
      confirmPush: async (s) => {
        confirms.push(s.endpoint);
        return answer;
      },
    });
    expect(
      (await post(deps, 'POST /v1/push/subscribe', { ...subscribeBody(['u4pruy']), nonce: '1' }))
        .status,
    ).toBe(400);
    expect(confirms).toEqual([]);
    expect((await post(deps, 'POST /v1/push/subscribe', subscribeBody(['u4pruy']))).status).toBe(
      400,
    );
    expect((await store.subsPage('u4pruy', NOW_S, null, 500)).subs).toHaveLength(0);
    answer = 'error';
    expect((await post(deps, 'POST /v1/push/subscribe', subscribeBody(['u4pruy']))).status).toBe(
      503,
    );
    expect((await store.subsPage('u4pruy', NOW_S, null, 500)).subs).toHaveLength(0);
    answer = 'ok';
    expect((await post(deps, 'POST /v1/push/subscribe', subscribeBody(['u4pruy']))).status).toBe(
      201,
    );
    expect(confirms).toHaveLength(3);
    // An identical renewal skips the confirmation; changed keys are confirmed again.
    expect((await post(deps, 'POST /v1/push/subscribe', subscribeBody(['u4pruy']))).status).toBe(
      201,
    );
    expect(confirms).toHaveLength(3);
    expect(
      (
        await post(
          deps,
          'POST /v1/push/subscribe',
          subscribeBody(['u4pruy'], { p256dh: `C${'b'.repeat(86)}`, auth: AUTH }),
        )
      ).status,
    ).toBe(201);
    expect(confirms).toHaveLength(4);
  });
});

describe('CR-13 one notification per crossing into or out of dark', () => {
  it('CR-13 only dark, and dark to coming back or lit, call for a notification', () => {
    const states = ['dark', 'lit', 'mixed', 'comingBack', 'unknown'];
    fc.assert(
      fc.property(
        fc.option(fc.constantFrom(...states), { nil: null }),
        fc.constantFrom(...states),
        (last, next) => {
          const t = transition(last, next);
          if (next === 'dark') expect(t).toBe(last === 'dark' ? null : 'outage');
          else if ((next === 'comingBack' || next === 'lit') && last === 'dark')
            expect(t).toBe('restoration');
          else expect(t).toBeNull();
        },
      ),
    );
  });

  it('CR-13 five dark devices notify once; more dark reports do not notify again; under k never notifies', async () => {
    const store = memoryCrowdStore();
    const sent: [string, string, number][] = [];
    const deps = depsFor(store, {
      notifyCell: async (g, kind, n) => {
        sent.push([g, kind, n]);
      },
    });
    const cell = 'u4pruy';
    for (let i = 0; i < 8; i++) {
      const d = await device(store);
      const r = {
        geohash6: cell,
        minute: NOW_MIN,
        verdict: 'absent',
        confidence: 0.8,
        senses: ['hum'],
        restoreEdge: false,
      };
      await post(deps, 'POST /v1/reports', await signed(d, r));
      expect(sent).toEqual(i < 4 ? [] : [[cell, 'outage', 5]]);
    }
  });
});

describe('GL-07 Ask phrasing is grounded in the passages', () => {
  const numArb = fc.oneof(
    fc.nat({ max: 999 }).map(String),
    fc.tuple(fc.nat({ max: 99 }), fc.nat({ max: 9 })).map(([a, b]) => `${a}.${b}`),
  );
  const wordsArb = fc
    .array(fc.stringMatching(/^[a-z]{1,8}$/), { maxLength: 8 })
    .map((w) => w.join(' '));

  it('GL-07 a phrasing that only reuses the passages’ numbers passes', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(wordsArb, numArb), { minLength: 1, maxLength: 6 }),
        fc.array(fc.nat(), { maxLength: 6 }),
        (parts, picks) => {
          const passages = parts.map(([w, n]) => `${w} ${n} h.`);
          const nums = parts.map(([, n]) => n);
          const phrasing = `Keep it shut ${picks.map((p) => nums[p % nums.length]).join(' and ')} hours.`;
          expect(groundedNumbers(phrasing, passages)).toBe(true);
        },
      ),
    );
  });

  /** The same numbers written in other scripts' digits, as a model answering in that language might. */
  const DIGIT_ZEROS = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xe50, 0xff10];
  const scriptNumArb = fc
    .tuple(numArb, fc.constantFrom(...DIGIT_ZEROS))
    .map(([n, zero]) => n.replace(/[0-9]/g, (d) => String.fromCharCode(zero + Number(d))));

  it('GL-07 a phrasing that introduces any number not in the passages is rejected', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(wordsArb, numArb), { maxLength: 6 }),
        scriptNumArb,
        wordsArb,
        (parts, extra, words) => {
          const passages = parts.map(([w, n]) => `${w} ${n} h.`);
          const inPassages = new Set(passages.join(' ').match(/\d+(?:[.,]\d+)?/g) ?? []);
          fc.pre(!inPassages.has(extra));
          expect(groundedNumbers(`${words} about ${extra} hours.`, passages)).toBe(false);
        },
      ),
    );
  });

  it('GL-07 regression: a number inside a longer passage number is still a new number', () => {
    // Shrunk counterexample (2026-11-27): passages [" 0.0 h."], phrasing " about 0 hours."
    // was accepted, because "0.0" contains "0". The same let "2" through next to "28".
    expect(groundedNumbers(' about 0 hours.', [' 0.0 h.'])).toBe(false);
    expect(groundedNumbers('Keep it 2 days.', ['Many insulins keep 28 days.'])).toBe(false);
    expect(groundedNumbers('About 4 hours.', ['A full freezer keeps 48 hours.'])).toBe(false);
    expect(groundedNumbers('Wait 3 minutes.', ['Wait 30 minutes.'])).toBe(false);
    expect(groundedNumbers('Up to 28 days.', ['Many insulins keep 28 days.'])).toBe(true);
    // Shrunk counterexample (2026-11-27): no passages, phrasing " about ٠ hours." was
    // accepted: digits of another script were not seen as a number at all.
    expect(groundedNumbers(' about ٠ hours.', [])).toBe(false);
    expect(groundedNumbers('صالح لمدة ٤٨ ساعة', ['A full freezer keeps 48 hours.'])).toBe(false);
  });

  it('GL-07 every library answer returns its passages and sources, and an invented number is dropped', async () => {
    const questions = [
      'chicken in the fridge',
      'insulin out of the fridge',
      'generator in the garage',
      'is the water safe',
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...questions),
        fc.boolean(),
        fc.nat({ max: 1000 }),
        async (q, invent, n) => {
          const store = memoryCrowdStore();
          const found = guidance.ask(q);
          if (found.kind !== 'answer') throw new Error('library question');
          const source = found.passages.map((p) => p.text).join(' ');
          const numbers: string[] = source.match(/\d+(?:[.,]\d+)?/g) ?? [];
          const novel = invent && !numbers.includes(String(n));
          const phrased = novel ? `It is fine for ${n} hours.` : 'Keep the door shut.';
          const res = await post(depsFor(store, { phrase: async () => phrased }), 'POST /v1/ask', {
            question: q,
          });
          const out = JSON.parse(res.body);
          expect(out.kind).toBe('answer');
          expect(out.passages).toEqual(found.passages);
          expect(out.sources).toEqual(found.guide.sources);
          expect(out.phrased).toBe(novel ? null : phrased);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('GL-07 questions outside the library never reach the model; phrasing is limited to 6 a minute per bucket and 120 in all', async () => {
    const store = memoryCrowdStore();
    let calls = 0;
    const deps = depsFor(store, {
      phrase: async () => {
        calls++;
        return 'Keep the door shut.';
      },
    });
    const outside = await post(deps, 'POST /v1/ask', { question: 'who won the football' });
    expect(JSON.parse(outside.body)).toEqual({ kind: 'outside' });
    expect(calls).toBe(0);
    const phrasedFor = async (requester: string) =>
      JSON.parse(
        (await post(deps, 'POST /v1/ask', { question: 'chicken in the fridge' }, requester)).body,
      );
    for (let i = 0; i < 6; i++) expect((await phrasedFor('one')).phrased).not.toBeNull();
    const seventh = await phrasedFor('one');
    expect(seventh.phrased).toBeNull();
    expect(seventh.passages.length).toBeGreaterThan(0);
    for (let b = 0; b < 19; b++) for (let i = 0; i < 6; i++) await phrasedFor(`b${b}`);
    expect(calls).toBe(120);
    expect((await phrasedFor('fresh')).phrased).toBeNull();
    expect(calls).toBe(120);
  });
});

describe('HC-01 history records the published state per 5-minute window', () => {
  it('HC-01 a report records its cell’s published state for its window; unknown is never recorded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('absent', 'present'), { minLength: 1, maxLength: 9 }),
        async (verdicts) => {
          const store = memoryCrowdStore();
          const deps = depsFor(store);
          const cell = 'u4pruy';
          for (const v of verdicts) {
            const d = await device(store);
            const r = {
              geohash6: cell,
              minute: NOW_MIN,
              verdict: v,
              confidence: 0.8,
              senses: ['hum'],
              restoreEdge: false,
            };
            await post(deps, 'POST /v1/reports', await signed(d, r));
            const pub = JSON.parse(
              (await get(deps, 'GET /v1/cells', { center: cell, cols: '1', rows: '1' })).body,
            ).cells[0];
            const ws = await store.windowsSince(cell, NOW_MIN - 60, NOW_S);
            if (pub.state === 'unknown') {
              expect(ws).toEqual([]);
            } else {
              expect(ws).toEqual([
                {
                  windowStart: NOW_MIN - (NOW_MIN % 5),
                  state: pub.state,
                  deviceCount: pub.deviceCount,
                },
              ]);
            }
          }
          // Kept 30 days, then gone.
          expect(await store.windowsSince(cell, 0, NOW_S + 30 * 86_400)).toEqual([]);
        },
      ),
      { numRuns: 25 },
    );
  });
});
