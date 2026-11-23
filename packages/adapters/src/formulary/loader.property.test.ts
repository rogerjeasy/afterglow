import { formulary } from '@afterglow/core';
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { toBase64Url, utf8 } from '../crypto/bytes.js';
import { type TrustAnchor, loadFormulary, manifestPayload } from './loader.js';

// Fictional products and arbitrary numbers only: no drug data lives in this repo.
type Unsigned = Omit<formulary.FormularyEntry, 'signature'>;

interface Signer {
  readonly keyId: string;
  readonly anchor: TrustAnchor;
  signText(text: string): Promise<string>;
  sign(u: Unsigned): Promise<formulary.FormularyEntry>;
}

async function makeSigner(keyId: string): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return {
    keyId,
    anchor: { keyId, publicKey: toBase64Url(raw) },
    async signText(text) {
      const sig = new Uint8Array(
        await crypto.subtle.sign('Ed25519', pair.privateKey, utf8(text) as BufferSource),
      );
      return `${keyId}.${toBase64Url(sig)}`;
    },
    async sign(u) {
      const sig = new Uint8Array(
        await crypto.subtle.sign(
          'Ed25519',
          pair.privateKey,
          utf8(formulary.canonicalPayload(u)) as BufferSource,
        ),
      );
      return { ...u, signature: `${keyId}.${toBase64Url(sig)}` };
    },
  };
}

const base: Unsigned = {
  product: 'Zorbex',
  labelVersion: 'L1',
  condition: 'unopened',
  maxTempC: 25,
  maxDays: 10,
  notes: 'fixture',
  source: { title: 'Fictional label', url: 'https://example.test/a', excerpt: 'fictional excerpt' },
  approver: 'A. Reviewer',
  approvedAt: '2026-03-01',
};
const second: Unsigned = { ...base, product: 'Quillan', condition: 'inUse', maxDays: 4 };

/** A snapshot as the review pipeline publishes it: entries plus a signed manifest (FM-19). */
async function snap(
  entries: readonly unknown[],
  formularyVersion = '5',
  signer: Signer = pipeline,
): Promise<{ formularyVersion: string; entries: readonly unknown[]; manifestSignature: string }> {
  const sigs = entries.map((e) => (e as { signature: string }).signature);
  return {
    formularyVersion,
    entries,
    manifestSignature: await signer.signText(manifestPayload(formularyVersion, sigs)),
  };
}
let pipeline: Signer;
let other: Signer;
let rotated: Signer;
let anchors: TrustAnchor[];
let signedA: formulary.FormularyEntry;
let signedB: formulary.FormularyEntry;

beforeAll(async () => {
  pipeline = await makeSigner('review-2026');
  other = await makeSigner('attacker');
  rotated = await makeSigner('review-2027');
  anchors = [pipeline.anchor];
  signedA = await pipeline.sign(base);
  signedB = await pipeline.sign(second);
});

async function admitted(entries: readonly unknown[], a: readonly TrustAnchor[] = anchors) {
  const r = await loadFormulary(await snap(entries), a, 0);
  if (r.kind !== 'loaded') throw new Error(`not loaded: ${JSON.stringify(r)}`);
  return r.formulary;
}

describe('Formulary loader properties', () => {
  it('FM-15 entries signed by a pinned key are admitted', async () => {
    const f = await admitted([signedA, signedB]);
    expect(f.entries.map((e) => e.product)).toEqual(['Quillan', 'Zorbex']);
    expect(f.rejected).toEqual([]);
    expect(f.entries.every(formulary.isValidatedEntry)).toBe(true);
  });

  it('FM-15 altering any signed field after signing rejects the entry', async () => {
    const tampers: Array<(e: formulary.FormularyEntry) => formulary.FormularyEntry> = [
      (e) => ({ ...e, product: `${e.product}x` }),
      (e) => ({ ...e, labelVersion: `${e.labelVersion}x` }),
      (e) => ({ ...e, condition: e.condition === 'inUse' ? 'unopened' : 'inUse' }),
      (e) => ({ ...e, maxTempC: e.maxTempC + 1 }),
      (e) => ({ ...e, maxDays: e.maxDays + 1 }),
      (e) => ({ ...e, notes: `${e.notes}x` }),
      (e) => ({ ...e, source: { ...e.source, title: `${e.source.title}x` } }),
      (e) => ({ ...e, source: { ...e.source, url: `${e.source.url}/x` } }),
      (e) => ({ ...e, source: { ...e.source, excerpt: `${e.source.excerpt}x` } }),
      (e) => ({ ...e, approver: `${e.approver}x` }),
      (e) => ({ ...e, approvedAt: '2030-01-01' }),
    ];
    for (const [i, t] of tampers.entries()) {
      const f = await admitted([t(signedA)]);
      expect(f.entries, `tamper #${i}`).toEqual([]);
      expect(f.rejected.map((r) => r.reason)).toEqual(['signature']);
    }
  });

  it('FM-15 a valid signature from a key that is not pinned is rejected', async () => {
    const forged = await other.sign(base);
    const f = await admitted([forged]);
    expect(f.entries).toEqual([]);
    expect(f.rejected.map((r) => r.reason)).toEqual(['signature']);
  });

  it('FM-15 claiming a pinned key id on a signature made by another key is rejected', async () => {
    const forged = await other.sign(base);
    const relabelled = {
      ...forged,
      signature: forged.signature.replace(/^attacker/, 'review-2026'),
    };
    const f = await admitted([relabelled]);
    expect(f.entries).toEqual([]);
  });

  it('FM-15 a signature copied from another entry does not verify', async () => {
    const swapped = { ...signedA, signature: signedB.signature };
    const f = await admitted([swapped]);
    expect(f.entries).toEqual([]);
  });

  it('FM-15 key rotation: entries signed by either pinned key are admitted', async () => {
    const both = [pipeline.anchor, rotated.anchor];
    const newer = await rotated.sign({ ...second, product: 'Mandrel' });
    const f = await admitted([signedA, newer], both);
    expect(f.entries.map((e) => e.product)).toEqual(['Mandrel', 'Zorbex']);
    // With the retired key removed from the app, a snapshot must be signed by the new key,
    // and entries signed only by the retired key are dropped.
    const r = await loadFormulary(await snap([signedA, newer], '5', rotated), [rotated.anchor], 0);
    expect(r.kind === 'loaded' && r.formulary.entries.map((e) => e.product)).toEqual(['Mandrel']);
    // A snapshot still signed by the retired key is refused outright.
    const stale = await loadFormulary(
      await snap([signedA, newer], '5', pipeline),
      [rotated.anchor],
      0,
    );
    expect(stale.kind).toBe('refused');
  });

  it('FM-15 malformed or unknown signatures never admit an entry and never throw', async () => {
    const sigs = [
      '',
      '.',
      'review-2026.',
      '.AAAA',
      'review-2026',
      'review-2026.AAAA',
      `review-2026.${'A'.repeat(86)}`,
      'review-2026.a.b',
      `nokey.${signedA.signature.split('.')[1]}`,
      `review-2026.${(signedA.signature.split('.')[1] as string).slice(0, -2)}`,
      `review-2026.${signedA.signature.split('.')[1]}=`,
      'review 2026.AAAA',
    ];
    for (const signature of sigs) {
      const f = await admitted([{ ...signedA, signature }]);
      expect(f.entries, signature).toEqual([]);
    }
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 120 }), async (s) => {
        fc.pre(s !== signedA.signature);
        const f = await admitted([{ ...signedA, signature: s }]);
        expect(f.entries).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('FM-15 arbitrary snapshots, anchors and versions never throw', async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), fc.anything(), fc.anything(), async (s, a, v) => {
        const r = await loadFormulary(s, a as TrustAnchor[], v as number);
        expect(['loaded', 'rollback', 'refused']).toContain(r.kind);
        if (r.kind === 'loaded')
          expect(r.formulary.entries.every(formulary.isValidatedEntry)).toBe(true);
      }),
      { numRuns: 300 },
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ signature: fc.string(), junk: fc.anything() }), { maxLength: 8 }),
        async (xs) => {
          const r = await loadFormulary(await snap(xs), anchors, 0);
          expect(r.kind).toBe('loaded');
          if (r.kind === 'loaded') expect(r.formulary.entries).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('FM-16 an older snapshot is refused as a rollback; equal and newer are accepted', async () => {
    const entries = [signedA];
    const older = await loadFormulary(await snap(entries, '4'), anchors, 5);
    expect(older).toEqual({ kind: 'rollback', offered: 4, lastAccepted: 5 });
    for (const [offered, last] of [
      ['5', 5],
      ['6', 5],
      ['1', 0],
      ['900', 5],
    ] as const) {
      const r = await loadFormulary(await snap(entries, offered), anchors, last);
      expect(r.kind).toBe('loaded');
      if (r.kind === 'loaded') expect(r.version).toBe(Number(offered));
    }
  });

  it('FM-16 any lower version is a rollback, any version at or above is not', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        async (offered, last) => {
          const r = await loadFormulary(await snap([], String(offered)), anchors, last);
          expect(r.kind).toBe(offered < last ? 'rollback' : 'loaded');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('FM-16 a version that is not a positive whole number is refused', async () => {
    for (const v of [
      '0',
      '01',
      '-1',
      '1.5',
      ' 1',
      '1 ',
      'abc',
      '',
      '1e3',
      '9'.repeat(16),
      5,
      null,
      undefined,
    ]) {
      const r = await loadFormulary({ formularyVersion: v, entries: [signedA] }, anchors, 0);
      expect(r.kind, String(v)).toBe('refused');
      if (r.kind === 'refused') expect(r.code).toBe('badSnapshot');
    }
    for (const last of [Number.NaN, -1, 1.5, Number.POSITIVE_INFINITY, '3', null, undefined]) {
      const r = await loadFormulary(await snap([signedA]), anchors, last as number);
      expect(r.kind, String(last)).toBe('refused');
      if (r.kind === 'refused') expect(r.code).toBe('badState');
    }
  });

  it('FM-17 a bad trust configuration yields no table', async () => {
    const good = pipeline.anchor;
    const bad: unknown[] = [
      [],
      null,
      undefined,
      'x',
      [good, good],
      [{ ...good, keyId: '' }],
      [{ ...good, keyId: 'has space' }],
      [{ ...good, keyId: 'a.b' }],
      [{ ...good, keyId: 'x'.repeat(65) }],
      [{ ...good, publicKey: '' }],
      [{ ...good, publicKey: 'AAAA' }],
      [{ ...good, publicKey: '!!!!' }],
      [{ ...good, publicKey: 42 }],
      [{ keyId: 'k' }],
      [null],
      [good, { keyId: 'second', publicKey: 'AAAA' }],
    ];
    for (const [i, a] of bad.entries()) {
      const r = await loadFormulary(await snap([signedA]), a as TrustAnchor[], 0);
      expect(r.kind, `anchors #${i}`).toBe('refused');
      if (r.kind === 'refused') expect(r.code).toBe('badAnchors');
    }
  });

  it('FM-17 a snapshot that is not an object, or has no entries, yields no table', async () => {
    for (const s of [
      null,
      [],
      'x',
      5,
      {},
      { formularyVersion: '1' },
      { formularyVersion: '1', entries: 'x' },
    ]) {
      const r = await loadFormulary(s, anchors, 0);
      expect(r.kind).toBe('refused');
    }
  });

  it('FM-18 core rules still apply to loaded entries: a same-date conflict admits neither', async () => {
    const a = await pipeline.sign({ ...base, maxDays: 5, labelVersion: 'L1' });
    const b = await pipeline.sign({ ...base, maxDays: 7, labelVersion: 'L2' });
    const f = await admitted([a, b]);
    expect(f.entries).toEqual([]);
    expect(f.rejected.map((r) => r.reason)).toEqual(['conflict', 'conflict']);
  });

  it('FM-18 a loaded entry yields a clock and a lookup; a copy of it does not', async () => {
    const f = await admitted([signedA]);
    const hit = formulary.lookupEntry(f, 'zorbex', 'unopened');
    expect(hit.kind).toBe('found');
    if (hit.kind !== 'found') return;
    const input = { startMinute: 0, nowMinute: 600, samples: [{ minute: 0, tempC: 20 }] };
    expect(formulary.excursionClock(hit.entry, input).kind).toBe('consuming');
    expect(formulary.excursionClock({ ...hit.entry } as formulary.ValidatedEntry, input).kind).toBe(
      'unknown',
    );
  });

  it('FM-18 loading is deterministic and independent of entry order', async () => {
    const a = await admitted([signedA, signedB]);
    const b = await admitted([signedB, signedA]);
    expect(b).toEqual(a);
  });

  it('FM-18 an oversized snapshot is refused rather than truncated', async () => {
    const many = Array.from({ length: 20_001 }, () => 0);
    const r = await loadFormulary({ formularyVersion: '5', entries: many }, anchors, 0);
    expect(r.kind).toBe('refused');
    if (r.kind === 'refused') expect(r.code).toBe('tooLarge');
  });

  // ------------------------------------------------------------------ FM-19
  it('FM-19 a snapshot with a valid manifest loads, whatever the order of its entries', async () => {
    const forward = await loadFormulary(await snap([signedA, signedB]), anchors, 0);
    const backward = await loadFormulary(await snap([signedB, signedA]), anchors, 0);
    expect(forward.kind).toBe('loaded');
    expect(backward).toEqual(forward);
  });

  it('FM-19 a missing or malformed manifest refuses the whole snapshot', async () => {
    const good = await snap([signedA, signedB]);
    const { manifestSignature: _drop, ...noManifest } = good;
    const cases: unknown[] = [
      noManifest,
      { ...good, manifestSignature: '' },
      { ...good, manifestSignature: 42 },
      { ...good, manifestSignature: null },
      { ...good, manifestSignature: 'review-2026.AAAA' },
      { ...good, manifestSignature: `${good.manifestSignature}x` },
      { ...good, manifestSignature: good.manifestSignature.replace(/^review-2026/, 'nokey') },
    ];
    for (const [i, c] of cases.entries()) {
      const r = await loadFormulary(c, anchors, 0);
      expect(r.kind, `case #${i}`).toBe('refused');
      if (r.kind === 'refused') expect(r.code).toBe('badManifest');
    }
  });

  it('FM-19 a manifest signed by an unpinned key is refused, even with valid entries', async () => {
    const forged = await snap([signedA], '5', other);
    const r = await loadFormulary(forged, anchors, 0);
    expect(r.kind).toBe('refused');
    if (r.kind === 'refused') expect(r.code).toBe('badManifest');
  });

  it('FM-19 an old entry replayed under a higher version number is refused', async () => {
    const real = await snap([signedA, signedB], '5');
    const replay = { ...real, formularyVersion: '99' };
    const r = await loadFormulary(replay, anchors, 5);
    expect(r.kind).toBe('refused');
    if (r.kind === 'refused') expect(r.code).toBe('badManifest');
  });

  it('FM-19 removing, adding or duplicating an entry after signing is refused', async () => {
    const real = await snap([signedA, signedB]);
    const extra = await pipeline.sign({ ...base, product: 'Mandrel' });
    const variants = [
      { ...real, entries: [signedA] },
      { ...real, entries: [signedA, signedB, extra] },
      { ...real, entries: [signedA, signedB, signedB] },
      { ...real, entries: [] },
    ];
    for (const [i, v] of variants.entries()) {
      const r = await loadFormulary(v, anchors, 0);
      expect(r.kind, `variant #${i}`).toBe('refused');
      if (r.kind === 'refused') expect(r.code).toBe('badManifest');
    }
  });

  it('FM-19 a withdrawn entry stays withdrawn: a later signed snapshot without it drops it', async () => {
    const v5 = await loadFormulary(await snap([signedA, signedB], '5'), anchors, 0);
    const v6 = await loadFormulary(await snap([signedA], '6'), anchors, 5);
    expect(v5.kind === 'loaded' && v5.formulary.entries.length).toBe(2);
    expect(v6.kind === 'loaded' && v6.formulary.entries.map((e) => e.product)).toEqual(['Zorbex']);
    // Replaying the old snapshot is a rollback, and forging a higher version is refused.
    const replayOld = await loadFormulary(await snap([signedA, signedB], '5'), anchors, 6);
    expect(replayOld.kind).toBe('rollback');
    const forgedHigher = await loadFormulary(
      { ...(await snap([signedA, signedB], '5')), formularyVersion: '7' },
      anchors,
      6,
    );
    expect(forgedHigher.kind).toBe('refused');
  });

  it('FM-19 an entry without a string signature refuses the snapshot', async () => {
    for (const bad of [null, 5, {}, { signature: 5 }, 'x']) {
      const r = await loadFormulary(
        { formularyVersion: '5', entries: [signedA, bad], manifestSignature: 'review-2026.AAAA' },
        anchors,
        0,
      );
      expect(r.kind).toBe('refused');
    }
  });
});
