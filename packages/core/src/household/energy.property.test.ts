import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LEAVE_NOW, MAX_AGE_MS } from '../coguard/ward.js';
import { EventLog } from '../events/log.js';
import type { AfterglowEvent } from '../events/types.js';
import { DEFAULT_HORIZON_HOURS, assessEnergy, assessWardOf } from './derive.js';
import { HOUSEHOLD_EVENT, householdEvent } from './events.js';
import { buildHouseholdView } from './view.js';

const E = HOUSEHOLD_EVENT;
const ev = (type: string, payload: unknown, lamport: number, epoch = 'dev-a'): AfterglowEvent =>
  householdEvent(type as (typeof E)[keyof typeof E], payload, epoch, lamport);
const viewOf = (events: AfterglowEvent[]) =>
  buildHouseholdView(events.reduce((l, e) => l.append(e), EventLog.empty()));

const store = (id: string, over: Record<string, unknown> = {}) => ({
  storeId: id,
  name: `Store ${id}`,
  kind: 'powerBank',
  capacityWh: 60,
  chargePct: 100,
  ac: false,
  ...over,
});
const load = (id: string, over: Record<string, unknown> = {}) => ({
  loadId: id,
  name: `Load ${id}`,
  watts: 5,
  class: 'communication',
  needs: 'usb',
  ...over,
});
const NOW = 1_800_000_000_000;

describe('Household energy and ward properties', () => {
  // ------------------------------------------------------------------ HH-14
  it('HH-14 a store and a load are recorded exactly as the user typed them', () => {
    const v = viewOf([ev(E.energyStoreSet, store('s1'), 1), ev(E.energyLoadSet, load('l1'), 2)]);
    expect(v.energyStores).toEqual([
      { id: 's1', name: 'Store s1', kind: 'powerBank', capacityWh: 60, chargePct: 100, ac: false },
    ]);
    expect(v.energyLoads).toEqual([
      { id: 'l1', name: 'Load l1', watts: 5, class: 'communication', needs: 'usb' },
    ]);
  });

  it('HH-14 anything the planner would refuse is ignored here too', () => {
    const badStores: unknown[] = [
      null,
      {},
      store('', {}),
      store('a', { capacityWh: 0 }),
      store('a', { capacityWh: Number.NaN }),
      store('a', { chargePct: 101 }),
      store('a', { kind: 'reactor' }),
      store('a', { ac: 'yes' }),
      store('a', { usableFraction: 2 }),
      store('a', { name: '  ' }),
    ];
    for (const [i, p] of badStores.entries()) {
      expect(viewOf([ev(E.energyStoreSet, p, 1)]).energyStores, `store #${i}`).toEqual([]);
    }
    const badLoads: unknown[] = [
      null,
      {},
      load('', {}),
      load('a', { watts: 0 }),
      load('a', { watts: -3 }),
      load('a', { class: 'luxury' }),
      load('a', { needs: 'gas' }),
      load('a', { drawsFrom: '' }),
    ];
    for (const [i, p] of badLoads.entries()) {
      expect(viewOf([ev(E.energyLoadSet, p, 1)]).energyLoads, `load #${i}`).toEqual([]);
    }
  });

  it('HH-14 the later of a set and a removal wins', () => {
    const base = [ev(E.energyStoreSet, store('s1'), 1)];
    expect(viewOf([...base, ev(E.energyStoreRemoved, { storeId: 's1' }, 2)]).energyStores).toEqual(
      [],
    );
    expect(
      viewOf([
        ...base,
        ev(E.energyStoreRemoved, { storeId: 's1' }, 2),
        ev(E.energyStoreSet, store('s1', { chargePct: 40 }), 3),
      ]).energyStores[0]?.chargePct,
    ).toBe(40);
    const l = [ev(E.energyLoadSet, load('l1'), 1), ev(E.energyLoadRemoved, { loadId: 'l1' }, 2)];
    expect(viewOf(l).energyLoads).toEqual([]);
  });

  it('HH-14 the view does not depend on arrival order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc
              .record({ id: fc.constantFrom('a', 'b'), pct: fc.integer({ min: 0, max: 100 }) })
              .map((r) => ({ type: E.energyStoreSet, payload: store(r.id, { chargePct: r.pct }) })),
            fc
              .constantFrom('a', 'b')
              .map((id) => ({ type: E.energyStoreRemoved, payload: { storeId: id } })),
            fc
              .record({ id: fc.constantFrom('x', 'y'), w: fc.integer({ min: 1, max: 99 }) })
              .map((r) => ({ type: E.energyLoadSet, payload: load(r.id, { watts: r.w }) })),
          ),
          { maxLength: 12 },
        ),
        (items) => {
          const events = items.map((it, i) => ev(it.type, it.payload, i + 1));
          expect(viewOf([...events].reverse())).toEqual(viewOf(events));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('HH-14 a load tied to a removed store stays, and is reported unsupplied', () => {
    const v = viewOf([
      ev(E.energyStoreSet, store('s1'), 1),
      ev(E.energyLoadSet, load('l1', { drawsFrom: 's1' }), 2),
      ev(E.energyStoreRemoved, { storeId: 's1' }, 3),
    ]);
    expect(v.energyLoads).toHaveLength(1);
    const a = assessEnergy(v);
    if (a.result.kind !== 'plan') throw new Error('expected a plan');
    expect(a.result.plan.loads[0]).toMatchObject({ status: 'unsupplied' });
  });

  it('HH-14 the plan for a household comes from the planner, with its defaults listed', () => {
    const v = viewOf([
      ev(E.energyStoreSet, store('s1', { capacityWh: 100 }), 1),
      ev(E.energyLoadSet, load('l1', { watts: 5 }), 2),
    ]);
    const a = assessEnergy(v);
    expect(a.horizonHours).toBe(DEFAULT_HORIZON_HOURS);
    if (a.result.kind !== 'plan') throw new Error('expected a plan');
    expect(a.result.plan.loads[0]).toMatchObject({ status: 'covered' });
    expect(a.result.plan.defaultsUsed.join(' ')).toMatch(/power bank/);
  });

  // ------------------------------------------------------------------ HH-15
  it("HH-15 the horizon is the user's, or 12 hours labelled as a default", () => {
    const none = assessEnergy(viewOf([]));
    expect(none).toMatchObject({ horizonHours: 12, horizonIsDefault: true });
    const set = assessEnergy(viewOf([ev(E.horizonSet, { hours: 9.5 }, 1)]));
    expect(set).toMatchObject({ horizonHours: 9.5, horizonIsDefault: false });
    const later = assessEnergy(
      viewOf([ev(E.horizonSet, { hours: 9.5 }, 1), ev(E.horizonSet, { hours: 20 }, 2)]),
    );
    expect(later.horizonHours).toBe(20);
  });

  it('HH-15 an out-of-range or malformed horizon is ignored', () => {
    for (const hours of [
      0,
      0.2,
      169,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '8',
      null,
      undefined,
    ]) {
      const a = assessEnergy(viewOf([ev(E.horizonSet, { hours }, 1)]));
      expect(a).toMatchObject({ horizonHours: 12, horizonIsDefault: true });
    }
    expect(assessEnergy(viewOf([ev(E.horizonSet, 8, 1)])).horizonIsDefault).toBe(true);
  });

  // ------------------------------------------------------------------ HH-16
  const answer = (check: string, a: 'yes' | 'no' | 'unknown', atMs: number, lamport: number) =>
    ev(E.wardAnswered, { check, answer: a, atMs }, lamport);
  const allYes = (atMs: number) =>
    ['outdoors', 'distance', 'exhaust', 'alarm'].map((c, i) => answer(c, 'yes', atMs, i + 1));

  it('HH-16 the ward opens only when all four answers are yes and current', () => {
    const open = assessWardOf(viewOf(allYes(NOW - 1000)), NOW);
    expect(open.ward).toBe('open');
    const three = assessWardOf(viewOf(allYes(NOW - 1000).slice(0, 3)), NOW);
    expect(three.ward).toBe('closed');
    expect(three.unmet).toEqual(['alarm']);
    expect(assessWardOf(viewOf([]), NOW).ward).toBe('closed');
  });

  it('HH-16 an answer goes stale after six hours', () => {
    const v = viewOf(allYes(NOW - MAX_AGE_MS - 1));
    expect(assessWardOf(v, NOW).ward).toBe('closed');
    expect(assessWardOf(v, NOW - MAX_AGE_MS - 1 + 1000).ward).toBe('open');
  });

  it('HH-16 the latest answer to each check wins, whatever the order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            a: fc.constantFrom<'yes' | 'no' | 'unknown'>('yes', 'no', 'unknown'),
            t: fc.integer({ min: 0, max: 20 }),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        (xs) => {
          const events = xs.map((x, i) => answer('distance', x.a, NOW - 1000 + x.t, i + 1));
          const f = viewOf(events);
          expect(viewOf([...events].reverse())).toEqual(f);
          // Later lamport wins for an equal check: the last event is the answer.
          expect(f.wardAnswers.distance?.atMs).toBe(
            NOW - 1000 + (xs[xs.length - 1] as { t: number }).t,
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('HH-16 unknown checks and malformed answers are ignored', () => {
    const v = viewOf([
      ev(E.wardAnswered, { check: 'generator-colour', answer: 'yes', atMs: NOW }, 1),
      ev(E.wardAnswered, { check: 'distance', answer: 'sure', atMs: NOW }, 2),
      ev(E.wardAnswered, { check: 'distance', answer: 'yes', atMs: 'now' }, 3),
      ev(E.wardAnswered, { check: 'distance', answer: 'yes', atMs: -1 }, 4),
      ev(E.wardAnswered, null, 5),
    ]);
    expect(v.wardAnswers).toEqual({});
  });

  it('HH-16 symptoms are asked for, never stored: nothing about health is in the household', () => {
    const v = viewOf(allYes(NOW - 1000));
    expect(JSON.stringify(v)).not.toMatch(/symptom|headache|dizz/i);
    expect(assessWardOf(v, NOW, true).symptomAdvice).toBe(LEAVE_NOW);
    expect(assessWardOf(v, NOW, false).symptomAdvice).toBeNull();
    // Reporting a symptom again changes nothing in the view.
    expect(viewOf(allYes(NOW - 1000))).toEqual(v);
  });
});
