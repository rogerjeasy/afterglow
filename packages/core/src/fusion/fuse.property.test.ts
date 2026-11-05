import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { IllegalNegativeVoteError, fuse } from './fuse.js';
import {
  DEFAULT_K,
  type FusionContext,
  POSITIVE_ONLY_SENSES,
  type SenseId,
  type SenseVote,
} from './types.js';

const ALL_SENSES: readonly SenseId[] = [
  'chargingEdge',
  'hum',
  'flicker',
  'magnetometer',
  'telemetry',
];

/** Arbitrary for a single legal vote (positive-only senses never vote absent). */
const voteArb = (): fc.Arbitrary<SenseVote> =>
  fc
    .record({
      sense: fc.constantFrom(...ALL_SENSES),
      direction: fc.constantFrom('present', 'absent', 'unknown') as fc.Arbitrary<
        'present' | 'absent' | 'unknown'
      >,
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .map((v) =>
      v.direction === 'absent' && POSITIVE_ONLY_SENSES.has(v.sense)
        ? ({ ...v, direction: 'unknown' } as SenseVote)
        : (v as SenseVote),
    );

const votesArb = (): fc.Arbitrary<SenseVote[]> => fc.array(voteArb(), { maxLength: 12 });

const contextArb = (): fc.Arbitrary<FusionContext> =>
  fc.record({
    neighbourAbsentReports: fc.integer({ min: 0, max: 50 }),
    k: fc.integer({ min: 1, max: 10 }),
  });

describe('Grid Sense fusion properties', () => {
  // GS-01: the verdict is one of exactly three values.
  it('GS-01 always returns present | absent | unknown', () => {
    fc.assert(
      fc.property(votesArb(), contextArb(), (votes, ctx) => {
        const { verdict } = fuse(votes, ctx);
        expect(['present', 'absent', 'unknown']).toContain(verdict);
      }),
    );
  });

  // GS-02: order-independence. Fusion depends on the SET of votes, not their order.
  it('GS-02 is order-independent under permutation', () => {
    fc.assert(
      fc.property(votesArb(), contextArb(), (votes, ctx) => {
        const shuffled = [...votes].reverse();
        const a = fuse(votes, ctx);
        const b = fuse(shuffled, ctx);
        expect(b.verdict).toBe(a.verdict);
        expect(b.votedPositive).toEqual(a.votedPositive);
        expect(b.votedNegative).toEqual(a.votedNegative);
      }),
    );
  });

  // GS-02b: adding duplicate votes of senses already voting the same way cannot change the verdict.
  it('GS-02b is idempotent to duplicate identical votes', () => {
    fc.assert(
      fc.property(votesArb(), contextArb(), (votes, ctx) => {
        const base = fuse(votes, ctx);
        const doubled = fuse([...votes, ...votes], ctx);
        expect(doubled.verdict).toBe(base.verdict);
      }),
    );
  });

  // GS-03: absence of evidence never upgrades a verdict.
  // Adding 'unknown' votes must never change the outcome.
  it('GS-03 unknown votes never move the verdict', () => {
    fc.assert(
      fc.property(
        votesArb(),
        contextArb(),
        fc.array(fc.constantFrom(...ALL_SENSES), { maxLength: 6 }),
        (votes, ctx, unknownSenses) => {
          const base = fuse(votes, ctx);
          const withUnknowns = fuse(
            [
              ...votes,
              ...unknownSenses.map(
                (sense): SenseVote => ({ sense, direction: 'unknown', confidence: 0 }),
              ),
            ],
            ctx,
          );
          expect(withUnknowns.verdict).toBe(base.verdict);
        },
      ),
    );
  });

  // GS-04: PRESENT requires at least one positive sense. The verdict is never
  // "present" when no sense voted present.
  it('GS-04 present implies at least one positive sense voted', () => {
    fc.assert(
      fc.property(votesArb(), contextArb(), (votes, ctx) => {
        const res = fuse(votes, ctx);
        if (res.verdict === 'present') {
          expect(res.votedPositive.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  // GS-05: ABSENT requires real corroboration — never a single uncorroborated negative.
  it('GS-05 absent requires >=2 negatives, telemetry, or >=k neighbours', () => {
    fc.assert(
      fc.property(votesArb(), contextArb(), (votes, ctx) => {
        const res = fuse(votes, ctx);
        if (res.verdict === 'absent') {
          const telemetryAbsent = res.votedNegative.includes('telemetry');
          const twoOrMore = res.votedNegative.length >= 2;
          const neighbours = ctx.neighbourAbsentReports >= ctx.k && res.votedNegative.length >= 1;
          expect(telemetryAbsent || twoOrMore || neighbours).toBe(true);
        }
      }),
    );
  });

  // GS-06: positive-only senses can never produce a legal absent vote.
  it('GS-06 rejects an absent vote from a positive-only sense', () => {
    for (const sense of POSITIVE_ONLY_SENSES) {
      expect(() => fuse([{ sense, direction: 'absent', confidence: 1 }])).toThrow(
        IllegalNegativeVoteError,
      );
    }
  });

  // GS-07: a single uncorroborated negative never yields ABSENT.
  it('GS-07 one uncorroborated negative never declares absent', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<SenseId>('chargingEdge', 'hum'),
        fc.integer({ min: 0, max: 10 }),
        (negSense, neighbours) => {
          const ctx: FusionContext = { neighbourAbsentReports: neighbours, k: DEFAULT_K };
          const res = fuse([{ sense: negSense, direction: 'absent', confidence: 1 }], ctx);
          if (neighbours < DEFAULT_K) {
            expect(res.verdict).toBe('unknown');
          } else {
            expect(res.verdict).toBe('absent');
          }
        },
      ),
    );
  });

  // GS-08: every result carries a non-empty reason — unknown is designed, not silent.
  it('GS-08 always provides a plain-language reason', () => {
    fc.assert(
      fc.property(votesArb(), contextArb(), (votes, ctx) => {
        expect(fuse(votes, ctx).reason.length).toBeGreaterThan(0);
      }),
    );
  });
});
