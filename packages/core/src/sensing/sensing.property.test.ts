import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decodeCenter, isGeohash6 } from '../cells/geohash.js';
import {
  CHARGING_MINUTES,
  EDGE_FRESH_MINUTES,
  INITIAL_CHARGING,
  PLUGGED_MINUTES,
  chargingVote,
  observeCharging,
} from './chargingEdge.js';
import { cellsAround, validateCrowdReport } from './crowd.js';
import { humVerdict } from './hum.js';

/**
 * Grid Sense in the browser and the crowd report as it crosses the network
 * (.kiro/specs/crowd-reports CR-01, CR-03).
 */

const MIN = 60_000;
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'.split('');
const cellArb = fc.stringOf(fc.constantFrom(...BASE32), { minLength: 6, maxLength: 6 });
const SENSES = ['chargingEdge', 'hum', 'flicker', 'magnetometer', 'telemetry', 'reported'];
const NOW_MIN = 29_400_000;

const validReport = fc.record({
  geohash6: cellArb,
  minute: fc.integer({ min: NOW_MIN - 10, max: NOW_MIN + 10 }),
  verdict: fc.constantFrom('present', 'absent', 'unknown'),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  senses: fc.array(fc.constantFrom(...SENSES), { maxLength: 6 }),
  restoreEdge: fc.boolean(),
});

describe('CR-01 charging edge', () => {
  const obsArb = fc.array(
    fc.record({ charging: fc.boolean(), gapMin: fc.integer({ min: 0, max: 600 }) }),
    { maxLength: 30 },
  );
  const run = (obs: { charging: boolean; gapMin: number }[]) => {
    let s = INITIAL_CHARGING;
    let t = 0;
    const seen: { charging: boolean; atMs: number }[] = [];
    for (const o of obs) {
      t += o.gapMin * MIN;
      seen.push({ charging: o.charging, atMs: t });
      s = observeCharging(s, { charging: o.charging, atMs: t });
    }
    return { s, t, seen };
  };

  it('CR-01 a stop is a candidate outage only after at least 10 minutes on the charger', () => {
    fc.assert(
      fc.property(obsArb, fc.integer({ min: 0, max: 30 }), (obs, plugged) => {
        const { s: before, t } = run(obs);
        const charging = observeCharging(before, { charging: true, atMs: t + 1 });
        const stopAt = t + 1 + plugged * MIN;
        const stopped = observeCharging(charging, { charging: false, atMs: stopAt });
        const startedNow = before.charging !== true;
        if (startedNow) {
          expect(stopped.dropAtMs).toBe(plugged >= PLUGGED_MINUTES ? stopAt : null);
          const v = chargingVote(stopped, stopAt);
          expect(v.vote?.direction ?? null).toBe(plugged >= PLUGGED_MINUTES ? 'absent' : null);
        }
      }),
    );
  });

  it('CR-01 charging again after a drop is a candidate restoration; a drop goes stale after 6 hours', () => {
    let s = observeCharging(INITIAL_CHARGING, { charging: true, atMs: 0 });
    s = observeCharging(s, { charging: false, atMs: 20 * MIN });
    expect(chargingVote(s, 21 * MIN).vote?.direction).toBe('absent');
    expect(chargingVote(s, 20 * MIN + EDGE_FRESH_MINUTES * MIN + 1).vote).toBeNull();
    s = observeCharging(s, { charging: true, atMs: 60 * MIN });
    expect(chargingVote(s, 61 * MIN).vote).toBeNull(); // charging just started
    const back = chargingVote(s, 60 * MIN + CHARGING_MINUTES * MIN);
    expect(back.vote?.direction).toBe('present');
    expect(back.restoreEdge).toBe(true);
    expect(chargingVote(s, 60 * MIN + 11 * MIN).restoreEdge).toBe(false);
  });

  it('CR-01 any observation sequence gives a vote that agrees with the state, never an absent while charging', () => {
    fc.assert(
      fc.property(obsArb, fc.integer({ min: 0, max: 1000 }), (obs, later) => {
        const { s, t } = run(obs);
        const v = chargingVote(s, t + later * MIN);
        if (v.vote?.direction === 'absent') expect(s.charging).toBe(false);
        if (v.vote?.direction === 'present') expect(s.charging).toBe(true);
        if (s.charging === null) expect(v.vote).toBeNull();
        if (v.restoreEdge) expect(v.vote?.direction).toBe('present');
        // A non-finite time changes nothing.
        expect(observeCharging(s, { charging: !s.charging, atMs: Number.NaN })).toBe(s);
      }),
    );
  });
});

describe('CR-01 mains hum', () => {
  const RATE = 8000;
  const tone = (n: number, hz: number, amp: number, phase = 0) =>
    Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE + phase));
  const noise = (n: number, amp: number, seed: number) => {
    let x = seed || 1;
    return Array.from({ length: n }, () => {
      x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
      return amp * ((x / 0x7fffffff) * 2 - 1);
    });
  };

  it('CR-01 a silent or too-short sample is unknown, whatever else is in it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<50 | 60>(50, 60),
        fc.integer({ min: 0, max: RATE / 2 - 1 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (hz, n, amp) => {
          const short = tone(n, 2 * hz, amp);
          expect(humVerdict(short, RATE, hz).vote.direction).toBe('unknown');
          const silent = tone(RATE, 2 * hz, 5e-5);
          expect(humVerdict(silent, RATE, hz).vote.direction).toBe('unknown');
        },
      ),
      { numRuns: 30 },
    );
  });

  it('CR-01 strong 2nd and 3rd harmonics over a quiet floor vote present; a noisy room without them votes absent', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<50 | 60>(50, 60),
        fc.double({ min: 0.05, max: 0.5, noNaN: true }),
        fc.integer({ min: 1, max: 1000 }),
        (hz, amp, seed) => {
          const n = RATE;
          const floor = noise(n, amp / 50, seed);
          const a = tone(n, 2 * hz, amp);
          const b = tone(n, 3 * hz, amp, 1);
          const humming = floor.map((x, i) => x + (a[i] as number) + (b[i] as number));
          expect(humVerdict(humming, RATE, hz).vote.direction).toBe('present');
        },
      ),
      { numRuns: 20 },
    );
    // An audible room with no hum (broadband noise): the harmonics sit at the floor.
    for (const hz of [50, 60] as const) {
      expect(humVerdict(noise(RATE, 0.2, 7), RATE, hz).vote.direction).toBe('absent');
    }
  });
});

describe('CR-03 the report crossing the network', () => {
  it('CR-03 every valid report is accepted as itself, senses de-duplicated and sorted', () => {
    fc.assert(
      fc.property(validReport, fc.string(), (r, epoch) => {
        const out = validateCrowdReport(r, epoch, NOW_MIN);
        expect(out).toEqual({ deviceEpoch: epoch, ...r, senses: [...new Set(r.senses)].sort() });
      }),
    );
  });

  it('CR-03 any extra field is refused, so nothing but the six fields can cross', () => {
    fc.assert(
      fc.property(
        validReport,
        fc
          .string({ minLength: 1 })
          .filter(
            (k) =>
              !['geohash6', 'minute', 'verdict', 'confidence', 'senses', 'restoreEdge'].includes(k),
          ),
        fc.jsonValue(),
        (r, key, value) => {
          const bad = JSON.parse(JSON.stringify({ ...r, [key]: value ?? null }));
          expect(validateCrowdReport(bad, 'e', NOW_MIN)).toBe('unexpected field');
        },
      ),
    );
    expect(
      validateCrowdReport(JSON.parse('{"__proto__":{"x":1},"geohash6":"u4pruy"}'), 'e', NOW_MIN),
    ).toBe('unexpected field');
  });

  it('CR-03 a bad cell, a skewed or fractional minute, a bad verdict, confidence or sense is refused', () => {
    fc.assert(
      fc.property(
        validReport,
        fc.oneof(
          fc
            .string()
            .filter((s) => !isGeohash6(s))
            .map((geohash6) => ({ geohash6 })),
          fc.integer({ min: 11, max: 1_000_000 }).map((d) => ({ minute: NOW_MIN + d })),
          fc.integer({ min: 11, max: 1_000_000 }).map((d) => ({ minute: NOW_MIN - d })),
          fc.double({ noInteger: true, noNaN: true }).map((minute) => ({ minute })),
          fc
            .string()
            .filter((v) => !['present', 'absent', 'unknown'].includes(v))
            .map((verdict) => ({ verdict })),
          fc
            .oneof(
              fc.double({ min: 1.000001 }),
              fc.double({ max: -0.000001 }),
              fc.constant(Number.NaN),
            )
            .map((confidence) => ({ confidence })),
          fc
            .string()
            .filter((s) => !SENSES.includes(s))
            .map((s) => ({ senses: [s] })),
          fc
            .array(fc.constantFrom(...SENSES), { minLength: 7, maxLength: 9 })
            .map((senses) => ({ senses })),
          fc.constantFrom(0, 1, 'true', null).map((restoreEdge) => ({ restoreEdge })),
        ),
        (r, patch) => {
          const out = validateCrowdReport({ ...r, ...patch }, 'e', NOW_MIN);
          expect(typeof out).toBe('string');
        },
      ),
    );
    for (const x of [null, [], 'report', 42, undefined]) {
      expect(validateCrowdReport(x, 'e', NOW_MIN)).toBe('not an object');
    }
  });
});

describe('CR-04 cell grids for the map', () => {
  it('CR-04 cellsAround returns rows × cols valid cells with the centre in the middle', () => {
    fc.assert(
      fc.property(
        cellArb,
        fc.integer({ min: 1, max: 7 }),
        fc.integer({ min: 1, max: 7 }),
        (c, cols, rows) => {
          const grid = cellsAround(c, cols, rows);
          expect(grid).toHaveLength(rows);
          for (const row of grid) {
            expect(row).toHaveLength(cols);
            for (const g of row) expect(isGeohash6(g)).toBe(true);
          }
          expect(grid[Math.floor(rows / 2)]?.[Math.floor(cols / 2)]).toBe(c);
          // Row by row from the north: latitude never increases going down.
          const lat = (g: string) => decodeCenter(g).lat;
          for (let r = 1; r < rows; r++) {
            expect(lat(grid[r]?.[0] as string)).toBeLessThanOrEqual(
              lat(grid[r - 1]?.[0] as string),
            );
          }
        },
      ),
    );
    expect(cellsAround('not-a-cell', 3, 3)).toEqual([]);
  });
});
