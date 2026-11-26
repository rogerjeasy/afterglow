import { createAccountService } from '@afterglow/adapters';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_RECORD_BYTES, isVaultRecord } from './envelope.js';
import { type Claims, type VaultStore, handle, memoryStore } from './handler.js';

const CLIENT = 'app-client-123';
const config = { clientId: CLIENT, now: () => 1_700_000_000_000 };

const b64 = (n: number) =>
  fc.stringOf(
    fc.constantFrom(
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split(''),
    ),
    { minLength: n, maxLength: n },
  );
const kdfArb = fc.record({
  name: fc.constant('PBKDF2-SHA256'),
  iterations: fc.integer({ min: 100_000, max: 2_000_000 }),
  salt: b64(22),
});
const sealedArb = fc.record({ iv: b64(16), ct: b64(48) });
/** A structurally valid vault record, as JSON text. */
const recordArb: fc.Arbitrary<string> = fc
  .record({
    v: fc.constant(1),
    accountId: b64(16),
    kdf: kdfArb,
    wrappedDek: sealedArb,
    recovery: fc.record({ kdf: kdfArb, wrappedDek: sealedArb }),
    data: fc.option(
      fc.record({ iv: b64(16), ct: b64(64), rev: fc.integer({ min: 1, max: 1000 }) }),
      { nil: null },
    ),
  })
  .map((r) => JSON.stringify(r));

const subArb = fc.uuid().map((u) => u.toLowerCase());
const claimsFor = (sub: string): Claims => ({ sub, token_use: 'access', client_id: CLIENT });

const get = (store: VaultStore, c: Claims) =>
  handle({ routeKey: 'GET /v1/vault', body: null }, c, store, config);
const put = (store: VaultStore, c: Claims, record: string, expectedVersion: number | null) =>
  handle(
    { routeKey: 'PUT /v1/vault', body: JSON.stringify({ record, expectedVersion }) },
    c,
    store,
    config,
  );
const del = (store: VaultStore, c: Claims) =>
  handle({ routeKey: 'DELETE /v1/vault', body: null }, c, store, config);

describe('Vault service', () => {
  it('CA-01 a request without valid claims is refused and touches nothing', async () => {
    const bad: Claims[] = [
      null,
      undefined,
      {},
      { sub: 'not-a-uuid', token_use: 'access', client_id: CLIENT },
      { sub: '0d4e3f1a-1111-4222-8333-444455556666', token_use: 'id', client_id: CLIENT },
      { sub: '0d4e3f1a-1111-4222-8333-444455556666', token_use: 'access', client_id: 'other' },
      { sub: '0d4e3f1a-1111-4222-8333-444455556666', token_use: 'access' },
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...bad),
        recordArb,
        fc.constantFrom('GET /v1/vault', 'PUT /v1/vault', 'DELETE /v1/vault'),
        async (c, rec, route) => {
          const store = memoryStore();
          const r = await handle(
            { routeKey: route, body: JSON.stringify({ record: rec, expectedVersion: null }) },
            c,
            store,
            config,
          );
          expect(r.status).toBe(401);
          expect(store.dump().size).toBe(0);
        },
      ),
    );
    // An empty configured client id never authorises anything.
    const store = memoryStore();
    const r = await handle(
      { routeKey: 'GET /v1/vault', body: null },
      { sub: '0d4e3f1a-1111-4222-8333-444455556666', token_use: 'access', client_id: '' },
      store,
      { ...config, clientId: '' },
    );
    expect(r.status).toBe(401);
  });

  it('CA-01 the body cannot name an account: an extra field is refused, not obeyed', async () => {
    const store = memoryStore();
    const a = claimsFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const [rec] = fc.sample(recordArb, 1) as [string];
    const r = await handle(
      {
        routeKey: 'PUT /v1/vault',
        body: JSON.stringify({
          record: rec,
          expectedVersion: null,
          accountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }),
      },
      a,
      store,
      config,
    );
    expect(r.status).toBe(400);
    expect(store.dump().size).toBe(0);
  });

  it('CA-02 across any interleaving of many users, each sees only their own record', async () => {
    type Op = { user: number; kind: 'get' | 'put' | 'del'; rec: string };
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(subArb, { minLength: 2, maxLength: 6 }),
        fc.array(
          fc.record({
            user: fc.nat({ max: 5 }),
            kind: fc.constantFrom<'get' | 'put' | 'del'>('get', 'put', 'put', 'del'),
            rec: recordArb,
          }),
          { minLength: 1, maxLength: 40 },
        ),
        async (users, ops: Op[]) => {
          const store = memoryStore();
          // The model: what each user last stored successfully, and its version.
          const model = new Map<string, { rec: string; version: number }>();
          for (const op of ops) {
            const sub = users[op.user % users.length] as string;
            const c = claimsFor(sub);
            if (op.kind === 'put') {
              const expected = model.get(sub)?.version ?? null;
              const r = await put(store, c, op.rec, expected);
              expect(r.status).toBe(200);
              model.set(sub, { rec: op.rec, version: (expected ?? 0) + 1 });
            } else if (op.kind === 'del') {
              expect((await del(store, c)).status).toBe(204);
              model.delete(sub);
            } else {
              const r = await get(store, c);
              const mine = model.get(sub);
              if (!mine) expect(r.status).toBe(404);
              else {
                expect(r.status).toBe(200);
                expect(JSON.parse(r.body as string).record).toBe(mine.rec);
              }
            }
            // After every step, every user's view equals the model, never another's record.
            for (const u of users) {
              const r = await get(store, claimsFor(u));
              const mine = model.get(u);
              if (!mine) expect(r.status).toBe(404);
              else
                expect(JSON.parse(r.body as string)).toMatchObject({
                  record: mine.rec,
                  version: mine.version,
                });
            }
          }
          // The store holds exactly the users with a record, keyed by their own sub.
          expect(new Set(store.dump().keys())).toEqual(new Set(model.keys()));
        },
      ),
      { numRuns: 300 },
    );
  });

  it('CA-03 only well-formed vault records are stored', async () => {
    const a = claimsFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const junk = fc.oneof(
      fc.string(),
      fc.json(),
      recordArb.map((r) => r.replace('"v":1', '"v":2')),
      recordArb.map((r) => JSON.stringify({ ...JSON.parse(r), note: 'Insulin glargine, 3 pens' })),
      recordArb.map((r) =>
        JSON.stringify({
          ...JSON.parse(r),
          kdf: { name: 'PBKDF2-SHA256', iterations: 1, salt: 'abc' },
        }),
      ),
      recordArb.map((r) =>
        JSON.stringify({ ...JSON.parse(r), data: { iv: 'x', ct: 'plain text!', rev: 1 } }),
      ),
    );
    await fc.assert(
      fc.asyncProperty(junk, async (j) => {
        fc.pre(!isVaultRecord(j));
        const store = memoryStore();
        expect((await put(store, a, j, null)).status).toBe(400);
        expect(store.dump().size).toBe(0);
      }),
      { numRuns: 500 },
    );
    // Too large is refused even when well formed.
    const [rec] = fc.sample(recordArb, 1) as [string];
    const big = JSON.stringify({
      ...JSON.parse(rec),
      data: { iv: 'AAAAAAAAAAAAAAAA', ct: 'A'.repeat(MAX_RECORD_BYTES), rev: 1 },
    });
    expect(isVaultRecord(big)).toBe(false);
  });

  it('CA-03 a real vault record from the device’s own account service is accepted', async () => {
    const mem = new Map<string, string>();
    const service = createAccountService({
      storage: {
        getItem: (k) => mem.get(k) ?? null,
        setItem: (k, v) => void mem.set(k, v),
        removeItem: (k) => void mem.delete(k),
      },
      kdfIterations: 100_000,
    });
    const { session } = await service.createAccount({
      name: 'Ana',
      passphrase: 'a long and quiet lantern',
      confirmedAdult: true,
    });
    await service.saveData(session, { 'afterglow.household.events.v1': '[]' });
    const vaultKey = [...mem.keys()].find((k) => k.includes('vault'));
    const raw = vaultKey ? mem.get(vaultKey) : undefined;
    expect(raw).toBeTruthy();
    expect(isVaultRecord(raw)).toBe(true);
    // And it really is ciphertext: the stored data does not contain the plaintext key.
    expect(raw).not.toContain('household');
  });

  it('CA-04 versions increase by one per accepted write and a stale write is refused', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(recordArb, fc.option(fc.nat({ max: 6 }), { nil: null })), {
          minLength: 1,
          maxLength: 25,
        }),
        async (writes) => {
          const store = memoryStore();
          const a = claimsFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
          let version: number | null = null;
          for (const [rec, guess] of writes) {
            const expected = guess === 0 ? null : guess;
            const r = await put(store, a, rec, expected);
            if (expected === version) {
              expect(r.status).toBe(200);
              const next: number = (version ?? 0) + 1;
              expect(JSON.parse(r.body as string)).toEqual({ version: next });
              version = next;
            } else {
              expect(r.status).toBe(409);
              expect(JSON.parse(r.body as string)).toEqual({ version });
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('CA-05 delete removes only the caller’s vault', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(subArb, { minLength: 2, maxLength: 5 }),
        recordArb,
        async (users, rec) => {
          const store = memoryStore();
          for (const u of users)
            expect((await put(store, claimsFor(u), rec, null)).status).toBe(200);
          const [victim, ...others] = users as [string, ...string[]];
          expect((await del(store, claimsFor(victim))).status).toBe(204);
          expect((await get(store, claimsFor(victim))).status).toBe(404);
          for (const u of others) expect((await get(store, claimsFor(u))).status).toBe(200);
        },
      ),
    );
  });

  it('CA-06 a failing store yields 503 and nothing else, and unknown routes are 404', async () => {
    const failing: VaultStore = {
      get: async () => {
        throw new Error(
          'ProvisionedThroughputExceededException: table afterglow-dev-vault, key 1234',
        );
      },
      put: async () => {
        throw new Error('boom');
      },
      delete: async () => {
        throw new Error('boom');
      },
    };
    const a = claimsFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const [rec] = fc.sample(recordArb, 1) as [string];
    for (const r of [
      await get(failing, a),
      await put(failing, a, rec, null),
      await del(failing, a),
    ]) {
      expect(r.status).toBe(503);
      expect(r.body).not.toMatch(/Exception|table|key|boom/);
    }
    for (const route of ['GET /v1/vault/other', 'POST /v1/vault', 'GET /v1/users', '']) {
      expect((await handle({ routeKey: route, body: null }, a, memoryStore(), config)).status).toBe(
        404,
      );
    }
  });
});
