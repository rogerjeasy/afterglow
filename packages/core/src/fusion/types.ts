/**
 * Grid Sense fusion types.
 *
 * Invariant (fail-closed.md §1, §2, §3; GS-01..GS-04):
 * - mains is PRESENT when any positive sense votes and no negative sense contradicts;
 * - mains is ABSENT only when >= 2 negative senses agree, OR one negative sense is
 *   corroborated by home telemetry, OR by at least k neighbouring reports;
 * - everything else is UNKNOWN.
 *
 * A verdict always records which senses voted, so it is auditable.
 */

/** The identifiers of the five senses described in architecture §5. */
export type SenseId = 'chargingEdge' | 'hum' | 'flicker' | 'magnetometer' | 'telemetry';

/**
 * A single sense's vote.
 *
 * `direction` is what the sense claims about mains:
 * - 'present'  — mains is present (a positive vote);
 * - 'absent'   — mains is absent (a negative vote);
 * - 'unknown'  — the sense ran but cannot tell (silence, white noise, denied).
 *
 * Positive-only senses (flicker, magnetometer) may only ever carry 'present' or
 * 'unknown'; an 'absent' from them is illegal and is rejected at construction.
 */
export interface SenseVote {
  readonly sense: SenseId;
  readonly direction: 'present' | 'absent' | 'unknown';
  /** 0..1 confidence in this sense's own reading; informational, never a tie-breaker. */
  readonly confidence: number;
}

/** Senses that can never produce a negative (absent) vote. */
export const POSITIVE_ONLY_SENSES: ReadonlySet<SenseId> = new Set<SenseId>([
  'flicker',
  'magnetometer',
]);

/**
 * The deterministic verdict. A discriminated union, never a boolean or an
 * optional (fail-closed.md "When writing or reviewing code").
 */
export type MainsVerdict = 'present' | 'absent' | 'unknown';

/** Context the fusion function needs beyond the local sense votes. */
export interface FusionContext {
  /**
   * Count of neighbouring devices that independently reported mains-absent for
   * this cell in the corroboration window. Used only to corroborate a single
   * local negative sense. Never lowers k; see privacy-aggregation.md §1.
   */
  readonly neighbourAbsentReports: number;
  /** The corroboration threshold k. Defaults to 5 and is never per-request configurable. */
  readonly k: number;
}

/** The full, auditable result of a fusion. */
export interface FusionResult {
  readonly verdict: MainsVerdict;
  /** The senses that actually cast a positive or negative vote, sorted for determinism. */
  readonly votedPositive: readonly SenseId[];
  readonly votedNegative: readonly SenseId[];
  /** Plain-language reason, always set — "unknown" is designed, not a fallback. */
  readonly reason: string;
}

export const DEFAULT_K = 5;
