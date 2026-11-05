import type { Adherence, ObservedInterval, ScheduleWindow } from './types.js';

interface Interval {
  readonly startMinute: number;
  readonly endMinute: number;
}

/** Union length of a set of half-open intervals, de-overlapping (SC-05). */
function unionLength(intervals: readonly Interval[]): number {
  const valid = intervals.filter((i) => i.endMinute > i.startMinute);
  if (valid.length === 0) return 0;
  const sorted = [...valid].sort((a, b) => a.startMinute - b.startMinute);
  let total = 0;
  let curStart = sorted[0]?.startMinute as number;
  let curEnd = sorted[0]?.endMinute as number;
  for (let i = 1; i < sorted.length; i++) {
    const iv = sorted[i] as Interval;
    if (iv.startMinute <= curEnd) {
      curEnd = Math.max(curEnd, iv.endMinute);
    } else {
      total += curEnd - curStart;
      curStart = iv.startMinute;
      curEnd = iv.endMinute;
    }
  }
  total += curEnd - curStart;
  return total;
}

/** Length of the intersection of two interval sets, de-overlapping each first. */
function intersectionLength(a: readonly Interval[], b: readonly Interval[]): number {
  // Build merged (de-overlapped) copies, then sum pairwise intersections.
  const mergeIntervals = (xs: readonly Interval[]): Interval[] => {
    const valid = xs.filter((i) => i.endMinute > i.startMinute);
    if (valid.length === 0) return [];
    const sorted = [...valid].sort((x, y) => x.startMinute - y.startMinute);
    const out: Interval[] = [{ ...(sorted[0] as Interval) }];
    for (let i = 1; i < sorted.length; i++) {
      const iv = sorted[i] as Interval;
      const last = out[out.length - 1] as Interval;
      if (iv.startMinute <= last.endMinute) {
        out[out.length - 1] = {
          startMinute: last.startMinute,
          endMinute: Math.max(last.endMinute, iv.endMinute),
        };
      } else {
        out.push({ ...iv });
      }
    }
    return out;
  };

  const ma = mergeIntervals(a);
  const mb = mergeIntervals(b);
  let total = 0;
  for (const x of ma) {
    for (const y of mb) {
      const start = Math.max(x.startMinute, y.startMinute);
      const end = Math.min(x.endMinute, y.endMinute);
      if (end > start) total += end - start;
    }
  }
  return total;
}

/**
 * Score a utility's adherence: the fraction of its promised time that was
 * actually observed as an outage (SC-05, SC-06). Promised windows are
 * de-overlapped so overlapping promises are not double-counted. Returns unknown
 * when nothing was promised — never a flattering default.
 */
export function scoreAdherence(
  promised: readonly ScheduleWindow[],
  observed: readonly ObservedInterval[],
): Adherence {
  const promisedIntervals: Interval[] = promised.map((w) => ({
    startMinute: w.startMinute,
    endMinute: w.endMinute,
  }));
  const promisedLength = unionLength(promisedIntervals);
  if (promisedLength === 0) {
    return { kind: 'unknown', reason: 'nothing was promised for this area' };
  }
  const overlap = intersectionLength(promisedIntervals, observed);
  // overlap cannot exceed promisedLength; clamp defensively for float safety.
  const value = Math.min(1, overlap / promisedLength);
  return { kind: 'score', value };
}
