import {
  DEFAULT_K,
  type FusionContext,
  type FusionResult,
  type MainsVerdict,
  POSITIVE_ONLY_SENSES,
  type SenseId,
  type SenseVote,
} from './types.js';

/** Thrown when a positive-only sense carries an illegal 'absent' vote. */
export class IllegalNegativeVoteError extends Error {
  constructor(sense: SenseId) {
    super(`Sense "${sense}" is positive-only and cannot vote "absent".`);
    this.name = 'IllegalNegativeVoteError';
  }
}

const sortSenses = (ids: Iterable<SenseId>): readonly SenseId[] =>
  [...ids].sort((a, b) => a.localeCompare(b));

/**
 * Fuse a set of sense votes into a single mains verdict.
 *
 * Pure and order-independent (fail-closed.md §1): the result depends only on the
 * SET of votes and the context, never on the order they arrive in. No I/O, no
 * timers, no randomness.
 *
 * Rules, in order:
 *  1. Reject illegal negatives from positive-only senses (fail-closed.md §2).
 *  2. Collect distinct positive and negative senses (duplicates collapse).
 *  3. Telemetry is authoritative for the home:
 *     - a telemetry 'absent' alone is enough to declare ABSENT;
 *     - a telemetry 'present' alone contradicts any single negative, keeping
 *       the verdict out of ABSENT unless other negatives also agree.
 *  4. ABSENT when: >= 2 distinct negative senses agree, OR exactly one negative
 *     sense is corroborated by telemetry-absent or by >= k neighbouring reports.
 *  5. PRESENT when: at least one positive sense votes and no negative sense
 *     contradicts it.
 *  6. UNKNOWN otherwise — including the contradictory case of positives and a
 *     single uncorroborated negative (we never guess to break a tie).
 *
 * @throws IllegalNegativeVoteError if a positive-only sense votes 'absent'.
 */
export function fuse(
  votes: readonly SenseVote[],
  context: FusionContext = { neighbourAbsentReports: 0, k: DEFAULT_K },
): FusionResult {
  const positive = new Set<SenseId>();
  const negative = new Set<SenseId>();

  for (const vote of votes) {
    if (vote.direction === 'absent' && POSITIVE_ONLY_SENSES.has(vote.sense)) {
      throw new IllegalNegativeVoteError(vote.sense);
    }
    if (vote.direction === 'present') {
      positive.add(vote.sense);
    } else if (vote.direction === 'absent') {
      negative.add(vote.sense);
    }
    // 'unknown' votes record nothing: absence of evidence never moves a verdict.
  }

  const votedPositive = sortSenses(positive);
  const votedNegative = sortSenses(negative);
  const telemetryAbsent = negative.has('telemetry');
  const telemetryPresent = positive.has('telemetry');
  const neighboursCorroborate = context.neighbourAbsentReports >= context.k;

  const result = (verdict: MainsVerdict, reason: string): FusionResult => ({
    verdict,
    votedPositive,
    votedNegative,
    reason,
  });

  // Telemetry is authoritative for the home (architecture §5). A present signal
  // from the household's own equipment blocks ABSENT unless multiple other
  // negatives independently agree.
  if (telemetryAbsent) {
    return result('absent', 'Home telemetry reports grid loss (authoritative).');
  }

  // Rule 4: two or more distinct negatives agree.
  if (negative.size >= 2) {
    return result('absent', `${negative.size} negative senses agree: ${votedNegative.join(', ')}.`);
  }

  // Rule 4: a single negative, corroborated.
  if (negative.size === 1) {
    if (telemetryPresent) {
      // One negative contradicted by authoritative telemetry-present: not enough to call absent.
      return result(
        'unknown',
        'One negative sense is contradicted by home telemetry reporting mains present.',
      );
    }
    if (neighboursCorroborate) {
      return result(
        'absent',
        `One negative sense (${votedNegative[0]}) corroborated by ${context.neighbourAbsentReports} neighbouring reports (k=${context.k}).`,
      );
    }
    if (positive.size > 0) {
      // Contradiction: positives and an uncorroborated negative. Never guess.
      return result(
        'unknown',
        'Senses disagree and the negative is not corroborated; cannot decide.',
      );
    }
    return result(
      'unknown',
      `A single negative sense (${votedNegative[0]}) is not corroborated by telemetry or ${context.k} neighbours.`,
    );
  }

  // Rule 5: positives with no negative.
  if (positive.size > 0) {
    return result('present', `Positive senses and no contradiction: ${votedPositive.join(', ')}.`);
  }

  // Rule 6: nothing to go on.
  return result('unknown', 'No sense produced a positive or negative vote.');
}
