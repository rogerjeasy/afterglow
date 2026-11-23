import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { HUE_NOISE_FLOOR, ceilingRed, judgePixel, scanRgba } from './pixelScan.js';
import { type LuminanceMode, MODES } from './tokens.js';

const solid = (w: number, h: number, r: number, g: number, b: number): Uint8Array => {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  }
  return out;
};
const modeArb = fc.constantFrom<LuminanceMode>(...MODES);

describe('Pixel scan properties', () => {
  it('NS-10 the ceilings are the documented text ceilings and rise from Night to Ember', () => {
    expect(ceilingRed('night')).toBe(0xa5);
    expect(ceilingRed('dusk')).toBe(0xb7);
    expect(ceilingRed('ember')).toBe(0xff);
    expect(ceilingRed('night')).toBeLessThan(ceilingRed('dusk'));
    expect(ceilingRed('dusk')).toBeLessThan(ceilingRed('ember'));
  });

  it('NS-10 pure black passes in every mode', () => {
    for (const m of MODES) {
      const r = scanRgba(solid(8, 6, 0, 0, 0), 8, 6, m);
      expect(r.ok).toBe(true);
      expect(r.maxRed).toBe(0);
    }
  });

  it('NS-10 the ceiling itself is allowed and one step above it is not', () => {
    for (const m of MODES) {
      const limit = ceilingRed(m);
      expect(judgePixel(limit, 0, 0, m)).toBeNull();
      if (limit < 255) expect(judgePixel(limit + 1, 0, 0, m)).toBe('too bright');
    }
  });

  it('NS-10 any pixel above the ceiling fails, and its position is reported', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<LuminanceMode>('night', 'dusk'),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.nat(),
        fc.integer({ min: 1, max: 90 }),
        (mode, w, h, at, extra) => {
          const px = solid(w, h, 0, 0, 0);
          const p = at % (w * h);
          px[p * 4] = Math.min(255, ceilingRed(mode) + extra);
          const r = scanRgba(px, w, h, mode);
          expect(r.ok).toBe(false);
          expect(r.offenders).toBe(1);
          expect(r.examples[0]).toMatchObject({
            x: p % w,
            y: Math.floor(p / w),
            reason: 'too bright',
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('NS-11 a pixel that is not red-dominant fails, whatever its brightness', () => {
    fc.assert(
      fc.property(
        modeArb,
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: HUE_NOISE_FLOOR + 1, max: 255 }),
        fc.boolean(),
        (mode, r, stray, inGreen) => {
          fc.pre(r < 3 * stray && r <= ceilingRed(mode));
          const px = inGreen ? judgePixel(r, stray, 0, mode) : judgePixel(r, 0, stray, mode);
          expect(px).toBe('not red');
        },
      ),
      { numRuns: 300 },
    );
    expect(judgePixel(0, 0, 200, 'ember')).toBe('not red');
    expect(judgePixel(255, 255, 255, 'ember')).toBe('not red');
    expect(judgePixel(120, 120, 120, 'night')).toBe('not red');
  });

  it('NS-11 any red-dominant pixel at or under the ceiling passes', () => {
    fc.assert(
      fc.property(
        modeArb,
        fc.integer({ min: 0, max: 255 }),
        fc.nat(255),
        fc.nat(255),
        (mode, r0, g0, b0) => {
          const r = Math.min(r0, ceilingRed(mode));
          const g = Math.min(g0, Math.floor(r / 3));
          const b = Math.min(b0, Math.floor(r / 3));
          expect(judgePixel(r, g, b, mode)).toBeNull();
        },
      ),
      { numRuns: 300 },
    );
  });

  it('NS-11 near-black rendering noise below the hue floor is not a hue', () => {
    for (const m of MODES) {
      expect(judgePixel(0, HUE_NOISE_FLOOR, HUE_NOISE_FLOOR, m)).toBeNull();
      expect(judgePixel(0, HUE_NOISE_FLOOR + 1, 0, m)).toBe('not red');
    }
  });

  it('NS-12 alpha is ignored and the result is the same for any alpha', () => {
    fc.assert(
      fc.property(
        modeArb,
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        (mode, r, a) => {
          const base = solid(2, 2, r, 0, 0);
          const withAlpha = base.slice();
          for (let i = 3; i < withAlpha.length; i += 4) withAlpha[i] = a;
          expect(scanRgba(withAlpha, 2, 2, mode).ok).toBe(scanRgba(base, 2, 2, mode).ok);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('NS-12 a malformed buffer or size fails closed', () => {
    const ok = solid(4, 4, 0, 0, 0);
    expect(scanRgba(ok, 4, 4, 'night').ok).toBe(true);
    for (const [buf, w, h] of [
      [ok.slice(0, ok.length - 4), 4, 4],
      [ok, 4, 5],
      [ok, 0, 0],
      [ok, -4, -4],
      [ok, 2.5, 6.4],
      [new Uint8Array(0), 0, 0],
      [ok, Number.NaN, 4],
    ] as const) {
      expect(scanRgba(buf, w, h, 'night').ok, `${w}x${h}`).toBe(false);
    }
  });

  it('NS-12 the scan counts every offender and caps the examples', () => {
    const px = solid(10, 10, 0, 0, 0);
    for (let p = 0; p < 40; p++) px[p * 4] = 255;
    const r = scanRgba(px, 10, 10, 'night', 3);
    expect(r.offenders).toBe(40);
    expect(r.examples).toHaveLength(3);
    expect(r.maxRed).toBe(255);
  });
});
