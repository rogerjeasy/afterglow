import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HOLD_MINUTES, WINDOW_MINUTES, type Window, summarise } from './history.js';

/**
 * Cell history (.kiro/specs/consoles HC-02): each recorded 5-minute window holds until
 * the next one for at most 15 minutes, so a gap in reports is never an outage, and the
 * current minute counts. Checked against a minute-by-minute reference.
 */

const NOW = Math.floor(Date.UTC(2026, 10, 27, 12, 0, 0) / 60_000);
const STATES = ['dark', 'lit', 'mixed', 'comingBack'] as const;

/** The state each minute in [from, now] takes, by the rule as written in the spec. */
function reference(windows: readonly Window[], from: number, now: number) {
  const ws = [...windows].sort((a, b) => a.windowStart - b.windowStart);
  const at = (m: number): Window['state'] | null => {
    let best: Window | null = null;
    for (const w of ws) if (w.windowStart <= m) best = w;
    if (!best) return null;
    const next = ws.find((w) => w.windowStart > (best as Window).windowStart);
    const end = Math.min(
      next?.windowStart ?? Number.POSITIVE_INFINITY,
      best.windowStart + HOLD_MINUTES,
    );
    return m < end ? best.state : null;
  };
  let dark = 0;
  let known = 0;
  let outages = 0;
  let longest = 0;
  let run = 0;
  let lastDark: number | null = null;
  const daily = new Map<string, number>();
  for (let m = from; m <= now; m++) {
    const s = at(m);
    if (s !== null) known++;
    if (s === 'dark') {
      dark++;
      if (run === 0) outages++;
      run++;
      longest = Math.max(longest, run);
      lastDark = m + 1;
      const day = new Date((m - (m % 1440)) * 60_000).toISOString().slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + 1);
    } else {
      run = 0;
    }
  }
  return { dark, known, outages, longest, lastDark, daily };
}

const windowsArb = (from: number, now: number) =>
  fc.uniqueArray(
    fc.record({
      windowStart: fc
        .integer({ min: Math.floor((from - 60) / 5), max: Math.floor((now + 10) / 5) })
        .map((i) => i * WINDOW_MINUTES),
      state: fc.constantFrom(...STATES),
      deviceCount: fc.integer({ min: 5, max: 50 }),
    }),
    { selector: (w) => w.windowStart, maxLength: 80 },
  );

describe('Cell history (HC-02)', () => {
  it('HC-02 dark, known, outages and longest match the minute-by-minute hold-for-15-minutes rule', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 30, max: 2 * 1440 })
          .chain((span) => fc.tuple(fc.constant(NOW - span), windowsArb(NOW - span, NOW))),
        ([from, ws]) => {
          const h = summarise('u4pruy', ws, from, NOW);
          const ref = reference(ws, from, NOW);
          expect(h.darkMinutes).toBe(ref.dark);
          expect(h.knownMinutes).toBe(ref.known);
          expect(h.outages).toBe(ref.outages);
          expect(h.longestDarkMinutes).toBe(ref.longest);
          expect(h.lastDarkMinute).toBe(ref.lastDark);
          for (const d of h.daily) expect(d.darkMinutes).toBe(ref.daily.get(d.day) ?? 0);
          expect(h.daily.reduce((s, d) => s + d.darkMinutes, 0)).toBe(h.darkMinutes);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('HC-02 a gap in reports is never counted: each window holds at most 15 minutes', () => {
    fc.assert(
      fc.property(windowsArb(NOW - 1440, NOW), (ws) => {
        const h = summarise('u4pruy', ws, NOW - 1440, NOW);
        expect(h.knownMinutes).toBeLessThanOrEqual(HOLD_MINUTES * ws.length);
        expect(h.darkMinutes).toBeLessThanOrEqual(
          HOLD_MINUTES * ws.filter((w) => w.state === 'dark').length,
        );
        expect(h.darkMinutes).toBeLessThanOrEqual(h.knownMinutes);
        expect(h.knownMinutes).toBeLessThanOrEqual(1441);
        expect(h.outages === 0).toBe(h.darkMinutes === 0);
      }),
    );
  });

  it('HC-02 an outage that began this minute is one outage of one minute', () => {
    const h = summarise(
      'u4pruy',
      [{ windowStart: NOW, state: 'dark', deviceCount: 5 }],
      NOW - 60,
      NOW,
    );
    expect(h).toMatchObject({
      darkMinutes: 1,
      outages: 1,
      longestDarkMinutes: 1,
      lastDarkMinute: NOW + 1,
    });
    // Two dark windows 20 minutes apart are two outages: the 5 minutes between are unknown.
    const two = summarise(
      'u4pruy',
      [
        { windowStart: NOW - 40, state: 'dark', deviceCount: 5 },
        { windowStart: NOW - 20, state: 'dark', deviceCount: 5 },
      ],
      NOW - 60,
      NOW,
    );
    expect(two).toMatchObject({ darkMinutes: 30, outages: 2, longestDarkMinutes: 15 });
  });
});
