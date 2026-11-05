import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from '../crypto/bytes.js';
import {
  DEFAULT_KDF_ITERATIONS,
  VaultError,
  aad,
  deriveKek,
  generateDek,
  generateRecoveryCode,
  newKdf,
  normaliseRecoveryCode,
  open,
  seal,
  sealText,
  unwrapDek,
  wrapDek,
} from '../crypto/vault.js';
import { checkPassphrase } from './policy.js';
import { type RawStorage, createAccountService } from './service.js';
import { openVaultStorage } from './vault-storage.js';

const ITER = 1000; // tests only; production default is asserted separately
const PASS = 'correct horse battery staple';
const PASS2 = 'a different long passphrase';

interface Mem extends RawStorage {
  dump(): string;
  keys(): string[];
}
function mem(): Mem {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => [...m.entries()].map(([k, v]) => `${k}=${v}`).join('\n'),
    keys: () => [...m.keys()],
  };
}
function setup(startMs = 1_000_000) {
  const storage = mem();
  let t = startMs;
  const service = createAccountService({ storage, now: () => t, kdfIterations: ITER });
  return {
    storage,
    service,
    advance: (ms: number) => {
      t += ms;
    },
  };
}
const create = (s: ReturnType<typeof setup>, name = 'Thandi', pass = PASS) =>
  s.service.createAccount({ name, passphrase: pass, confirmedAdult: true });

const vaultKey = (id: string) => `afterglow.accounts.vault.v1.${id}`;

describe('Accounts and vault properties', () => {
  // ACC-04 -----------------------------------------------------------------
  it('ACC-04 nothing recognisable is stored: no passphrase, no keys, no values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.hexaString({ minLength: 8, maxLength: 16 }),
          fc.hexaString({ minLength: 12, maxLength: 40 }),
          {
            minKeys: 1,
            maxKeys: 5,
          },
        ),
        async (data) => {
          const s = setup();
          const { session, recoveryCode } = await create(s);
          await s.service.saveData(session, data);
          const raw = s.storage.dump();
          expect(raw).not.toContain(PASS);
          expect(raw).not.toContain(recoveryCode);
          expect(raw).not.toContain(recoveryCode.replaceAll('-', ''));
          for (const [k, v] of Object.entries(data)) {
            expect(raw).not.toContain(k);
            expect(raw).not.toContain(v);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('ACC-04b the vault holds only wrapped keys, KDF parameters and ciphertext', async () => {
    const s = setup();
    const { session } = await create(s);
    await s.service.saveData(session, { a: 'b' });
    const record = JSON.parse(s.storage.getItem(vaultKey(session.accountId)) as string);
    expect(Object.keys(record).sort()).toEqual(
      ['accountId', 'data', 'kdf', 'recovery', 'v', 'wrappedDek'].sort(),
    );
    expect(Object.keys(record.kdf).sort()).toEqual(['iterations', 'name', 'salt']);
    expect(Object.keys(record.wrappedDek).sort()).toEqual(['ct', 'iv']);
    expect(Object.keys(record.data).sort()).toEqual(['ct', 'iv', 'rev']);
  });

  // ACC-05 -----------------------------------------------------------------
  it('ACC-05 a wrong passphrase, an unknown account and a corrupt vault fail identically', async () => {
    const s = setup();
    const { session } = await create(s);
    const id = session.accountId;
    const wrong = await s.service.signIn(id, 'not the passphrase!!').catch((e) => e);
    const unknown = await s.service.signIn('nobody', PASS).catch((e) => e);
    s.storage.setItem(vaultKey(id), '{"broken":');
    const corrupt = await s.service.signIn(id, PASS).catch((e) => e);
    for (const e of [wrong, unknown, corrupt]) {
      expect(e).toMatchObject({ code: 'auth-failed' });
    }
    expect(wrong.message).toBe(unknown.message);
    expect(wrong.message).toBe(corrupt.message);
    expect(wrong.message).not.toMatch(/passphrase is (wrong|incorrect)/i);
  });

  it('ACC-05b any single-character change to the stored vault is detected', async () => {
    const paths = [
      ['kdf', 'salt'],
      ['wrappedDek', 'iv'],
      ['wrappedDek', 'ct'],
      ['data', 'iv'],
      ['data', 'ct'],
    ] as const;
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...paths),
        fc.nat(1000),
        fc.integer({ min: 1, max: 63 }),
        async (path, pos, shift) => {
          const s = setup();
          const { session } = await create(s);
          await s.service.saveData(session, { secret: 'value' });
          const id = session.accountId;
          const record = JSON.parse(s.storage.getItem(vaultKey(id)) as string);
          const original: string = record[path[0]][path[1]];
          const i = pos % original.length;
          const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
          const next = alphabet[(alphabet.indexOf(original[i] as string) + shift) % 64] as string;
          const changed = original.slice(0, i) + next + original.slice(i + 1);
          // Unused trailing bits of the last symbol do not change the bytes: not a real change.
          fc.pre(toBase64Url(fromBase64Url(changed)) !== original);
          record[path[0]][path[1]] = changed;
          s.storage.setItem(vaultKey(id), JSON.stringify(record));
          const result = await s.service
            .signIn(id, PASS)
            .then((sess) => s.service.loadData(sess))
            .then(() => 'opened')
            .catch(() => 'refused');
          expect(result).toBe('refused');
        },
      ),
      { numRuns: 40 },
    );
  });

  it('ACC-05c tampering with the revision or iteration count is detected', async () => {
    const s = setup();
    const { session } = await create(s);
    await s.service.saveData(session, { a: '1' });
    const id = session.accountId;
    const good = s.storage.getItem(vaultKey(id)) as string;
    type Rec = {
      v: number;
      accountId: string;
      kdf: { iterations: number };
      data: { rev: number };
    };
    const mutations: ((r: Rec) => void)[] = [
      (r) => {
        r.data.rev += 1;
      },
      (r) => {
        r.kdf.iterations += 1;
      },
      (r) => {
        r.v = 2;
      },
      (r) => {
        r.accountId = 'someone-else';
      },
    ];
    for (const mutate of mutations) {
      const r = JSON.parse(good);
      mutate(r);
      s.storage.setItem(vaultKey(id), JSON.stringify(r));
      const outcome = await s.service
        .signIn(id, PASS)
        .then((sess) => s.service.loadData(sess))
        .then(() => 'opened')
        .catch(() => 'refused');
      expect(outcome).toBe('refused');
    }
  });

  // ACC-06 / ACC-02 ---------------------------------------------------------
  it('ACC-06 a ciphertext moved to another account cannot be opened', async () => {
    const s = setup();
    const a = await create(s, 'Alice', PASS);
    const b = await create(s, 'Bob', PASS2);
    await s.service.saveData(a.session, { who: 'alice' });
    await s.service.saveData(b.session, { who: 'bob' });
    const recA = JSON.parse(s.storage.getItem(vaultKey(a.session.accountId)) as string);
    const recB = JSON.parse(s.storage.getItem(vaultKey(b.session.accountId)) as string);
    // Bob's data blob placed into Alice's vault.
    s.storage.setItem(vaultKey(a.session.accountId), JSON.stringify({ ...recA, data: recB.data }));
    await expect(s.service.loadData(a.session)).rejects.toBeInstanceOf(VaultError);
    // Bob's wrapped key placed into Alice's vault: Alice's own passphrase no longer works.
    s.storage.setItem(
      vaultKey(a.session.accountId),
      JSON.stringify({ ...recA, wrappedDek: recB.wrappedDek }),
    );
    await expect(s.service.signIn(a.session.accountId, PASS)).rejects.toMatchObject({
      code: 'auth-failed',
    });
    await expect(s.service.signIn(a.session.accountId, PASS2)).rejects.toMatchObject({
      code: 'auth-failed',
    });
  });

  it('ACC-06c the account id and purpose are bound into the ciphertext, even under the very same key', async () => {
    const dek = await generateDek();
    const sealed = await sealText(dek, 'payload', aad.data('account-A', 1));
    // Same key, same revision, different account id: must not open.
    await expect(open(dek, sealed, aad.data('account-B', 1))).rejects.toBeInstanceOf(VaultError);
    // Same key, same account, different revision or purpose: must not open.
    await expect(open(dek, sealed, aad.data('account-A', 2))).rejects.toBeInstanceOf(VaultError);
    await expect(open(dek, sealed, aad.passphraseWrap('account-A'))).rejects.toBeInstanceOf(
      VaultError,
    );
    await expect(open(dek, sealed, aad.data('account-A', 1))).resolves.toBeDefined();
  });

  it('ACC-06b a revision cannot be replayed under another revision number', async () => {
    const s = setup();
    const { session } = await create(s);
    await s.service.saveData(session, { v: 'one' });
    const old = JSON.parse(s.storage.getItem(vaultKey(session.accountId)) as string);
    await s.service.saveData(session, { v: 'two' });
    const current = JSON.parse(s.storage.getItem(vaultKey(session.accountId)) as string);
    s.storage.setItem(
      vaultKey(session.accountId),
      JSON.stringify({ ...current, data: { ...old.data, rev: current.data.rev } }),
    );
    await expect(s.service.loadData(session)).rejects.toBeInstanceOf(VaultError);
  });

  it('ACC-02 accounts are isolated: each sees only its own data and its own passphrase works', async () => {
    const s = setup();
    const a = await create(s, 'Alice', PASS);
    const b = await create(s, 'Bob', PASS2);
    await s.service.saveData(a.session, { who: 'alice' });
    await s.service.saveData(b.session, { who: 'bob' });
    expect(await s.service.loadData(a.session)).toEqual({ who: 'alice' });
    expect(await s.service.loadData(b.session)).toEqual({ who: 'bob' });
    await expect(s.service.signIn(a.session.accountId, PASS2)).rejects.toMatchObject({
      code: 'auth-failed',
    });
    await expect(s.service.signIn(b.session.accountId, PASS)).rejects.toMatchObject({
      code: 'auth-failed',
    });
  });

  // ACC-07 -----------------------------------------------------------------
  it('ACC-07 the session key cannot be exported, and a closed session does nothing', async () => {
    const s = setup();
    const { session } = await create(s);
    const key = session.useKey();
    expect(key.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toBeDefined();
    session.close();
    expect(session.active).toBe(false);
    await expect(s.service.loadData(session)).rejects.toMatchObject({ code: 'session-closed' });
    await expect(s.service.saveData(session, { a: 'b' })).rejects.toMatchObject({
      code: 'session-closed',
    });
  });

  it('ACC-07b signing in again after a lock needs the passphrase again', async () => {
    const s = setup();
    const { session } = await create(s);
    await s.service.saveData(session, { a: 'b' });
    session.close();
    const again = await s.service.signIn(session.accountId, PASS);
    expect(await s.service.loadData(again)).toEqual({ a: 'b' });
    expect(again).not.toBe(session);
  });

  // ACC-08 / ACC-09 ---------------------------------------------------------
  it('ACC-08 KDF parameters are stored; salts are unique; production default is at least 600,000', async () => {
    const s = setup();
    const a = await create(s, 'A1', PASS);
    const b = await create(s, 'B1', PASS2);
    const ra = JSON.parse(s.storage.getItem(vaultKey(a.session.accountId)) as string);
    const rb = JSON.parse(s.storage.getItem(vaultKey(b.session.accountId)) as string);
    expect(ra.kdf).toMatchObject({ name: 'PBKDF2-SHA256', iterations: ITER });
    expect(fromBase64Url(ra.kdf.salt)).toHaveLength(16);
    expect(ra.kdf.salt).not.toBe(rb.kdf.salt);
    expect(ra.recovery.kdf.salt).not.toBe(ra.kdf.salt);
    expect(DEFAULT_KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(newKdf().iterations).toBe(DEFAULT_KDF_ITERATIONS);
  });

  it('ACC-08b an account created with the production default stores that iteration count', async () => {
    const storage = mem();
    const service = createAccountService({ storage });
    const { session } = await service.createAccount({
      name: 'Prod',
      passphrase: PASS,
      confirmedAdult: true,
    });
    const rec = JSON.parse(storage.getItem(vaultKey(session.accountId)) as string);
    expect(rec.kdf.iterations).toBeGreaterThanOrEqual(600_000);
    const again = await service.signIn(session.accountId, PASS);
    expect(again.active).toBe(true);
  }, 60000);

  it('ACC-09 encrypting the same plaintext twice never repeats the IV or the ciphertext', async () => {
    const dek = await generateDek();
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 60 }), async (text) => {
        const a = await sealText(dek, text, 'x');
        const b = await sealText(dek, text, 'x');
        expect(a.iv).not.toBe(b.iv);
        expect(a.ct).not.toBe(b.ct);
      }),
      { numRuns: 40 },
    );
  });

  it('ACC-09b open(seal(x)) round-trips and fails under a different AAD or key', async () => {
    const dek = await generateDek();
    const other = await generateDek();
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 200 }), async (bytes) => {
        const sealed = await seal(dek, bytes, 'purpose-a');
        expect(Array.from(await open(dek, sealed, 'purpose-a'))).toEqual(Array.from(bytes));
        await expect(open(dek, sealed, 'purpose-b')).rejects.toBeInstanceOf(VaultError);
        await expect(open(other, sealed, 'purpose-a')).rejects.toBeInstanceOf(VaultError);
      }),
      { numRuns: 30 },
    );
  });

  it('ACC-08c wrapped keys unwrap only with the right KEK and AAD', async () => {
    const dek = await generateDek();
    const kdf = newKdf(ITER);
    const kek = await deriveKek('one passphrase', kdf);
    const wrong = await deriveKek('another passphrase', kdf);
    const wrapped = await wrapDek(dek, kek, aad.passphraseWrap('acct'));
    await expect(unwrapDek(wrapped, kek, aad.passphraseWrap('acct'))).resolves.toBeDefined();
    await expect(unwrapDek(wrapped, wrong, aad.passphraseWrap('acct'))).rejects.toBeInstanceOf(
      VaultError,
    );
    await expect(unwrapDek(wrapped, kek, aad.passphraseWrap('other'))).rejects.toBeInstanceOf(
      VaultError,
    );
    await expect(unwrapDek(wrapped, kek, aad.recoveryWrap('acct'))).rejects.toBeInstanceOf(
      VaultError,
    );
  });

  // ACC-10 -----------------------------------------------------------------
  it('ACC-10 the passphrase policy refuses weak passphrases and says why', () => {
    const weak: [string, RegExp][] = [
      ['short one', /at least 12/],
      ['aaaaaaaaaaaaaaaa', /repetitive/],
      ['abcdefghijklmnop', /runs/],
      ['123456789012345', /runs/],
      ['thandi is my name', /account name/],
      ['password', /at least 12|common/],
      ['Password12', /at least 12|common/],
      ['afterglow1234', /common/],
    ];
    for (const [p, why] of weak) {
      const r = checkPassphrase(p, 'Thandi');
      expect(r.ok, p).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(why);
    }
    for (const good of [
      'correct horse battery staple',
      'my gran bakes rusks on sundays',
      'Ñandú viaja 7 lunas',
    ]) {
      expect(checkPassphrase(good, 'Thandi').ok, good).toBe(true);
    }
  });

  it('ACC-10b anything under 12 characters is refused', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 11 }), (p) => {
        expect(checkPassphrase(p, 'Anyone').ok).toBe(false);
      }),
    );
  });

  it('ACC-10c a refused passphrase creates nothing', async () => {
    const s = setup();
    await expect(
      s.service.createAccount({ name: 'X', passphrase: 'short', confirmedAdult: true }),
    ).rejects.toMatchObject({ code: 'policy' });
    expect(s.storage.keys()).toEqual([]);
  });

  // ACC-11 -----------------------------------------------------------------
  it('ACC-11 five failures lock the account, doubling up to 15 minutes, even for the right passphrase', async () => {
    const s = setup();
    const { session } = await create(s);
    const id = session.accountId;
    for (let i = 0; i < 4; i++) {
      await expect(s.service.signIn(id, 'wrong wrong wrong')).rejects.toMatchObject({
        code: 'auth-failed',
      });
    }
    await expect(s.service.signIn(id, 'wrong wrong wrong')).rejects.toMatchObject({
      code: 'auth-failed',
    });
    expect(s.service.retryAfterMs(id)).toBe(30_000);
    // The right passphrase is refused while locked.
    await expect(s.service.signIn(id, PASS)).rejects.toMatchObject({ code: 'throttled' });
    s.advance(30_000);
    await expect(s.service.signIn(id, 'wrong wrong wrong')).rejects.toMatchObject({
      code: 'auth-failed',
    });
    expect(s.service.retryAfterMs(id)).toBe(60_000);
    let expected = 60_000;
    for (let i = 0; i < 8; i++) {
      s.advance(expected);
      await expect(s.service.signIn(id, 'wrong wrong wrong')).rejects.toMatchObject({
        code: 'auth-failed',
      });
      expected = Math.min(15 * 60_000, expected * 2);
      expect(s.service.retryAfterMs(id)).toBe(expected);
    }
    expect(expected).toBe(15 * 60_000);
    s.advance(15 * 60_000);
    await expect(s.service.signIn(id, PASS)).resolves.toBeDefined();
    expect(s.service.retryAfterMs(id)).toBe(0);
    // Success resets the counter.
    for (let i = 0; i < 4; i++) {
      await expect(s.service.signIn(id, 'wrong wrong wrong')).rejects.toMatchObject({
        code: 'auth-failed',
      });
    }
    await expect(s.service.signIn(id, PASS)).resolves.toBeDefined();
  });

  it('ACC-11b failures on one account do not lock another', async () => {
    const s = setup();
    const a = await create(s, 'Alice', PASS);
    const b = await create(s, 'Bob', PASS2);
    for (let i = 0; i < 6; i++)
      await s.service.signIn(a.session.accountId, 'nope nope nope').catch(() => {});
    expect(s.service.retryAfterMs(a.session.accountId)).toBeGreaterThan(0);
    await expect(s.service.signIn(b.session.accountId, PASS2)).resolves.toBeDefined();
  });

  // ACC-12 -----------------------------------------------------------------
  it('ACC-12 recovery codes have 125 bits in a readable format and never repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}(-[2-9A-HJ-NP-Z]{5}){4}$/);
      expect(normaliseRecoveryCode(code)).toHaveLength(25);
      seen.add(code);
    }
    expect(seen.size).toBe(300);
    expect(normaliseRecoveryCode('too short')).toBeNull();
    expect(normaliseRecoveryCode('0'.repeat(25))).toBeNull();
  });

  it('ACC-12b the recovery code resets the passphrase, keeps the data, and is spent after use', async () => {
    const s = setup();
    const { session, recoveryCode } = await create(s);
    await s.service.saveData(session, { keep: 'me' });
    session.close();
    // Lower case and no dashes still work.
    const messy = recoveryCode.replaceAll('-', '').toLowerCase();
    const { session: back, recoveryCode: next } = await s.service.recover(
      session.accountId,
      messy,
      PASS2,
    );
    expect(await s.service.loadData(back)).toEqual({ keep: 'me' });
    await expect(s.service.signIn(session.accountId, PASS)).rejects.toMatchObject({
      code: 'auth-failed',
    });
    await expect(s.service.signIn(session.accountId, PASS2)).resolves.toBeDefined();
    expect(next).not.toBe(recoveryCode);
    await expect(
      s.service.recover(session.accountId, recoveryCode, 'yet another long passphrase'),
    ).rejects.toMatchObject({ code: 'auth-failed' });
    await expect(
      s.service.recover(session.accountId, next, 'yet another long passphrase'),
    ).resolves.toBeDefined();
  });

  it('ACC-12c a wrong recovery code fails generically and counts toward the lockout', async () => {
    const s = setup();
    const { session } = await create(s);
    for (let i = 0; i < 5; i++) {
      await expect(
        s.service.recover(session.accountId, generateRecoveryCode(), PASS2),
      ).rejects.toMatchObject({ code: 'auth-failed' });
    }
    await expect(s.service.signIn(session.accountId, PASS)).rejects.toMatchObject({
      code: 'throttled',
    });
  });

  it('ACC-12d recovery refuses a weak new passphrase and changes nothing', async () => {
    const s = setup();
    const { session, recoveryCode } = await create(s);
    await expect(s.service.recover(session.accountId, recoveryCode, 'weak')).rejects.toMatchObject({
      code: 'policy',
    });
    await expect(s.service.signIn(session.accountId, PASS)).resolves.toBeDefined();
    await expect(s.service.recover(session.accountId, recoveryCode, PASS2)).resolves.toBeDefined();
  });

  // ACC-14 -----------------------------------------------------------------
  it('ACC-14 changing the passphrase needs the current one and keeps the data', async () => {
    const s = setup();
    const { session } = await create(s);
    await s.service.saveData(session, { keep: 'me' });
    await expect(
      s.service.changePassphrase(session, 'not the current one', PASS2),
    ).rejects.toMatchObject({
      code: 'auth-failed',
    });
    await s.service.changePassphrase(session, PASS, PASS2);
    await expect(s.service.signIn(session.accountId, PASS)).rejects.toMatchObject({
      code: 'auth-failed',
    });
    const again = await s.service.signIn(session.accountId, PASS2);
    expect(await s.service.loadData(again)).toEqual({ keep: 'me' });
  });

  it('ACC-14b regenerating the recovery code needs the passphrase and retires the old code', async () => {
    const s = setup();
    const { session, recoveryCode } = await create(s);
    await expect(
      s.service.regenerateRecoveryCode(session, 'wrong wrong wrong'),
    ).rejects.toMatchObject({
      code: 'auth-failed',
    });
    const fresh = await s.service.regenerateRecoveryCode(session, PASS);
    expect(fresh).not.toBe(recoveryCode);
    await expect(s.service.recover(session.accountId, recoveryCode, PASS2)).rejects.toMatchObject({
      code: 'auth-failed',
    });
    await expect(s.service.recover(session.accountId, fresh, PASS2)).resolves.toBeDefined();
  });

  // ACC-15 -----------------------------------------------------------------
  it('ACC-15 deleting needs the passphrase, then removes every trace of the account', async () => {
    const s = setup();
    const a = await create(s, 'Alice', PASS);
    const b = await create(s, 'Bob', PASS2);
    await s.service.saveData(a.session, { who: 'alice' });
    await expect(s.service.deleteAccount(a.session, 'wrong wrong wrong')).rejects.toMatchObject({
      code: 'auth-failed',
    });
    expect(s.service.listAccounts().map((x) => x.name)).toEqual(['Alice', 'Bob']);
    await s.service.deleteAccount(a.session, PASS);
    expect(s.service.listAccounts().map((x) => x.name)).toEqual(['Bob']);
    expect(s.storage.getItem(vaultKey(a.session.accountId))).toBeNull();
    expect(a.session.active).toBe(false);
    await expect(s.service.signIn(a.session.accountId, PASS)).rejects.toMatchObject({
      code: 'auth-failed',
    });
    // Bob is untouched.
    expect(await s.service.loadData(b.session)).toBeNull();
    expect(s.storage.dump()).not.toContain(a.session.accountId);
  });

  it('ACC-15b export returns the decrypted data without keys or secrets', async () => {
    const s = setup();
    const { session } = await create(s);
    await s.service.saveData(session, { hello: 'world' });
    const out = JSON.parse(await s.service.exportData(session));
    expect(out).toMatchObject({ app: 'afterglow', account: 'Thandi', data: { hello: 'world' } });
    const text = JSON.stringify(out);
    expect(text).not.toContain(PASS);
    expect(text).not.toMatch(/wrappedDek|salt|kdf/);
  });

  // ACC-16 -----------------------------------------------------------------
  it('ACC-16 an account cannot be created without the adult confirmation, and nothing is stored', async () => {
    const s = setup();
    await expect(
      s.service.createAccount({ name: 'Kid', passphrase: PASS, confirmedAdult: false }),
    ).rejects.toMatchObject({ code: 'adult-required' });
    expect(s.storage.keys()).toEqual([]);
    const ok = await create(s);
    expect(s.storage.dump()).not.toMatch(/adult|birth|age/i);
    expect(ok.session.active).toBe(true);
  });

  // names ------------------------------------------------------------------
  it('account names are validated and unique ignoring case', async () => {
    const s = setup();
    await create(s, 'Thandi');
    await expect(create(s, 'thandi', PASS2)).rejects.toMatchObject({ code: 'exists' });
    await expect(create(s, '', PASS2)).rejects.toMatchObject({ code: 'name' });
    await expect(create(s, 'x'.repeat(41), PASS2)).rejects.toMatchObject({ code: 'name' });
    await expect(create(s, 'bad\u0007name', PASS2)).rejects.toMatchObject({ code: 'name' });
  });

  // saves ------------------------------------------------------------------
  it('concurrent saves are serialised and the last write wins', async () => {
    const s = setup();
    const { session } = await create(s);
    const writes = [1, 2, 3, 4, 5].map((n) => s.service.saveData(session, { n: String(n) }));
    await Promise.all(writes);
    expect(await s.service.loadData(session)).toEqual({ n: '5' });
    const rec = JSON.parse(s.storage.getItem(vaultKey(session.accountId)) as string);
    expect(rec.data.rev).toBe(5);
  });

  it('a save does not undo a passphrase change made after the session opened', async () => {
    const s = setup();
    const { session } = await create(s);
    await s.service.changePassphrase(session, PASS, PASS2);
    await s.service.saveData(session, { late: 'write' });
    await expect(s.service.signIn(session.accountId, PASS2)).resolves.toBeDefined();
    await expect(s.service.signIn(session.accountId, PASS)).rejects.toMatchObject({
      code: 'auth-failed',
    });
  });

  // vault storage -----------------------------------------------------------
  it('vault storage persists encrypted, restores after a fresh sign-in, and never writes plaintext', async () => {
    const s = setup();
    const { session } = await create(s);
    const store = await openVaultStorage(s.service, session, 5);
    store.setItem('events', 'SECRET-EVENT-LOG-CONTENT');
    store.setItem('epoch', 'SECRET-EPOCH-VALUE');
    await store.flush();
    expect(s.storage.dump()).not.toContain('SECRET-EVENT-LOG-CONTENT');
    expect(s.storage.dump()).not.toContain('SECRET-EPOCH-VALUE');
    expect(store.lastError).toBeNull();
    await store.close();

    // A new service instance over the same raw storage, as after a page reload.
    const service2 = createAccountService({ storage: s.storage, kdfIterations: ITER });
    const again = await service2.signIn(session.accountId, PASS);
    const reopened = await openVaultStorage(service2, again, 5);
    expect(reopened.getItem('events')).toBe('SECRET-EVENT-LOG-CONTENT');
    expect(reopened.getItem('epoch')).toBe('SECRET-EPOCH-VALUE');
    reopened.removeItem('epoch');
    await reopened.close();
    const third = await openVaultStorage(
      service2,
      await service2.signIn(session.accountId, PASS),
      5,
    );
    expect(third.getItem('epoch')).toBeNull();
    expect(third.getItem('events')).toBe('SECRET-EVENT-LOG-CONTENT');
    await third.close();
  });

  it('vault storage refuses writes after close and returns nothing', async () => {
    const s = setup();
    const { session } = await create(s);
    const store = await openVaultStorage(s.service, session, 5);
    store.setItem('k', 'v');
    await store.close();
    expect(store.getItem('k')).toBeNull();
    expect(() => store.setItem('k', 'x')).toThrow();
    await expect(store.seed({ a: 'b' })).rejects.toBeDefined();
  });

  it('seeding brings data into a new account in one encrypted write', async () => {
    const s = setup();
    const { session } = await create(s);
    const store = await openVaultStorage(s.service, session, 5);
    await store.seed({ 'guest.events': '[1,2,3]' });
    expect(s.storage.dump()).not.toContain('[1,2,3]');
    expect(await s.service.loadData(session)).toEqual({ 'guest.events': '[1,2,3]' });
    await store.close();
  });
});
