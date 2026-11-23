import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CompartmentState } from '../thermal/types.js';
import { buildFormulary, isValidatedEntry } from './admit.js';
import {
  BEYOND_LABEL_MESSAGE,
  DISCLAIMER,
  FREEZING_LINE,
  IN_USE_CAVEAT,
  MAX_SAMPLES,
  excursionClock,
  formatMinutes,
  modelledSeries,
} from './clock.js';
import {
  MINUTES_PER_DAY,
  REFRIGERATED_MAX_C,
  canonicalPayload,
  normaliseProduct,
} from './entry.js';
import { NOT_IN_TABLE_MESSAGE, lookupEntry, searchFormulary } from './lookup.js';
import type {
  ClockInput,
  ClockResult,
  Condition,
  Formulary,
  FormularyEntry,
  TemperatureSample,
  ValidatedEntry,
  Verifier,
} from './types.js';

// ---------------------------------------------------------------------------
// Fixtures. Every product is fictional and every number is arbitrary: the core
// holds no drug data (label-only-medicine.md). The signature scheme is a toy
// hash so the tests exercise the admission flow; real Ed25519 verification
// belongs to the adapter layer.
// ---------------------------------------------------------------------------

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
const sigOf = (payload: string): string => `sig-${fnv(payload)}`;
const verify: Verifier = (payload, signature) => signature === sigOf(payload);

type Unsigned = Omit<FormularyEntry, 'signature'>;
const sign = (u: Unsigned): FormularyEntry => ({ ...u, signature: sigOf(canonicalPayload(u)) });

const NAMES = ['Zorbex', 'Quillan', 'Mandrel', 'Tarvox', 'Velmin', 'Pexoral'] as const;

const dateArb = fc
  .record({
    y: fc.integer({ min: 2024, max: 2027 }),
    m: fc.integer({ min: 1, max: 12 }),
    d: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);

const unsignedArb: fc.Arbitrary<Unsigned> = fc.record({
  product: fc.constantFrom(...NAMES),
  labelVersion: fc.constantFrom('L1', 'L2', '2026-A'),
  condition: fc.constantFrom<Condition>('unopened', 'inUse'),
  maxTempC: fc.double({ min: 8, max: 40, noNaN: true, noDefaultInfinity: true }),
  maxDays: fc.double({ min: 0, max: 120, noNaN: true, noDefaultInfinity: true }),
  notes: fc.string({ maxLength: 60 }),
  source: fc.record({
    title: fc.constantFrom('Fictional label A', 'Fictional label B'),
    url: fc.constantFrom('https://example.test/a', 'https://example.test/b?v=2'),
    excerpt: fc.string({ minLength: 1, maxLength: 80 }),
  }),
  approver: fc.constantFrom('A. Reviewer', 'B. Reviewer'),
  approvedAt: dateArb,
});

const keyOf = (e: { product: string; condition: string }): string =>
  `${normaliseProduct(e.product)}|${e.condition}`;

/** Distinct (product, condition) pairs so every generated entry is admitted. */
const distinctEntriesArb = fc
  .uniqueArray(unsignedArb, { selector: keyOf, minLength: 1, maxLength: 8 })
  .map((us) => us.map(sign));

const snap = (entries: readonly unknown[], formularyVersion = 'test-1') => ({
  formularyVersion,
  entries,
});

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

/** Build a one-entry table and return the admitted entry. */
function admitOne(over: Partial<Unsigned> = {}): ValidatedEntry {
  const f = buildFormulary(snap([sign({ ...base, ...over })]), verify);
  const e = f.entries[0];
  if (!e) throw new Error(`fixture was not admitted: ${JSON.stringify(f.rejected)}`);
  return e;
}

const rank = (r: ClockResult): number =>
  ({ noExcursion: 0, consuming: 1, exhausted: 2, beyondLabel: 3, unknown: -1 })[r.kind];

const tempArb = fc.double({ min: -5, max: 45, noNaN: true, noDefaultInfinity: true });
/** A strictly increasing series that starts at minute 0. */
const seriesArb: fc.Arbitrary<TemperatureSample[]> = fc
  .tuple(tempArb, fc.array(fc.tuple(fc.integer({ min: 1, max: 300 }), tempArb), { maxLength: 40 }))
  .map(([t0, rest]) => {
    const out: TemperatureSample[] = [{ minute: 0, tempC: t0 }];
    let m = 0;
    for (const [dm, t] of rest) {
      m += dm;
      out.push({ minute: m, tempC: t });
    }
    return out;
  });

const entryParamsArb = fc.record({
  maxTempC: fc.double({ min: 8, max: 40, noNaN: true, noDefaultInfinity: true }),
  maxDays: fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true }),
});

const input = (
  samples: readonly TemperatureSample[],
  nowMinute: number,
  startMinute = 0,
): ClockInput => ({
  startMinute,
  nowMinute,
  samples,
});

describe('Formulary properties', () => {
  // ------------------------------------------------------------------ FM-01
  it('FM-01 every well-formed, correctly signed entry is admitted and nothing is rejected', () => {
    fc.assert(
      fc.property(distinctEntriesArb, (entries) => {
        const f = buildFormulary(snap(entries), verify);
        expect(f.entries).toHaveLength(entries.length);
        expect(f.rejected).toEqual([]);
        expect(f.entries.every(isValidatedEntry)).toBe(true);
        expect(f.formularyVersion).toBe('test-1');
      }),
      { numRuns: 200 },
    );
  });

  it('FM-01 altering any signed field after signing rejects the entry as a signature failure', () => {
    const tampers: Array<(e: FormularyEntry) => FormularyEntry> = [
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
    fc.assert(
      fc.property(unsignedArb, fc.nat({ max: tampers.length - 1 }), (u, i) => {
        const tampered = (tampers[i] as (e: FormularyEntry) => FormularyEntry)(sign(u));
        const f = buildFormulary(snap([tampered]), verify);
        expect(f.entries).toEqual([]);
        expect(f.rejected.map((r) => r.reason)).toEqual(['signature']);
      }),
      { numRuns: 300 },
    );
  });

  it('FM-01 an arbitrary signature string never admits an entry', () => {
    fc.assert(
      fc.property(unsignedArb, fc.string({ minLength: 1, maxLength: 60 }), (u, s) => {
        fc.pre(s !== sigOf(canonicalPayload(u)));
        const f = buildFormulary(snap([{ ...u, signature: s }]), verify);
        expect(f.entries).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it('FM-01 only an exact true from the verifier counts; a throw, a Promise or a truthy value rejects', () => {
    const entry = sign(base);
    const hostile: unknown[] = [
      () => 1,
      () => 'true',
      () => ({}),
      () => [],
      () => Promise.resolve(true),
      () => undefined,
      () => null,
      () => {
        throw new Error('boom');
      },
      'not a function',
      undefined,
    ];
    for (const v of hostile) {
      const f = buildFormulary(snap([entry]), v as Verifier);
      expect(f.entries).toEqual([]);
      expect(f.rejected.map((r) => r.reason)).toEqual(['signature']);
    }
    expect(buildFormulary(snap([entry]), () => true).entries).toHaveLength(1);
  });

  it('FM-01 malformed entries are rejected, whatever the cause, and never throw', () => {
    const good = sign(base);
    const bad: unknown[] = [
      null,
      undefined,
      42,
      'text',
      [],
      [good],
      {},
      { ...good, extra: 1 },
      Object.fromEntries(Object.entries(good).filter(([k]) => k !== 'notes')),
      { ...good, product: '' },
      { ...good, product: '   ' },
      { ...good, product: 'a\u0000b' },
      { ...good, product: 'x'.repeat(201) },
      { ...good, condition: 'opened' },
      { ...good, maxTempC: Number.NaN },
      { ...good, maxTempC: Number.POSITIVE_INFINITY },
      { ...good, maxTempC: '25' },
      { ...good, maxTempC: REFRIGERATED_MAX_C - 0.1 },
      { ...good, maxTempC: 61 },
      { ...good, maxDays: -1 },
      { ...good, maxDays: Number.NaN },
      { ...good, maxDays: 3651 },
      { ...good, source: { ...good.source, url: 'http://example.test/a' } },
      { ...good, source: { ...good.source, url: 'javascript:alert(1)' } },
      { ...good, source: { ...good.source, extra: 'x' } },
      { ...good, source: { ...good.source, excerpt: '' } },
      { ...good, source: 'https://example.test' },
      { ...good, approvedAt: '2026-02-30' },
      { ...good, approvedAt: '2026-13-01' },
      { ...good, approvedAt: 'yesterday' },
      { ...good, approver: '  ' },
      { ...good, signature: '' },
      { ...good, signature: 'has space' },
      Object.create({ ...good }),
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error('trap');
          },
        },
      ),
    ];
    for (const [i, b] of bad.entries()) {
      const f = buildFormulary(snap([b]), verify);
      expect(f.entries, `bad case #${i}`).toEqual([]);
      expect(f.rejected).toHaveLength(1);
      expect(f.rejected[0]?.reason).toBe('malformed');
    }
  });

  it('FM-01 never throws for any snapshot or verifier, and admits only what verifies', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (s, v) => {
        const f = buildFormulary(s, v as Verifier);
        expect(Array.isArray(f.entries)).toBe(true);
        expect(f.entries.every(isValidatedEntry)).toBe(true);
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(fc.array(fc.anything(), { maxLength: 10 }), (xs) => {
        const f = buildFormulary(snap(xs), verify);
        for (const e of f.entries) {
          const { signature, ...unsigned } = e;
          expect(signature).toBe(sigOf(canonicalPayload(unsigned)));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('FM-01 a snapshot without a version or an entries array yields an empty table', () => {
    for (const s of [
      null,
      [],
      'x',
      {},
      { formularyVersion: '', entries: [] },
      { formularyVersion: 'v' },
      { formularyVersion: 1, entries: [] },
    ]) {
      const f = buildFormulary(s, verify);
      expect(f.entries).toEqual([]);
      expect(f.rejected.length).toBeGreaterThan(0);
    }
  });

  it('FM-01 admitted entries are frozen copies, not the caller’s objects', () => {
    const raw = sign(base);
    const f = buildFormulary(snap([raw]), verify);
    const e = f.entries[0] as ValidatedEntry;
    expect(e).not.toBe(raw);
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.source)).toBe(true);
    (raw as { maxDays: number }).maxDays = 9999;
    expect(e.maxDays).toBe(base.maxDays);
  });

  // ------------------------------------------------------------------ FM-02
  it('FM-02 lookup finds an entry exactly when a normalised name and condition match', () => {
    fc.assert(
      fc.property(
        distinctEntriesArb,
        fc.oneof(fc.constantFrom(...NAMES), fc.string({ maxLength: 12 })),
        fc.constantFrom<Condition>('unopened', 'inUse'),
        (entries, query, condition) => {
          const f = buildFormulary(snap(entries), verify);
          const r = lookupEntry(f, query, condition);
          const expected = entries.find(
            (e) =>
              e.condition === condition && normaliseProduct(e.product) === normaliseProduct(query),
          );
          if (expected) {
            expect(r.kind).toBe('found');
            if (r.kind === 'found') expect(r.entry.signature).toBe(expected.signature);
          } else {
            expect(r.kind).toBe('notInTable');
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('FM-02 case, spacing and Unicode width variants of a name find the same entry', () => {
    const f = buildFormulary(snap([sign({ ...base, product: 'Zorbex Plus' })]), verify);
    for (const q of ['zorbex plus', 'ZORBEX PLUS', '  Zorbex   Plus ', 'Ｚｏｒｂｅｘ Ｐｌｕｓ']) {
      expect(lookupEntry(f, q, 'unopened').kind, q).toBe('found');
    }
  });

  it('FM-02 a prefix, a substring or a longer name never matches', () => {
    fc.assert(
      fc.property(fc.constantFrom(...NAMES), fc.integer({ min: 1, max: 5 }), (name, cut) => {
        const f = buildFormulary(snap([sign({ ...base, product: name })]), verify);
        expect(lookupEntry(f, name.slice(0, cut), 'unopened').kind).toBe('notInTable');
        expect(lookupEntry(f, name.slice(cut), 'unopened').kind).toBe('notInTable');
        expect(lookupEntry(f, `${name}s`, 'unopened').kind).toBe('notInTable');
        expect(lookupEntry(f, `${name} xr`, 'unopened').kind).toBe('notInTable');
      }),
      { numRuns: 100 },
    );
  });

  it('FM-02 not in the table says ask your pharmacist and offers label review', () => {
    const f = buildFormulary(snap([sign(base)]), verify);
    const cases: Array<[unknown, unknown]> = [
      ['Unlisted', 'unopened'],
      ['', 'unopened'],
      ['   ', 'inUse'],
      [undefined, 'unopened'],
      [42, 'unopened'],
      ['Zorbex', 'opened'],
      ['Zorbex', undefined],
      ['Zorbex', 'inUse'],
    ];
    for (const [q, c] of cases) {
      const r = lookupEntry(f, q as string, c as Condition);
      expect(r.kind).toBe('notInTable');
      if (r.kind === 'notInTable') {
        expect(r.message).toBe(NOT_IN_TABLE_MESSAGE);
        expect(r.message).toMatch(/pharmacist/i);
        expect(r.canSubmitLabelForReview).toBe(true);
      }
    }
  });

  // ------------------------------------------------------------------ FM-03
  it('FM-03 a copied, spread, cloned or hand-built entry never yields a clock', () => {
    const e = admitOne();
    const win = input([{ minute: 0, tempC: 20 }], 100);
    expect(excursionClock(e, win).kind).not.toBe('unknown');

    const forgeries: unknown[] = [
      { ...e },
      structuredClone(e),
      JSON.parse(JSON.stringify(e)),
      Object.assign(Object.create(null), e),
      sign(base),
      { ...sign(base), maxTempC: 60, maxDays: 3650 },
      null,
      undefined,
      42,
    ];
    for (const forged of forgeries) {
      expect(isValidatedEntry(forged)).toBe(false);
      const r = excursionClock(forged as ValidatedEntry, win);
      expect(r.kind).toBe('unknown');
    }
  });

  it('FM-03 a hand-built formulary finds nothing, even with entries that look right', () => {
    const real = buildFormulary(snap([sign(base)]), verify);
    const forgedEntry = { ...(real.entries[0] as ValidatedEntry) } as ValidatedEntry;
    const handBuilt: Formulary = { formularyVersion: 'x', entries: [forgedEntry], rejected: [] };
    expect(lookupEntry(handBuilt, 'Zorbex', 'unopened').kind).toBe('notInTable');
    expect(searchFormulary(handBuilt, 'zor')).toEqual([]);
    for (const junk of [null, undefined, {}, { entries: 'x' }, { entries: [null, 1] }]) {
      expect(lookupEntry(junk as unknown as Formulary, 'Zorbex', 'unopened').kind).toBe(
        'notInTable',
      );
    }
  });

  // ------------------------------------------------------------------ FM-04
  it('FM-04 consumed time stays within 0..budget and remaining is budget minus consumed', () => {
    fc.assert(
      fc.property(
        entryParamsArb,
        seriesArb,
        fc.integer({ min: 0, max: 30000 }),
        (p, samples, now) => {
          const e = admitOne(p);
          const r = excursionClock(e, input(samples, now));
          expect(r.kind).not.toBe('unknown');
          if (r.kind === 'unknown') return;
          const budget = p.maxDays * MINUTES_PER_DAY;
          expect(r.budgetMinutes).toBe(budget);
          expect(r.consumedMinutes).toBeGreaterThanOrEqual(0);
          expect(r.consumedMinutes).toBeLessThanOrEqual(budget);
          if (r.kind === 'noExcursion' || r.kind === 'consuming') {
            expect(r.remainingMinutes).toBeCloseTo(budget - r.consumedMinutes, 6);
            expect(r.remainingMinutes).toBeGreaterThanOrEqual(0);
          }
          if (r.kind === 'exhausted') {
            expect(r.remainingMinutes).toBe(0);
            expect(r.consumedMinutes).toBe(budget);
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it('FM-04 the budget is used up exactly at its limit and the clock then stops', () => {
    const e = admitOne({ maxTempC: 25, maxDays: 1 });
    // The interval 0..10 runs from 5 C to 20 C and is judged by its warmer end (FM-08),
    // so consumption starts at minute 0, not minute 10.
    const samples = [
      { minute: 0, tempC: 5 },
      { minute: 10, tempC: 20 },
    ];
    const mid = excursionClock(e, input(samples, 1000));
    expect(mid.kind).toBe('consuming');
    if (mid.kind === 'consuming') expect(mid.consumedMinutes).toBe(1000);

    const end = excursionClock(e, input(samples, MINUTES_PER_DAY));
    expect(end.kind).toBe('exhausted');
    if (end.kind === 'exhausted') expect(end.exhaustedAtMinute).toBe(MINUTES_PER_DAY);

    const later = excursionClock(e, input(samples, 5 * MINUTES_PER_DAY));
    expect(later.kind).toBe('exhausted');
    if (later.kind === 'exhausted') {
      expect(later.consumedMinutes).toBe(MINUTES_PER_DAY);
      expect(later.remainingMinutes).toBe(0);
      expect(later.exhaustedAtMinute).toBe(MINUTES_PER_DAY);
    }
  });

  it('FM-04 a zero-day allowance is used up the moment the temperature leaves the range', () => {
    const e = admitOne({ maxDays: 0 });
    const r = excursionClock(e, input([{ minute: 0, tempC: 20 }], 5));
    expect(r.kind).toBe('exhausted');
    if (r.kind === 'exhausted') {
      expect(r.consumedMinutes).toBe(0);
      expect(r.exhaustedAtMinute).toBe(0);
    }
  });

  // ------------------------------------------------------------------ FM-05
  it('FM-05 as time advances, consumed time never falls and the status never moves backwards', () => {
    fc.assert(
      fc.property(
        entryParamsArb,
        seriesArb,
        fc.array(fc.integer({ min: 0, max: 30000 }), { minLength: 2, maxLength: 12 }),
        (p, samples, nows) => {
          const e = admitOne(p);
          const sorted = [...nows].sort((a, b) => a - b);
          let prevRank = -1;
          let prevConsumed = -1;
          for (const now of sorted) {
            const r = excursionClock(e, input(samples, now));
            if (r.kind === 'unknown') throw new Error(r.reason);
            expect(rank(r)).toBeGreaterThanOrEqual(prevRank);
            expect(r.consumedMinutes).toBeGreaterThanOrEqual(prevConsumed - 1e-9);
            prevRank = rank(r);
            prevConsumed = r.consumedMinutes;
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  // ------------------------------------------------------------------ FM-06
  it('FM-06 inside the refrigerated range nothing is consumed', () => {
    fc.assert(
      fc.property(
        entryParamsArb,
        fc.array(
          fc.tuple(
            fc.integer({ min: 1, max: 300 }),
            fc.double({ min: 1, max: REFRIGERATED_MAX_C, noNaN: true }),
          ),
          { maxLength: 30 },
        ),
        fc.integer({ min: 0, max: 20000 }),
        (p, rest, now) => {
          const samples: TemperatureSample[] = [{ minute: 0, tempC: 4 }];
          let m = 0;
          for (const [dm, t] of rest) {
            m += dm;
            samples.push({ minute: m, tempC: t });
          }
          const r = excursionClock(admitOne(p), input(samples, now));
          expect(r.kind).toBe('noExcursion');
          if (r.kind === 'noExcursion') {
            expect(r.consumedMinutes).toBe(0);
            expect(r.remainingMinutes).toBe(p.maxDays * MINUTES_PER_DAY);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  // ------------------------------------------------------------------ FM-07
  it('FM-07 above the label maximum the clock stops, reports no remainder and stays stopped', () => {
    fc.assert(
      fc.property(
        entryParamsArb,
        fc.integer({ min: 1, max: 200 }),
        fc.double({ min: 0.5, max: 15, noNaN: true }),
        fc.array(fc.integer({ min: 0, max: 5000 }), { minLength: 1, maxLength: 8 }),
        (p, hotAt, over, extraNows) => {
          const samples: TemperatureSample[] = [
            { minute: 0, tempC: 4 },
            { minute: hotAt, tempC: p.maxTempC + over },
            { minute: hotAt + 50, tempC: 4 },
          ];
          const e = admitOne(p);
          let since: number | null = null;
          for (const extra of extraNows) {
            const now = hotAt + extra;
            const r = excursionClock(e, input(samples, now));
            if (now <= 0) continue;
            expect(r.kind).toBe('beyondLabel');
            if (r.kind !== 'beyondLabel') continue;
            expect(r.message).toBe(BEYOND_LABEL_MESSAGE);
            expect('remainingMinutes' in r).toBe(false);
            expect(r.sinceMinute).toBeLessThanOrEqual(hotAt);
            if (since !== null) expect(r.sinceMinute).toBe(since);
            since = r.sinceMinute;
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('FM-07 a later return to the refrigerated range does not bring the clock back', () => {
    const e = admitOne({ maxTempC: 25, maxDays: 5 });
    const samples = [
      { minute: 0, tempC: 4 },
      { minute: 100, tempC: 30 },
      { minute: 160, tempC: 3 },
    ];
    for (const now of [101, 200, 100000]) {
      expect(excursionClock(e, input(samples, now)).kind).toBe('beyondLabel');
    }
  });

  it('FM-07 reaching exactly the label maximum is still inside the allowance', () => {
    const e = admitOne({ maxTempC: 25, maxDays: 5 });
    const r = excursionClock(e, input([{ minute: 0, tempC: 25 }], 60));
    expect(r.kind).toBe('consuming');
  });

  // ------------------------------------------------------------------ FM-08
  it('FM-08 a coarser modelled step never reports less consumption than a finer one', () => {
    const stateArb: fc.Arbitrary<CompartmentState> = fc.record({
      startC: fc.double({ min: -20, max: 10, noNaN: true, noDefaultInfinity: true }),
      ambientC: fc.double({ min: -10, max: 40, noNaN: true, noDefaultInfinity: true }),
      tauMinutes: fc.double({ min: 20, max: 3000, noNaN: true, noDefaultInfinity: true }),
    });
    fc.assert(
      fc.property(
        stateArb,
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 1, max: 2000 }),
        (state, step, factor, end) => {
          const e = admitOne({ maxTempC: 60, maxDays: 3650 });
          const fine = modelledSeries(state, 0, end, step);
          const coarse = modelledSeries(state, 0, end, step * factor);
          if (fine.kind !== 'ok' || coarse.kind !== 'ok') throw new Error('series failed');
          const f = excursionClock(e, input(fine.samples, end));
          const c = excursionClock(e, input(coarse.samples, end));
          if (f.kind === 'unknown' || c.kind === 'unknown') throw new Error('clock unknown');
          expect(c.consumedMinutes).toBeGreaterThanOrEqual(f.consumedMinutes - 1e-9);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('FM-08 a modelled series always includes both ends and is strictly increasing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 3000 }),
        fc.double({ min: 0.5, max: 90, noNaN: true, noDefaultInfinity: true }),
        (from, len, step) => {
          const r = modelledSeries(
            { startC: 4, ambientC: 22, tauMinutes: 300 },
            from,
            from + len,
            step,
          );
          if (r.kind !== 'ok') throw new Error(r.reason);
          expect(r.samples[0]?.minute).toBe(from);
          expect(r.samples.at(-1)?.minute).toBe(from + len);
          for (let i = 1; i < r.samples.length; i++) {
            expect((r.samples[i] as TemperatureSample).minute).toBeGreaterThan(
              (r.samples[i - 1] as TemperatureSample).minute,
            );
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('FM-08 a series is strictly increasing even when length / step is not exact in floating point', () => {
    // Found by HH-10: step = length / 2000 made ceil(length / step) 2001, which put a
    // grid point on the end and produced a non-increasing series for 8 631 791 minutes.
    const state = { startC: 4, ambientC: 22, tauMinutes: 300 };
    for (const len of [8_631_791, 2187, 1, 3, 7, 4_999_999]) {
      for (const pieces of [2000, 1999, 2001, 997, 3]) {
        const r = modelledSeries(state, 0, len, len / pieces);
        if (r.kind !== 'ok') throw new Error(r.reason);
        for (let i = 1; i < r.samples.length; i++) {
          expect((r.samples[i] as TemperatureSample).minute).toBeGreaterThan(
            (r.samples[i - 1] as TemperatureSample).minute,
          );
        }
        expect(r.samples.at(-1)?.minute).toBe(len);
        expect(r.samples[0]?.minute).toBe(0);
      }
    }
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 60_000_000 }),
        fc.integer({ min: 2, max: 3000 }),
        (len, pieces) => {
          const r = modelledSeries(state, 0, len, len / pieces);
          if (r.kind !== 'ok') throw new Error(r.reason);
          for (let i = 1; i < r.samples.length; i++) {
            expect((r.samples[i] as TemperatureSample).minute).toBeGreaterThan(
              (r.samples[i - 1] as TemperatureSample).minute,
            );
          }
          expect(r.samples.at(-1)?.minute).toBe(len);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('FM-08 a series that cannot be built is invalid, not truncated', () => {
    const s = { startC: 4, ambientC: 22, tauMinutes: 300 };
    for (const [from, to, step] of [
      [Number.NaN, 10, 1],
      [-1, 10, 1],
      [10, 5, 1],
      [0, 10, 0],
      [0, 10, -2],
      [0, 10, Number.NaN],
      [0, 1e9, 1],
    ] as const) {
      expect(modelledSeries(s, from, to, step).kind).toBe('invalid');
    }
    expect(modelledSeries({ startC: 4, ambientC: 22, tauMinutes: 0 }, 0, 10, 1).kind).toBe(
      'invalid',
    );
    expect(modelledSeries({ startC: Number.NaN, ambientC: 22, tauMinutes: 5 }, 0, 10, 1).kind).toBe(
      'invalid',
    );
  });

  // ------------------------------------------------------------------ FM-09
  it('FM-09 an invalid window or reading gives unknown with a reason and a way forward', () => {
    const e = admitOne();
    const ok: TemperatureSample[] = [
      { minute: 0, tempC: 5 },
      { minute: 10, tempC: 6 },
    ];
    const cases: ClockInput[] = [
      input(ok, 5, Number.NaN),
      input(ok, 5, -1),
      input(ok, Number.NaN),
      input(ok, Number.POSITIVE_INFINITY),
      input(ok, 4, 5),
      input([], 5),
      input([{ minute: 4, tempC: 5 }], 10, 3),
      input(
        [
          { minute: 5, tempC: 5 },
          { minute: 5, tempC: 6 },
        ],
        10,
        5,
      ),
      input(
        [
          { minute: 10, tempC: 5 },
          { minute: 5, tempC: 6 },
        ],
        20,
        10,
      ),
      input([{ minute: Number.NaN, tempC: 5 }], 5),
      input([{ minute: -1, tempC: 5 }], 5),
      input([{ minute: 0, tempC: Number.NaN }], 5),
      input([{ minute: 0, tempC: Number.POSITIVE_INFINITY }], 5),
      input([{ minute: 0, tempC: 200 }], 5),
      input([{ minute: 0, tempC: -200 }], 5),
      input([null as unknown as TemperatureSample], 5),
      null as unknown as ClockInput,
      { startMinute: 0, nowMinute: 5, samples: 'x' as unknown as TemperatureSample[] },
    ];
    for (const c of cases) {
      const r = excursionClock(e, c);
      expect(r.kind, JSON.stringify(c)).toBe('unknown');
      if (r.kind === 'unknown') {
        expect(r.reason.length).toBeGreaterThan(0);
        expect(r.whatWouldResolveIt.length).toBeGreaterThan(0);
      }
    }
  });

  it('FM-09 a series over the size cap is refused, and one at the cap is accepted', () => {
    const e = admitOne();
    const make = (n: number): TemperatureSample[] =>
      Array.from({ length: n }, (_, i) => ({ minute: i, tempC: 5 }));
    expect(excursionClock(e, input(make(MAX_SAMPLES + 1), 10)).kind).toBe('unknown');
    expect(excursionClock(e, input(make(MAX_SAMPLES), 10)).kind).toBe('noExcursion');
  });

  it('FM-09 arbitrary garbage input never throws', () => {
    const e = admitOne();
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const r = excursionClock(e, x as ClockInput);
        expect(['unknown', 'noExcursion', 'consuming', 'exhausted', 'beyondLabel']).toContain(
          r.kind,
        );
      }),
      { numRuns: 300 },
    );
  });

  // ------------------------------------------------------------------ FM-10
  it('FM-10 every clock result carries its provenance and the disclaimer', () => {
    fc.assert(
      fc.property(unsignedArb, seriesArb, fc.integer({ min: 0, max: 20000 }), (u, samples, now) => {
        const f = buildFormulary(snap([sign(u)]), verify);
        const e = f.entries[0] as ValidatedEntry;
        const r = excursionClock(e, input(samples, now));
        if (r.kind === 'unknown') throw new Error(r.reason);
        expect(r.provenance).toEqual({
          product: u.product,
          condition: u.condition,
          labelVersion: u.labelVersion,
          approver: u.approver,
          approvedAt: u.approvedAt,
          source: u.source,
          entryNotes: u.notes,
          disclaimer: DISCLAIMER,
        });
      }),
      { numRuns: 200 },
    );
  });

  it('FM-10 generated messages never call anything safe', () => {
    const safeWord = /safe/i;
    fc.assert(
      fc.property(
        entryParamsArb,
        seriesArb,
        fc.integer({ min: 0, max: 30000 }),
        (p, samples, now) => {
          const r = excursionClock(admitOne(p), input(samples, now));
          if (r.kind === 'unknown') throw new Error(r.reason);
          expect(r.message).not.toMatch(safeWord);
          for (const line of r.lines) expect(line).not.toMatch(safeWord);
          expect(DISCLAIMER).not.toMatch(safeWord);
          expect(BEYOND_LABEL_MESSAGE).not.toMatch(safeWord);
          expect(NOT_IN_TABLE_MESSAGE).not.toMatch(safeWord);
          expect(FREEZING_LINE).not.toMatch(safeWord);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('FM-10 durations are written "3 h 10 m" and rounded down', () => {
    expect(formatMinutes(190)).toBe('3 h 10 m');
    expect(formatMinutes(59.9)).toBe('59 m');
    expect(formatMinutes(1440 * 27 + 180)).toBe('27 d 3 h');
    expect(formatMinutes(-5)).toBe('0 m');
    expect(formatMinutes(Number.NaN)).toBe('0 m');
  });

  // ------------------------------------------------------------------ FM-11
  it('FM-11 the table does not depend on the order of the input entries', () => {
    const junkArb = fc.array(fc.anything(), { maxLength: 4 });
    fc.assert(
      fc.property(
        fc.array(unsignedArb, { minLength: 1, maxLength: 10 }),
        junkArb,
        fc.nat({ max: 20 }),
        (us, junk, rot) => {
          const all: unknown[] = [...us.map(sign), ...junk];
          const rotated = [...all.slice(rot % all.length), ...all.slice(0, rot % all.length)];
          const a = buildFormulary(snap(all), verify);
          const b = buildFormulary(snap([...all].reverse()), verify);
          const c = buildFormulary(snap(rotated), verify);
          expect(b).toEqual(a);
          expect(c).toEqual(a);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('FM-11 the later approval wins when two entries share a product and condition', () => {
    const older = sign({ ...base, approvedAt: '2026-03-01', maxDays: 5, labelVersion: 'L1' });
    const newer = sign({ ...base, approvedAt: '2026-04-01', maxDays: 7, labelVersion: 'L2' });
    for (const order of [
      [older, newer],
      [newer, older],
    ]) {
      const f = buildFormulary(snap(order), verify);
      expect(f.entries).toHaveLength(1);
      expect(f.entries[0]?.labelVersion).toBe('L2');
      expect(f.rejected).toEqual([]);
    }
  });

  it('FM-11 a timestamp is later than the date it falls on', () => {
    const day = sign({ ...base, approvedAt: '2026-03-01', labelVersion: 'day' });
    const stamp = sign({ ...base, approvedAt: '2026-03-01T08:30:00Z', labelVersion: 'stamp' });
    const f = buildFormulary(snap([stamp, day]), verify);
    expect(f.entries[0]?.labelVersion).toBe('stamp');
  });

  it('FM-11 two different entries approved at the same time conflict and neither is used', () => {
    const a = sign({ ...base, maxDays: 5, labelVersion: 'L1' });
    const b = sign({ ...base, maxDays: 7, labelVersion: 'L2' });
    const older = sign({ ...base, approvedAt: '2025-01-01', maxDays: 1, labelVersion: 'L0' });
    for (const order of [
      [a, b, older],
      [older, b, a],
    ]) {
      const f = buildFormulary(snap(order), verify);
      expect(f.entries).toEqual([]);
      expect(f.rejected.map((r) => r.reason)).toEqual(['conflict', 'conflict', 'conflict']);
      expect(lookupEntry(f, 'Zorbex', 'unopened').kind).toBe('notInTable');
    }
  });

  it('FM-11 identical content with two valid signatures resolves to the same entry in any order', () => {
    const lenient: Verifier = (p, s) => s === sigOf(p) || s === `alt-${fnv(p)}`;
    const u = base;
    const one = { ...u, signature: sigOf(canonicalPayload(u)) };
    const two = { ...u, signature: `alt-${fnv(canonicalPayload(u))}` };
    const a = buildFormulary(snap([one, two]), lenient);
    const b = buildFormulary(snap([two, one]), lenient);
    expect(a.entries).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it('FM-11 products that differ only in case or spacing share one key', () => {
    const a = sign({
      ...base,
      product: 'Zorbex Plus',
      approvedAt: '2026-01-01',
      labelVersion: 'old',
    });
    const b = sign({
      ...base,
      product: 'zorbex   plus',
      approvedAt: '2026-02-01',
      labelVersion: 'new',
    });
    const f = buildFormulary(snap([a, b]), verify);
    expect(f.entries).toHaveLength(1);
    expect(f.entries[0]?.labelVersion).toBe('new');
  });

  // ------------------------------------------------------------------ FM-12
  it('FM-12 reaching 0 C or below is flagged, and not otherwise', () => {
    fc.assert(
      fc.property(entryParamsArb, seriesArb, (p, samples) => {
        const last = (samples.at(-1) as TemperatureSample).minute;
        const r = excursionClock(admitOne(p), input(samples, last + 1));
        if (r.kind === 'unknown') throw new Error(r.reason);
        const touched = samples.some((s) => s.tempC <= 0);
        expect(r.reachedFreezing).toBe(touched);
        expect(r.lines.includes(FREEZING_LINE)).toBe(touched);
      }),
      { numRuns: 300 },
    );
  });

  // ------------------------------------------------------------------ FM-14
  it('FM-14 every in-use result says it counts only time outside the fridge; unopened results do not', () => {
    fc.assert(
      fc.property(
        entryParamsArb,
        fc.constantFrom<Condition>('unopened', 'inUse'),
        seriesArb,
        fc.integer({ min: 0, max: 30000 }),
        (p, condition, samples, now) => {
          const r = excursionClock(admitOne({ ...p, condition }), input(samples, now));
          if (r.kind === 'unknown') throw new Error(r.reason);
          expect(r.lines.includes(IN_USE_CAVEAT)).toBe(condition === 'inUse');
        },
      ),
      { numRuns: 300 },
    );
  });

  // ------------------------------------------------------------------ FM-13
  it('FM-13 search returns only admitted entries whose name starts with the query', () => {
    fc.assert(
      fc.property(
        distinctEntriesArb,
        fc.string({ maxLength: 4 }),
        fc.integer({ min: 0, max: 5 }),
        (entries, q, limit) => {
          const f = buildFormulary(snap(entries), verify);
          const hits = searchFormulary(f, q, limit);
          expect(hits.length).toBeLessThanOrEqual(limit);
          for (const h of hits) {
            expect(isValidatedEntry(h)).toBe(true);
            expect(normaliseProduct(h.product).startsWith(normaliseProduct(q))).toBe(true);
          }
          expect(searchFormulary(f, q, limit)).toEqual(hits);
          if (normaliseProduct(q) === '') expect(hits).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('FM-13 a bad limit falls back to the default instead of listing everything', () => {
    const entries = NAMES.map((n) => sign({ ...base, product: n }));
    const f = buildFormulary(snap(entries), verify);
    expect(searchFormulary(f, 'z', Number.NaN).length).toBeLessThanOrEqual(10);
    expect(searchFormulary(f, 'z', -3)).toEqual([]);
    expect(searchFormulary(f, 42 as unknown as string)).toEqual([]);
  });
});
