import { describe, expect, it } from 'vitest';
import { type RawStorage, createAccountService } from './service.js';
import { openVaultStorage } from './vault-storage.js';

/**
 * The account service's server seam (cloud-accounts CA-03, CA-10): a record can be
 * exported exactly, installed on another device, and another copy of the same
 * account can be read with the open session's key.
 */

const memory = (): RawStorage & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};
const PASS = 'a long and quiet lantern';
const service = (storage: RawStorage) => createAccountService({ storage, kdfIterations: 1000 });

describe('Account service server seam', () => {
  it('CA-03 exportRecord returns the stored record exactly, and nothing for an unknown id', async () => {
    const s = memory();
    const a = service(s);
    const { session } = await a.createAccount({
      name: 'Ana',
      passphrase: PASS,
      confirmedAdult: true,
    });
    await a.saveData(session, { k: 'v' });
    const raw = a.exportRecord(session.accountId);
    expect(raw).toBe(s.map.get(`afterglow.accounts.vault.v1.${session.accountId}`));
    expect(raw).not.toContain('"k"');
    expect(a.exportRecord('AAAAAAAAAAAAAAAA')).toBeNull();
  });

  it('CA-10 a record adopted on a second device opens with the same passphrase, and only with it', async () => {
    const one = service(memory());
    const { session } = await one.createAccount({
      name: 'Ana',
      passphrase: PASS,
      confirmedAdult: true,
    });
    await one.saveData(session, { 'afterglow.household.events.v1': '[1]' });
    const raw = one.exportRecord(session.accountId) as string;

    // Wrong passphrase: refused, and nothing is left on the device.
    const twoStorage = memory();
    const two = service(twoStorage);
    await expect(
      two.adoptRecord(raw, 'ana@example.com', 'not the passphrase at all'),
    ).rejects.toThrow();
    expect(two.listAccounts()).toEqual([]);
    expect(two.exportRecord(session.accountId)).toBeNull();

    const s2 = await two.adoptRecord(raw, 'ana@example.com', PASS);
    expect(s2.accountId).toBe(session.accountId);
    expect(two.listAccounts()).toEqual([{ id: session.accountId, name: 'ana@example.com' }]);
    expect(await two.loadData(s2)).toEqual({ 'afterglow.household.events.v1': '[1]' });
  });

  it('CA-10 adoptRecord never replaces an account already on the device, and refuses junk', async () => {
    const one = service(memory());
    const { session } = await one.createAccount({
      name: 'Ana',
      passphrase: PASS,
      confirmedAdult: true,
    });
    await one.saveData(session, { local: 'precious' });
    const raw = one.exportRecord(session.accountId) as string;
    // The same id arriving from "the server" must not overwrite the local copy.
    await expect(one.adoptRecord(raw, 'Ana', PASS)).rejects.toThrow(/already on this device/);
    expect(await one.loadData(session)).toEqual({ local: 'precious' });

    const a = service(memory());
    for (const junk of ['', '{', '{}', JSON.stringify({ v: 1, accountId: 'x' }), 'null']) {
      await expect(a.adoptRecord(junk, 'Ana', PASS)).rejects.toThrow();
    }
    await expect(a.adoptRecord(raw, '   ', PASS)).rejects.toThrow();
    expect(a.listAccounts()).toEqual([]);
  });

  it('verifyPassphrase proves the passphrase for an open session, generically', async () => {
    const a = service(memory());
    const { session } = await a.createAccount({
      name: 'Ana',
      passphrase: PASS,
      confirmedAdult: true,
    });
    await expect(a.verifyPassphrase(session, PASS)).resolves.toBeUndefined();
    await expect(a.verifyPassphrase(session, 'wrong wrong wrong wrong')).rejects.toThrow();
  });

  it('CA-10 openRecordData reads another device’s copy of the same account, never another account', async () => {
    const one = service(memory());
    const { session } = await one.createAccount({
      name: 'Ana',
      passphrase: PASS,
      confirmedAdult: true,
    });
    await one.saveData(session, { a: '1' });
    const two = service(memory());
    const s2 = await two.adoptRecord(one.exportRecord(session.accountId) as string, 'Ana', PASS);
    // Device two writes; device one reads that copy with its own session.
    await two.saveData(s2, { a: '1', b: '2' });
    const theirs = two.exportRecord(session.accountId) as string;
    expect(await one.openRecordData(session, theirs)).toEqual({ a: '1', b: '2' });
    // One's own stored copy is untouched.
    expect(await one.loadData(session)).toEqual({ a: '1' });

    // A different account's record cannot be opened with this session.
    const other = service(memory());
    const { session: so } = await other.createAccount({
      name: 'Bea',
      passphrase: PASS,
      confirmedAdult: true,
    });
    await other.saveData(so, { secret: 'x' });
    await expect(
      one.openRecordData(session, other.exportRecord(so.accountId) as string),
    ).rejects.toThrow();
  });

  it('CA-10 the vault storage reports each successful save', async () => {
    const a = service(memory());
    const { session } = await a.createAccount({
      name: 'Ana',
      passphrase: PASS,
      confirmedAdult: true,
    });
    let saved = 0;
    const vault = await openVaultStorage(a, session, 1, () => {
      saved += 1;
    });
    vault.setItem('x', '1');
    await vault.flush();
    expect(saved).toBe(1);
    await vault.close();
  });
});
