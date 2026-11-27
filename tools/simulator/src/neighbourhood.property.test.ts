import { cells, restoration } from '@afterglow/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  HORIZON_MINUTES,
  RECONFIRM_MINUTES,
  type SimConfig,
  buildNeighbourhood,
} from './neighbourhood.js';

const START = 29_000_000;
const config = (seed: number, over: Partial<SimConfig> = {}): SimConfig => ({
  ...DEFAULT_CONFIG,
  seed,
  outageStartMinute: START,
  ...over,
});

const seedArb = fc.integer({ min: 1, max: 2_000_000 });
const FIELDS = [
  'confidence',
  'deviceEpoch',
  'geohash6',
  'minute',
  'restoreEdge',
  'senses',
  'verdict',
];
const KNOWN_SENSES = new Set(['ce', 'hum', 'fl', 'mag', 'tel']);

/** The states a cell passes through, in order, with repeats collapsed. */
function journey(
  n: ReturnType<typeof buildNeighbourhood>,
  geohash6: string,
): { states: string[]; maxDeviceCount: number } {
  const line = cells.cellTimeline(geohash6, n.reports, START - 15, n.endMinute, 5);
  const states: string[] = [];
  for (const s of line) if (states[states.length - 1] !== s.state) states.push(s.state);
  return { states, maxDeviceCount: Math.max(...line.map((s) => s.deviceCount)) };
}

describe('Simulator properties', () => {
  // SIM-01: deterministic.
  it('SIM-01 the same config gives the same neighbourhood, a new seed a different one', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        expect(buildNeighbourhood(config(seed))).toEqual(buildNeighbourhood(config(seed)));
      }),
      { numRuns: 15 },
    );
    expect(buildNeighbourhood(config(1)).reports).not.toEqual(
      buildNeighbourhood(config(2)).reports,
    );
  });

  // SIM-02: no more than the real report carries.
  it('SIM-02 every report is exactly a CellReport, small, geohash-6 and with known senses', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const n = buildNeighbourhood(config(seed));
        // A plain loop that collects violations: 16,000 expect() calls per run is slow.
        const bad: string[] = [];
        const fields = FIELDS.join();
        for (const r of n.reports) {
          if (Object.keys(r).sort().join() !== fields) bad.push(`fields ${Object.keys(r)}`);
          if (JSON.stringify(r).length > 200) bad.push('over 200 bytes');
          if (!cells.isGeohash6(r.geohash6)) bad.push(`geohash ${r.geohash6}`);
          if (!Number.isInteger(r.minute)) bad.push(`minute ${r.minute}`);
          if (!/^sim-[0-9a-z]{6}-\d+$/.test(r.deviceEpoch)) bad.push(`epoch ${r.deviceEpoch}`);
          for (const s of r.senses) if (!KNOWN_SENSES.has(s)) bad.push(`sense ${s}`);
        }
        expect(bad).toEqual([]);
      }),
      { numRuns: 10 },
    );
  });

  // SIM-03: a held verdict is repeated within RECONFIRM_MINUTES.
  it('SIM-03 a device repeats its verdict at least every re-confirmation interval', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const n = buildNeighbourhood(config(seed));
        const byDevice = new Map<string, number[]>();
        for (const r of n.reports) {
          const list = byDevice.get(r.deviceEpoch);
          if (list) list.push(r.minute);
          else byDevice.set(r.deviceEpoch, [r.minute]);
        }
        for (const minutes of byDevice.values()) {
          minutes.sort((a, b) => a - b);
          for (let i = 1; i < minutes.length; i++) {
            expect((minutes[i] as number) - (minutes[i - 1] as number)).toBeLessThanOrEqual(
              RECONFIRM_MINUTES + 5,
            );
          }
        }
      }),
      { numRuns: 8 },
    );
  });

  // SIM-04: the scenario walks the real core through every state.
  it('SIM-04 the user cell goes lit, dark, coming back, lit through the real core', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const n = buildNeighbourhood(config(seed));
        // While phones lose power over a couple of minutes the cell is honestly `mixed`.
        const { states } = journey(n, n.userCell);
        expect(states.filter((s) => s !== 'mixed')).toEqual(['lit', 'dark', 'comingBack', 'lit']);
      }),
      { numRuns: 10 },
    );
  });

  // pbt-catches 2026-11-27: on CI this seed's restores trickled in, the cell went
  // dark → mixed → lit, and the core could not say "coming back" from mixed.
  it('SIM-04 regression: seed 1872461 passes through coming back', () => {
    const n = buildNeighbourhood(config(1872461));
    const { states } = journey(n, n.userCell);
    expect(states.filter((s) => s !== 'mixed')).toEqual(['lit', 'dark', 'comingBack', 'lit']);
  });

  it('SIM-04 a sparse cell is only ever unknown, and a lit cell never goes dark', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const n = buildNeighbourhood(config(seed));
        const sparse = n.cells.filter((c) => c.devices < cells.K_ANONYMITY);
        expect(sparse.length).toBeGreaterThanOrEqual(1);
        for (const c of sparse) {
          const j = journey(n, c.geohash6);
          expect(j.states).toEqual(['unknown']);
          expect(j.maxDeviceCount).toBeLessThan(cells.K_ANONYMITY);
        }
        const lit = n.cells.filter(
          (c) => c.restoreAtMinute === null && c.devices >= cells.K_ANONYMITY,
        );
        expect(lit.length).toBeGreaterThanOrEqual(1);
        for (const c of lit) {
          const states = journey(n, c.geohash6).states.filter((s) => s !== 'unknown');
          expect(states).toEqual(['lit']);
        }
      }),
      { numRuns: 8 },
    );
  });

  // SIM-05: a real grid.
  it('SIM-05 the grid is cols x rows distinct valid cells whose neighbours touch', () => {
    fc.assert(
      fc.property(
        seedArb,
        fc.integer({ min: 3, max: 7 }),
        fc.integer({ min: 3, max: 8 }),
        (seed, cols, rows) => {
          const n = buildNeighbourhood(config(seed, { cols, rows }));
          expect(n.cells).toHaveLength(cols * rows);
          expect(new Set(n.cells.map((c) => c.geohash6)).size).toBe(cols * rows);
          for (const c of n.cells) expect(cells.isGeohash6(c.geohash6)).toBe(true);
          const at = (col: number, row: number) =>
            n.cells.find((c) => c.col === col && c.row === row) as (typeof n.cells)[number];
          const eps = 1e-9;
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols - 1; col++) {
              const a = cells.decodeBounds(at(col, row).geohash6);
              const b = cells.decodeBounds(at(col + 1, row).geohash6);
              expect(Math.abs(a.lngMax - b.lngMin)).toBeLessThan(eps);
              expect(Math.abs(a.latMin - b.latMin)).toBeLessThan(eps);
            }
          }
          for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < cols; col++) {
              const north = cells.decodeBounds(at(col, row).geohash6);
              const south = cells.decodeBounds(at(col, row + 1).geohash6);
              expect(Math.abs(north.latMin - south.latMax)).toBeLessThan(eps);
            }
          }
          expect(n.cells.some((c) => c.geohash6 === n.userCell)).toBe(true);
        },
      ),
      { numRuns: 15 },
    );
  });

  // SIM-06: a plausible promise and enough honest history.
  it('SIM-06 the promise is after the start and the history is enough for a band', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const n = buildNeighbourhood(config(seed));
        expect(n.provider.promisedEndMinute).toBeGreaterThan(START);
        expect(n.provider.promisedEndMinute).toBeLessThan(START + HORIZON_MINUTES);
        expect(n.history.length).toBeGreaterThanOrEqual(restoration.MIN_HISTORY);
        const early = restoration.estimateRestoration({
          nowMinute: START + 30,
          promisedEndMinute: n.provider.promisedEndMinute,
          history: n.history,
          crowdState: 'dark',
        });
        expect(early.kind).toBe('estimate');
      }),
      { numRuns: 25 },
    );
  });

  // SIM-06: the true restoration is a draw, not a value picked to match the estimate.
  it('SIM-06 the estimate is sometimes wrong: the true time is not tuned to fit the band', () => {
    let inside = 0;
    let outside = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const n = buildNeighbourhood(config(seed));
      const truth = (n.cells.find((c) => c.geohash6 === n.userCell)?.restoreAtMinute ?? 0) - 6;
      const e = restoration.estimateRestoration({
        nowMinute: START + 30,
        promisedEndMinute: n.provider.promisedEndMinute,
        history: n.history,
        crowdState: 'dark',
      });
      if (e.kind !== 'estimate') continue;
      if (truth >= e.lowMinute - 10 && truth <= e.highMinute + 10) inside++;
      else outside++;
    }
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
  });
});
