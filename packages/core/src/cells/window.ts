import { aggregateCell } from './aggregate.js';
import {
  type CellReport,
  type CellState,
  type CellStateValue,
  DEVICE_COUNT_WINDOW_MINUTES,
  type Provenance,
  RESTORE_WINDOW_MINUTES,
} from './types.js';

/**
 * Windowing over a report stream (CE-09..CE-13).
 *
 * `aggregateCell` is the kernel for one set of reports. This layer answers "what
 * is this cell's state at time t?" from a stream: it keeps the last 30 minutes,
 * lets each device speak once by its latest word, keeps "coming back" about now,
 * and threads each window's state into the next. Pure; the Flink job (Wave 6)
 * calls the same functions.
 */

/** The 5-minute state window an instant falls in. */
function windowStartOf(nowMinute: number): number {
  return Math.floor(nowMinute / 5) * 5;
}

/**
 * One report per device: its latest by minute (CE-10). Two reports from one
 * device at the same latest minute that disagree on the verdict become
 * `unknown`, whichever order they arrived in (fail closed).
 */
function latestPerDevice(reports: readonly CellReport[]): CellReport[] {
  const byDevice = new Map<string, CellReport[]>();
  for (const r of reports) {
    const bucket = byDevice.get(r.deviceEpoch);
    if (!bucket) byDevice.set(r.deviceEpoch, [r]);
    else if (r.minute > (bucket[0] as CellReport).minute) byDevice.set(r.deviceEpoch, [r]);
    else if (r.minute === (bucket[0] as CellReport).minute) bucket.push(r);
  }
  const out: CellReport[] = [];
  for (const bucket of byDevice.values()) {
    const first = bucket[0] as CellReport;
    const agree = bucket.every((r) => r.verdict === first.verdict);
    out.push({
      deviceEpoch: first.deviceEpoch,
      geohash6: first.geohash6,
      minute: first.minute,
      verdict: agree ? first.verdict : 'unknown',
      confidence: Math.min(...bucket.map((r) => r.confidence)),
      senses: [...new Set(bucket.flatMap((r) => r.senses))].sort(),
      restoreEdge: agree && bucket.every((r) => r.restoreEdge),
    });
  }
  return out;
}

/**
 * The state of one cell at `nowMinute` (CE-09..CE-12).
 *
 * `priorState` is the cell's state in the window before; `comingBack` counts as
 * still restoring from dark, so the state lasts while fresh restore edges last
 * and no longer (CE-12). Reports for other cells are ignored.
 */
export function cellStateAt(
  geohash6: string,
  reports: readonly CellReport[],
  nowMinute: number,
  priorState?: CellStateValue,
  extraProvenance?: readonly Provenance[],
): CellState {
  const windowStart = windowStartOf(nowMinute);
  const inWindow = reports.filter(
    (r) =>
      r.geohash6 === geohash6 &&
      r.minute <= nowMinute &&
      r.minute > nowMinute - DEVICE_COUNT_WINDOW_MINUTES,
  );
  // A restore edge only counts when it is fresh (CE-12).
  const fresh = latestPerDevice(inWindow).map((r) =>
    r.restoreEdge && r.minute <= nowMinute - RESTORE_WINDOW_MINUTES
      ? { ...r, restoreEdge: false }
      : r,
  );
  const state = aggregateCell(fresh, {
    windowStart,
    ...(priorState === undefined
      ? {}
      : { priorState: priorState === 'comingBack' ? 'dark' : priorState }),
    ...(extraProvenance ? { extraProvenance } : {}),
  });
  // The kernel has no cell to name when nothing arrived; the caller asked about one.
  return state.geohash6 === geohash6 ? state : { ...state, geohash6 };
}

/** A timeline is never longer than this many steps (a guard against a runaway loop). */
const MAX_STEPS = 2000;

/**
 * The cell's state at each step from `fromMinute` to `toMinute` inclusive (CE-13),
 * each window given the state of the one before. Returns an empty list for
 * unusable arguments rather than looping on them.
 */
export function cellTimeline(
  geohash6: string,
  reports: readonly CellReport[],
  fromMinute: number,
  toMinute: number,
  stepMinutes = 5,
): CellState[] {
  if (
    !Number.isInteger(fromMinute) ||
    !Number.isInteger(toMinute) ||
    !Number.isInteger(stepMinutes) ||
    stepMinutes <= 0 ||
    toMinute < fromMinute ||
    (toMinute - fromMinute) / stepMinutes > MAX_STEPS
  ) {
    return [];
  }
  // Sort once, then give each step only the reports that can fall in its window.
  // `cellStateAt` filters again, so the result is identical to calling it on everything.
  const mine = reports.filter((r) => r.geohash6 === geohash6).sort((a, b) => a.minute - b.minute);
  const firstAfter = (minute: number): number => {
    let lo = 0;
    let hi = mine.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((mine[mid] as CellReport).minute > minute) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  const out: CellState[] = [];
  let prior: CellStateValue | undefined;
  for (let t = fromMinute; t <= toMinute; t += stepMinutes) {
    const inWindow = mine.slice(firstAfter(t - DEVICE_COUNT_WINDOW_MINUTES), firstAfter(t));
    const s = cellStateAt(geohash6, inWindow, t, prior);
    out.push(s);
    prior = s.state;
  }
  return out;
}
