import type { MessageName } from '../heliograph/codes.js';

/**
 * A Séance field test (spec `field-checks`, FC-06): one phone sends a known message
 * with its screen, another watches with its camera at a measured distance, and every
 * attempt is written down. The tally says how often the message got through, and,
 * separately, whether the receiver ever showed a different message, which the codec
 * promises never to do (HL-09). Pure.
 */

export type TrialOutcome =
  /** The receiver showed the message that was sent. */
  | 'read'
  /** The receiver showed a different message. HL-09 says this should never happen. */
  | 'wrong'
  /** The receiver saw a signal and refused it (asked for a repeat). */
  | 'refused'
  /** Nothing was read before the person stopped watching. */
  | 'missed';

export interface Trial {
  readonly sent: MessageName;
  readonly outcome: TrialOutcome;
  /** Seconds from pressing send to the receiver showing the message; only for `read`. */
  readonly seconds: number | null;
}

export interface Tally {
  readonly attempts: number;
  readonly read: number;
  readonly wrong: number;
  readonly refused: number;
  readonly missed: number;
  /** read / attempts, or null with no attempts. */
  readonly successRate: number | null;
  /** The middle of the delivery times of the reads, or null when none were timed. */
  readonly medianSeconds: number | null;
}

/** FC-06: count a run of trials. Unknown outcomes are not counted at all. */
export function tallyTrials(trials: readonly Trial[]): Tally {
  const known = trials.filter(
    (t) =>
      t.outcome === 'read' ||
      t.outcome === 'wrong' ||
      t.outcome === 'refused' ||
      t.outcome === 'missed',
  );
  const count = (o: TrialOutcome): number => known.filter((t) => t.outcome === o).length;
  const times = known
    .filter(
      (t) =>
        t.outcome === 'read' && t.seconds !== null && Number.isFinite(t.seconds) && t.seconds >= 0,
    )
    .map((t) => t.seconds as number)
    .sort((a, b) => a - b);
  const mid = times.length / 2;
  const medianSeconds =
    times.length === 0
      ? null
      : times.length % 2 === 1
        ? (times[Math.floor(mid)] as number)
        : ((times[mid - 1] as number) + (times[mid] as number)) / 2;
  const read = count('read');
  return {
    attempts: known.length,
    read,
    wrong: count('wrong'),
    refused: count('refused'),
    missed: count('missed'),
    successRate: known.length === 0 ? null : read / known.length,
    medianSeconds,
  };
}
