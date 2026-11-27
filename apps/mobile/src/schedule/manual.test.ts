import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseSchedule, scheduleNow } from './manual';

/**
 * The manual schedule (.kiro/specs/consoles SC-01): windows a utility announced, typed
 * or pasted; read line by line, never guessed, merged by the core, with the window now
 * and the next one.
 */

const NOW = new Date(2026, 10, 27, 15, 12, 0).getTime(); // a Friday, local time
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const timeArb = fc.record({
  h: fc.integer({ min: 0, max: 23 }),
  m: fc.integer({ min: 0, max: 59 }),
});
const sepArb = fc.constantFrom('-', ' - ', '–', ' to ', ' until ');
const dayArb = fc.oneof(
  fc.constant({ word: '', offset: 0 as number | null, weekday: null as number | null }),
  fc.constant({ word: 'today ', offset: 0, weekday: null }),
  fc.constant({ word: 'Tomorrow ', offset: 1, weekday: null }),
  fc.integer({ min: 0, max: 6 }).map((i) => ({ word: `${DAYS[i]} `, offset: null, weekday: i })),
  fc
    .integer({ min: 0, max: 6 })
    .map((i) => ({ word: `${(DAYS[i] as string).toUpperCase()}day: `, offset: null, weekday: i })),
);

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
};

describe('Manual schedule (SC-01)', () => {
  it('SC-01 every announced line becomes one window on the right day, past midnight when it ends before it starts', () => {
    fc.assert(
      fc.property(
        dayArb,
        timeArb,
        timeArb,
        sepArb,
        fc.constantFrom(':', 'h', '.'),
        (day, a, b, sep, colon) => {
          const line = `${day.word}${pad(a.h)}${colon}${pad(a.m)}${sep}${b.h}${colon}${pad(b.m)}`;
          const { windows, unread } = parseSchedule(line, NOW);
          expect(unread).toEqual([]);
          expect(windows).toHaveLength(1);
          const w = windows[0] as { startMs: number; endMs: number };
          const start = new Date(w.startMs);
          expect([start.getHours(), start.getMinutes()]).toEqual([a.h, a.m]);
          const dayOffset = Math.round(
            (startOfDay(w.startMs).getTime() - startOfDay(NOW).getTime()) / (24 * HOUR),
          );
          if (day.offset !== null) expect(dayOffset).toBe(day.offset);
          else {
            expect(start.getDay()).toBe(day.weekday);
            expect(dayOffset).toBeGreaterThanOrEqual(0);
            expect(dayOffset).toBeLessThan(7);
          }
          expect(w.endMs).toBeGreaterThan(w.startMs);
          // At most a day (plus an hour for a clock change).
          expect(w.endMs - w.startMs).toBeLessThanOrEqual(25 * HOUR);
          const end = new Date(w.endMs);
          expect([end.getHours(), end.getMinutes()]).toEqual([b.h, b.m]);
          const crosses = b.h * 60 + b.m <= a.h * 60 + a.m;
          expect(startOfDay(w.endMs).getTime() > startOfDay(w.startMs).getTime()).toBe(crosses);
        },
      ),
    );
  });

  it('SC-01 a date written in full is that date', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date(2026, 0, 1), max: new Date(2027, 11, 31) }),
        timeArb,
        (d, a) => {
          const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          const { windows } = parseSchedule(
            `${iso} ${pad(a.h)}:${pad(a.m)}-${pad((a.h + 2) % 24)}:${pad(a.m)}`,
            NOW,
          );
          const s = new Date(windows[0]?.startMs ?? 0);
          expect([
            s.getFullYear(),
            s.getMonth(),
            s.getDate(),
            s.getHours(),
            s.getMinutes(),
          ]).toEqual([d.getFullYear(), d.getMonth(), d.getDate(), a.h, a.m]);
        },
      ),
    );
  });

  it('SC-01 a line it cannot read is given back unread, never guessed', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/\d{1,2}[:h.]\d{2}/.test(s)),
        (line) => {
          const { windows, unread } = parseSchedule(line, NOW);
          expect(windows).toEqual([]);
          expect(unread).toEqual(
            line
              .split(/\n|;/)
              .map((l) => l.trim())
              .filter(Boolean),
          );
        },
      ),
    );
    expect(parseSchedule('25:00-26:00\n18:61-19:00\nlundi 18:00-20:00', NOW)).toEqual({
      windows: [],
      unread: ['25:00-26:00', '18:61-19:00', 'lundi 18:00-20:00'],
    });
    const mixed = parseSchedule('Stage 2:\n18:00-20:30; tomorrow 06:00-08:30', NOW);
    expect(mixed.windows).toHaveLength(2);
    expect(mixed.unread).toEqual(['Stage 2:']);
  });

  it('SC-01 the window now and the next one come from the merged timeline', () => {
    const windowsArb = fc.array(
      fc
        .record({
          from: fc.integer({ min: -48 * 60, max: 48 * 60 }),
          len: fc.integer({ min: 1, max: 6 * 60 }),
        })
        .map((w) => ({
          startMs: NOW + w.from * MIN,
          endMs: NOW + (w.from + w.len) * MIN,
        })),
      { maxLength: 12 },
    );
    fc.assert(
      fc.property(windowsArb, (ws) => {
        const { timeline, current, next } = scheduleNow(ws, NOW);
        const minute = Math.floor(NOW / MIN);
        const covering = ws.some((w) => w.startMs <= NOW && NOW < w.endMs);
        expect(current !== null).toBe(covering);
        if (current) expect(current.startMinute <= minute && minute < current.endMinute).toBe(true);
        const upcoming = timeline.filter((w) => w.startMinute >= minute);
        if (upcoming.length === 0) expect(next).toBeNull();
        else expect(next?.startMinute).toBe(Math.min(...upcoming.map((w) => w.startMinute)));
        // Every announced minute is in the merged timeline.
        for (const w of ws) {
          const m = Math.floor(w.startMs / MIN);
          expect(timeline.some((t) => t.startMinute <= m && m < t.endMinute)).toBe(true);
        }
      }),
    );
  });
});
