import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastOnBlack, parseHex, relativeLuminance } from './luminance.js';
import {
  AMBER_MAX_GREEN_RATIO,
  HUE_NOISE_FLOOR,
  ceilingLuminance,
  judgePixel,
  scanRgba,
} from './pixelScan.js';
import {
  type LuminanceMode,
  MODES,
  type RampKey,
  TEXT_TOKENS,
  amberFor,
  amberRamp,
  ceilingHex,
  ramp,
  resolveToken,
  semanticTokenNames,
} from './tokens.js';

/**
 * The amber variant for protanopia (design 3.4; night-shell NS-18..NS-21). Amber
 * is a different hue from red, so it is not red-dominant (NS-02 is red-only), but
 * it lives under the very same luminance ceilings.
 */

const EPS = 1e-9;
const modeArb = fc.constantFrom<LuminanceMode>(...MODES);
const lum = (mode: LuminanceMode, t: Parameters<typeof resolveToken>[1], hue: 'red' | 'amber') =>
  relativeLuminance(resolveToken(mode, t, hue));

describe('Amber variant properties', () => {
  it('NS-18 amber: no amber text token exceeds its mode luminance ceiling', () => {
    for (const mode of MODES) {
      const ceiling = ceilingLuminance(mode);
      for (const t of TEXT_TOKENS) {
        const hex = resolveToken(mode, t, 'amber');
        expect(
          relativeLuminance(hex),
          `${mode}/${t} amber ${hex} exceeds the ${mode} ceiling ${ceilingHex(mode)}`,
        ).toBeLessThanOrEqual(ceiling + EPS);
      }
    }
  });

  it('NS-18 amber: no amber token of any kind exceeds its mode ceiling', () => {
    for (const mode of MODES) {
      for (const t of semanticTokenNames()) {
        expect(lum(mode, t, 'amber'), `${mode}/${t}`).toBeLessThanOrEqual(
          ceilingLuminance(mode) + EPS,
        );
      }
    }
  });

  it('NS-19 amber: every red step has an amber stand-in, and every token resolves into the amber ramp', () => {
    for (const key of Object.keys(ramp) as RampKey[]) {
      const stand = amberFor[key];
      expect(amberRamp[stand], `${key} -> ${stand}`).toBeDefined();
    }
    const amberValues = new Set(Object.values(amberRamp));
    for (const mode of MODES) {
      expect(resolveToken(mode, 'bg', 'amber')).toBe('#000000');
      for (const t of semanticTokenNames()) {
        const hex = resolveToken(mode, t, 'amber');
        expect(amberValues.has(hex), `${mode}/${t} = ${hex} not in the amber ramp`).toBe(true);
      }
    }
  });

  it('NS-19 amber: the amber ramp is one hue (B = 0, G/R between 0.5 and 0.6) and rises in luminance', () => {
    let last = -1;
    for (const [name, hex] of Object.entries(amberRamp)) {
      const { r, g, b } = parseHex(hex);
      expect(b, `${name} blue`).toBe(0);
      if (r > 0) {
        expect(g / r, `${name} G/R`).toBeGreaterThanOrEqual(0.5);
        expect(g / r, `${name} G/R`).toBeLessThanOrEqual(0.6);
      }
      const l = relativeLuminance(hex);
      expect(l, `${name} is not brighter than the step before`).toBeGreaterThan(last);
      last = l;
    }
  });

  it('NS-20 amber: the tiers keep their order, so hierarchy reads the same in both hues', () => {
    const names = semanticTokenNames();
    for (const mode of MODES) {
      for (const a of names) {
        for (const b of names) {
          if (lum(mode, a, 'red') <= lum(mode, b, 'red')) {
            expect(
              lum(mode, a, 'amber'),
              `${mode}: ${a} is dimmer than ${b} in red but not in amber`,
            ).toBeLessThanOrEqual(lum(mode, b, 'amber') + EPS);
          }
        }
      }
    }
  });

  it('NS-20 amber: from red.200 up, each amber stand-in is within 7% of the red luminance', () => {
    const bright: RampKey[] = [
      'red.200',
      'red.400',
      'red.500',
      'red.600',
      'red.700',
      'red.800',
      'red.900',
      'red.950',
      'red.1000',
    ];
    for (const key of bright) {
      const red = relativeLuminance(ramp[key] as string);
      const amber = relativeLuminance(amberRamp[amberFor[key]] as string);
      expect(Math.abs(amber - red) / red, `${key} -> ${amberFor[key]}`).toBeLessThanOrEqual(0.07);
    }
  });

  it('NS-20 amber: wherever a red token meets the documented WCAG level, the amber one does too', () => {
    const levels: [LuminanceMode, number][] = [
      ['dusk', 3.0],
      ['ember', 4.5],
    ];
    for (const [mode, level] of levels) {
      for (const t of TEXT_TOKENS) {
        if (contrastOnBlack(resolveToken(mode, t, 'red')) < level) continue;
        expect(
          contrastOnBlack(resolveToken(mode, t, 'amber')),
          `${mode}/${t} meets ${level}:1 in red but not in amber`,
        ).toBeGreaterThanOrEqual(level);
      }
    }
    // The headline claims (NS-06), in amber.
    expect(contrastOnBlack(resolveToken('dusk', 'text.primary', 'amber'))).toBeGreaterThanOrEqual(
      3,
    );
    expect(contrastOnBlack(resolveToken('ember', 'text.primary', 'amber'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('NS-21 amber scan: every amber ramp colour at or under the ceiling passes, and the red scan would refuse amber', () => {
    for (const mode of MODES) {
      for (const [name, hex] of Object.entries(amberRamp)) {
        const { r, g, b } = parseHex(hex);
        const under = relativeLuminance(hex) <= ceilingLuminance(mode) + EPS;
        expect(judgePixel(r, g, b, mode, 'amber'), `${mode} ${name}`).toBe(
          under ? null : 'too bright',
        );
      }
    }
    // Amber is not red-dominant, which is why the scan takes the hue.
    const { r, g, b } = parseHex(resolveToken('night', 'text.emphasis', 'amber'));
    expect(judgePixel(r, g, b, 'night', 'red')).toBe('not red');
  });

  it('NS-21 amber scan: pure red under the ceiling still passes, and over it fails', () => {
    expect(judgePixel(0xa5, 0, 0, 'night', 'amber')).toBeNull();
    expect(judgePixel(0xa6, 0, 0, 'night', 'amber')).toBe('too bright');
    expect(judgePixel(0xb7, 0, 0, 'dusk', 'amber')).toBeNull();
    expect(judgePixel(0xb8, 0, 0, 'dusk', 'amber')).toBe('too bright');
    // One red unit over amber.700 is #784300, just over the Night ceiling.
    expect(judgePixel(0x78, 0x43, 0, 'night', 'amber')).toBe('too bright');
  });

  it('NS-21 amber scan: a greener or bluer pixel fails, whatever its brightness', () => {
    fc.assert(
      fc.property(
        modeArb,
        fc.integer({ min: 0, max: 80 }),
        fc.integer({ min: 1, max: 60 }),
        (mode, r, extra) => {
          const g = Math.ceil(r * AMBER_MAX_GREEN_RATIO) + HUE_NOISE_FLOOR + extra;
          expect(judgePixel(r, Math.min(255, g), 0, mode, 'amber')).not.toBeNull();
          const blue = HUE_NOISE_FLOOR + extra;
          if (r < 3 * blue) expect(judgePixel(r, 0, blue, mode, 'amber')).not.toBeNull();
        },
      ),
    );
    expect(judgePixel(0, 40, 0, 'night', 'amber')).toBe('not amber');
    expect(judgePixel(0, 0, 40, 'night', 'amber')).toBe('not amber');
  });

  it('NS-21 amber scan: anti-aliased amber text (the ceiling token over black, any coverage) passes', () => {
    fc.assert(
      fc.property(modeArb, fc.double({ min: 0, max: 1, noNaN: true }), (mode, alpha) => {
        const top = parseHex(resolveToken(mode, 'text.emphasis', 'amber'));
        const px = new Uint8Array([
          Math.round(top.r * alpha),
          Math.round(top.g * alpha),
          Math.round(top.b * alpha),
          255,
        ]);
        expect(scanRgba(px, 1, 1, mode, 5, 'amber').ok).toBe(true);
      }),
    );
  });
});
