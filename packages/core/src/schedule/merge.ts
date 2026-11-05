import type { MergedTimeline, NextWindow, ScheduleWindow } from './types.js';

/** Thrown when a schedule window violates the contract (SC-04). */
export class InvalidWindowError extends Error {
  constructor(reason: string) {
    super(`Invalid schedule window: ${reason}`);
    this.name = 'InvalidWindowError';
  }
}

function validateWindow(w: ScheduleWindow): void {
  if (typeof w.areaId !== 'string' || w.areaId.length === 0) {
    throw new InvalidWindowError('areaId must be a non-empty string');
  }
  if (typeof w.source !== 'string' || w.source.length === 0) {
    throw new InvalidWindowError('source must be a non-empty string');
  }
  if (!Number.isInteger(w.startMinute) || !Number.isInteger(w.endMinute)) {
    throw new InvalidWindowError('startMinute and endMinute must be integers');
  }
  if (w.endMinute <= w.startMinute) {
    throw new InvalidWindowError('endMinute must be greater than startMinute');
  }
}

/**
 * Deterministic TOTAL ordering for windows (SC-01). Every field that can differ
 * between two windows takes part, so no two distinct windows ever compare equal
 * and the sort result cannot depend on input order. (A partial order left ties
 * to the stable sort, which preserved arrival order: see pbt-catches.md.)
 */
function compareWindows(a: ScheduleWindow, b: ScheduleWindow): number {
  if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
  if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  if (a.areaId !== b.areaId) return a.areaId < b.areaId ? -1 : 1;
  if (a.fetchedAt !== b.fetchedAt) return a.fetchedAt - b.fetchedAt;
  const sa = a.stage === undefined ? -1 : a.stage;
  const sb = b.stage === undefined ? -1 : b.stage;
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}

/**
 * Coalesce overlapping or contiguous windows that share the same area+source
 * (SC-02). Intervals are half-open, so `a.end === b.start` is contiguous.
 * Keeps the earliest fetchedAt; keeps the stage only if all agree.
 */
function coalesceGroup(windows: readonly ScheduleWindow[]): ScheduleWindow[] {
  const sorted = [...windows].sort(compareWindows);
  const out: ScheduleWindow[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.startMinute <= last.endMinute) {
      // overlap or contiguous: extend
      const endMinute = Math.max(last.endMinute, w.endMinute);
      const stage = last.stage === w.stage ? last.stage : undefined;
      out[out.length - 1] = {
        areaId: last.areaId,
        source: last.source,
        startMinute: last.startMinute,
        endMinute,
        fetchedAt: Math.min(last.fetchedAt, w.fetchedAt),
        ...(stage !== undefined ? { stage } : {}),
      };
    } else {
      out.push(w);
    }
  }
  return out;
}

/**
 * Merge windows for one or more areas into a canonical timeline (SC-01, SC-02,
 * SC-03). Groups by (areaId, source), coalesces within each group, concatenates,
 * and sorts. Pure, idempotent, commutative.
 */
export function mergeSchedule(windows: readonly ScheduleWindow[]): MergedTimeline {
  const groups = new Map<string, ScheduleWindow[]>();
  for (const w of windows) {
    validateWindow(w);
    const key = `${w.areaId}\u0000${w.source}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(w);
    else groups.set(key, [w]);
  }
  const merged: ScheduleWindow[] = [];
  for (const bucket of groups.values()) {
    merged.push(...coalesceGroup(bucket));
  }
  return merged.sort(compareWindows);
}

/** The earliest merged window starting at or after `minute` (SC-07). */
export function nextWindow(timeline: MergedTimeline, minute: number): NextWindow {
  let best: ScheduleWindow | undefined;
  for (const w of timeline) {
    if (w.startMinute >= minute && (best === undefined || w.startMinute < best.startMinute)) {
      best = w;
    }
  }
  return best ? { kind: 'window', window: best } : { kind: 'none' };
}
