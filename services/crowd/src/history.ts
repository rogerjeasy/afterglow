/**
 * Cell history and community comparisons (product description 7.3 "history and
 * playback", 7.19 "community comparisons"). Each time a report changes or confirms a
 * cell's published state, that state is written for its 5-minute window (only states
 * published under k = 5 rules: dark, lit, mixed, comingBack). A window's state holds
 * until the next window, for at most HOLD_MINUTES (phones confirm every 10 minutes),
 * so a gap in reports is never counted as an outage.
 */

export interface Window {
  readonly windowStart: number;
  readonly state: 'dark' | 'lit' | 'mixed' | 'comingBack';
  readonly deviceCount: number;
}

export const WINDOW_MINUTES = 5;
export const HOLD_MINUTES = 15;

export interface CellHistory {
  readonly geohash6: string;
  readonly darkMinutes: number;
  readonly knownMinutes: number;
  /** Separate dark periods. */
  readonly outages: number;
  readonly longestDarkMinutes: number;
  readonly lastDarkMinute: number | null;
  /** Dark minutes per UTC day, oldest first, for the chart. */
  readonly daily: readonly { readonly day: string; readonly darkMinutes: number }[];
}

export function summarise(
  geohash6: string,
  windows: readonly Window[],
  fromMinute: number,
  nowMinute: number,
): CellHistory {
  const ws = [...windows].sort((a, b) => a.windowStart - b.windowStart);
  const daily = new Map<string, number>();
  for (let m = fromMinute - (fromMinute % 1440); m <= nowMinute; m += 1440) {
    daily.set(new Date(m * 60_000).toISOString().slice(0, 10), 0);
  }
  let dark = 0;
  let known = 0;
  let outages = 0;
  let longest = 0;
  let run = 0;
  let lastDark: number | null = null;
  let prevDarkEnd: number | null = null;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i] as Window;
    const next = ws[i + 1]?.windowStart ?? nowMinute + 1;
    // The current minute counts, so an outage that began this minute is one outage.
    const end = Math.min(next, w.windowStart + HOLD_MINUTES, nowMinute + 1);
    const start = Math.max(w.windowStart, fromMinute);
    const span = Math.max(0, end - start);
    if (span === 0) continue;
    known += span;
    if (w.state === 'dark') {
      dark += span;
      // A new outage unless it continues the previous dark stretch without a gap.
      if (prevDarkEnd === null || start > prevDarkEnd) {
        outages++;
        run = 0;
      }
      run += span;
      longest = Math.max(longest, run);
      prevDarkEnd = end;
      lastDark = end;
      for (let m = start; m < end; ) {
        const dayStart = m - (m % 1440);
        const stop = Math.min(end, dayStart + 1440);
        const key = new Date(dayStart * 60_000).toISOString().slice(0, 10);
        daily.set(key, (daily.get(key) ?? 0) + (stop - m));
        m = stop;
      }
    } else {
      prevDarkEnd = null;
    }
  }
  return {
    geohash6,
    darkMinutes: dark,
    knownMinutes: known,
    outages,
    longestDarkMinutes: longest,
    lastDarkMinute: lastDark,
    daily: [...daily].map(([day, darkMinutes]) => ({ day, darkMinutes })),
  };
}
