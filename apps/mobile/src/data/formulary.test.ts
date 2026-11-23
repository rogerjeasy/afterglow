import { type TrustAnchor, manifestPayload } from '@afterglow/adapters';
import { formulary } from '@afterglow/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { memoryStorage } from '../household/store';
import { SNAPSHOT_URL, VERSION_KEY, loadFormularyState } from './formulary';

// Fictional product, arbitrary numbers: the repository holds no drug data.
const b64u = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const utf8 = (s: string): BufferSource => new TextEncoder().encode(s) as BufferSource;

let privateKey: CryptoKey;
let anchors: TrustAnchor[];

async function signedSnapshot(version: string, products: string[]) {
  const entries = [];
  for (const product of products) {
    const u = {
      product,
      labelVersion: 'L1',
      condition: 'unopened' as const,
      maxTempC: 25,
      maxDays: 10,
      notes: 'fixture',
      source: {
        title: 'Fictional label',
        url: 'https://example.test/a',
        excerpt: 'fictional excerpt',
      },
      approver: 'A. Reviewer',
      approvedAt: '2026-03-01',
    };
    const sig = new Uint8Array(
      await crypto.subtle.sign('Ed25519', privateKey, utf8(formulary.canonicalPayload(u))),
    );
    entries.push({ ...u, signature: `k1.${b64u(sig)}` });
  }
  const m = new Uint8Array(
    await crypto.subtle.sign(
      'Ed25519',
      privateKey,
      utf8(
        manifestPayload(
          version,
          entries.map((e) => e.signature),
        ),
      ),
    ),
  );
  return { formularyVersion: version, entries, manifestSignature: `k1.${b64u(m)}` };
}

const deps = (text: string | null | Error, storage = memoryStorage(), a = anchors) => ({
  fetchText: async (url: string) => {
    expect(url).toBe(SNAPSHOT_URL);
    if (text instanceof Error) throw text;
    return text;
  },
  storage,
  anchors: a,
});

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  privateKey = pair.privateKey;
  anchors = [
    {
      keyId: 'k1',
      publicKey: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    },
  ];
});

describe('formulary state in the app', () => {
  it('shows no table, and a reason, when nothing is published', async () => {
    for (const text of [
      null,
      '',
      '<!doctype html><html></html>',
      'not json',
      new Error('offline'),
    ]) {
      const s = await loadFormularyState(deps(text));
      expect(s.kind).toBe('none');
    }
  });

  it('shows no table when the build pins no review key', async () => {
    const snap = await signedSnapshot('3', ['Zorbex']);
    const s = await loadFormularyState(deps(JSON.stringify(snap), memoryStorage(), []));
    expect(s.kind).toBe('none');
    if (s.kind === 'none') expect(s.reason).toMatch(/no pinned review key/);
  });

  it('loads a correctly signed table and remembers its version', async () => {
    const storage = memoryStorage();
    const snap = await signedSnapshot('3', ['Zorbex', 'Quillan']);
    const s = await loadFormularyState(deps(JSON.stringify(snap), storage));
    expect(s.kind).toBe('loaded');
    if (s.kind !== 'loaded') return;
    expect(s.version).toBe(3);
    expect(s.formulary.entries.map((e) => e.product)).toEqual(['Quillan', 'Zorbex']);
    expect(storage.getItem(VERSION_KEY)).toBe('3');
  });

  it('refuses an older table than the one already accepted, and keeps the stored version', async () => {
    const storage = memoryStorage({ [VERSION_KEY]: '5' });
    const old = await signedSnapshot('4', ['Zorbex']);
    const s = await loadFormularyState(deps(JSON.stringify(old), storage));
    expect(s.kind).toBe('none');
    if (s.kind === 'none') expect(s.reason).toMatch(/older/);
    expect(storage.getItem(VERSION_KEY)).toBe('5');
  });

  it('drops a tampered entry but keeps the rest, and reports it', async () => {
    const snap = await signedSnapshot('9', ['Zorbex', 'Quillan']);
    const tampered = {
      ...snap,
      entries: [{ ...snap.entries[0], maxDays: 999 }, snap.entries[1]],
    };
    const s = await loadFormularyState(deps(JSON.stringify(tampered)));
    expect(s.kind).toBe('loaded');
    if (s.kind !== 'loaded') return;
    expect(s.formulary.entries.map((e) => e.product)).toEqual(['Quillan']);
    expect(s.formulary.rejected.map((r) => r.reason)).toEqual(['signature']);
  });

  it('refuses a snapshot whose version or entry set was changed, and keeps the stored version', async () => {
    const storage = memoryStorage({ [VERSION_KEY]: '2' });
    const snap = await signedSnapshot('9', ['Zorbex', 'Quillan']);
    const variants = [
      { ...snap, formularyVersion: '99' },
      { ...snap, entries: [snap.entries[0]] },
      { ...snap, entries: [...snap.entries, snap.entries[0]] },
      { ...snap, manifestSignature: undefined },
    ];
    for (const v of variants) {
      const s = await loadFormularyState(deps(JSON.stringify(v), storage));
      expect(s.kind).toBe('none');
      expect(storage.getItem(VERSION_KEY)).toBe('2');
    }
  });

  it('a bad stored version is treated as none accepted yet, never as a crash', async () => {
    for (const v of ['abc', '-3', '1.5', '']) {
      const snap = await signedSnapshot('1', ['Zorbex']);
      const s = await loadFormularyState(
        deps(JSON.stringify(snap), memoryStorage({ [VERSION_KEY]: v })),
      );
      expect(s.kind).toBe('loaded');
    }
  });
});
