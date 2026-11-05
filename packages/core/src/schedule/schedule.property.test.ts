import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scoreAdherence } from './adherence.js';
import { InvalidWindowError, mergeSchedule, nextWindow } from './merge.js';
import type { ObservedInterval, ScheduleWindow } from './types.js';

const windowArb = (): fc.Arbitrary<ScheduleWindow> =>
  fc
    .record({
      areaId: fc.constantFrom('area-1', 'area-2'),
      start: fc.integer({ min: 0, max: 200 }),
      len: fc.integer({ min: 1, max: 60 }),
      source: fc.constantFrom('eskomsepush', 'yasno', 'manual'),
      fetchedAt: fc.integer({ min: 0, max: 1000 }),
    })
    .map(({ areaId, start, len, source, fetchedAt }) => ({
      areaId,
      startMinute: start,
      endMinute: start + len,
      source,
      fetchedAt,
    }));

const windowsArb = () => fc.array(windowArb(), { maxLength: 25 });

const observedArb = (): fc.Arbitrary<ObservedInterval> =>
  fc
    .record({ start: fc.integer({ min: 0, max: 260 }), len: fc.integer({ min: 1, max: 60 }) })
    .map(({ start, len }) => ({ startMinute: start, endMinute: start + len }));

describe('Schedule properties', () => {
  // SC-01: merge is deterministic, order-independent, and idempotent.
  it('SC-01 merge is commutative and idempotent', () => {
    fc.assert(
      fc.property(windowsArb(), (windows) => {
        const a = mergeSchedule(windows);
        const b = mergeSchedule([...windows].reverse());
        const dup = mergeSchedule([...windows, ...windows]);
        expect(b).toEqual(a);
        expect(dup).toEqual(a);
      }),
      { numRuns: 5000 },
    );
  });

  // SC-01 regression: windows identical except areaId must merge identically in any
  // order (shrunken counterexample, recorded in docs/kiro/pbt-catches.md).
  it('SC-01 regression: same span and source, different areas, any order', () => {
    const a: ScheduleWindow = {
      areaId: 'area-2',
      startMinute: 151,
      endMinute: 209,
      source: 'eskomsepush',
      fetchedAt: 0,
    };
    const b: ScheduleWindow = { ...a, areaId: 'area-1' };
    expect(mergeSchedule([a, b])).toEqual(mergeSchedule([b, a]));
  });

  // SC-01b: the merged timeline is sorted by startMinute.
  it('SC-01b merged timeline is sorted ascending', () => {
    fc.assert(
      fc.property(windowsArb(), (windows) => {
        const merged = mergeSchedule(windows);
        for (let i = 1; i < merged.length; i++) {
          expect((merged[i] as ScheduleWindow).startMinute).toBeGreaterThanOrEqual(
            (merged[i - 1] as ScheduleWindow).startMinute,
          );
        }
      }),
    );
  });

  // SC-02: within a source, no two merged windows overlap or touch.
  it('SC-02 coalesces overlapping/contiguous windows within a source', () => {
    fc.assert(
      fc.property(windowsArb(), (windows) => {
        const merged = mergeSchedule(windows);
        // group by area+source and assert gaps
        const groups = new Map<string, ScheduleWindow[]>();
        for (const w of merged) {
          const key = `${w.areaId}\u0000${w.source}`;
          const g = groups.get(key) ?? [];
          g.push(w);
          groups.set(key, g);
        }
        for (const g of groups.values()) {
          const sorted = [...g].sort((x, y) => x.startMinute - y.startMinute);
          for (let i = 1; i < sorted.length; i++) {
            // strictly after the previous end (contiguous would have coalesced)
            expect((sorted[i] as ScheduleWindow).startMinute).toBeGreaterThan(
              (sorted[i - 1] as ScheduleWindow).endMinute,
            );
          }
        }
      }),
    );
  });

  // SC-03: sources are kept distinct — no merged window invents a source.
  it('SC-03 keeps sources distinct', () => {
    fc.assert(
      fc.property(windowsArb(), (windows) => {
        const inputSources = new Set(windows.map((w) => w.source));
        const outSources = new Set(mergeSchedule(windows).map((w) => w.source));
        for (const s of outSources) expect(inputSources.has(s)).toBe(true);
      }),
    );
  });

  // SC-04: invalid windows are rejected.
  it('SC-04 rejects invalid windows', () => {
    expect(() =>
      mergeSchedule([{ areaId: 'a', source: 's', startMinute: 10, endMinute: 10, fetchedAt: 0 }]),
    ).toThrow(InvalidWindowError);
    expect(() =>
      mergeSchedule([{ areaId: '', source: 's', startMinute: 0, endMinute: 5, fetchedAt: 0 }]),
    ).toThrow(InvalidWindowError);
  });

  // SC-05: adherence is in [0,1], and unknown when nothing promised.
  it('SC-05 adherence is bounded and unknown when nothing promised', () => {
    fc.assert(
      fc.property(windowsArb(), fc.array(observedArb(), { maxLength: 20 }), (windows, observed) => {
        const a = scoreAdherence(windows, observed);
        if (windows.length === 0) {
          expect(a.kind).toBe('unknown');
        } else if (a.kind === 'score') {
          expect(a.value).toBeGreaterThanOrEqual(0);
          expect(a.value).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  // SC-06: adherence is monotone — adding observed outage never lowers the score.
  it('SC-06 adherence is monotone in observed overlap', () => {
    fc.assert(
      fc.property(
        fc.array(windowArb(), { minLength: 1, maxLength: 10 }),
        fc.array(observedArb(), { maxLength: 10 }),
        observedArb(),
        (windows, observed, extra) => {
          const before = scoreAdherence(windows, observed);
          const after = scoreAdherence(windows, [...observed, extra]);
          if (before.kind === 'score' && after.kind === 'score') {
            expect(after.value).toBeGreaterThanOrEqual(before.value - 1e-9);
          }
        },
      ),
    );
  });

  // SC-07: nextWindow returns the earliest window at/after the minute, or none.
  it('SC-07 next-window is correct and fail-closed', () => {
    fc.assert(
      fc.property(windowsArb(), fc.integer({ min: 0, max: 300 }), (windows, minute) => {
        const timeline = mergeSchedule(windows);
        const next = nextWindow(timeline, minute);
        const candidates = timeline.filter((w) => w.startMinute >= minute);
        if (candidates.length === 0) {
          expect(next.kind).toBe('none');
        } else {
          const earliest = Math.min(...candidates.map((w) => w.startMinute));
          expect(next.kind).toBe('window');
          if (next.kind === 'window') expect(next.window.startMinute).toBe(earliest);
        }
      }),
    );
  });
});
