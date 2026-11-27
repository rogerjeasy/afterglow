import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MessageName } from '../heliograph/codes.js';
import { crossingTime, temperatureAt } from '../thermal/model.js';
import type { CompartmentState } from '../thermal/types.js';
import { type Trial, type TrialOutcome, tallyTrials } from './seance.js';
import {
  type Reading,
  compareReadings,
  fitTau,
  insideBand,
  measuredCrossing,
  safeTau,
} from './thermometer.js';

/** A warming fridge-like body: start below the room, a time constant from minutes to days. */
const warmingState = (): fc.Arbitrary<CompartmentState> =>
  fc
    .record({
      startC: fc.double({ min: -20, max: 8, noNaN: true }),
      gap: fc.double({ min: 3, max: 30, noNaN: true }),
      tauMinutes: fc.double({ min: 60, max: 8000, noNaN: true }),
    })
    .map(({ startC, gap, tauMinutes }) => ({ startC, ambientC: startC + gap, tauMinutes }));

/** Reading times spread over at least two hours, strictly after the start. */
const times = (): fc.Arbitrary<number[]> =>
  fc
    .uniqueArray(fc.integer({ min: 10, max: 1440 }), { minLength: 3, maxLength: 12 })
    .filter((ts) => Math.max(...ts) - Math.min(...ts) >= 120)
    .map((ts) => [...ts].sort((a, b) => a - b));

const sample = (state: CompartmentState, ts: readonly number[]): Reading[] =>
  ts.map((minute) => ({ minute, c: temperatureAt(state, minute) }));

/** Keep only readings that moved measurably; a curve that barely moves teaches nothing. */
const movedEnough = (state: CompartmentState, ts: readonly number[]): boolean =>
  ts.some((t) => Math.abs(temperatureAt(state, t) - state.startC) >= 0.5) &&
  ts.every((t) => {
    const r = (state.ambientC - temperatureAt(state, t)) / (state.ambientC - state.startC);
    return r > 1e-9 && r < 1 - 1e-9;
  });

describe('Field check properties', () => {
  it('FC-01 readings taken from the model itself compare with no error and no bias', () => {
    fc.assert(
      fc.property(warmingState(), times(), (state, ts) => {
        const cmp = compareReadings(state, sample(state, ts));
        expect(cmp.kind).toBe('compared');
        if (cmp.kind !== 'compared') return;
        expect(cmp.n).toBe(ts.length);
        expect(cmp.maxAbsErrorC).toBeLessThan(1e-9);
        expect(Math.abs(cmp.biasC)).toBeLessThan(1e-9);
      }),
    );
  });

  it('FC-01 a thermometer that reads d degrees warm shows a bias of d', () => {
    fc.assert(
      fc.property(
        warmingState(),
        times(),
        fc.double({ min: -3, max: 3, noNaN: true }),
        (state, ts, d) => {
          const cmp = compareReadings(
            state,
            sample(state, ts).map((r) => ({ ...r, c: r.c + d })),
          );
          if (cmp.kind !== 'compared') throw new Error('expected a comparison');
          expect(cmp.biasC).toBeCloseTo(d, 9);
          expect(cmp.meanAbsErrorC).toBeCloseTo(Math.abs(d), 9);
        },
      ),
    );
  });

  it('FC-02 the fit recovers the time constant from clean readings', () => {
    fc.assert(
      fc.property(warmingState(), times(), (state, ts) => {
        fc.pre(movedEnough(state, ts));
        const fit = fitTau(state.startC, state.ambientC, sample(state, ts));
        expect(fit.kind).toBe('fitted');
        if (fit.kind !== 'fitted') return;
        expect(Math.abs(fit.tauMinutes - state.tauMinutes) / state.tauMinutes).toBeLessThan(1e-6);
      }),
    );
  });

  it('FC-02 too few, too short or unmoving readings are unknown, never a guess', () => {
    const s: CompartmentState = { startC: 3, ambientC: 22, tauMinutes: 3000 };
    expect(fitTau(3, 22, []).kind).toBe('unknown');
    expect(fitTau(3, 22, sample(s, [30, 60])).kind).toBe('unknown');
    expect(fitTau(3, 22, sample(s, [10, 20, 30])).kind).toBe('unknown');
    expect(fitTau(3, 3.5, sample(s, [60, 120, 180])).kind).toBe('unknown');
    expect(
      fitTau(3, 22, [
        { minute: 60, c: 3.1 },
        { minute: 120, c: 3.2 },
        { minute: 180, c: 3.3 },
      ]).kind,
    ).toBe('unknown');
  });

  it('FC-03 a thermometer check never makes a clock longer than the default', () => {
    fc.assert(
      fc.property(
        warmingState(),
        fc.array(
          fc.record({
            minute: fc.double({ min: -10, max: 3000, noNaN: false }),
            c: fc.double({ min: -100, max: 120, noNaN: false }),
          }),
          { maxLength: 15 },
        ),
        fc.double({ min: -10, max: 20, noNaN: true }),
        (state, readings, threshold) => {
          const t = safeTau(state, threshold, readings);
          expect(t.tauMinutes).toBeLessThanOrEqual(state.tauMinutes);
          expect(t.tauMinutes).toBeGreaterThan(0);
          expect(Number.isFinite(t.tauMinutes)).toBe(true);
        },
      ),
    );
  });

  it('FC-03 when the thermometer saw the danger line, the model crosses it no later', () => {
    fc.assert(
      fc.property(
        warmingState(),
        times(),
        fc.double({ min: 0.5, max: 3, noNaN: true }),
        (state, ts, speedUp) => {
          // The real appliance warms faster than the model thinks.
          const real = { ...state, tauMinutes: state.tauMinutes / speedUp };
          const threshold = state.startC + (state.ambientC - state.startC) * 0.3;
          const readings = sample(real, ts);
          const seen = measuredCrossing(state.startC, state.ambientC, threshold, readings);
          fc.pre(seen !== null && seen > 0);
          const t = safeTau(state, threshold, readings);
          const c = crossingTime({ ...state, tauMinutes: t.tauMinutes }, threshold);
          expect(c.kind).toBe('at');
          if (c.kind === 'at') expect(c.minute).toBeLessThanOrEqual((seen as number) + 1e-6);
        },
      ),
    );
  });

  it('FC-04 the measured crossing lies between the readings either side of the line', () => {
    fc.assert(
      fc.property(warmingState(), times(), (state, ts) => {
        const readings = sample(state, ts);
        const threshold = state.startC + (state.ambientC - state.startC) * 0.2;
        const seen = measuredCrossing(state.startC, state.ambientC, threshold, readings);
        const firstAt = readings.find((r) => r.c >= threshold);
        if (!firstAt) {
          expect(seen).toBeNull();
          return;
        }
        const before = [...readings].reverse().find((r) => r.minute < firstAt.minute);
        expect(seen).not.toBeNull();
        expect(seen as number).toBeLessThanOrEqual(firstAt.minute);
        expect(seen as number).toBeGreaterThanOrEqual(before ? before.minute : 0);
      }),
    );
  });

  it('FC-05 unusable readings are dropped, never thrown on or trusted', () => {
    fc.assert(
      fc.property(
        warmingState(),
        fc.array(
          fc.record({
            minute: fc.oneof(
              fc.constant(Number.NaN),
              fc.constant(-5),
              fc.constant(Number.POSITIVE_INFINITY),
            ),
            c: fc.double({ noNaN: false }),
          }),
          { maxLength: 8 },
        ),
        (state, junk) => {
          expect(compareReadings(state, junk).kind).toBe('none');
          expect(fitTau(state.startC, state.ambientC, junk).kind).toBe('unknown');
          expect(measuredCrossing(state.startC, state.ambientC, state.startC + 1, junk)).toBeNull();
          expect(insideBand(state.startC, state.ambientC, 60, 600, junk).n).toBe(0);
        },
      ),
    );
  });

  it('FC-05 the band holds every reading taken from a time constant inside it', () => {
    fc.assert(
      fc.property(
        warmingState(),
        times(),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (state, ts, f) => {
          const fast = state.tauMinutes * 0.5;
          const slow = state.tauMinutes * 2;
          const mid = fast + (slow - fast) * f;
          const readings = sample({ ...state, tauMinutes: mid }, ts);
          const band = insideBand(state.startC, state.ambientC, fast, slow, readings);
          expect(band.inside).toBe(band.n);
        },
      ),
    );
  });

  const outcomes: readonly TrialOutcome[] = ['read', 'wrong', 'refused', 'missed'];
  const trial = (): fc.Arbitrary<Trial> =>
    fc.record({
      sent: fc.constantFrom<MessageName>('SAFE', 'HELP', 'COMING'),
      outcome: fc.constantFrom(...outcomes),
      seconds: fc.option(fc.double({ min: 0, max: 120, noNaN: true }), { nil: null }),
    });

  it('FC-06 the tally counts every attempt once, and wrong reads stay separate', () => {
    fc.assert(
      fc.property(fc.array(trial(), { maxLength: 60 }), (trials) => {
        const t = tallyTrials(trials);
        expect(t.attempts).toBe(trials.length);
        expect(t.read + t.wrong + t.refused + t.missed).toBe(t.attempts);
        expect(t.wrong).toBe(trials.filter((x) => x.outcome === 'wrong').length);
        if (t.attempts === 0) expect(t.successRate).toBeNull();
        else expect(t.successRate).toBeCloseTo(t.read / t.attempts, 12);
        if (t.medianSeconds !== null) {
          const timed = trials
            .filter((x) => x.outcome === 'read' && x.seconds !== null)
            .map((x) => x.seconds as number);
          expect(t.medianSeconds).toBeGreaterThanOrEqual(Math.min(...timed));
          expect(t.medianSeconds).toBeLessThanOrEqual(Math.max(...timed));
        }
      }),
    );
  });
});
