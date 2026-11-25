import type { household } from '@afterglow/core';
import { formatClockTime, formatDuration, formatTemp } from '../format';

/**
 * Words for the Graveyard Shift. The chart is a glance; this is the sentence and the
 * numbers behind it, so the night reads the same to a screen reader and in a table.
 */

type Night = Extract<household.GraveyardShift, { kind: 'night' }>;

const MS = 60_000;
/** A clock time, with the weekday when it falls on another day than now, so a 48 h axis is not ambiguous. */
const clock = (nowMs: number, minutes: number): string => {
  const at = nowMs + minutes * MS;
  const time = formatClockTime(at);
  return new Date(at).toDateString() === new Date(nowMs).toDateString()
    ? time
    : `${new Date(at).toLocaleDateString([], { weekday: 'short' })} ${time}`;
};

export interface NightText {
  readonly headline: string;
  readonly detail: string;
  /** What the axis covers and whether that length is a default. */
  readonly axis: string;
  readonly sources: readonly string[];
}

/** Whether the likely curve is falling toward the threshold (cold) or rising to it (heat). */
export function direction(night: Night): 'falls' | 'rises' {
  const start = night.points[0]?.midC ?? night.thresholdC;
  return night.thresholdC < start ? 'falls' : 'rises';
}

export function nightText(night: Night, nowMs: number): NightText {
  const verb = direction(night) === 'falls' ? 'falls to' : 'rises to';
  const t = formatTemp(night.thresholdC);
  const sources = [night.modelVersion, night.isDefaultBand ? 'default band' : 'archetype band'];
  const axis = `The axis covers the next ${
    Number.isInteger(night.spanMinutes / 60)
      ? `${night.spanMinutes / 60} h`
      : formatDuration(night.spanMinutes)
  }${night.spanIsDefault ? ', a default. Change it under Candles.' : ', the length you chose.'}`;
  const wide = night.isDefaultBand
    ? ' I do not know your building, so this is a wide band, not a good guess.'
    : '';

  if (night.crossing === null) {
    return {
      headline: 'No headstone tonight',
      detail: `${night.notReachedReason ?? 'The threshold is not reached.'} The curve settles near ${formatTemp(night.outdoorC)}.${wide}`,
      axis,
      sources,
    };
  }
  const { earliestMinutes, midMinutes, latestMinutes } = night.crossing;
  if (midMinutes === 0) {
    return {
      headline: `Already at ${t}`,
      detail: `Your home is at or past the line you set.${wide}`,
      axis,
      sources,
    };
  }
  const band =
    latestMinutes === null
      ? `from ${clock(nowMs, earliestMinutes)}, perhaps much later`
      : `between ${clock(nowMs, earliestMinutes)} and ${clock(nowMs, latestMinutes)}`;
  const outside = midMinutes > night.spanMinutes;
  return {
    headline: outside ? `${t} not within this night` : `${t} at ${clock(nowMs, midMinutes)}`,
    detail: `Your home ${verb} ${t} ${outside ? `about ${clock(nowMs, midMinutes)}, after this axis ends` : `at about ${clock(nowMs, midMinutes)}`}. Likely ${band}.${wide}`,
    axis,
    sources,
  };
}

export interface NightRow {
  readonly time: string;
  readonly likely: string;
  readonly range: string;
}

/** One row an hour, for the table that stands in for the chart. */
export function nightRows(night: Night, nowMs: number): NightRow[] {
  return night.points
    .filter((p) => p.tMinutes % 60 === 0)
    .map((p) => {
      const lo = Math.min(p.fastC, p.slowC);
      const hi = Math.max(p.fastC, p.slowC);
      return {
        time: p.tMinutes === 0 ? 'Now' : clock(nowMs, p.tMinutes),
        likely: formatTemp(p.midC),
        range: `${formatTemp(lo)} to ${formatTemp(hi)}`,
      };
    });
}

export interface Tick {
  readonly fraction: number;
  readonly label: string;
}

/**
 * Three labels along the axis: now, the middle and the end. Three always fit side by
 * side on a 320 px phone at 16 px, where more would collide.
 */
export function axisTicks(night: Night, nowMs: number): Tick[] {
  return [
    { fraction: 0, label: 'Now' },
    { fraction: 0.5, label: clock(nowMs, night.spanMinutes / 2) },
    { fraction: 1, label: clock(nowMs, night.spanMinutes) },
  ];
}

/** Where a temperature sits on the vertical scale, 0 at the bottom and 1 at the top. */
export function yScale(night: Night): {
  toFraction: (c: number) => number;
  min: number;
  max: number;
} {
  const values = [night.thresholdC, night.outdoorC];
  for (const p of night.points) values.push(p.midC, p.fastC, p.slowC);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.08);
  const min = lo - pad;
  const max = hi + pad;
  return { toFraction: (c) => (c - min) / (max - min), min, max };
}
