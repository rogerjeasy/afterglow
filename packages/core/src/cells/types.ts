import type { MainsVerdict } from '../fusion/types.js';

/** The k-anonymity threshold. Fixed; never per-request configurable (CE-01). */
export const K_ANONYMITY = 5;

/** The restoration window, in minutes (CE-05). */
export const RESTORE_WINDOW_MINUTES = 10;

/** The distinct-device counting window, in minutes (CE-01). */
export const DEVICE_COUNT_WINDOW_MINUTES = 30;

/**
 * A single device's report for a cell (privacy-aggregation.md rule 4).
 * `minute` is minutes since an epoch (integer), keeping payloads tiny.
 */
export interface CellReport {
  readonly deviceEpoch: string;
  readonly geohash6: string;
  readonly minute: number;
  readonly verdict: MainsVerdict;
  readonly confidence: number;
  readonly senses: readonly string[];
  readonly restoreEdge: boolean;
}

export type CellStateValue = 'dark' | 'lit' | 'mixed' | 'comingBack' | 'unknown';

export type Provenance = 'crowd' | 'provider' | 'satellite' | 'telemetry';

/** The published cell state. Never written with deviceCount < k unless unknown (CE-01). */
export interface CellState {
  readonly geohash6: string;
  readonly windowStart: number;
  readonly state: CellStateValue;
  readonly deviceCount: number;
  readonly provenance: readonly Provenance[];
}

/** Context the aggregator needs beyond the reports themselves. */
export interface AggregateContext {
  /** Start minute of the 5-minute state window. */
  readonly windowStart: number;
  /** The cell's prior state, so restoration can require a dark predecessor (CE-05). */
  readonly priorState?: CellStateValue;
  /** k threshold; defaults to K_ANONYMITY and is not meant to be lowered. */
  readonly k?: number;
  /** Extra provenance sources contributing to this cell (provider/satellite/telemetry). */
  readonly extraProvenance?: readonly Provenance[];
}
