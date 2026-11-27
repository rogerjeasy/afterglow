import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type CellReport, K_ANONYMITY } from './types.js';
import { cellStateAt, cellTimeline } from './window.js';

const CELL = 'u4pruy';
const OTHER = 'u4pruz';

const mk = (
  device: string,
  minute: number,
  verdict: CellReport['verdict'],
  restoreEdge = false,
  geohash6 = CELL,
): CellReport => ({
  deviceEpoch: device,
  geohash6,
  minute,
  verdict,
  confidence: 1,
  senses: [],
  restoreEdge,
});

const reportArb: fc.Arbitrary<CellReport> = fc.record({
  deviceEpoch: fc.constantFrom('d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'),
  geohash6: fc.constantFrom(CELL, OTHER),
  minute: fc.integer({ min: 0, max: 120 }),
  verdict: fc.constantFrom('present', 'absent', 'unknown') as fc.Arbitrary<CellReport['verdict']>,
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  senses: fc.constant([] as string[]),
  restoreEdge: fc.boolean(),
});
const reportsArb = fc.array(reportArb, { maxLength: 60 });
const nowArb = fc.integer({ min: 0, max: 130 });

const devices = (n: number): string[] => Array.from({ length: n }, (_, i) => `dev${i}`);

describe('Cells windowing properties', () => {
  // CE-09: no report from the future changes the answer.
  it('CE-09 reports after now are ignored', () => {
    fc.assert(
      fc.property(reportsArb, nowArb, (reports, now) => {
        const past = reports.filter((r) => r.minute <= now);
        expect(cellStateAt(CELL, reports, now)).toEqual(cellStateAt(CELL, past, now));
      }),
    );
  });

  // CE-09: nor do reports older than the 30-minute window.
  it('CE-09 reports 30 or more minutes old are ignored', () => {
    fc.assert(
      fc.property(reportsArb, nowArb, (reports, now) => {
        const recent = reports.filter((r) => r.minute > now - 30);
        expect(cellStateAt(CELL, reports, now)).toEqual(cellStateAt(CELL, recent, now));
      }),
    );
  });

  // CE-10: a device that said dark then lit counts as lit.
  it('CE-10 a device counts once, by its latest word', () => {
    const flipped = devices(5).flatMap((d) => [mk(d, 10, 'absent'), mk(d, 20, 'present')]);
    expect(cellStateAt(CELL, flipped, 25).state).toBe('lit');
    const dark = devices(5).flatMap((d) => [mk(d, 10, 'present'), mk(d, 20, 'absent')]);
    expect(cellStateAt(CELL, dark, 25).state).toBe('dark');
  });

  // CE-10: a conflicting pair at one minute is unknown, and the order of arrival never matters.
  it('CE-10 conflicting verdicts at the latest minute become unknown, in either order', () => {
    const a = [mk('x', 10, 'present'), mk('x', 10, 'absent')];
    const b = [...a].reverse();
    const withFour = (extra: CellReport[]): CellReport[] => [
      ...devices(4).map((d) => mk(d, 10, 'absent')),
      ...extra,
    ];
    // x is unknown, so it does not reach k: four definite devices is below k.
    expect(cellStateAt(CELL, withFour(a), 12)).toEqual(cellStateAt(CELL, withFour(b), 12));
    expect(cellStateAt(CELL, withFour(a), 12).state).toBe('unknown');
    expect(cellStateAt(CELL, withFour(a), 12).deviceCount).toBe(4);
  });

  // CE-11: order and duplication never matter.
  it('CE-11 windowed state is order-independent and idempotent', () => {
    fc.assert(
      fc.property(reportsArb, nowArb, (reports, now) => {
        const base = cellStateAt(CELL, reports, now);
        expect(cellStateAt(CELL, [...reports].reverse(), now)).toEqual(base);
        expect(cellStateAt(CELL, [...reports, ...reports], now)).toEqual(base);
      }),
    );
  });

  // CE-11: k holds through the window layer.
  it('CE-11 a definite state implies at least k distinct devices', () => {
    fc.assert(
      fc.property(
        reportsArb,
        nowArb,
        fc.constantFrom<'dark' | 'lit' | 'mixed' | 'comingBack' | 'unknown' | undefined>(
          undefined,
          'dark',
          'comingBack',
          'lit',
        ),
        (reports, now, prior) => {
          const s = cellStateAt(CELL, reports, now, prior);
          if (s.state !== 'unknown') expect(s.deviceCount).toBeGreaterThanOrEqual(K_ANONYMITY);
        },
      ),
    );
  });

  // CE-11: asking about a cell with no reports names that cell and says unknown.
  it('CE-11 an empty window names the cell and is unknown with zero devices', () => {
    const s = cellStateAt(CELL, [], 50);
    expect(s).toMatchObject({ geohash6: CELL, state: 'unknown', deviceCount: 0 });
    // Reports for another cell never leak in.
    const other = devices(8).map((d) => mk(d, 49, 'absent', false, OTHER));
    expect(cellStateAt(CELL, other, 50)).toMatchObject({ state: 'unknown', deviceCount: 0 });
  });

  // CE-12: a restore edge older than 10 minutes does not say "coming back".
  it('CE-12 stale restore edges do not say coming back', () => {
    const edges = devices(5).map((d) => mk(d, 100, 'present', true));
    expect(cellStateAt(CELL, edges, 105, 'dark').state).toBe('comingBack');
    expect(cellStateAt(CELL, edges, 110, 'dark').state).not.toBe('comingBack');
    expect(cellStateAt(CELL, edges, 125, 'dark').state).not.toBe('comingBack');
  });

  // CE-12: "coming back" lasts while the edges are fresh, and then the cell is lit.
  it('CE-12 comingBack persists through its fresh edges, then settles to lit', () => {
    const edges = devices(6).map((d) => mk(d, 100, 'present', true));
    const first = cellStateAt(CELL, edges, 102, 'dark');
    expect(first.state).toBe('comingBack');
    const second = cellStateAt(CELL, edges, 107, first.state);
    expect(second.state).toBe('comingBack');
    const third = cellStateAt(CELL, edges, 112, second.state);
    expect(third.state).toBe('lit');
  });

  // CE-12: a cell that was never dark cannot come back.
  it('CE-12 a cell that was not dark does not come back', () => {
    const edges = devices(6).map((d) => mk(d, 100, 'present', true));
    for (const prior of [undefined, 'lit', 'unknown'] as const) {
      expect(cellStateAt(CELL, edges, 102, prior).state).toBe('lit');
    }
  });

  // pbt-catches 2026-11-27 (SIM-04): restores trickle in, so a dark cell is briefly
  // `mixed` before k restore edges arrive. A partly dark cell can come back.
  it('CE-12 a partly dark (mixed) cell comes back once k devices report a restore edge', () => {
    const edges = devices(6).map((d) => mk(d, 100, 'present', true));
    expect(cellStateAt(CELL, edges, 102, 'mixed').state).toBe('comingBack');
  });

  it('CE-13 a dark cell whose restores trickle in still passes through coming back', () => {
    const ds = devices(8);
    const reports: CellReport[] = [
      ...ds.map((d) => mk(d, 20, 'absent')),
      // Re-confirmed while the verdict holds (CR-16), so the dark is not forgotten.
      ...ds.map((d) => mk(d, 45, 'absent')),
      // Two phones see the power first: the cell is mixed, not yet k restore edges.
      ...ds.slice(0, 2).map((d) => mk(d, 60, 'present', true)),
      // A minute later the rest follow.
      ...ds.slice(2).map((d) => mk(d, 61, 'present', true)),
    ];
    const states: string[] = [];
    for (const s of cellTimeline(CELL, reports, 30, 70, 1)) {
      if (states[states.length - 1] !== s.state) states.push(s.state);
    }
    expect(states).toEqual(['dark', 'mixed', 'comingBack']);
  });

  // Q1: with change-only reports a held verdict is forgotten after 30 minutes. Fail closed.
  it('Q1 a verdict nobody repeats falls back to unknown after 30 minutes', () => {
    const once = devices(6).map((d) => mk(d, 20, 'absent'));
    expect(cellStateAt(CELL, once, 25).state).toBe('dark');
    expect(cellStateAt(CELL, once, 49).state).toBe('dark');
    expect(cellStateAt(CELL, once, 50).state).toBe('unknown');
  });

  // CE-13: a timeline walks the night: lit, dark, coming back, lit.
  it('CE-13 a timeline threads each window into the next', () => {
    const reports: CellReport[] = [
      ...devices(6).map((d) => mk(d, 0, 'present')),
      ...devices(6).map((d) => mk(d, 20, 'absent')),
      // A re-confirmation while the verdict holds (Q1), so the dark is not forgotten.
      ...devices(6).map((d) => mk(d, 40, 'absent')),
      ...devices(6).map((d) => mk(d, 60, 'present', true)),
    ];
    const line = cellTimeline(CELL, reports, 5, 90, 5);
    const at = (m: number): string => line.find((s) => s.windowStart === m)?.state ?? 'missing';
    expect(at(10)).toBe('lit');
    expect(at(25)).toBe('dark');
    expect(at(45)).toBe('dark');
    expect(at(60)).toBe('comingBack');
    expect(at(65)).toBe('comingBack');
    expect(at(70)).toBe('lit'); // the edges are now exactly 10 minutes old: stale
    expect(at(80)).toBe('lit');
  });

  it('CE-13 a timeline is one state per step, in order, each k-gated', () => {
    fc.assert(
      fc.property(reportsArb, (reports) => {
        const line = cellTimeline(CELL, reports, 0, 120, 5);
        expect(line).toHaveLength(25);
        line.forEach((s, i) => {
          expect(s.windowStart).toBe(i * 5);
          if (s.state !== 'unknown') expect(s.deviceCount).toBeGreaterThanOrEqual(K_ANONYMITY);
        });
      }),
    );
  });

  // CE-13: the sorted, sliced timeline is exactly the plain one-step-at-a-time answer.
  it('CE-13 a timeline equals calling cellStateAt step by step on everything', () => {
    fc.assert(
      fc.property(reportsArb, fc.integer({ min: 1, max: 9 }), (reports, step) => {
        const line = cellTimeline(CELL, reports, 0, 125, step);
        const naive = [];
        let prior: Parameters<typeof cellStateAt>[3];
        for (let t = 0; t <= 125; t += step) {
          const s = cellStateAt(CELL, reports, t, prior);
          naive.push(s);
          prior = s.state;
        }
        expect(line).toEqual(naive);
      }),
    );
  });

  it('CE-13 unusable arguments give an empty timeline, not a loop', () => {
    expect(cellTimeline(CELL, [], 10, 5, 5)).toEqual([]);
    expect(cellTimeline(CELL, [], 0, 100, 0)).toEqual([]);
    expect(cellTimeline(CELL, [], 0, Number.POSITIVE_INFINITY, 5)).toEqual([]);
    expect(cellTimeline(CELL, [], 0.5, 10, 5)).toEqual([]);
    expect(cellTimeline(CELL, [], 0, 1_000_000, 1)).toEqual([]);
  });
});
