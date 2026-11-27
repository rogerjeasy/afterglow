import {
  type LuminanceMode,
  MODES,
  ceilingRed,
  contrastOnBlack,
  isRedDominant,
  judgePixel,
  ramp,
  relativeLuminance,
  textCeiling,
} from '@afterglow/design-system';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ceilingFor, luminanceCheck } from './luminance.js';

const hex2 = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();
const toHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const modeArb = fc.constantFrom<LuminanceMode>(...MODES);
const byte = fc.integer({ min: 0, max: 255 });
/** A red-only colour: G and B at most a third of R. */
const redOnlyArb = byte.chain((r) =>
  fc
    .tuple(
      fc.integer({ min: 0, max: Math.floor(r / 3) }),
      fc.integer({ min: 0, max: Math.floor(r / 3) }),
    )
    .map(([g, b]) => toHex(r, g, b)),
);

describe('luminance_check', () => {
  it('MCP-01 the ceiling is the design-system text ceiling of each mode', () => {
    for (const mode of MODES) {
      const c = ceilingFor(mode);
      expect(c.token).toBe(textCeiling[mode]);
      expect(c.hex).toBe(ramp[textCeiling[mode]]);
      expect(c.relativeLuminance).toBe(relativeLuminance(c.hex));
    }
    expect(ceilingFor('night').hex).toBe('#A50000');
    expect(ceilingFor('dusk').hex).toBe('#B70000');
    expect(ceilingFor('ember').hex).toBe('#FF0000');
  });

  it('MCP-01 property: for random red-only colours the numbers are the design-system numbers', () => {
    fc.assert(
      fc.property(fc.array(redOnlyArb, { minLength: 1, maxLength: 20 }), modeArb, (hexes, mode) => {
        const report = luminanceCheck(hexes, mode);
        const ceilingL = relativeLuminance(ramp[textCeiling[mode]] as string);
        report.results.forEach((r, i) => {
          const hex = hexes[i] as string;
          if (r.verdict === 'unknown') throw new Error(`unexpected unknown for ${hex}`);
          expect(r.relativeLuminance).toBe(relativeLuminance(hex));
          expect(r.contrastOnBlack).toBe(contrastOnBlack(hex));
          expect(r.redOnly).toBe(isRedDominant(hex));
          expect(r.redOnly).toBe(true);
          expect(r.verdict === 'pass').toBe(relativeLuminance(hex) <= ceilingL + 1e-9);
        });
      }),
      { numRuns: 300 },
    );
  });

  it('MCP-02 property: a pure red passes exactly when the pixel scanner allows it', () => {
    fc.assert(
      fc.property(byte, modeArb, (r, mode) => {
        const [res] = luminanceCheck([toHex(r, 0, 0)], mode).results;
        expect(res?.verdict === 'pass').toBe(judgePixel(r, 0, 0, mode) === null);
        expect(res?.verdict === 'pass').toBe(r <= ceilingRed(mode));
      }),
    );
  });

  it('MCP-02 property: any colour that is not red-only fails in every mode', () => {
    const notRed = fc
      .tuple(byte, byte, byte)
      .filter(([r, g, b]) => r < 3 * Math.max(g, b))
      .map(([r, g, b]) => toHex(r, g, b));
    fc.assert(
      fc.property(notRed, modeArb, (hex, mode) => {
        const [res] = luminanceCheck([hex], mode).results;
        expect(res?.verdict).toBe('fail');
      }),
    );
  });

  it('MCP-02 a malformed colour is unknown, never a pass, and spoils allPass', () => {
    for (const bad of ['red', '#F00', '#GG0000', '', 'A50000', '#A500001']) {
      const report = luminanceCheck(['#000000', bad], 'night');
      expect(report.results[1]?.verdict).toBe('unknown');
      expect(report.allPass).toBe(false);
    }
    expect(luminanceCheck(['#000000', '#a50000'], 'night').allPass).toBe(true);
  });

  it('MCP-02 the ceiling itself passes and one step above it fails', () => {
    expect(luminanceCheck(['#A50000'], 'night').allPass).toBe(true);
    expect(luminanceCheck(['#A60000'], 'night').allPass).toBe(false);
    expect(luminanceCheck(['#A60000'], 'dusk').allPass).toBe(true);
    expect(luminanceCheck(['#00FF00'], 'ember').allPass).toBe(false);
  });
});
