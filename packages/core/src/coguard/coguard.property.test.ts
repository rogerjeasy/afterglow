import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Answer,
  CANNOT_SEE,
  CHECKS,
  type CheckId,
  LEAVE_NOW,
  MAX_AGE_MS,
  SYMPTOMS,
  assessWard,
} from './ward.js';

const NOW = 1_800_000_000_000;
const ids = CHECKS.map((c) => c.id);
const ans = (answer: Answer, ageMs = 1000) => ({ answer, atMs: NOW - ageMs });
const allYes = (ageMs = 1000): Record<string, unknown> =>
  Object.fromEntries(ids.map((id) => [id, ans('yes', ageMs)]));

const answerArb = fc.constantFrom<Answer>('yes', 'no', 'unknown');

describe('CO Guard properties', () => {
  // ------------------------------------------------------------------ CO-01
  it('CO-01 the ward opens only when every check is a current yes', () => {
    fc.assert(
      fc.property(
        fc.record(
          Object.fromEntries(
            ids.map((id) => [
              id,
              fc.option(fc.tuple(answerArb, fc.integer({ min: -1000, max: 2 * MAX_AGE_MS })), {
                nil: undefined,
              }),
            ]),
          ) as Record<CheckId, fc.Arbitrary<[Answer, number] | undefined>>,
        ),
        (raw) => {
          const answers: Record<string, unknown> = {};
          for (const id of ids) {
            const v = raw[id];
            if (v) answers[id] = { answer: v[0], atMs: NOW - v[1] };
          }
          const r = assessWard(answers, NOW);
          const allCurrentYes = ids.every((id) => {
            const v = raw[id];
            return v !== undefined && v[0] === 'yes' && v[1] >= 0 && v[1] <= MAX_AGE_MS;
          });
          expect(r.ward).toBe(allCurrentYes ? 'open' : 'closed');
          expect(r.unmet.length === 0).toBe(allCurrentYes);
          expect(r.checks.map((c) => c.spec.id)).toEqual(ids);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('CO-01 an empty or missing answer set never opens the ward', () => {
    for (const a of [{}, undefined, null, [], 'yes', 5, { outdoors: ans('yes') }]) {
      const r = assessWard(a, NOW);
      expect(r.ward).toBe('closed');
      expect(r.unmet.length).toBeGreaterThan(0);
    }
    expect(assessWard(allYes(), NOW).ward).toBe('open');
  });

  it('CO-01 malformed answers count as unmet, whatever they look like', () => {
    const junk: unknown[] = [
      null,
      'yes',
      5,
      [],
      {},
      { answer: 'yes' },
      { atMs: NOW },
      { answer: 'maybe', atMs: NOW },
      { answer: 'yes', atMs: 'now' },
      { answer: 'yes', atMs: Number.NaN },
      { answer: 'yes', atMs: Number.POSITIVE_INFINITY },
      { answer: true, atMs: NOW },
    ];
    for (const j of junk) {
      const r = assessWard({ ...allYes(), distance: j }, NOW);
      expect(r.ward, JSON.stringify(j)).toBe('closed');
      expect(r.unmet).toEqual(['distance']);
    }
  });

  it('CO-01 prototype keys are not answers', () => {
    const r = assessWard(Object.create({ ...allYes() }), NOW);
    expect(r.ward).toBe('closed');
    expect(
      assessWard(JSON.parse('{"__proto__":{"outdoors":{"answer":"yes","atMs":1}}}'), NOW).ward,
    ).toBe('closed');
  });

  // ------------------------------------------------------------------ CO-02
  it('CO-02 a no on outdoors or distance is a refusal with the rule, not a to-do', () => {
    for (const id of ['outdoors', 'distance'] as const) {
      const r = assessWard({ ...allYes(), [id]: ans('no') }, NOW);
      expect(r.ward).toBe('closed');
      expect(r.checks.find((c) => c.spec.id === id)?.status).toBe('refused');
      expect(r.refusals).toHaveLength(1);
      expect(r.refusals[0]).toMatch(/^Do not run the generator like this\./);
    }
  });

  it('CO-02 a no on exhaust or alarm is something to fix first, not a refusal of the place', () => {
    for (const id of ['exhaust', 'alarm'] as const) {
      const r = assessWard({ ...allYes(), [id]: ans('no') }, NOW);
      expect(r.checks.find((c) => c.spec.id === id)?.status).toBe('unmet');
      expect(r.refusals).toEqual([]);
      expect(r.checks.find((c) => c.spec.id === id)?.why).toMatch(/^Fix this first\./);
    }
  });

  // ------------------------------------------------------------------ CO-03
  it('CO-03 an answer older than six hours, or dated in the future, is not current', () => {
    const edge = assessWard({ ...allYes(), alarm: ans('yes', MAX_AGE_MS) }, NOW);
    expect(edge.ward).toBe('open'); // exactly at the limit still counts
    const old = assessWard({ ...allYes(), alarm: ans('yes', MAX_AGE_MS + 1) }, NOW);
    expect(old.ward).toBe('closed');
    expect(old.checks.find((c) => c.spec.id === 'alarm')?.why).toMatch(/old/);
    const future = assessWard({ ...allYes(), alarm: ans('yes', -1) }, NOW);
    expect(future.ward).toBe('closed');
  });

  it('CO-03 a stale no is not treated as a current refusal', () => {
    const r = assessWard({ ...allYes(), distance: ans('no', MAX_AGE_MS + 5) }, NOW);
    expect(r.checks.find((c) => c.spec.id === 'distance')?.status).toBe('unmet');
    expect(r.refusals).toEqual([]);
  });

  // ------------------------------------------------------------------ CO-04
  it('CO-04 any symptom says to get outside and call, whatever the checklist says', () => {
    for (const a of [allYes(), {}, { ...allYes(), distance: ans('no') }]) {
      const r = assessWard(a, NOW, true);
      expect(r.symptomAdvice).toBe(LEAVE_NOW);
      expect(r.symptomAdvice).toMatch(/fresh air immediately, then call/);
    }
    expect(assessWard(allYes(), NOW, false).symptomAdvice).toBeNull();
    expect(SYMPTOMS).toEqual([
      'headache',
      'dizziness',
      'weakness',
      'upset stomach',
      'vomiting',
      'chest pain',
      'confusion',
    ]);
  });

  it('CO-04 with no symptom the ward still says CO cannot be seen or smelled', () => {
    for (const s of [false, true]) {
      expect(assessWard(allYes(), NOW, s).notice).toBe(CANNOT_SEE);
    }
    expect(CANNOT_SEE).toMatch(/cannot be seen or smelled/);
    expect(assessWard(allYes(), NOW).notice).not.toMatch(/fine|ok|clear/i);
  });

  // ------------------------------------------------------------------ CO-05
  it('CO-05 no sentence says safe, and every check carries its source', () => {
    const texts: string[] = [LEAVE_NOW, CANNOT_SEE];
    for (const c of CHECKS) {
      texts.push(c.question, c.rule);
      expect(c.source.title.length).toBeGreaterThan(0);
      expect(c.source.url).toMatch(/^https:\/\/(www\.)?(cdc\.gov|tools\.cdc\.gov|cpsc\.gov)\//);
    }
    fc.assert(
      fc.property(
        fc.array(answerArb, { minLength: 4, maxLength: 4 }),
        fc.boolean(),
        (vals, sym) => {
          const answers = Object.fromEntries(ids.map((id, i) => [id, ans(vals[i] as Answer)]));
          const r = assessWard(answers, NOW, sym);
          texts.push(r.notice, r.symptomAdvice ?? '', ...r.refusals, ...r.checks.map((c) => c.why));
        },
      ),
      { numRuns: 100 },
    );
    for (const t of texts) expect(t).not.toMatch(/safe/i);
  });

  it('CO-05 the distance rule uses the source figure: 20 feet, 6.1 m', () => {
    const d = CHECKS.find((c) => c.id === 'distance');
    expect(d?.question).toMatch(/20 feet \(6\.1 m\)/);
    expect(20 * 0.3048).toBeCloseTo(6.096, 3);
  });

  // ------------------------------------------------------------------ CO-06
  it('CO-06 deterministic and total: same answers, same result, and nothing throws', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (a, t, s) => {
        const r = assessWard(a, t as number, s as boolean);
        expect(assessWard(a, t as number, s as boolean)).toEqual(r);
        expect(['open', 'closed']).toContain(r.ward);
        expect(r.checks).toHaveLength(4);
      }),
      { numRuns: 400 },
    );
  });
});
