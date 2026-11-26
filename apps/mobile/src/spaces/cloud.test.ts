import { type VaultStore, handle, memoryStore } from '@afterglow/vault-service/handler';
import { describe, expect, it } from 'vitest';
import type { VaultApi } from '../cloud/api';
import { type CloudAuth, CloudError } from '../cloud/auth';
import { type StorageLike, memoryStorage } from '../household/store';
import { createSpaceController } from './controller';

/**
 * Cloud accounts through the real controller and the REAL server handler
 * (services/vault): the fake API turns each fake user's token into claims and calls
 * `handle`, so isolation here is the server's isolation, seen from the app.
 */

const CLIENT = 'appclient';
const PASS_A = 'correct horse battery staple';
const PASS_B = 'my gran bakes rusks on sundays';
const ITER = 100_000; // the server refuses weaker vault records

/** Everything that went over the "network", to prove the passphrase never did (CA-09). */
type Wire = string[];

function fakeCloud(
  wire: Wire,
  opts: {
    offline?: () => boolean;
    refuseChange?: () => boolean;
    failRevocation?: () => boolean;
  } = {},
) {
  const users = new Map<string, { secret: string; confirmed: boolean; sub: string }>();
  const store: VaultStore & { dump(): ReadonlyMap<string, unknown> } = memoryStore();
  let n = 0;
  const net = (what: string): void => {
    if (opts.offline?.()) throw new CloudError('network', 'offline');
    wire.push(what);
  };

  /** Each device has its own signed-in user; the server is shared. */
  const authFor = (): CloudAuth & { current(): string | null } => {
    let current: string | null = null;
    return {
      async signUp(email, secret) {
        net(`signUp ${email} ${secret}`);
        if (users.has(email)) throw new CloudError('exists', 'exists');
        n += 1;
        users.set(email, {
          secret,
          confirmed: false,
          sub: `0000000${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
        });
      },
      async confirm(email, code) {
        net(`confirm ${email} ${code}`);
        const u = users.get(email);
        if (!u || code !== '123456') throw new CloudError('bad-code', 'bad');
        u.confirmed = true;
      },
      async resend(email) {
        net(`resend ${email}`);
      },
      async signIn(email, secret) {
        net(`signIn ${email}`); // SRP: the secret itself is never on the wire
        const u = users.get(email);
        if (!u || u.secret !== secret) {
          throw new CloudError('auth-failed', 'That email and passphrase did not open an account.');
        }
        if (!u.confirmed) throw new CloudError('unconfirmed', 'no');
        current = u.sub;
      },
      async accessToken() {
        if (!current) throw new CloudError('signed-out', 'out');
        return `token:${current}`;
      },
      signOut() {
        current = null;
      },
      async deleteUser() {
        for (const [e, u] of users) if (u.sub === current) users.delete(e);
        current = null;
      },
      async changePassword(oldSecret, newSecret) {
        net('changePassword');
        if (opts.refuseChange?.()) throw new CloudError('unknown', 'refused');
        const u = [...users.values()].find((x) => x.sub === current);
        if (!u || u.secret !== oldSecret) {
          throw new CloudError('auth-failed', 'That email and passphrase did not open an account.');
        }
        u.secret = newSecret;
      },
      async signOutEverywhere() {
        net('signOutEverywhere');
        if (opts.failRevocation?.()) throw new CloudError('network', 'offline');
        current = null;
      },
      current: () => current,
    };
  };

  const call = async (token: string, routeKey: string, body: string | null) => {
    net(`${routeKey} ${token} ${body ?? ''}`);
    const sub = token.replace(/^token:/, '');
    return handle({ routeKey, body }, { sub, token_use: 'access', client_id: CLIENT }, store, {
      clientId: CLIENT,
      now: () => 1,
    });
  };
  const api: VaultApi = {
    async get(token) {
      const r = await call(token, 'GET /v1/vault', null);
      if (r.status === 404) return null;
      const x = JSON.parse(r.body as string);
      return { record: x.record, version: x.version };
    },
    async put(token, record, expectedVersion) {
      const r = await call(token, 'PUT /v1/vault', JSON.stringify({ record, expectedVersion }));
      const v = JSON.parse(r.body as string).version ?? null;
      if (r.status === 200) return { ok: true, version: v };
      if (r.status === 409) return { ok: false, version: v };
      throw new Error(`status ${r.status}`);
    },
    async delete(token) {
      await call(token, 'DELETE /v1/vault', null);
    },
  };
  return { authFor, api, store, users };
}

function device(cloud: ReturnType<typeof fakeCloud>, raw: StorageLike = memoryStorage()) {
  const auth = cloud.authFor();
  let n = 0;
  const controller = createSpaceController({
    rawStorage: raw,
    now: () => 1_000_000,
    randomId: () => `r${Math.random().toString(36).slice(2, 10)}${++n}`,
    kdfIterations: ITER,
    seedDemo: () => {},
    cloud: { auth, api: cloud.api, loginIterations: 1000 },
  });
  return { controller, auth, raw };
}

const settle = async (c: ReturnType<typeof device>['controller']) => {
  // Wait out the device's save debounce (150 ms), push now, then wait for the push to finish.
  await new Promise((r) => setTimeout(r, 220));
  await c.cloudRetry();
  for (let i = 0; i < 40 && c.getState().cloud?.sync === 'syncing'; i++) {
    await new Promise((r) => setTimeout(r, 25));
  }
};
const names = (c: ReturnType<typeof device>['controller']) =>
  c
    .getState()
    .store.getState()
    .view.roster.map((p) => p.name)
    .sort();

async function signUp(d: ReturnType<typeof device>, email: string, pass: string) {
  expect(
    await d.controller.cloudSignUp({
      email,
      passphrase: pass,
      confirmedAdult: true,
      moveGuestData: false,
    }),
  ).toBe(true);
  expect(d.controller.getState().cloudPending).toEqual({ email });
  expect(await d.controller.cloudConfirm('123456')).toBe(true);
  d.controller.acknowledgeRecoveryCode();
}

describe('Cloud accounts through the controller and the real server handler', () => {
  it('CA-12 without a cloud service nothing cloud is offered', () => {
    const c = createSpaceController({
      rawStorage: memoryStorage(),
      now: () => 1,
      randomId: () => 'x',
      seedDemo: () => {},
    });
    expect(c.getState().cloudAvailable).toBe(false);
  });

  it('CA-09 / CA-10 sign up, then the household follows the person to a second device', async () => {
    const wire: Wire = [];
    const cloud = fakeCloud(wire);
    const one = device(cloud);
    await signUp(one, 'ana@example.com', PASS_A);
    expect(one.controller.getState().kind).toBe('account');
    one.controller.getState().store.addPerson('Mom', 3);
    await settle(one.controller);
    expect(one.controller.getState().cloud).toMatchObject({
      email: 'ana@example.com',
      sync: 'synced',
    });

    const two = device(cloud);
    expect(await two.controller.cloudSignIn('ANA@example.com ', PASS_A)).toBe(true);
    await settle(two.controller);
    expect(names(two.controller)).toEqual(['Mom']);

    // CA-09: the passphrase never crossed the wire, and the server holds no plaintext.
    const all = wire.join('\n');
    expect(all).not.toContain(PASS_A);
    expect(all).not.toContain('Mom');
    expect(JSON.stringify([...cloud.store.dump()])).not.toContain('Mom');
  }, 60_000);

  it('CA-10 two devices edit apart; after sync both have both changes', async () => {
    const cloud = fakeCloud([]);
    const one = device(cloud);
    await signUp(one, 'ana@example.com', PASS_A);
    await settle(one.controller);
    const two = device(cloud);
    await two.controller.cloudSignIn('ana@example.com', PASS_A);
    await settle(two.controller);

    two.controller.getState().store.addPerson('Paulo', 7);
    await settle(two.controller);
    one.controller.getState().store.addPerson('Mom', 3); // one has not seen Paulo yet
    await settle(one.controller); // its push meets 409, merges, pushes again
    expect(names(one.controller)).toEqual(['Mom', 'Paulo']);

    // Two picks up Mom on its next sync.
    two.controller.getState().store.addPerson('Sipho', 5);
    await settle(two.controller);
    expect(names(two.controller)).toEqual(['Mom', 'Paulo', 'Sipho']);
  }, 60_000);

  it('CA-02 another person never sees, and cannot open, someone else’s household', async () => {
    const cloud = fakeCloud([]);
    const ana = device(cloud);
    await signUp(ana, 'ana@example.com', PASS_A);
    ana.controller.getState().store.addPerson('Mom', 3);
    await settle(ana.controller);

    const bea = device(cloud);
    await signUp(bea, 'bea@example.com', PASS_B);
    await settle(bea.controller);
    expect(names(bea.controller)).toEqual([]);
    expect(cloud.store.dump().size).toBe(2);

    // Bea, on her own device, cannot open Ana's account with her own passphrase or Ana's email.
    const third = device(cloud);
    expect(await third.controller.cloudSignIn('ana@example.com', PASS_B)).toBe(false);
    expect(third.controller.getState().kind).toBe('guest');
  }, 60_000);

  it('CA-10 offline with a copy on this device, the household opens and syncs when back', async () => {
    let offline = false;
    const cloud = fakeCloud([], { offline: () => offline });
    const raw = memoryStorage();
    const d = device(cloud, raw);
    await signUp(d, 'ana@example.com', PASS_A);
    d.controller.getState().store.addPerson('Mom', 3);
    await settle(d.controller);
    await d.controller.lock();
    expect(d.auth.current()).toBeNull(); // CA-11

    offline = true;
    expect(await d.controller.cloudSignIn('ana@example.com', PASS_A)).toBe(true);
    expect(names(d.controller)).toEqual(['Mom']);
    expect(d.controller.getState().cloud?.sync).toBe('offline');
    d.controller.getState().store.addPerson('Paulo', 7);

    offline = false;
    await d.controller.cloudRetry();
    await settle(d.controller);
    expect(d.controller.getState().cloud?.sync).toBe('synced');
    const fresh = device(cloud);
    await fresh.controller.cloudSignIn('ana@example.com', PASS_A);
    await settle(fresh.controller);
    expect(names(fresh.controller)).toEqual(['Mom', 'Paulo']);
  }, 60_000);

  it('CA-09 a wrong passphrase opens nothing and says nothing specific', async () => {
    const cloud = fakeCloud([]);
    const d = device(cloud);
    await signUp(d, 'ana@example.com', PASS_A);
    await d.controller.lock();
    expect(await d.controller.cloudSignIn('ana@example.com', 'not the right passphrase')).toBe(
      false,
    );
    expect(d.controller.getState().kind).toBe('guest');
    expect(d.controller.getState().error).toMatch(/did not open an account/);
  }, 60_000);

  it('CA-05 deleting the account removes the server copy, the user and the device copy', async () => {
    const cloud = fakeCloud([]);
    const d = device(cloud);
    await signUp(d, 'ana@example.com', PASS_A);
    await settle(d.controller);
    expect(cloud.store.dump().size).toBe(1);
    expect(await d.controller.deleteAccount(PASS_A)).toBe(true);
    expect(cloud.store.dump().size).toBe(0);
    expect(cloud.users.size).toBe(0);
    expect(d.controller.getState().kind).toBe('guest');
    expect(d.controller.getState().accounts).toEqual([]);
    expect(Object.keys(d.controller.getState().cloudLinks)).toEqual([]);
  }, 60_000);

  it('CA-12 sign-up refuses a weak passphrase, a bad email and a minor', async () => {
    const d = device(fakeCloud([]));
    expect(
      await d.controller.cloudSignUp({
        email: 'ana@example.com',
        passphrase: 'short',
        confirmedAdult: true,
        moveGuestData: false,
      }),
    ).toBe(false);
    expect(
      await d.controller.cloudSignUp({
        email: 'not an email',
        passphrase: PASS_A,
        confirmedAdult: true,
        moveGuestData: false,
      }),
    ).toBe(false);
    expect(
      await d.controller.cloudSignUp({
        email: 'ana@example.com',
        passphrase: PASS_A,
        confirmedAdult: false,
        moveGuestData: false,
      }),
    ).toBe(false);
    expect(d.controller.getState().cloudPending).toBeNull();
  });

  it('CA-05 / ACC-14 a wrong passphrase deletes nothing, here or on the server', async () => {
    const cloud = fakeCloud([]);
    const d = device(cloud);
    await signUp(d, 'ana@example.com', PASS_A);
    await settle(d.controller);
    expect(await d.controller.deleteAccount('somebody else typed this')).toBe(false);
    expect(cloud.store.dump().size).toBe(1);
    expect(cloud.users.size).toBe(1);
    expect(d.controller.getState().kind).toBe('account');
  }, 60_000);

  it('CA-09 a passphrase change moves the login with it: only the new one opens the account elsewhere', async () => {
    const cloud = fakeCloud([]);
    const one = device(cloud);
    await signUp(one, 'ana@example.com', PASS_A);
    one.controller.getState().store.addPerson('Mom', 3);
    await settle(one.controller);
    expect(await one.controller.changePassphrase(PASS_A, PASS_B)).toBe(true);
    await settle(one.controller);

    const old = device(cloud);
    expect(await old.controller.cloudSignIn('ana@example.com', PASS_A)).toBe(false);
    const fresh = device(cloud);
    expect(await fresh.controller.cloudSignIn('ana@example.com', PASS_B)).toBe(true);
    await settle(fresh.controller);
    expect(names(fresh.controller)).toEqual(['Mom']);
  }, 60_000);

  it('CA-10 a failed sign-in on a new device leaves nothing installed', async () => {
    const cloud = fakeCloud([]);
    const one = device(cloud);
    await signUp(one, 'ana@example.com', PASS_A);
    await settle(one.controller);
    // Right login secret is impossible without the passphrase, so simulate a server copy that
    // does not open with what was typed: change it on one device, then try the old one elsewhere.
    await one.controller.changePassphrase(PASS_A, PASS_B);
    const other = device(cloud);
    expect(await other.controller.cloudSignIn('ana@example.com', PASS_A)).toBe(false);
    expect(other.controller.getState().accounts).toEqual([]);
  }, 60_000);

  it('CA-09 if the account refuses the new secret, the device change is rolled back', async () => {
    let refuse = false;
    const cloud = fakeCloud([], { refuseChange: () => refuse });
    const one = device(cloud);
    await signUp(one, 'ana@example.com', PASS_A);
    await settle(one.controller);
    refuse = true;
    expect(await one.controller.changePassphrase(PASS_A, PASS_B)).toBe(false);
    // Both still open with the OLD passphrase: here, and on a new phone.
    await one.controller.lock();
    expect(await one.controller.cloudSignIn('ana@example.com', PASS_A)).toBe(true);
    const fresh = device(cloud);
    expect(await fresh.controller.cloudSignIn('ana@example.com', PASS_A)).toBe(true);
  }, 60_000);

  it('CA-09 if other sessions cannot be ended yet, the change still holds and the person is told', async () => {
    let fail = true;
    const cloud = fakeCloud([], { failRevocation: () => fail });
    const one = device(cloud);
    await signUp(one, 'ana@example.com', PASS_A);
    await settle(one.controller);
    expect(await one.controller.changePassphrase(PASS_A, PASS_B)).toBe(true);
    expect(one.controller.getState().notice).toMatch(/could not be signed out yet/);
    // The new passphrase is the one that works, everywhere.
    const fresh = device(cloud);
    expect(await fresh.controller.cloudSignIn('ana@example.com', PASS_B)).toBe(true);
    // And the revocation is retried until it succeeds.
    fail = false;
    await one.controller.cloudRetry();
    await settle(one.controller);
    expect(one.controller.getState().cloud?.sync).toBe('synced');
  }, 60_000);

  it('CA-09 a revocation that failed survives a lock and is retried at the next online sign-in', async () => {
    let fail = true;
    const wire: Wire = [];
    const cloud = fakeCloud(wire, { failRevocation: () => fail });
    const raw = memoryStorage();
    const one = device(cloud, raw);
    await signUp(one, 'ana@example.com', PASS_A);
    await settle(one.controller);
    expect(await one.controller.changePassphrase(PASS_A, PASS_B)).toBe(true);
    await one.controller.lock();
    // A new controller on the same device storage: a restart, not just a lock.
    fail = false;
    const again = device(cloud, raw);
    const before = wire.filter((w) => w === 'signOutEverywhere').length;
    expect(await again.controller.cloudSignIn('ana@example.com', PASS_B)).toBe(true);
    expect(wire.filter((w) => w === 'signOutEverywhere').length).toBe(before + 1);
    expect(raw.getItem('afterglow.cloud.revoke.v1')).toBe('[]');
  }, 60_000);
});
