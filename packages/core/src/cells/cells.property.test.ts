import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { InvalidReportError, aggregateCell } from './aggregate.js';
import { decodeBounds, encodeGeohash, isGeohash6 } from './geohash.js';
import { type AggregateContext, type CellReport, K_ANONYMITY } from './types.js';

const CELL = 'u4pruy'; // a valid geohash-6

const verdictArb = () =>
  fc.constantFrom('present', 'absent', 'unknown') as fc.Arbitrary<CellReport['verdict']>;

const reportArb = (geohash6 = CELL): fc.Arbitrary<CellReport> =>
  fc.record({
    deviceEpoch: fc.constantFrom('d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'),
    geohash6: fc.constant(geohash6),
    minute: fc.integer({ min: 0, max: 60 }),
    verdict: verdictArb(),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    senses: fc.constant([]),
    restoreEdge: fc.boolean(),
  });

const reportsArb = () => fc.array(reportArb(), { maxLength: 40 });

const ctx = (over: Partial<AggregateContext> = {}): AggregateContext => ({
  windowStart: 0,
  ...over,
});

describe('Cells properties', () => {
  // CE-01: k-anonymity is never breached — a definite state implies >= k devices.
  it('CE-01 a definite state implies at least k distinct devices', () => {
    fc.assert(
      fc.property(reportsArb(), (reports) => {
        const state = aggregateCell(reports, ctx());
        if (state.state !== 'unknown') {
          expect(state.deviceCount).toBeGreaterThanOrEqual(K_ANONYMITY);
        }
      }),
    );
  });

  // CE-01b: one device reporting many times never reaches k alone.
  it('CE-01b a single device never reaches k', () => {
    fc.assert(
      fc.property(fc.array(reportArb(), { minLength: 1, maxLength: 50 }), (reports) => {
        const single = reports.map((r) => ({ ...r, deviceEpoch: 'only-one' }));
        const state = aggregateCell(single, ctx());
        expect(state.state).toBe('unknown');
        expect(state.deviceCount).toBeLessThanOrEqual(1);
      }),
    );
  });

  // CE-02: reports with an invalid geohash are rejected.
  it('CE-02 rejects non-geohash6 location', () => {
    const bad: CellReport = {
      deviceEpoch: 'd1',
      geohash6: 'abc', // too short + invalid chars
      minute: 0,
      verdict: 'absent',
      confidence: 1,
      senses: [],
      restoreEdge: false,
    };
    expect(() => aggregateCell([bad], ctx())).toThrow(InvalidReportError);
  });

  // CE-03: aggregation is order-independent and idempotent.
  it('CE-03 aggregation is commutative and idempotent', () => {
    fc.assert(
      fc.property(reportsArb(), (reports) => {
        const a = aggregateCell(reports, ctx());
        const b = aggregateCell([...reports].reverse(), ctx());
        const dup = aggregateCell([...reports, ...reports], ctx());
        expect(b).toEqual(a);
        expect(dup).toEqual(a);
      }),
    );
  });

  // CE-04: all-absent (>=k) is dark, all-present is lit, mixed is mixed.
  it('CE-04 state reflects the verdict mix', () => {
    const mk = (device: string, verdict: CellReport['verdict']): CellReport => ({
      deviceEpoch: device,
      geohash6: CELL,
      minute: 1,
      verdict,
      confidence: 1,
      senses: [],
      restoreEdge: false,
    });
    const fiveAbsent = ['a', 'b', 'c', 'd', 'e'].map((d) => mk(d, 'absent'));
    const fivePresent = ['a', 'b', 'c', 'd', 'e'].map((d) => mk(d, 'present'));
    const mixed = [
      mk('a', 'absent'),
      mk('b', 'absent'),
      mk('c', 'absent'),
      mk('d', 'present'),
      mk('e', 'present'),
    ];
    expect(aggregateCell(fiveAbsent, ctx()).state).toBe('dark');
    expect(aggregateCell(fivePresent, ctx()).state).toBe('lit');
    expect(aggregateCell(mixed, ctx()).state).toBe('mixed');
  });

  // CE-05: comingBack requires a prior dark state AND >= k restore edges in window.
  it('CE-05 restoration requires prior dark and k restore edges', () => {
    const mk = (device: string): CellReport => ({
      deviceEpoch: device,
      geohash6: CELL,
      minute: 5,
      verdict: 'present',
      confidence: 1,
      senses: [],
      restoreEdge: true,
    });
    const fiveRestore = ['a', 'b', 'c', 'd', 'e'].map(mk);
    // prior dark -> comingBack
    expect(aggregateCell(fiveRestore, ctx({ priorState: 'dark' })).state).toBe('comingBack');
    // no prior dark -> never comingBack
    expect(aggregateCell(fiveRestore, ctx({ priorState: 'lit' })).state).not.toBe('comingBack');
    // below k restore edges -> not comingBack even if prior dark
    const fourRestore = ['a', 'b', 'c', 'd'].map(mk);
    expect(aggregateCell(fourRestore, ctx({ priorState: 'dark' })).state).toBe('unknown');
  });

  // CE-06: geohash encode/decode round-trips within the cell bounds.
  it('CE-06 geohash round-trips within bounds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -89.9, max: 89.9, noNaN: true }),
        fc.double({ min: -179.9, max: 179.9, noNaN: true }),
        (lat, lng) => {
          const gh = encodeGeohash({ lat, lng });
          expect(isGeohash6(gh)).toBe(true);
          const b = decodeBounds(gh);
          expect(lat).toBeGreaterThanOrEqual(b.latMin);
          expect(lat).toBeLessThanOrEqual(b.latMax);
          expect(lng).toBeGreaterThanOrEqual(b.lngMin);
          expect(lng).toBeLessThanOrEqual(b.lngMax);
        },
      ),
    );
  });

  // CE-07: every published artifact is cell-granular — deviceCount is the only
  // count, no per-device data leaks into the state.
  it('CE-07 published state exposes nothing finer than the cell', () => {
    fc.assert(
      fc.property(reportsArb(), (reports) => {
        const state = aggregateCell(reports, ctx());
        const keys = Object.keys(state).sort();
        expect(keys).toEqual(['deviceCount', 'geohash6', 'provenance', 'state', 'windowStart']);
        // geohash is exactly a cell, never finer
        if (state.geohash6) expect(isGeohash6(state.geohash6)).toBe(true);
      }),
    );
  });

  // CE-08: provenance includes 'crowd' when devices contributed, plus extras.
  it('CE-08 provenance is explicit', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((d) => ({
      deviceEpoch: d,
      geohash6: CELL,
      minute: 1,
      verdict: 'absent' as const,
      confidence: 1,
      senses: [],
      restoreEdge: false,
    }));
    const state = aggregateCell(five, ctx({ extraProvenance: ['satellite'] }));
    expect(state.provenance).toContain('crowd');
    expect(state.provenance).toContain('satellite');
  });
});
