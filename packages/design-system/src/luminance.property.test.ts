import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastOnBlack, isRedDominant, parseHex, relativeLuminance } from './luminance.js';
import {
  type LuminanceMode,
  MODES,
  ramp,
  type RampKey,
  resolveToken,
  type SemanticToken,
  semanticTokenNames,
  TEXT_TOKENS,
  textCeiling,
} from './tokens.js';

const EPS = 1e-9;

describe('Night Shell luminance properties', () => {
  // NS-01: every token in the base ramp is pure red (G = B = 0).
  it('NS-01 base ramp is pure red: G = B = 0', () => {
    for (const [name, hex] of Object.entries(ramp)) {
      const { g, b } = parseHex(hex);
      expect(g, `${name} green channel`).toBe(0);
      expect(b, `${name} blue channel`).toBe(0);
    }
  });

  // NS-02: every ramp colour is red-dominant per night-vision.md rule 2 (R >= 3*max(G,B)).
  it('NS-02 base ramp is red-dominant (R >= 3*max(G,B))', () => {
    for (const [name, hex] of Object.entries(ramp)) {
      expect(isRedDominant(hex), `${name} not red-dominant`).toBe(true);
    }
  });

  // NS-03: no TEXT token in any mode exceeds that mode's text ceiling luminance.
  it('NS-03 no text token exceeds its mode luminance ceiling', () => {
    for (const mode of MODES) {
      const ceilingHex = ramp[textCeiling[mode] as RampKey] as string;
      const ceilingL = relativeLuminance(ceilingHex);
      for (const token of TEXT_TOKENS) {
        const hex = resolveToken(mode, token);
        expect(
          relativeLuminance(hex),
          `${mode}/${token} (${hex}) exceeds ceiling ${ceilingHex}`,
        ).toBeLessThanOrEqual(ceilingL + EPS);
      }
    }
  });

  // NS-04: the background is pure black in every mode (there is no light mode).
  it('NS-04 background is pure black in every mode', () => {
    for (const mode of MODES) {
      expect(resolveToken(mode, 'bg')).toBe('#000000');
    }
  });

  // NS-05: every semantic token resolves to a known ramp colour (no raw/ad-hoc hex).
  it('NS-05 every semantic token resolves to a ramp colour', () => {
    const rampValues = new Set(Object.values(ramp));
    for (const mode of MODES) {
      for (const token of semanticTokenNames()) {
        const hex = resolveToken(mode, token);
        expect(rampValues.has(hex), `${mode}/${token} = ${hex} not in ramp`).toBe(true);
      }
    }
  });

  // NS-06: the documented WCAG conformance claims hold.
  //  - Dusk ceiling meets AA large text (>= 3.0:1) on black;
  //  - Ember primary text meets AA normal text (>= 4.5:1) on black.
  it('NS-06 Dusk ceiling >= 3:1 and Ember primary text >= 4.5:1 on black', () => {
    const duskCeiling = ramp[textCeiling.dusk as RampKey] as string;
    expect(contrastOnBlack(duskCeiling)).toBeGreaterThanOrEqual(3.0);

    const emberPrimary = resolveToken('ember', 'text.primary');
    expect(contrastOnBlack(emberPrimary)).toBeGreaterThanOrEqual(4.5);
  });

  // NS-07: luminance is monotone — contrastOnBlack never decreases as the hex brightens.
  // Checked as a property over arbitrary pure-red intensities.
  it('NS-07 contrast on black is monotone in red intensity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (a, b) => {
          const toHex = (n: number) => `#${n.toString(16).padStart(2, '0')}0000`;
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(contrastOnBlack(toHex(hi))).toBeGreaterThanOrEqual(contrastOnBlack(toHex(lo)));
        },
      ),
    );
  });

  // NS-08: parseHex rejects anything that is not a 6-digit hex colour.
  it('NS-08 parseHex rejects malformed colour strings', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !/^#[0-9a-fA-F]{6}$/.test(s)),
        (bad) => {
          expect(() => parseHex(bad)).toThrow();
        },
      ),
    );
  });
});

// Exhaustive guard: assert the shape the invariant relies on at module load time.
describe('Night Shell token shape', () => {
  it('exposes all three modes with identical token sets', () => {
    const names = new Set<SemanticToken>(semanticTokenNames());
    for (const mode of MODES as LuminanceMode[]) {
      for (const token of names) {
        expect(() => resolveToken(mode, token)).not.toThrow();
      }
    }
  });
});
