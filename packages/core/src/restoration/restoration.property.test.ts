import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CellStateValue } from '../cells/types.js';
import {
  MIN_HISTORY,
  type PastOutage,
  type RestorationInput,
  estimateRestoration,
} from './restoration.js';

const NOW = 1000;
const STATES: CellStateValue[] = ['dark', 'mixed', 'unknown'];

const pastArb: fc.Arbitrary<PastOutage> = fc
  .record({
    promised: fc.integer({ min: 0, max: 500 }),
    overrun: fc.integer({ min: -60, max: 300 }),
  })
  .map(({ promised, overrun }) => ({
    promisedEndMinute: promised,
    actualEndMinute: promised + overrun,
  }));
const historyArb = fc.array(pastArb, { maxLength: 40 });
const promiseArb = fc.integer({ min: NOW - 120, max: NOW + 240 });
const crowdArb = fc.constantFrom(...STATES);

const input = (over: Partial<RestorationInput> & Pick<RestorationInput, 'history'>) => ({
  nowMinute: NOW,
  promisedEndMinute: NOW + 60,
  crowdState: 'dark' as CellStateValue,
  ...over,
});

/** Five past outages that each ran `overrun` minutes over, so a band can be drawn. */
const flat = (overrun: number, n = MIN_HISTORY): PastOutage[] =>
  Array.from({ length: n }, (_, i) => ({
    promisedEndMinute: i * 10,
    actualEndMinute: i * 10 + overrun,
  }));

describe('Restoration properties', () => {
  // RS-01: a band is ordered and strictly in the future.
  it('RS-01 an estimate is ordered and after now', () => {
    fc.assert(
      fc.property(historyArb, promiseArb, crowdArb, (history, promise, crowd) => {
        const r = estimateRestoration(
          input({ history, promisedEndMinute: promise, crowdState: crowd }),
        );
        if (r.kind === 'estimate') {
          expect(r.lowMinute).toBeGreaterThan(NOW);
          expect(r.lowMinute).toBeLessThanOrEqual(r.atMinute);
          expect(r.atMinute).toBeLessThanOrEqual(r.highMinute);
        }
      }),
    );
  });

  // RS-02: no promise, no estimate.
  it('RS-02 no promise gives unknown, whatever the history', () => {
    fc.assert(
      fc.property(historyArb, crowdArb, (history, crowd) => {
        const r = estimateRestoration(
          input({ history, promisedEndMinute: null, crowdState: crowd }),
        );
        expect(r.kind).toBe('unknown');
      }),
    );
  });

  // RS-03: thin history never gives a band.
  it('RS-03 fewer than MIN_HISTORY eligible outages never give a band', () => {
    fc.assert(
      fc.property(
        fc.array(pastArb, { maxLength: MIN_HISTORY - 1 }),
        promiseArb,
        (history, promise) => {
          const r = estimateRestoration(input({ history, promisedEndMinute: promise }));
          expect(r.kind).not.toBe('estimate');
          if (promise > NOW) expect(r).toEqual({ kind: 'promiseOnly', promisedEndMinute: promise });
          else expect(r.kind).toBe('unknown');
        },
      ),
    );
  });

  // RS-04: the order of the history never matters.
  it('RS-04 the history order never matters', () => {
    fc.assert(
      fc.property(historyArb, promiseArb, (history, promise) => {
        const a = estimateRestoration(input({ history, promisedEndMinute: promise }));
        const b = estimateRestoration(
          input({ history: [...history].reverse(), promisedEndMinute: promise }),
        );
        expect(b).toEqual(a);
      }),
    );
  });

  // RS-05: an outage that ran later than every past one never moves the band earlier.
  it('RS-05 a later outage never moves the band earlier', () => {
    fc.assert(
      fc.property(historyArb, promiseArb, fc.integer({ min: 0, max: 200 }), (h, promise, extra) => {
        const before = estimateRestoration(input({ history: h, promisedEndMinute: promise }));
        if (before.kind !== 'estimate') return;
        const worst = Math.max(...h.map((p) => p.actualEndMinute - p.promisedEndMinute));
        const later: PastOutage = { promisedEndMinute: 0, actualEndMinute: worst + extra };
        const after = estimateRestoration(
          input({ history: [...h, later], promisedEndMinute: promise }),
        );
        expect(after.kind).toBe('estimate');
        if (after.kind === 'estimate') {
          expect(after.lowMinute).toBeGreaterThanOrEqual(before.lowMinute);
          expect(after.atMinute).toBeGreaterThanOrEqual(before.atMinute);
          expect(after.highMinute).toBeGreaterThanOrEqual(before.highMinute);
        }
      }),
    );
  });

  // RS-06: bad input fails closed and never throws.
  it('RS-06 unusable time or promise gives unknown, never a throw', () => {
    const bad = [Number.NaN, Number.POSITIVE_INFINITY, 1.5];
    for (const b of bad) {
      expect(estimateRestoration(input({ history: flat(10), nowMinute: b })).kind).toBe('unknown');
      expect(estimateRestoration(input({ history: flat(10), promisedEndMinute: b })).kind).toBe(
        'unknown',
      );
    }
  });

  it('RS-06 unusable past outages are ignored and never counted toward MIN_HISTORY', () => {
    const junk: PastOutage[] = [
      { promisedEndMinute: Number.NaN, actualEndMinute: 5 },
      { promisedEndMinute: 5, actualEndMinute: Number.POSITIVE_INFINITY },
      { promisedEndMinute: 1.5, actualEndMinute: 9 },
    ];
    // Four good outages plus junk is still thin.
    expect(estimateRestoration(input({ history: [...flat(10, 4), ...junk] })).kind).toBe(
      'promiseOnly',
    );
    // Junk does not disturb a band drawn from good outages.
    expect(estimateRestoration(input({ history: [...flat(10), ...junk] }))).toEqual(
      estimateRestoration(input({ history: flat(10) })),
    );
  });

  // RS-07: a lit cell has nothing to estimate.
  it('RS-07 a lit cell gives unknown', () => {
    fc.assert(
      fc.property(historyArb, promiseArb, (history, promise) => {
        const r = estimateRestoration(
          input({ history, promisedEndMinute: promise, crowdState: 'lit' }),
        );
        expect(r.kind).toBe('unknown');
      }),
    );
  });

  // RS-08: the crowd saying "coming back" wins, with or without a promise or history.
  it('RS-08 coming back is underway, with or without a promise or history', () => {
    fc.assert(
      fc.property(historyArb, fc.option(promiseArb, { nil: null }), (history, promise) => {
        const r = estimateRestoration(
          input({ history, promisedEndMinute: promise, crowdState: 'comingBack' }),
        );
        expect(r).toEqual({ kind: 'underway' });
      }),
    );
  });

  // RS-09: provenance travels with the estimate.
  it('RS-09 an estimate names the promise and how many outages it is drawn from', () => {
    const r = estimateRestoration(input({ history: flat(20, 7), promisedEndMinute: NOW + 60 }));
    expect(r).toEqual({
      kind: 'estimate',
      atMinute: NOW + 80,
      lowMinute: NOW + 80,
      highMinute: NOW + 80,
      promisedEndMinute: NOW + 60,
      basedOn: 7,
    });
  });

  // Worked example: a spread of overruns gives a spread band by nearest rank.
  it('RS-01 nearest-rank percentiles on a known spread', () => {
    // Overruns 0,10,...,90 (ten outages): p10 = 0, p50 = 40, p90 = 80.
    const history = Array.from({ length: 10 }, (_, i) => ({
      promisedEndMinute: 0,
      actualEndMinute: i * 10,
    }));
    const r = estimateRestoration(input({ history, promisedEndMinute: NOW + 30 }));
    expect(r).toMatchObject({
      kind: 'estimate',
      lowMinute: NOW + 30,
      atMinute: NOW + 70,
      highMinute: NOW + 110,
      basedOn: 10,
    });
  });

  // The promise has passed: only outages that ran this late are still possible.
  it('RS-01 a late outage is conditioned on being late', () => {
    // 90 minutes past the promise. Overruns of 0..80 are already ruled out.
    const history = [...flat(10, 6), ...flat(100, 3), ...flat(130, 3)];
    const r = estimateRestoration(input({ history, promisedEndMinute: NOW - 90 }));
    expect(r).toMatchObject({ kind: 'estimate', basedOn: 6 });
    if (r.kind === 'estimate') expect(r.lowMinute).toBe(NOW + 10);
    // Nothing ran that late: unknown, never a time in the past.
    const none = estimateRestoration(input({ history: flat(10), promisedEndMinute: NOW - 90 }));
    expect(none.kind).toBe('unknown');
  });
});
