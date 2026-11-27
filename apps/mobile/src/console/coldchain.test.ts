import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Fridge, LogEntry, Site } from './api';
import { coldChainReport, generatorSummary, summariseFridges } from './coldchain';

/**
 * The cold-chain report (.kiro/specs/consoles BC-04): each fridge's excursions outside
 * its range, from the first reading out to the first reading back in, never
 * interpolated; and the generator's log.
 */

const T0 = Date.UTC(2026, 10, 27, 6, 0, 0);
const fridge: Fridge = { id: 'vax-1', name: 'Vaccine fridge', minC: 2, maxC: 8 };
const site = (fridges: readonly Fridge[] = [fridge]): Site => ({
  siteId: 'site-01',
  name: 'Clinic',
  kind: 'clinic',
  geohash6: 'u4pruy',
  lat: 1,
  lng: 2,
  fridges,
  status: null,
});
const reading = (tempC: number, atMs: number, fridgeId = fridge.id): LogEntry => ({
  kind: 'reading',
  fridgeId,
  tempC,
  atMs,
});

/** Readings at distinct minutes (staff log one reading per fridge at a time). */
const readingsArb = fc.uniqueArray(
  fc.record({ tempC: fc.integer({ min: -30, max: 30 }), at: fc.integer({ min: 0, max: 10_000 }) }),
  { selector: (r) => r.at, maxLength: 40 },
);
const classify = (t: number) => (t > fridge.maxC ? 'warm' : t < fridge.minC ? 'cold' : null);

describe('Cold-chain (BC-04)', () => {
  it('BC-04 every out-of-range reading lies in exactly one excursion of its own direction, and in-range readings in none', () => {
    fc.assert(
      fc.property(readingsArb, (rs) => {
        const entries = rs.map((r) => reading(r.tempC, T0 + r.at * 60_000));
        const [s] = summariseFridges(site(), entries);
        const xs = s?.excursions ?? [];
        const sorted = [...entries].sort((a, b) => a.atMs - b.atMs) as Extract<
          LogEntry,
          { kind: 'reading' }
        >[];
        for (const x of xs) {
          // The worst reading is on the excursion's own side of the range.
          if (x.direction === 'warm') expect(x.worstC).toBeGreaterThan(fridge.maxC);
          else expect(x.worstC).toBeLessThan(fridge.minC);
          if (x.endMs !== null) expect(x.endMs).toBeGreaterThanOrEqual(x.startMs);
        }
        // Excursions do not overlap and are in time order.
        for (let i = 1; i < xs.length; i++) {
          const prev = xs[i - 1];
          expect(prev?.endMs).not.toBeNull();
          expect((xs[i] as { startMs: number }).startMs).toBeGreaterThanOrEqual(
            prev?.endMs as number,
          );
        }
        // Every out-of-range reading starts or continues an excursion of its direction.
        for (const r of sorted) {
          const dir = classify(r.tempC);
          if (!dir) continue;
          const inside = xs.filter(
            (x) => r.atMs >= x.startMs && (x.endMs === null || r.atMs < x.endMs),
          );
          expect(inside).toHaveLength(1);
          expect(inside[0]?.direction).toBe(dir);
        }
        // Only readings: an excursion never starts or ends between two logged readings.
        for (const x of xs) {
          expect(sorted.some((r) => r.atMs === x.startMs)).toBe(true);
          if (x.endMs !== null) expect(sorted.some((r) => r.atMs === x.endMs)).toBe(true);
        }
      }),
    );
  });

  it('BC-04 regression: a fridge that goes from too warm straight to too cold has two excursions', () => {
    // Shrunk counterexample (2026-11-27): readings 9 °C then 0 °C a minute later (range 2–8)
    // came out as one "too warm" excursion whose worst reading was 0 °C.
    const [s] = summariseFridges(site(), [reading(9, T0), reading(0, T0 + 60_000)]);
    expect(s?.excursions).toEqual([
      { fridgeId: 'vax-1', startMs: T0, endMs: T0 + 60_000, worstC: 9, direction: 'warm' },
      { fridgeId: 'vax-1', startMs: T0 + 60_000, endMs: null, worstC: 0, direction: 'cold' },
    ]);
  });

  it('BC-04 the summary counts only that fridge’s readings, with its min, max and last', () => {
    fc.assert(
      fc.property(readingsArb, readingsArb, (mine, others) => {
        const entries = [
          ...mine.map((r) => reading(r.tempC, T0 + r.at * 60_000)),
          ...others.map((r) => reading(r.tempC, T0 + r.at * 60_000, 'other')),
        ];
        const [s] = summariseFridges(site(), entries);
        expect(s?.readings).toBe(mine.length);
        const temps = mine.map((r) => r.tempC);
        expect(s?.minC).toBe(temps.length ? Math.min(...temps) : null);
        expect(s?.maxC).toBe(temps.length ? Math.max(...temps) : null);
        const lastAt = mine.length ? Math.max(...mine.map((r) => r.at)) : null;
        expect(s?.lastAtMs).toBe(lastAt === null ? null : T0 + lastAt * 60_000);
      }),
    );
  });

  it('BC-04 the generator log counts starts and litres added, in time order', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            event: fc.constantFrom('start' as const, 'stop' as const, 'refuel' as const),
            litres: fc.option(fc.integer({ min: 1, max: 200 }), { nil: null }),
            at: fc.integer({ min: 0, max: 10_000 }),
          }),
          { maxLength: 30 },
        ),
        (gs) => {
          const entries: LogEntry[] = gs.map((g) => ({
            kind: 'generator',
            event: g.event,
            litres: g.litres,
            atMs: T0 + g.at * 60_000,
          }));
          const out = generatorSummary([...entries, reading(5, T0)]);
          expect(out.starts).toBe(gs.filter((g) => g.event === 'start').length);
          expect(out.litres).toBe(
            gs.reduce((s, g) => s + (g.event === 'refuel' ? (g.litres ?? 0) : 0), 0),
          );
          expect(out.events.map((e) => e.atMs)).toEqual(
            entries.map((e) => e.atMs).sort((a, b) => a - b),
          );
        },
      ),
    );
  });

  it('BC-04 the printable report names each fridge and its range, says when nothing was logged, and defers stock decisions', () => {
    const text = coldChainReport(
      site([fridge, { id: 'f2', name: 'Spare fridge', minC: 0, maxC: 4 }]),
      [reading(10, T0), reading(5, T0 + 30 * 60_000)],
      30,
      T0 + 3600_000,
    );
    expect(text).toContain('Cold-chain report: Clinic');
    expect(text).toContain('Vaccine fridge (safe range 2 to 8 °C)');
    expect(text).toContain('too warm, worst 10 °C');
    expect(text).toContain('at most 30 minutes between readings');
    expect(text).toContain('Spare fridge (safe range 0 to 4 °C)\n- No readings logged.');
    expect(text).toContain('Generator: 0 starts, 0 litres added');
    expect(text).toContain('your pharmacist or supervisor');
  });
});
