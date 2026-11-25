import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFormulary } from '@afterglow/adapters';
import { formulary } from '@afterglow/core';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { approve } from './approve.js';
import { renderFormularyDoc } from './docs.js';
import { generateKey, makeSigner, parseAnchors, readPrivateKey, writePrivateKey } from './keys.js';
import { checkNumbers, durationsDays, temperaturesC } from './numbers.js';
import {
  type Proposal,
  type ValidatorReport,
  checkProposal,
  parseProposal,
  parseReport,
} from './proposal.js';
import { isSafeId } from './safe.js';
import { buildSnapshot } from './snapshot.js';
import { makeSource, parseSource } from './sources.js';

/*
 * Every fixture here is INVENTED: a made-up product and a made-up label sentence, so the
 * tests exercise the pipeline without any real drug data in the repository.
 */

const TODAY = '2026-11-25';
const NOW = new Date('2026-11-25T12:00:00Z');
const LABEL =
  'Store unopened in a refrigerator. After first use, Zorbex may be kept below 30°C (86°F) for up to 28 days. Do not freeze.';

const source = makeSource({
  id: 'zorbex-label-1',
  product: 'Zorbex',
  labelVersion: '2026-01',
  title: 'Zorbex invented label',
  url: 'https://example.test/zorbex',
  fetchedAt: '2026-11-01T00:00:00Z',
  text: `HOW SUPPLIED\n${LABEL}\nKeep out of reach of children.`,
});

const proposal = (over: Partial<Proposal['entry']> = {}, p: Partial<Proposal> = {}): Proposal => ({
  id: 'zorbex-in-use',
  sourceId: source.id,
  proposer: { family: 'Alpha', model: 'alpha-1' },
  proposedAt: '2026-11-02',
  entry: {
    product: 'Zorbex',
    labelVersion: '2026-01',
    condition: 'inUse',
    maxTempC: 30,
    maxDays: 28,
    notes: '',
    source: { title: source.title, url: source.url, excerpt: LABEL },
    ...over,
  },
  ...p,
});

const report = (over: Partial<ValidatorReport> = {}): ValidatorReport => ({
  proposalId: 'zorbex-in-use',
  validator: { family: 'Beta', model: 'beta-1' },
  verdict: 'agree',
  extracted: { condition: 'inUse', maxTempC: 30, maxDays: 28 },
  reasons: [],
  ...over,
});

const check = (p: Proposal, r: ValidatorReport | null = report()) =>
  checkProposal(p, source, r, TODAY);
const reasonsOf = (r: ReturnType<typeof check>): string => (r.ok ? '' : r.reasons.join(' | '));

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'afterglow-fp-'));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('Formulary pipeline: the label is the law', () => {
  it('a proposal that is true to its label passes every check', () => {
    expect(check(proposal())).toMatchObject({ ok: true });
  });

  // FP-01
  it('FP-01 an excerpt that is not in the source is rejected', () => {
    const r = check(
      proposal({
        source: {
          title: source.title,
          url: source.url,
          excerpt: LABEL.replace('28 days', '30 days'),
        },
      }),
    );
    expect(reasonsOf(r)).toContain('does not appear word for word');
  });

  it('FP-01 whitespace and typography differences do not matter, wording does', () => {
    // Extra spaces and a label printing the degree as a masculine ordinal are the same words.
    const spaced = LABEL.replace(/ /g, '  ').replace('30°C', '30\u00baC');
    expect(
      check(proposal({ source: { title: source.title, url: source.url, excerpt: spaced } })).ok,
    ).toBe(true);
    const reworded = LABEL.replace('may be kept', 'can be kept');
    expect(
      check(proposal({ source: { title: source.title, url: source.url, excerpt: reworded } })).ok,
    ).toBe(false);
  });

  it('FP-01 a trivially short excerpt is rejected', () => {
    const r = check(
      proposal({ source: { title: source.title, url: source.url, excerpt: '28 days' } }),
    );
    expect(reasonsOf(r)).toContain('too short');
  });

  // FP-02
  it('FP-02 temperatures are read in Celsius and Fahrenheit, durations in days and weeks', () => {
    expect(temperaturesC('below 30°C (86°F)')).toEqual([30, 30]);
    expect(temperaturesC('at 25 degrees Celsius or 77 degrees F')).toEqual([25, 25]);
    expect(temperaturesC('up to 25\u00baC')).toEqual([25]);
    expect(durationsDays('for 4 weeks or 28-day use, 56 days')).toEqual([28, 56, 28]);
    expect(durationsDays('about a month')).toEqual([]);
  });

  it('FP-02 a number the excerpt does not state is rejected, whatever it is', () => {
    fc.assert(
      fc.property(fc.integer({ min: 8, max: 60 }), fc.integer({ min: 1, max: 400 }), (c, d) => {
        const excerpt = `Keep the open pen at or below ${c}°C for up to ${d} days after first use.`;
        const ok = checkNumbers({ maxTempC: c, maxDays: d, notes: '', source: { excerpt } });
        expect(ok.ok).toBe(true);
        // A different day count is rejected, unless it happens to be another stated figure.
        const other = d === 1 ? 2 : d - 1;
        const bad = checkNumbers({ maxTempC: c, maxDays: other, notes: '', source: { excerpt } });
        expect(bad.ok).toBe(false);
        const badTemp = checkNumbers({
          maxTempC: c === 60 ? 59 : c + 1,
          maxDays: d,
          notes: '',
          source: { excerpt },
        });
        expect(badTemp.ok).toBe(false);
      }),
    );
  });

  it('FP-02 notes cannot introduce a figure the label does not state', () => {
    const e = { maxTempC: 30, maxDays: 28, source: { excerpt: LABEL } };
    expect(checkNumbers({ ...e, notes: 'Do not freeze. Up to 28 days.' }).ok).toBe(true);
    const r = checkNumbers({ ...e, notes: 'Discard after 14 days.' });
    expect(r.ok).toBe(false);
    expect(r.reasons.join()).toContain('number 14');
  });

  it('FP-02 weeks convert exactly', () => {
    const excerpt = 'After first use keep at 25°C for up to 4 weeks.';
    expect(checkNumbers({ maxTempC: 25, maxDays: 28, notes: '', source: { excerpt } }).ok).toBe(
      true,
    );
    expect(checkNumbers({ maxTempC: 25, maxDays: 4, notes: '', source: { excerpt } }).ok).toBe(
      false,
    );
  });

  // FP-03
  it('FP-03 the validator must be a different family and a different model', () => {
    expect(
      reasonsOf(check(proposal(), report({ validator: { family: ' ALPHA ', model: 'beta-1' } }))),
    ).toContain('same model family');
    expect(
      reasonsOf(check(proposal(), report({ validator: { family: 'Beta', model: 'Alpha-1' } }))),
    ).toContain('same model as');
    expect(reasonsOf(check(proposal(), null))).toContain('no validator report');
  });

  it('FP-03 the validator must agree and have read the same figures', () => {
    expect(reasonsOf(check(proposal(), report({ verdict: 'disagree' })))).toContain(
      'does not agree',
    );
    expect(
      reasonsOf(
        check(
          proposal(),
          report({ extracted: { condition: 'unopened', maxTempC: 30, maxDays: 28 } }),
        ),
      ),
    ).toContain('different condition');
    expect(
      reasonsOf(
        check(proposal(), report({ extracted: { condition: 'inUse', maxTempC: 25, maxDays: 28 } })),
      ),
    ).toContain('different temperature');
    expect(
      reasonsOf(
        check(proposal(), report({ extracted: { condition: 'inUse', maxTempC: 30, maxDays: 14 } })),
      ),
    ).toContain('different number of days');
    expect(reasonsOf(check(proposal(), report({ proposalId: 'someone-else' })))).toContain(
      'another proposal',
    );
  });

  // FP-04
  it('FP-04 a proposal about another product, version, title or URL is rejected', () => {
    expect(reasonsOf(check(proposal({ product: 'Zorbex Forte' })))).toContain('product differs');
    expect(reasonsOf(check(proposal({ labelVersion: '2025-01' })))).toContain(
      'label version differs',
    );
    expect(
      reasonsOf(check(proposal({ source: { title: 'x', url: source.url, excerpt: LABEL } }))),
    ).toContain('title differs');
    expect(
      reasonsOf(
        check(
          proposal({
            source: { title: source.title, url: 'https://example.test/other', excerpt: LABEL },
          }),
        ),
      ),
    ).toContain('URL differs');
    expect(reasonsOf(check(proposal({}, { sourceId: 'another-source' })))).toContain(
      'different source',
    );
  });

  it('FP-04 nothing the app would refuse is ever queued', () => {
    // 4 C is below the refrigerated range this model can represent, so the app refuses it.
    const text = 'Keep at 4°C for up to 28 days after first use, then discard it.';
    const low = makeSource({ ...source, text, id: 'low-1' });
    const p = proposal(
      { maxTempC: 4, source: { title: source.title, url: source.url, excerpt: text } },
      { sourceId: 'low-1' },
    );
    const r = checkProposal(
      p,
      low,
      report({ extracted: { condition: 'inUse', maxTempC: 4, maxDays: 28 } }),
      TODAY,
    );
    expect(reasonsOf(r)).toContain('The app would refuse this entry');
  });

  it('FP-04 every reason is reported, not only the first', () => {
    const r = check(proposal({ product: 'Other', labelVersion: 'x' }), null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it('FP-04 malformed proposals and reports are refused, never thrown on', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        expect(() => parseProposal(raw)).not.toThrow();
        expect(() => parseReport(raw)).not.toThrow();
      }),
    );
    const extra = { ...proposal(), approver: 'me' };
    expect(parseProposal(extra).ok).toBe(false);
    expect(parseProposal(proposal()).ok).toBe(true);
    expect(parseReport(report()).ok).toBe(true);
    expect(parseReport({ ...report(), extra: 1 }).ok).toBe(false);
  });

  // FP-08
  it('FP-08 an id can never name a path', () => {
    for (const bad of [
      '',
      '../x',
      'a/b',
      'a\\b',
      '.hidden',
      'A',
      'x y',
      'a.b',
      '-a',
      'x'.repeat(82),
      '../../validated/x',
    ]) {
      expect(isSafeId(bad), bad).toBe(false);
    }
    fc.assert(
      fc.property(fc.string(), (s) => {
        if (isSafeId(s)) expect(/[/\\.\s]/.test(s)).toBe(false);
      }),
      { numRuns: 500 },
    );
    expect(isSafeId('zorbex-in-use')).toBe(true);
  });

  // FP-09
  it('FP-09 a source whose text changed after ingestion is refused', () => {
    expect(parseSource({ ...source })).not.toBeNull();
    expect(parseSource({ ...source, text: `${source.text} and 99 days` })).toBeNull();
    expect(
      reasonsOf(checkProposal(proposal(), { ...source, text: `${source.text}!` }, report(), TODAY)),
    ).toContain('no longer matches its hash');
    expect(parseSource({ ...source, extra: 'x' })).toBeNull();
  });
});

describe('Formulary pipeline: approval, signing and the published snapshot', () => {
  const approveWith = async (over: Partial<Parameters<typeof approve>[0]> = {}) => {
    const key = await generateKey('review-test');
    const sign = await makeSigner(key.anchor.keyId, key.privatePkcs8);
    const result = await approve({
      proposal: proposal(),
      source,
      report: report(),
      approver: 'A. Pharmacist, MPharm (test)',
      approvedAt: '2026-11-20',
      labelRead: true,
      now: NOW,
      sign,
      ...over,
    });
    return { key, sign, result };
  };

  // FP-05
  it('FP-05 approval needs a name, a real past date and an explicit "I read the label"', async () => {
    const reasons = async (over: Partial<Parameters<typeof approve>[0]>): Promise<string> => {
      const { result } = await approveWith(over);
      return result.ok ? '' : result.reasons.join(' | ');
    };
    expect(await reasons({ approver: '   ' })).toContain('named approver');
    expect(await reasons({ labelRead: false })).toContain('read the label');
    expect(await reasons({ approvedAt: '2026-13-40' })).toContain('not a real date');
    expect(await reasons({ approvedAt: '2027-01-01' })).toContain('in the future');
    expect((await approveWith()).result.ok).toBe(true);
  });

  it('FP-05 approval re-checks everything, so a queue edited after review is refused', async () => {
    const tampered = proposal({
      maxDays: 90,
      source: { title: source.title, url: source.url, excerpt: LABEL },
    });
    const { result } = await approveWith({
      proposal: tampered,
      report: report({ extracted: { condition: 'inUse', maxTempC: 30, maxDays: 90 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons.join()).toContain('maxDays 90 is not stated');
  });

  it('FP-05 the signature is over the exact bytes the app verifies', async () => {
    const { key, result } = await approveWith();
    if (!result.ok) throw new Error('expected approval');
    const entry = result.entry;
    expect(entry.signature.startsWith('review-test.')).toBe(true);
    const { signature: _s, ...unsigned } = entry;
    const payload = formulary.canonicalPayload(unsigned);
    const pub = await globalThis.crypto.subtle.importKey(
      'raw',
      Buffer.from(key.anchor.publicKey, 'base64url'),
      'Ed25519',
      false,
      ['verify'],
    );
    const ok = await globalThis.crypto.subtle.verify(
      'Ed25519',
      pub,
      Buffer.from(entry.signature.split('.')[1] as string, 'base64url'),
      Buffer.from(payload),
    );
    expect(ok).toBe(true);
  });

  it('FP-05 the review log line names who approved what, with a hash of the proposal', async () => {
    const { result } = await approveWith();
    if (!result.ok) throw new Error('expected approval');
    expect(result.log).toMatchObject({
      action: 'approved',
      proposalId: 'zorbex-in-use',
      product: 'Zorbex',
      approver: 'A. Pharmacist, MPharm (test)',
    });
    expect(result.log.proposalSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  // FP-06: end to end with the real app loader
  it('FP-06 a snapshot loads in the real app loader, and the entry is usable for a clock', async () => {
    const { key, sign, result } = await approveWith();
    if (!result.ok) throw new Error('expected approval');
    const built = await buildSnapshot({
      entries: [result.entry],
      anchors: [key.anchor],
      previousVersion: 0,
      sign,
    });
    if (!built.ok) throw new Error(built.reasons.join());
    expect(built.snapshot.formularyVersion).toBe('1');
    const loaded = await loadFormulary(JSON.parse(JSON.stringify(built.snapshot)), [key.anchor], 0);
    expect(loaded.kind).toBe('loaded');
    if (loaded.kind === 'loaded') {
      expect(loaded.formulary.entries).toHaveLength(1);
      expect(formulary.lookupEntry(loaded.formulary, 'zorbex', 'inUse').kind).toBe('found');
    }
  });

  it('FP-06 the version rises by exactly one and a stale offer is a rollback', async () => {
    const { key, sign, result } = await approveWith();
    if (!result.ok) throw new Error('expected approval');
    const v5 = await buildSnapshot({
      entries: [result.entry],
      anchors: [key.anchor],
      previousVersion: 4,
      sign,
    });
    if (!v5.ok) throw new Error('expected a snapshot');
    expect(v5.snapshot.formularyVersion).toBe('5');
    expect((await loadFormulary(v5.snapshot, [key.anchor], 9)).kind).toBe('rollback');
  });

  it('FP-06 nothing is published for an empty table or a duplicate product', async () => {
    const { key, sign, result } = await approveWith();
    if (!result.ok) throw new Error('expected approval');
    const empty = await buildSnapshot({
      entries: [],
      anchors: [key.anchor],
      previousVersion: 0,
      sign,
    });
    expect(empty.ok).toBe(false);
    const dup = await buildSnapshot({
      entries: [result.entry, result.entry],
      anchors: [key.anchor],
      previousVersion: 0,
      sign,
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.reasons.join()).toContain('Two entries for Zorbex');
  });

  it('FP-06 a snapshot signed by a key the app does not pin is never produced', async () => {
    const real = await generateKey('review-test');
    const stranger = await generateKey('stranger');
    const signer = await makeSigner('stranger', stranger.privatePkcs8);
    const { result } = await approveWith({ sign: signer });
    if (!result.ok) throw new Error('expected approval');
    const built = await buildSnapshot({
      entries: [result.entry],
      anchors: [real.anchor],
      previousVersion: 0,
      sign: signer,
    });
    expect(built.ok).toBe(false);
  });

  it('FP-06 changing any published byte afterwards makes the app refuse it', async () => {
    const { key, sign, result } = await approveWith();
    if (!result.ok) throw new Error('expected approval');
    const built = await buildSnapshot({
      entries: [result.entry],
      anchors: [key.anchor],
      previousVersion: 0,
      sign,
    });
    if (!built.ok) throw new Error('expected a snapshot');
    const copy = JSON.parse(JSON.stringify(built.snapshot));
    copy.entries[0].maxDays = 280;
    const loaded = await loadFormulary(copy, [key.anchor], 0);
    // The manifest still verifies, but the entry's own signature no longer does.
    expect(loaded.kind === 'loaded' ? loaded.formulary.entries.length : 0).toBe(0);
    const reversion = JSON.parse(JSON.stringify(built.snapshot));
    reversion.formularyVersion = '2';
    expect((await loadFormulary(reversion, [key.anchor], 0)).kind).toBe('refused');
  });

  // FP-10
  it('FP-10 the documentation is generated from the entries alone', async () => {
    const { result } = await approveWith();
    if (!result.ok) throw new Error('expected approval');
    const doc = renderFormularyDoc([result.entry], '1');
    expect(doc).toContain('## Zorbex (in use)');
    expect(doc).toContain('Up to 30 °C for 28 days');
    expect(doc).toContain('Approved by A. Pharmacist, MPharm (test) on 2026-11-20');
    expect(doc).toContain('Store unopened in a refrigerator.');
    expect(renderFormularyDoc([], '0')).toContain('No entries have been approved yet.');
  });
});

describe('Formulary pipeline: keys never live in the repository', () => {
  const root = (): string => tmp();

  // FP-07
  it('FP-07 a private key is written outside the repo, owner-only, and never overwritten', async () => {
    const repo = root();
    const away = tmp();
    const key = await generateKey('k1');
    const path = join(away, 'review.key');
    writePrivateKey(path, repo, key.privatePkcs8);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(() => writePrivateKey(path, repo, key.privatePkcs8)).toThrow(/overwrite/);
    expect(readPrivateKey(path, repo)).toBe(key.privatePkcs8);
  });

  it('FP-07 writing or reading a private key inside the repo is refused', async () => {
    const repo = root();
    const key = await generateKey('k1');
    expect(() => writePrivateKey(join(repo, 'review.key'), repo, key.privatePkcs8)).toThrow(
      /inside the repository/,
    );
    expect(() =>
      writePrivateKey(join(repo, 'a', '..', 'review.key'), repo, key.privatePkcs8),
    ).toThrow(/inside the repository/);
    const inside = join(repo, 'k');
    writeFileSync(inside, key.privatePkcs8, { mode: 0o600 });
    expect(() => readPrivateKey(inside, repo)).toThrow(/inside the repository/);
  });

  it('FP-07 a key file other users can read is refused', async () => {
    const repo = root();
    const away = tmp();
    const path = join(away, 'open.key');
    writeFileSync(path, 'x', { mode: 0o644 });
    chmodSync(path, 0o644);
    expect(() => readPrivateKey(path, repo)).toThrow(/group or others/);
  });

  it('FP-07 the anchors file holds public keys only', async () => {
    const key = await generateKey('k1');
    expect(parseAnchors([key.anchor])).toEqual([key.anchor]);
    expect(() => parseAnchors([{ ...key.anchor, privateKey: key.privatePkcs8 }])).toThrow(
      /other than keyId and publicKey/,
    );
    expect(() => parseAnchors([{ keyId: 'k', publicKey: key.privatePkcs8 }])).toThrow(/32-byte/);
    expect(() => parseAnchors({})).toThrow();
  });

  it('FP-07 a signer never reveals the key in what it returns', async () => {
    const key = await generateKey('k1');
    const sign = await makeSigner('k1', key.privatePkcs8);
    const sig = await sign('anything');
    expect(sig.startsWith('k1.')).toBe(true);
    expect(sig).not.toContain(key.privatePkcs8);
  });
});
