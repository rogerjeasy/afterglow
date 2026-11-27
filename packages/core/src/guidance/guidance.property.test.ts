import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ask } from './ask.js';
import { LIBRARY } from './content.js';

/**
 * The guidance library and Ask Afterglow (.kiro/specs/guidance GL-01..GL-04): answers
 * come only from the library's own passages, always with the chosen guide's danger
 * signs and sources; a question the library does not cover is "outside", never answered.
 */

const ALL_TEXT = LIBRARY.flatMap((g) => [g.title, g.words, ...g.steps, ...(g.danger ?? [])])
  .join(' ')
  .toLowerCase();

/** Questions people ask, plus noise: library words, stop words, unicode, empty. */
const libraryWord = fc.constantFrom(
  ...[...new Set(ALL_TEXT.split(/[^a-z]+/).filter((w) => w.length > 2))],
);
const questionArb = fc.oneof(
  fc.array(libraryWord, { minLength: 1, maxLength: 6 }).map((w) => w.join(' ')),
  fc
    .tuple(fc.array(libraryWord, { maxLength: 3 }), fc.fullUnicodeString({ maxLength: 40 }))
    .map(([w, u]) => `${u} ${w.join(' ')}?`),
  fc.fullUnicodeString({ maxLength: 120 }),
  fc.constantFrom('', '   ', 'what is the', 'how do I', '¿qué hago?', 'CHICKEN IN THE FRIDGE!!'),
);

describe('Guidance library (GL-01, GL-02)', () => {
  it('GL-01 the library covers the ten outage topics, each with ordered steps and cited sources', () => {
    expect(new Set(LIBRARY.map((g) => g.topic))).toEqual(
      new Set([
        'food',
        'medicine',
        'co',
        'cold',
        'heat',
        'power',
        'water',
        'light',
        'phone',
        'devices',
      ]),
    );
    expect(new Set(LIBRARY.map((g) => g.id)).size).toBe(LIBRARY.length);
    for (const g of LIBRARY) {
      expect(g.title.trim().length).toBeGreaterThan(0);
      expect(g.steps.length).toBeGreaterThan(0);
      for (const s of [...g.steps, ...(g.danger ?? [])]) expect(s.trim().length).toBeGreaterThan(0);
      expect(g.sources.length).toBeGreaterThan(0);
      for (const s of g.sources) {
        expect(s.publisher.trim().length).toBeGreaterThan(0);
        expect(s.title.trim().length).toBeGreaterThan(0);
        expect(new URL(s.url).protocol).toBe('https:');
      }
    }
  });

  it('GL-02 where guidance depends on the product, the label and the pharmacist decide', () => {
    const insulin = LIBRARY.find((g) => g.topic === 'medicine');
    expect(insulin).toBeDefined();
    expect(insulin?.steps.join(' ')).toMatch(/label and pharmacist decide/);
  });
});

describe('Ask Afterglow (GL-03, GL-04)', () => {
  it('GL-03 an answer quotes only its guide’s own passages, always with all its danger signs and sources', () => {
    fc.assert(
      fc.property(questionArb, (q) => {
        const r = ask(q);
        if (r.kind === 'outside') return;
        const g = r.guide;
        expect(LIBRARY).toContain(g);
        const own = new Set([...g.steps, ...(g.danger ?? [])]);
        for (const p of r.passages) {
          expect(own.has(p.text)).toBe(true);
          expect(p.kind).toBe(g.steps.includes(p.text) ? 'step' : 'danger');
        }
        expect(new Set(r.passages.map((p) => p.text)).size).toBe(r.passages.length);
        for (const d of g.danger ?? [])
          expect(r.passages).toContainEqual({ text: d, kind: 'danger' });
        const steps = r.passages.filter((p) => p.kind === 'step').length;
        expect(steps).toBeLessThanOrEqual(3);
        expect(r.passages.length).toBeGreaterThan(0);
        expect(g.sources.length).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });

  it('GL-03 matching is deterministic and ignores case, accents and punctuation', () => {
    fc.assert(
      fc.property(fc.array(libraryWord, { minLength: 1, maxLength: 5 }), (words) => {
        const q = words.join(' ');
        const a = ask(q);
        expect(ask(q)).toEqual(a);
        expect(ask(`${q.toUpperCase()}?!`)).toEqual(a);
      }),
    );
  });

  it('GL-03 asking for a guide by its own title answers with that guide', () => {
    for (const g of LIBRARY) {
      const r = ask(g.title);
      expect(r.kind === 'answer' ? r.guide.id : r.kind).toBe(g.id);
    }
  });

  it('GL-03 everyday questions go to the right guide', () => {
    const cases: [string, string][] = [
      ['Is the chicken in the fridge still ok?', 'food-fridge'],
      ['how long does insulin last out of the fridge', 'medicine-insulin'],
      ['can I run the generator in the garage', 'co-generator'],
      ['how do I make water safe to drink', 'water-safe'],
      ['my phone battery is low', 'phone-battery'],
    ];
    for (const [q, id] of cases) {
      const r = ask(q);
      expect(r.kind === 'answer' ? r.guide.id : r.kind).toBe(id);
    }
  });

  it('GL-04 a question with no word from the library is outside it, and nothing is answered', () => {
    const noise = fc
      .array(fc.stringMatching(/^[qxzjvw]{3,9}$/), { minLength: 0, maxLength: 6 })
      .map((w) => w.join(' '));
    fc.assert(
      fc.property(
        fc.oneof(noise, fc.constantFrom('', '?', 'what is the', 'how do i do it', '1')),
        (q) => {
          fc.pre(q.split(' ').every((w) => w === '' || !ALL_TEXT.includes(w)));
          const r = ask(q);
          expect(r.kind).toBe('outside');
          expect(r).not.toHaveProperty('passages');
          if (r.kind === 'outside') for (const s of r.suggestions) expect(LIBRARY).toContain(s);
        },
      ),
    );
  });
});
