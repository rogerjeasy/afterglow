import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EventLog } from '../events/log.js';
import { listArchetypes } from '../thermal/archetypes.js';
import { GRAVEYARD_STEP_MINUTES, graveyardShift, hoursOfSafety } from './derive.js';
import { HOUSEHOLD_EVENT, type HomePayload, householdEvent } from './events.js';
import { buildHouseholdView } from './view.js';

const E = HOUSEHOLD_EVENT;
const MIN = 60_000;
const START = 1_700_000_000_000;
const ARCHETYPES = listArchetypes();

const viewWith = (home: HomePayload | null, horizonHours?: number, outageAtMs?: number) => {
  const log: ReturnType<typeof householdEvent>[] = [];
  let l = 0;
  if (home) log.push(householdEvent(E.homeSet, home, 'dev-a', ++l));
  if (horizonHours !== undefined)
    log.push(householdEvent(E.horizonSet, { hours: horizonHours }, 'dev-a', ++l));
  if (outageAtMs !== undefined)
    log.push(householdEvent(E.outageSet, { startedAtMs: outageAtMs }, 'dev-a', ++l));
  return buildHouseholdView(EventLog.from(log));
};

const homeArb: fc.Arbitrary<HomePayload> = fc
  .record({
    archetype: fc.option(fc.constantFrom(...ARCHETYPES), { nil: null }),
    indoorC: fc.integer({ min: 10, max: 30 }),
    outdoorC: fc.integer({ min: -25, max: 40 }),
    mode: fc.constantFrom('cold' as const, 'heat' as const),
    thresholdC: fc.integer({ min: 0, max: 40 }),
  })
  .map((h) => ({
    ...h,
    archetype: h.archetype
      ? {
          type: h.archetype.type,
          vintage: h.archetype.vintage,
          insulation: h.archetype.insulation,
          climate: h.archetype.climate,
        }
      : null,
  }));

const horizonArb = fc.option(fc.integer({ min: 1, max: 48 }), { nil: undefined });
const elapsedArb = fc.option(fc.integer({ min: 0, max: 600 }), { nil: undefined });

describe('Graveyard Shift properties', () => {
  // HH-17: the night is the hours-of-safety model, sampled; they cannot disagree.
  it('HH-17 the crossing is exactly the hours-of-safety band', () => {
    fc.assert(
      fc.property(homeArb, horizonArb, elapsedArb, (home, horizon, elapsed) => {
        const view = viewWith(home, horizon, elapsed === undefined ? undefined : START);
        const now = START + (elapsed ?? 0) * MIN;
        const shift = graveyardShift(view, now);
        const hours = hoursOfSafety(view, now);
        if (shift.kind !== 'night') return expect(hours.kind).toBe('unknown');
        if (hours.kind === 'band') {
          expect(shift.crossing).toEqual({
            earliestMinutes: hours.earliestMinutes,
            midMinutes: hours.midMinutes,
            latestMinutes: hours.latestMinutes,
          });
          expect(shift.notReachedReason).toBeNull();
        } else {
          expect(shift.crossing).toBeNull();
          expect(shift.notReachedReason).not.toBeNull();
        }
      }),
    );
  });

  // HH-17: the likely curve meets the threshold at the likely crossing; the others at theirs.
  it('HH-17 each curve is at the threshold at its own crossing', () => {
    // Samples are every 30 minutes, so check the model through the points either side.
    fc.assert(
      fc.property(homeArb, (home) => {
        const view = viewWith(home, 48);
        const shift = graveyardShift(view, START);
        if (shift.kind !== 'night' || !shift.crossing) return;
        const { thresholdC } = shift;
        const crossingAt = shift.crossing.midMinutes;
        // The direction the home travels, from indoors toward the outdoors, not the mode label.
        const falling = home.indoorC > home.outdoorC;
        const before = shift.points.filter((p) => p.tMinutes <= crossingAt);
        const after = shift.points.filter((p) => p.tMinutes >= crossingAt);
        // Before the likely crossing the likely curve has not crossed; after it has (or ties).
        const crossed = (c: number): boolean => (falling ? c <= thresholdC : c >= thresholdC);
        for (const p of before.slice(0, -1)) expect(crossed(p.midC) && p.tMinutes > 0).toBe(false);
        for (const p of after.slice(1)) expect(crossed(p.midC) || p.tMinutes === 0).toBe(true);
      }),
    );
  });

  // HH-17: curves move only toward the outdoor temperature, and are ordered by speed.
  it('HH-17 curves move toward the outdoors and the fast one is closest to it', () => {
    fc.assert(
      fc.property(homeArb, horizonArb, elapsedArb, (home, horizon, elapsed) => {
        const view = viewWith(home, horizon, elapsed === undefined ? undefined : START);
        const shift = graveyardShift(view, START + (elapsed ?? 0) * MIN);
        if (shift.kind !== 'night') return;
        const d = (c: number): number => Math.abs(c - shift.outdoorC);
        const eps = 1e-9;
        for (let i = 0; i < shift.points.length; i++) {
          const p = shift.points[i];
          if (!p) throw new Error('missing point');
          expect(d(p.fastC)).toBeLessThanOrEqual(d(p.midC) + eps);
          expect(d(p.midC)).toBeLessThanOrEqual(d(p.slowC) + eps);
          if (i > 0) {
            const q = shift.points[i - 1];
            if (!q) throw new Error('missing point');
            expect(d(p.midC)).toBeLessThanOrEqual(d(q.midC) + eps);
            expect(d(p.fastC)).toBeLessThanOrEqual(d(q.fastC) + eps);
            expect(d(p.slowC)).toBeLessThanOrEqual(d(q.slowC) + eps);
          }
        }
      }),
    );
  });

  it('HH-17 the axis is the plan horizon, sampled every 30 minutes, and says when it is a default', () => {
    fc.assert(
      fc.property(homeArb, fc.integer({ min: 1, max: 48 }), (home, hours) => {
        const set = graveyardShift(viewWith(home, hours), START);
        if (set.kind !== 'night') return;
        expect(set.spanMinutes).toBe(hours * 60);
        expect(set.spanIsDefault).toBe(false);
        expect(set.points).toHaveLength(set.spanMinutes / GRAVEYARD_STEP_MINUTES + 1);
        expect(set.points[0]?.tMinutes).toBe(0);
        expect(set.points[set.points.length - 1]?.tMinutes).toBe(set.spanMinutes);
        const dflt = graveyardShift(viewWith(home), START);
        if (dflt.kind === 'night') {
          expect(dflt.spanIsDefault).toBe(true);
          expect(dflt.spanMinutes).toBe(12 * 60);
        }
      }),
    );
  });

  it('HH-17 an unknown home gives unknown and no curve', () => {
    const r = graveyardShift(viewWith(null), START);
    expect(r).toEqual({ kind: 'unknown', reason: 'I do not know your home yet.' });
  });

  it('HH-17 no archetype means the wide band, flagged, and a known one does not', () => {
    const base = { indoorC: 20, outdoorC: 0, mode: 'cold' as const, thresholdC: 15 };
    const none = graveyardShift(viewWith({ ...base, archetype: null }), START);
    expect(none.kind === 'night' && none.isDefaultBand).toBe(true);
    const a = ARCHETYPES[0];
    if (!a) throw new Error('no archetype');
    const known = graveyardShift(
      viewWith({
        ...base,
        archetype: {
          type: a.type,
          vintage: a.vintage,
          insulation: a.insulation,
          climate: a.climate,
        },
      }),
      START,
    );
    expect(known.kind === 'night' && known.isDefaultBand).toBe(false);
  });

  it('HH-17 a threshold the weather never reaches gives the curve with no headstone', () => {
    // Indoor 20, outdoor 18, threshold 15: the home settles at 18, above the line.
    const r = graveyardShift(
      viewWith({ archetype: null, indoorC: 20, outdoorC: 18, mode: 'cold', thresholdC: 15 }),
      START,
    );
    expect(r.kind).toBe('night');
    if (r.kind === 'night') {
      expect(r.crossing).toBeNull();
      expect(r.notReachedReason).toMatch(/does not take your home down/);
      expect(r.points.length).toBeGreaterThan(1);
    }
  });

  it('HH-17 the curve starts from where the outage has already taken the home', () => {
    const home: HomePayload = {
      archetype: null,
      indoorC: 20,
      outdoorC: 0,
      mode: 'cold',
      thresholdC: 5,
    };
    const fresh = graveyardShift(viewWith(home, 12, START), START);
    const later = graveyardShift(viewWith(home, 12, START), START + 6 * 60 * MIN);
    if (fresh.kind === 'night' && later.kind === 'night') {
      expect(fresh.points[0]?.midC).toBeCloseTo(20, 6);
      expect(later.points[0]?.midC).toBeLessThan(fresh.points[0]?.midC ?? Number.NaN);
    } else throw new Error('expected a night');
  });
});
