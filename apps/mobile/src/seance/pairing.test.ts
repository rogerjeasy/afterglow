import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_NAME, cleanName, pairLink, parsePair } from './pairing';

/**
 * Pairing in person (.kiro/specs/device-features DF-14): a link carrying the person's
 * Heliograph number and name, in the hash so it never reaches a server.
 */

const ORIGIN = 'https://afterglow.example';
const slotArb = fc.integer({ min: 0, max: 63 });
const nameArb = fc.oneof(
  fc.stringMatching(/^[A-Za-z][A-Za-z '-]{0,30}$/),
  fc.fullUnicodeString({ minLength: 1, maxLength: 60 }),
  fc.constantFrom('Mrs Dlamini', 'Zoë', 'José María', '李小龙', 'Ana & <Bo>', '  Spaced   out  '),
  // Long names, with a space or an emoji near the 40-character cut.
  fc
    .tuple(
      fc.stringMatching(/^[A-Za-z]{36,44}$/),
      fc.constantFrom(' x', '😀', ' 😀', '👩🏽‍⚕️ Ana', ''),
    )
    .map(([a, b]) => `${a}${b}`),
);

describe('Pairing links (DF-14)', () => {
  it('DF-14 a pairing link reads back as the same number and name, with the offer only in the hash', () => {
    fc.assert(
      fc.property(slotArb, nameArb, (slot, name) => {
        fc.pre(cleanName(name) !== '');
        const link = pairLink({ slot, name }, ORIGIN);
        const url = new URL(link);
        expect(url.origin).toBe(ORIGIN);
        expect(url.pathname).toBe('/app/seance');
        // Nothing in the path or query that a server would log.
        expect(url.search).toBe('');
        expect(url.hash.startsWith('#/seance/pair?')).toBe(true);
        expect(parsePair(link)).toEqual({ slot, name: cleanName(name) });
        // The same offer read from a scanned text or from the hash alone.
        expect(parsePair(url.hash)).toEqual({ slot, name: cleanName(name) });
      }),
    );
  });

  it('DF-14 a name lands on someone else’s list printable, single-spaced and at most 40 characters', () => {
    fc.assert(
      fc.property(fc.oneof(fc.fullUnicodeString({ maxLength: 200 }), nameArb), (raw) => {
        const n = cleanName(raw);
        expect(n).not.toMatch(/[\p{C}<>]/u);
        expect(n).not.toMatch(/\s\s/);
        expect([...n].length).toBeLessThanOrEqual(MAX_NAME);
        expect(n).toBe(n.trim());
        expect(cleanName(n)).toBe(n);
      }),
    );
  });

  it('DF-14 a name keeps its words apart: any whitespace between them becomes one space', () => {
    const word = fc.stringMatching(/^[A-Za-z]{1,6}$/);
    const gap = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r\n', ' '), {
      minLength: 1,
      maxLength: 3,
    });
    fc.assert(
      fc.property(fc.array(fc.tuple(word, gap), { minLength: 1, maxLength: 4 }), (parts) => {
        const raw = parts.map(([w, g]) => `${w}${g}`).join('');
        expect(cleanName(raw)).toBe(
          parts
            .map(([w]) => w)
            .join(' ')
            .slice(0, MAX_NAME)
            .trim(),
        );
      }),
    );
  });

  it('DF-14 anything that is not a pairing offer is refused, never half-read', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        fc.pre(!text.includes('#/seance/pair?'));
        expect(parsePair(text)).toBeNull();
      }),
    );
    fc.assert(
      fc.property(
        fc.oneof(
          fc.integer({ min: 64, max: 999 }).map(String),
          fc.integer({ min: -99, max: -1 }).map(String),
          fc.constantFrom('', 'x', '1.5', '007', ' 3', '0x1'),
        ),
        (s) => {
          expect(
            parsePair(`${ORIGIN}/app/seance#/seance/pair?s=${encodeURIComponent(s)}&n=Ana`),
          ).toBeNull();
        },
      ),
    );
    expect(parsePair(`${ORIGIN}/app/seance#/seance/pair?s=5`)).toBeNull();
    expect(parsePair(`${ORIGIN}/app/seance#/seance/pair?s=5&n=%00%01`)).toBeNull();
  });
});

describe('Pairing regressions (DF-14)', () => {
  it('DF-14 regression: shrunk counterexamples of 2026-11-27 stay fixed', () => {
    // A tab between two words glued them: [["a", "\t"], ["A", " "]] became "aA".
    expect(cleanName('a\tA ')).toBe('a A');
    // A 40-character cut inside an emoji left half of it (a lone surrogate) on the list.
    const emoji = `${'A'.repeat(38)} 😀`;
    expect(cleanName(emoji)).toBe(`${'A'.repeat(38)} 😀`);
    expect(parsePair(pairLink({ slot: 0, name: emoji }, ORIGIN))).toEqual({
      slot: 0,
      name: cleanName(emoji),
    });
    // A cut just after a space left the name ending in a space.
    expect(cleanName(`${'a'.repeat(39)} x`)).toBe('a'.repeat(39));
  });
});
