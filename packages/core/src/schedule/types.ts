/**
 * Schedule types. Minutes are absolute integers since an epoch. Intervals are
 * half-open [startMinute, endMinute). No I/O lives here; provider adapters feed
 * normalised windows in.
 */

/** A promised outage window from one provider for one area. */
export interface ScheduleWindow {
  readonly areaId: string;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly source: string;
  readonly stage?: number;
  /** When this window was fetched, for provenance; earliest is kept on coalesce. */
  readonly fetchedAt: number;
}

/** An observed outage interval (e.g. derived from crowd dark periods). */
export interface ObservedInterval {
  readonly startMinute: number;
  readonly endMinute: number;
}

/** The result of merging all windows for an area: sorted, source-tagged. */
export type MergedTimeline = readonly ScheduleWindow[];

/** Adherence is a number in [0,1], or unknown when nothing was promised. */
export type Adherence =
  | { readonly kind: 'score'; readonly value: number }
  | { readonly kind: 'unknown'; readonly reason: string };

export type NextWindow =
  | { readonly kind: 'window'; readonly window: ScheduleWindow }
  | { readonly kind: 'none' };
