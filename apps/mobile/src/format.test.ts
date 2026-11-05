import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatDuration, formatTemp, formatTimer } from './format';

describe('format', () => {
  it('writes durations as "3 h 10 m", never "3:10"', () => {
    expect(formatDuration(190)).toBe('3 h 10 m');
    expect(formatDuration(42)).toBe('42 m');
    expect(formatDuration(0)).toBe('0 m');
    expect(formatDuration(60)).toBe('1 h 0 m');
    expect(formatDuration(24 * 60 * 4 + 3 * 60)).toBe('4 d 3 h');
  });

  it('never shows more time than the model gave: minutes are floored', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 20000, noNaN: true }), (m) => {
        const text = formatDuration(m);
        const match = /^(?:(\d+) d (\d+) h|(?:(\d+) h )?(\d+) m)$/.exec(text);
        expect(match).not.toBeNull();
        const days = Number(match?.[1] ?? 0);
        const dayHours = Number(match?.[2] ?? 0);
        const hours = Number(match?.[3] ?? 0);
        const mins = Number(match?.[4] ?? 0);
        const shown = days * 1440 + dayHours * 60 + hours * 60 + mins;
        expect(shown).toBeLessThanOrEqual(m + 1e-9);
      }),
    );
  });

  it('treats invalid input as zero rather than inventing time', () => {
    expect(formatDuration(Number.NaN)).toBe('0 m');
    expect(formatDuration(-5)).toBe('0 m');
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0 m');
  });

  it('formats the outage timer and temperatures', () => {
    expect(formatTimer(7 * 60_000 + 12_000)).toBe('00:07:12');
    expect(formatTimer(-5)).toBe('00:00:00');
    expect(formatTemp(4.4)).toBe('4.4 °C');
    expect(formatTemp(22)).toBe('22 °C');
  });
});
