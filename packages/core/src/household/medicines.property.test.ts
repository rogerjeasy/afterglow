import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EventLog } from '../events/log.js';
import type { AfterglowEvent } from '../events/types.js';
import { buildFormulary } from '../formulary/admit.js';
import { excursionClock, modelledSeries } from '../formulary/clock.js';
import { canonicalPayload } from '../formulary/entry.js';
import type { Formulary, FormularyEntry, ValidatedEntry } from '../formulary/types.js';
import { assessMedicines, compartmentModel, elapsedMinutes } from './derive.js';
import { HOUSEHOLD_EVENT, householdEvent } from './events.js';
import { buildHouseholdView } from './view.js';

// Fictional product, arbitrary numbers, toy signature scheme: no drug data lives in this repo.
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}
const sigOf = (p: string): string => `sig-${fnv(p)}`;
type Unsigned = Omit<FormularyEntry, 'signature'>;
const sign = (u: Unsigned): FormularyEntry => ({ ...u, signature: sigOf(canonicalPayload(u)) });
const unsigned = (over: Partial<Unsigned> = {}): Unsigned => ({
  product: 'Zorbex',
  labelVersion: 'L1',
  condition: 'unopened',
  maxTempC: 40,
  maxDays: 20,
  notes: 'fixture',
  source: { title: 'Fictional label', url: 'https://example.test/a', excerpt: 'fictional excerpt' },
  approver: 'A. Reviewer',
  approvedAt: '2026-03-01',
  ...over,
});
const table = (entries: FormularyEntry[]): Formulary =>
  buildFormulary({ formularyVersion: '1', entries }, (p, s) => s === sigOf(p));
const TABLE = table([sign(unsigned()), sign(unsigned({ condition: 'inUse', maxDays: 3 }))]);

const E = HOUSEHOLD_EVENT;
const ev = (type: string, payload: unknown, lamport: number, epoch = 'dev-a'): AfterglowEvent =>
  householdEvent(type as (typeof E)[keyof typeof E], payload, epoch, lamport);
const fridge = (over: Record<string, unknown> = {}) => ({
  applianceId: 'fridge',
  name: 'Fridge',
  class: 'fridge',
  fullness: 'full',
  ambientC: null,
  ...over,
});
const med = (over: Record<string, unknown> = {}) => ({
  medicineId: 'm1',
  applianceId: 'fridge',
  product: 'Zorbex',
  condition: 'unopened',
  ...over,
});
const logOf = (events: AfterglowEvent[]): EventLog =>
  events.reduce((l, e) => l.append(e), EventLog.empty());
const viewOf = (events: AfterglowEvent[]) => buildHouseholdView(logOf(events));

const OUTAGE_AT = 1_000_000_000_000;
const MIN = 60_000;

describe('Household medicine properties', () => {
  // ------------------------------------------------------------------ HH-08
  it('HH-08 a medicine is stored as exactly its names, with no storage data', () => {
    const v = viewOf([ev(E.applianceSet, fridge(), 1), ev(E.medicineAdded, med(), 2)]);
    expect(v.medicines).toHaveLength(1);
    expect(Object.keys(v.medicines[0] as object).sort()).toEqual(
      ['applianceId', 'condition', 'id', 'product'].sort(),
    );
    expect(v.medicines[0]).toEqual({
      id: 'm1',
      applianceId: 'fridge',
      product: 'Zorbex',
      condition: 'unopened',
    });
  });

  it('HH-08 malformed medicine events are ignored and extra fields are not kept', () => {
    const bad: unknown[] = [
      null,
      'x',
      [],
      {},
      med({ medicineId: '' }),
      med({ medicineId: 'x'.repeat(65) }),
      med({ applianceId: 3 }),
      med({ product: '' }),
      med({ product: '   ' }),
      med({ product: 'x'.repeat(201) }),
      med({ product: 'a\u0000b' }),
      med({ product: 7 }),
      med({ condition: 'opened' }),
      med({ condition: undefined }),
    ];
    for (const [i, payload] of bad.entries()) {
      const v = viewOf([ev(E.applianceSet, fridge(), 1), ev(E.medicineAdded, payload, 2)]);
      expect(v.medicines, `bad #${i}`).toEqual([]);
    }
    const extra = viewOf([
      ev(E.applianceSet, fridge(), 1),
      ev(E.medicineAdded, { ...med(), maxTempC: 99, maxDays: 99 }, 2),
    ]);
    expect(Object.keys(extra.medicines[0] as object)).not.toContain('maxDays');
    expect(viewOf([ev(E.medicineRemoved, { medicineId: 5 }, 1)]).medicines).toEqual([]);
  });

  it('HH-08 the later of a set and a removal wins, and removing the appliance drops the medicine', () => {
    const base = [ev(E.applianceSet, fridge(), 1), ev(E.medicineAdded, med(), 2)];
    expect(viewOf([...base, ev(E.medicineRemoved, { medicineId: 'm1' }, 3)]).medicines).toEqual([]);
    expect(
      viewOf([
        ...base,
        ev(E.medicineRemoved, { medicineId: 'm1' }, 3),
        ev(E.medicineAdded, med({ condition: 'inUse' }), 4),
      ]).medicines.map((m) => m.condition),
    ).toEqual(['inUse']);
    expect(
      viewOf([...base, ev(E.applianceRemoved, { applianceId: 'fridge' }, 3)]).medicines,
    ).toEqual([]);
  });

  it('HH-08 the view does not depend on arrival order', () => {
    const idArb = fc.constantFrom('m1', 'm2', 'm3');
    const eventArb = fc.oneof(
      fc
        .record({
          id: idArb,
          product: fc.constantFrom('Zorbex', 'Quillan'),
          c: fc.constantFrom('unopened', 'inUse'),
        })
        .map((r) => ({
          type: E.medicineAdded,
          payload: med({ medicineId: r.id, product: r.product, condition: r.c }),
        })),
      idArb.map((id) => ({ type: E.medicineRemoved, payload: { medicineId: id } })),
    );
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 12 }), (items) => {
        const events = [
          ev(E.applianceSet, fridge(), 0),
          ...items.map((it, i) => ev(it.type, it.payload, i + 1)),
        ];
        expect(viewOf([...events].reverse())).toEqual(viewOf(events));
      }),
      { numRuns: 200 },
    );
  });

  // ------------------------------------------------------------------ HH-09
  const withOutage = (extra: AfterglowEvent[] = [], ambientC: number | null = 30) => [
    ev(E.applianceSet, fridge({ ambientC }), 1),
    ev(E.medicineAdded, med(), 2),
    ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 3),
    ...extra,
  ];

  it('HH-09 with no table, or a hand-built one, every medicine is notInTable and never gets a clock', () => {
    const v = viewOf(withOutage());
    const forged: Formulary = {
      formularyVersion: 'x',
      entries: [{ ...(TABLE.entries[0] as ValidatedEntry) }],
      rejected: [],
    };
    for (const t of [null, table([]), forged]) {
      const out = assessMedicines(v, t, OUTAGE_AT + 600 * MIN);
      expect(out.map((a) => a.kind)).toEqual(['notInTable']);
    }
  });

  it('HH-09 a medicine that is not in the table never gets a clock, whatever its name', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 5000 }),
        (name, mins) => {
          fc.pre(name.trim() !== '' && name.normalize('NFKC').toLowerCase().trim() !== 'zorbex');
          fc.pre(![...name].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127));
          const v = viewOf([
            ev(E.applianceSet, fridge(), 1),
            ev(E.medicineAdded, med({ product: name }), 2),
            ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 3),
          ]);
          const out = assessMedicines(v, TABLE, OUTAGE_AT + mins * MIN);
          expect(out.map((a) => a.kind)).toEqual(['notInTable']);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('HH-09 when the power is on a found medicine has no clock yet', () => {
    const v = viewOf([ev(E.applianceSet, fridge(), 1), ev(E.medicineAdded, med(), 2)]);
    const out = assessMedicines(v, TABLE, OUTAGE_AT);
    expect(out.map((a) => a.kind)).toEqual(['noOutage']);
  });

  it('HH-09 during an outage the clock is the formulary clock over the appliance model', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 38, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 0, max: 3000 }),
        fc.constantFrom('unopened', 'inUse'),
        (ambientC, mins, condition) => {
          const v = viewOf([
            ev(E.applianceSet, fridge({ ambientC }), 1),
            ev(E.medicineAdded, med({ condition }), 2),
            ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 3),
          ]);
          const now = OUTAGE_AT + mins * MIN;
          const [a] = assessMedicines(v, TABLE, now);
          expect(a?.kind).toBe('clock');
          if (a?.kind !== 'clock') return;
          const model = compartmentModel(v, 'fridge');
          const e = elapsedMinutes(v, now) as number;
          const series = modelledSeries(
            (model as NonNullable<typeof model>).state,
            0,
            e,
            Math.max(1, e / 2000),
          );
          if (series.kind !== 'ok') throw new Error(series.reason);
          expect(a.clock).toEqual(
            excursionClock(a.entry, { startMinute: 0, nowMinute: e, samples: series.samples }),
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  it('HH-09 door openings never reduce what has been used', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 10, max: 30, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 60, max: 3000 }),
        fc.array(fc.double({ min: 0.5, max: 10, noNaN: true }), { maxLength: 6 }),
        (ambientC, mins, doors) => {
          const base = [
            ev(E.applianceSet, fridge({ ambientC }), 1),
            ev(E.medicineAdded, med(), 2),
            ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 3),
          ];
          const opened = doors.map((m, i) =>
            ev(
              E.doorOpened,
              { applianceId: 'fridge', openMinutes: m, atMs: OUTAGE_AT + (i + 1) * MIN },
              10 + i,
            ),
          );
          const now = OUTAGE_AT + mins * MIN;
          const used = (events: AfterglowEvent[]): number => {
            const [a] = assessMedicines(viewOf(events), TABLE, now);
            if (a?.kind !== 'clock' || a.clock.kind === 'unknown') throw new Error('no clock');
            return a.clock.kind === 'beyondLabel'
              ? Number.POSITIVE_INFINITY
              : a.clock.consumedMinutes;
          };
          expect(used([...base, ...opened])).toBeGreaterThanOrEqual(used(base) - 1e-6);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('HH-09 a medicine whose appliance is gone is not assessed', () => {
    const v = viewOf([...withOutage(), ev(E.applianceRemoved, { applianceId: 'fridge' }, 9)]);
    expect(assessMedicines(v, TABLE, OUTAGE_AT + 600 * MIN)).toEqual([]);
  });

  it('HH-09 the in-use caveat reaches the household result', () => {
    const v = viewOf([
      ev(E.applianceSet, fridge({ ambientC: 25 }), 1),
      ev(E.medicineAdded, med({ condition: 'inUse' }), 2),
      ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 3),
    ]);
    const [a] = assessMedicines(v, TABLE, OUTAGE_AT + 300 * MIN);
    if (a?.kind !== 'clock' || a.clock.kind === 'unknown') throw new Error('expected a clock');
    expect(a.clock.lines.join(' ')).toMatch(/days since you first opened it/);
  });

  // ------------------------------------------------------------------ HH-10
  it('HH-10 assessment is deterministic and survives a very long outage', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50_000_000 }), (mins) => {
        const v = viewOf(withOutage());
        const now = OUTAGE_AT + mins * MIN;
        const a = assessMedicines(v, TABLE, now);
        expect(assessMedicines(v, TABLE, now)).toEqual(a);
        expect(a[0]?.kind).toBe('clock');
        if (a[0]?.kind === 'clock') expect(a[0].clock.kind).not.toBe('unknown');
      }),
      { numRuns: 100 },
    );
  });

  it('HH-10 a non-finite time gives no clock rather than a wrong one', () => {
    const v = viewOf(withOutage());
    const out = assessMedicines(v, TABLE, Number.NaN);
    expect(out.map((a) => a.kind)).toEqual(['noOutage']);
  });
});
