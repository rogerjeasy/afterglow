import { describe, expect, it } from 'vitest';
import { type HouseholdStore, KEYS, type StorageLike } from '../household/store';
import { IDLE_LOCK_MS, createSpaceController } from './controller';

const PASS_A = 'correct horse battery staple';
const PASS_B = 'my gran bakes rusks on sundays';

interface Mem extends StorageLike {
  dump(): string;
}
function mem(): Mem {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    dump: () => [...m.entries()].map(([k, v]) => `${k}=${v}`).join('\n'),
  };
}

function setup() {
  const raw = mem();
  let t = 1_000_000;
  let n = 0;
  const controller = createSpaceController({
    rawStorage: raw,
    now: () => t,
    randomId: () => `id${++n}`,
    kdfIterations: 1000,
    seedDemo: (store) => {
      store.addAppliance({
        name: 'DemoFridgeXYZ',
        class: 'fridge',
        fullness: 'half',
        ambientC: null,
      });
    },
  });
  return {
    raw,
    controller,
    advance: (ms: number) => {
      t += ms;
    },
  };
}
type Ctx = ReturnType<typeof setup>;

const fridge = (name: string) => ({
  name,
  class: 'fridge' as const,
  fullness: 'full' as const,
  ambientC: null,
});
const namesIn = (store: HouseholdStore) => store.getState().view.appliances.map((a) => a.name);

const create = (c: Ctx, name: string, pass: string, moveGuestData = false) =>
  c.controller.createAccount({ name, passphrase: pass, confirmedAdult: true, moveGuestData });

describe('Spaces', () => {
  it('ACC-01 starts in the guest space with no account and works immediately', () => {
    const c = setup();
    const s = c.controller.getState();
    expect(s.kind).toBe('guest');
    expect(s.account).toBeNull();
    s.store.addAppliance(fridge('GuestFridge'));
    expect(namesIn(s.store)).toEqual(['GuestFridge']);
  });

  it('ACC-03 demo data lives in memory only: never in storage, never in guest', () => {
    const c = setup();
    const guest = c.controller.getState().store;
    guest.addAppliance(fridge('RealFridge'));
    const before = c.raw.dump();

    c.controller.enterDemo();
    const demo = c.controller.getState();
    expect(demo.kind).toBe('demo');
    expect(demo.store).not.toBe(guest);
    expect(namesIn(demo.store)).toEqual(['DemoFridgeXYZ']); // never mixed with RealFridge
    demo.store.addAppliance(fridge('DemoExtra'));
    demo.store.startOutage(5000);
    expect(c.raw.dump()).toBe(before); // not one byte written

    c.controller.exitDemo();
    const back = c.controller.getState();
    expect(back.kind).toBe('guest');
    expect(back.store).toBe(guest);
    expect(namesIn(back.store)).toEqual(['RealFridge']);
    expect(c.raw.dump()).not.toContain('DemoFridgeXYZ');
    // A second demo starts fresh: nothing survives the first.
    c.controller.enterDemo();
    expect(namesIn(c.controller.getState().store)).toEqual(['DemoFridgeXYZ']);
  });

  it('ACC-03b account actions are refused while in the demo', async () => {
    const c = setup();
    c.controller.enterDemo();
    expect(await create(c, 'Thandi', PASS_A)).toBe(false);
    expect(c.controller.getState().kind).toBe('demo');
    expect(c.raw.dump()).not.toContain('afterglow.accounts'); // no directory, no vault
  });

  it('ACC-04 an account stores its household data only as ciphertext', async () => {
    const c = setup();
    expect(await create(c, 'Thandi', PASS_A)).toBe(true);
    const acct = c.controller.getState();
    expect(acct.kind).toBe('account');
    acct.store.addAppliance(fridge('SecretFridgeName'));
    acct.store.startOutage(123456);
    await c.controller.lock();
    expect(c.raw.dump()).not.toContain('SecretFridgeName');
    expect(c.raw.dump()).not.toContain(PASS_A);
    expect(c.raw.dump()).not.toContain(KEYS.events); // even the key names live inside the vault
    // And it comes back after signing in again.
    const id = c.controller.getState().accounts[0]?.id as string;
    expect(await c.controller.signIn(id, PASS_A)).toBe(true);
    expect(namesIn(c.controller.getState().store)).toEqual(['SecretFridgeName']);
  });

  it('ACC-02 the guest space and an account never see each other', async () => {
    const c = setup();
    c.controller.getState().store.addAppliance(fridge('GuestOnly'));
    await create(c, 'Thandi', PASS_A);
    const acct = c.controller.getState().store;
    expect(namesIn(acct)).toEqual([]); // not the guest's data
    acct.addAppliance(fridge('AccountOnly'));
    await c.controller.lock();
    expect(namesIn(c.controller.getState().store)).toEqual(['GuestOnly']);
  });

  it('ACC-02b two accounts are isolated, and one passphrase does not open the other', async () => {
    const c = setup();
    await create(c, 'Alice', PASS_A);
    c.controller.getState().store.addAppliance(fridge('AliceFridge'));
    await c.controller.lock();
    await create(c, 'Bob', PASS_B);
    expect(namesIn(c.controller.getState().store)).toEqual([]);
    c.controller.getState().store.addAppliance(fridge('BobFridge'));
    await c.controller.lock();

    const [alice, bob] = c.controller.getState().accounts;
    expect(await c.controller.signIn(alice?.id as string, PASS_B)).toBe(false);
    expect(c.controller.getState().kind).toBe('guest');
    expect(await c.controller.signIn(bob?.id as string, PASS_A)).toBe(false);
    expect(c.controller.getState().kind).toBe('guest');

    expect(await c.controller.signIn(alice?.id as string, PASS_A)).toBe(true);
    expect(namesIn(c.controller.getState().store)).toEqual(['AliceFridge']);
    await c.controller.lock();
    expect(await c.controller.signIn(bob?.id as string, PASS_B)).toBe(true);
    expect(namesIn(c.controller.getState().store)).toEqual(['BobFridge']);
  });

  it('ACC-02c signing in to a second account while one is open is refused', async () => {
    const c = setup();
    await create(c, 'Alice', PASS_A);
    await c.controller.lock();
    await create(c, 'Bob', PASS_B);
    const alice = c.controller.getState().accounts.find((a) => a.name === 'Alice');
    expect(await c.controller.signIn(alice?.id as string, PASS_A)).toBe(false);
    expect(c.controller.getState().account?.name).toBe('Bob');
    c.controller.enterDemo(); // not from inside an account
    expect(c.controller.getState().kind).toBe('account');
  });

  it('moving guest data into a new account encrypts it and removes the plaintext copy', async () => {
    const c = setup();
    c.controller.getState().store.addAppliance(fridge('MovedFridge'));
    expect(c.raw.dump()).toContain('MovedFridge'); // guest data is plaintext, by design
    await create(c, 'Thandi', PASS_A, true);
    expect(namesIn(c.controller.getState().store)).toEqual(['MovedFridge']);
    await c.controller.lock();
    expect(c.raw.dump()).not.toContain('MovedFridge');
    expect(namesIn(c.controller.getState().store)).toEqual([]);
  });

  it('not moving guest data leaves it in the guest space, untouched', async () => {
    const c = setup();
    c.controller.getState().store.addAppliance(fridge('StaysGuest'));
    await create(c, 'Thandi', PASS_A, false);
    expect(namesIn(c.controller.getState().store)).toEqual([]);
    await c.controller.lock();
    expect(namesIn(c.controller.getState().store)).toEqual(['StaysGuest']);
  });

  it('ACC-07 after locking, the old account store cannot leak new plaintext', async () => {
    const c = setup();
    await create(c, 'Thandi', PASS_A);
    const oldStore = c.controller.getState().store;
    oldStore.addAppliance(fridge('Before'));
    await c.controller.lock();
    expect(c.controller.getState().kind).toBe('guest');
    expect(c.controller.getState().store).not.toBe(oldStore);
    // A stale reference writing after the lock must not reach storage in plaintext.
    oldStore.addAppliance(fridge('LeakAfterLock'));
    expect(c.raw.dump()).not.toContain('LeakAfterLock');
    expect(c.raw.dump()).not.toContain('Before');
    // And the late write was not persisted into the account either.
    const id = c.controller.getState().accounts[0]?.id as string;
    await c.controller.signIn(id, PASS_A);
    expect(namesIn(c.controller.getState().store)).toEqual(['Before']);
  });

  it('ACC-05 sign-in failures are generic and never echo the passphrase', async () => {
    const c = setup();
    await create(c, 'Thandi', PASS_A);
    await c.controller.lock();
    const id = c.controller.getState().accounts[0]?.id as string;
    await c.controller.signIn(id, 'this is the wrong one');
    const wrong = c.controller.getState().error;
    await c.controller.signIn('nonexistent', 'this is the wrong one');
    const unknown = c.controller.getState().error;
    expect(wrong).toBe(unknown);
    expect(wrong).not.toContain('this is the wrong one');
    expect(wrong).not.toMatch(/incorrect|invalid password|no such/i);
  });

  it('ACC-11 repeated failures set a wait that the UI can count down', async () => {
    const c = setup();
    await create(c, 'Thandi', PASS_A);
    await c.controller.lock();
    const id = c.controller.getState().accounts[0]?.id as string;
    for (let i = 0; i < 4; i++) {
      await c.controller.signIn(id, 'wrong wrong wrong');
      expect(c.controller.getState().retryUntilMs).toBeNull(); // still within the free attempts
    }
    // The failure that starts the lockout reports it straight away.
    await c.controller.signIn(id, 'wrong wrong wrong');
    expect(c.controller.getState().retryUntilMs).toBe(1_000_000 + 30_000);
    await c.controller.signIn(id, PASS_A); // right passphrase, but throttled
    const s = c.controller.getState();
    expect(s.kind).toBe('guest');
    expect(s.retryUntilMs).not.toBeNull();
    expect(s.error).toMatch(/Too many attempts/);
    // The lockout is read from the service, so clearing messages does not lose it.
    c.controller.clearMessages();
    expect(c.controller.retryUntil(id)).toBe(1_000_000 + 30_000);
    expect(c.controller.retryUntil('some-other-account')).toBeNull();
    c.advance(31_000);
    expect(c.controller.retryUntil(id)).toBeNull();
    expect(await c.controller.signIn(id, PASS_A)).toBe(true);
  });

  it('ACC-12 the recovery code is surfaced once and cleared on acknowledge, lock and recovery use', async () => {
    const c = setup();
    await create(c, 'Thandi', PASS_A);
    const code = c.controller.getState().recoveryCode;
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}(-[2-9A-HJ-NP-Z]{5}){4}$/);
    c.controller.acknowledgeRecoveryCode();
    expect(c.controller.getState().recoveryCode).toBeNull();
    c.controller.getState().store.addAppliance(fridge('Kept'));
    await c.controller.lock();
    const id = c.controller.getState().accounts[0]?.id as string;
    // Forgot the passphrase: reset with the code, data survives, a fresh code is issued.
    expect(await c.controller.recover(id, code as string, PASS_B)).toBe(true);
    const after = c.controller.getState();
    expect(namesIn(after.store)).toEqual(['Kept']);
    expect(after.recoveryCode).not.toBeNull();
    expect(after.recoveryCode).not.toBe(code);
    await c.controller.lock();
    expect(c.controller.getState().recoveryCode).toBeNull();
    expect(await c.controller.signIn(id, PASS_A)).toBe(false);
    expect(await c.controller.signIn(id, PASS_B)).toBe(true);
  });

  it('ACC-13 idle lock after 10 minutes, but never during an outage', async () => {
    const c = setup();
    await create(c, 'Thandi', PASS_A);
    c.controller.getState().store.startOutage(1);
    c.advance(IDLE_LOCK_MS + 60_000);
    c.controller.checkIdle();
    expect(c.controller.getState().kind).toBe('account'); // outage: stays open

    c.controller.getState().store.endOutage();
    c.controller.touch();
    c.advance(IDLE_LOCK_MS - 1000);
    c.controller.checkIdle();
    expect(c.controller.getState().kind).toBe('account'); // not yet idle long enough
    c.advance(2000);
    c.controller.checkIdle();
    await new Promise((r) => setTimeout(r, 20));
    expect(c.controller.getState().kind).toBe('guest');
    expect(c.controller.getState().notice).toMatch(/Locked after 10 minutes/);
  });

  it('ACC-14 sensitive actions need the passphrase and fail generically without it', async () => {
    const c = setup();
    await create(c, 'Thandi', PASS_A);
    expect(await c.controller.changePassphrase('not it at all', PASS_B)).toBe(false);
    expect(await c.controller.deleteAccount('not it at all')).toBe(false);
    expect(await c.controller.regenerateRecoveryCode('not it at all')).toBe(false);
    expect(c.controller.getState().kind).toBe('account');
    expect(c.controller.getState().accounts).toHaveLength(1);
    expect(await c.controller.changePassphrase(PASS_A, PASS_B)).toBe(true);
  });

  it('ACC-15 deleting an account removes it, rotates the device identity and cannot be undone', async () => {
    const c = setup();
    c.controller.getState().store.addAppliance(fridge('G'));
    const epochBefore = c.raw.getItem(KEYS.epoch);
    await create(c, 'Thandi', PASS_A);
    c.controller.getState().store.addAppliance(fridge('Doomed'));
    const id = c.controller.getState().account?.id as string;
    expect(await c.controller.deleteAccount(PASS_A)).toBe(true);
    const s = c.controller.getState();
    expect(s.kind).toBe('guest');
    expect(s.accounts).toEqual([]);
    expect(c.raw.getItem(KEYS.epoch)).not.toBe(epochBefore);
    expect(c.raw.dump()).not.toContain(id);
    expect(await c.controller.signIn(id, PASS_A)).toBe(false);
    expect(namesIn(s.store)).toEqual(['G']); // the guest space is untouched
  });

  it('ACC-15b export is available only when signed in, and holds the account data', async () => {
    const c = setup();
    expect(await c.controller.exportData()).toBeNull();
    await create(c, 'Thandi', PASS_A);
    c.controller.getState().store.addAppliance(fridge('ExportMe'));
    const text = (await c.controller.exportData()) as string;
    expect(JSON.parse(text).account).toBe('Thandi');
    expect(text).toContain('ExportMe');
    expect(text).not.toContain(PASS_A);
  });

  it('ACC-16 no account is created without the adult confirmation', async () => {
    const c = setup();
    const ok = await c.controller.createAccount({
      name: 'Kid',
      passphrase: PASS_A,
      confirmedAdult: false,
      moveGuestData: false,
    });
    expect(ok).toBe(false);
    expect(c.controller.getState().accounts).toEqual([]);
    expect(c.controller.getState().error).toMatch(/18/);
  });

  it('only one account action runs at a time', async () => {
    const c = setup();
    const first = create(c, 'Alice', PASS_A);
    const second = create(c, 'Bob', PASS_B);
    expect(await second).toBe(false);
    expect(await first).toBe(true);
    expect(c.controller.getState().accounts.map((a) => a.name)).toEqual(['Alice']);
  });
});
