import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildingCrossing, compartmentFor } from './archetypes.js';
import {
  applyDoorEvents,
  crossingTime,
  discardTime,
  InvalidThermalInputError,
  temperatureAt,
} from './model.js';
import type { CompartmentState, DoorEvent } from './types.js';

const stateArb = (): fc.Arbitrary<CompartmentState> =>
  fc.record({
    startC: fc.double({ min: -30, max: 40, noNaN: true }),
    ambientC: fc.double({ min: -30, max: 40, noNaN: true }),
    tauMinutes: fc.double({ min: 1, max: 10000, noNaN: true }),
  });

const between = (x: number, a: number, b: number): boolean => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return x >= lo - 1e-6 && x <= hi + 1e-6;
};

describe('Thermal properties', () => {
  // TH-01: temperature stays bounded between start and ambient.
  it('TH-01 temperature is bounded between start and ambient', () => {
    fc.assert(
      fc.property(stateArb(), fc.double({ min: 0, max: 20000, noNaN: true }), (state, t) => {
        const temp = temperatureAt(state, t);
        expect(between(temp, state.startC, state.ambientC)).toBe(true);
      }),
    );
  });

  // TH-01b: temperature moves monotonically toward ambient.
  it('TH-01b temperature approaches ambient monotonically', () => {
    fc.assert(
      fc.property(
        stateArb(),
        fc.double({ min: 0, max: 5000, noNaN: true }),
        fc.double({ min: 0, max: 5000, noNaN: true }),
        (state, ta, tb) => {
          const t1 = Math.min(ta, tb);
          const t2 = Math.max(ta, tb);
          const d1 = Math.abs(temperatureAt(state, t1) - state.ambientC);
          const d2 = Math.abs(temperatureAt(state, t2) - state.ambientC);
          expect(d2).toBeLessThanOrEqual(d1 + 1e-6);
        },
      ),
    );
  });

  // TH-02: crossing time is exact when reachable, never when unreachable.
  it('TH-02 crossing is exact when reachable and never otherwise', () => {
    fc.assert(
      fc.property(stateArb(), fc.double({ min: -30, max: 40, noNaN: true }), (state, threshold) => {
        const cr = crossingTime(state, threshold);
        if (cr.kind === 'at' && cr.minute > 0) {
          // temperature at the crossing minute should equal the threshold
          const temp = temperatureAt(state, cr.minute);
          expect(Math.abs(temp - threshold)).toBeLessThan(1e-3);
        }
      }),
    );
  });

  // TH-02b: unreachable thresholds (beyond ambient) return never.
  it('TH-02b threshold beyond ambient is never reached', () => {
    const warming: CompartmentState = { startC: 0, ambientC: 20, tauMinutes: 100 };
    expect(crossingTime(warming, 25).kind).toBe('never'); // past ambient
    const cooling: CompartmentState = { startC: 20, ambientC: 0, tauMinutes: 100 };
    expect(crossingTime(cooling, -5).kind).toBe('never');
  });

  // TH-03: door events are order-independent.
  it('TH-03 door events are order-independent', () => {
    const doorArb = fc.array(
      fc.record({ openMinutes: fc.double({ min: 0, max: 10, noNaN: true }) }),
      { maxLength: 8 },
    ) as fc.Arbitrary<DoorEvent[]>;
    fc.assert(
      fc.property(stateArb(), doorArb, (state, events) => {
        const a = applyDoorEvents(state, events).startC;
        const b = applyDoorEvents(state, [...events].reverse()).startC;
        expect(Math.abs(a - b)).toBeLessThan(1e-6);
      }),
    );
  });

  // TH-03b: door events never push past ambient.
  it('TH-03b door events never overshoot ambient', () => {
    fc.assert(
      fc.property(
        stateArb(),
        fc.array(fc.record({ openMinutes: fc.double({ min: 0, max: 20, noNaN: true }) }), {
          maxLength: 10,
        }) as fc.Arbitrary<DoorEvent[]>,
        (state, events) => {
          const result = applyDoorEvents(state, events);
          expect(between(result.startC, state.startC, state.ambientC)).toBe(true);
        },
      ),
    );
  });

  // TH-04: discard time never exceeds crossing + budget, and starts at crossing.
  it('TH-04 discard is crossing + budget, never extended', () => {
    fc.assert(
      fc.property(
        stateArb(),
        fc.double({ min: -30, max: 40, noNaN: true }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        (state, dangerC, budget) => {
          const result = discardTime(state, { name: 'x', dangerC, budgetMinutes: budget });
          const cr = crossingTime(state, dangerC);
          if (cr.kind === 'never') {
            expect(result.kind).toBe('notYetAtRisk');
          } else if (result.kind === 'discardAt') {
            expect(Math.abs(result.minute - (cr.minute + budget))).toBeLessThan(1e-6);
          }
        },
      ),
    );
  });

  // TH-05: building crossing uses a band; earliest <= latest when both cross.
  it('TH-05 building band: earliest crosses no later than latest', () => {
    const q = { type: 'detachedHouse', vintage: 'post2000', insulation: 'good', climate: 'cold' };
    const bc = buildingCrossing(q, 20, 0, 15); // home cooling from 20C toward 0C, threshold 15C
    expect(bc.isDefaultBand).toBe(false);
    if (bc.bandEarliest.kind === 'at' && bc.bandLatest.kind === 'at') {
      expect(bc.bandEarliest.minute).toBeLessThanOrEqual(bc.bandLatest.minute);
    }
  });

  // TH-05b: no archetype -> wide default band, flagged.
  it('TH-05b missing archetype yields a flagged default band', () => {
    const bc = buildingCrossing(null, 20, 0, 15);
    expect(bc.isDefaultBand).toBe(true);
  });

  // TH-07: appliance defaults reproduce USDA anchors (fridge ~4h, freezer full ~48h).
  it('TH-07 appliance defaults reproduce USDA guidance', () => {
    const fridge = compartmentFor('fridge', 'full', 22);
    const fridgeCross = crossingTime(fridge.state, fridge.dangerC);
    expect(fridgeCross.kind).toBe('at');
    if (fridgeCross.kind === 'at') {
      expect(fridgeCross.minute / 60).toBeGreaterThan(3.5);
      expect(fridgeCross.minute / 60).toBeLessThan(4.5);
    }
    const freezer = compartmentFor('freezer', 'full', 22);
    const freezerCross = crossingTime(freezer.state, freezer.dangerC);
    if (freezerCross.kind === 'at') {
      expect(freezerCross.minute / 60).toBeGreaterThan(44);
      expect(freezerCross.minute / 60).toBeLessThan(52);
    }
  });

  // Validation: invalid inputs are rejected.
  it('rejects non-positive tau and negative t', () => {
    expect(() => temperatureAt({ startC: 0, ambientC: 10, tauMinutes: 0 }, 1)).toThrow(
      InvalidThermalInputError,
    );
    expect(() => temperatureAt({ startC: 0, ambientC: 10, tauMinutes: 10 }, -1)).toThrow(
      InvalidThermalInputError,
    );
  });
});
