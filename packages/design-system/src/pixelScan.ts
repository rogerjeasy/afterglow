import { linearise, parseHex, relativeLuminance } from './luminance.js';
import {
  type Hue,
  type LuminanceMode,
  amberRamp,
  ceilingHex,
  ramp,
  textCeiling,
} from './tokens.js';

/**
 * The pixel scan (night-vision.md rule 3; NS-10). Pure analysis of a decoded
 * screenshot: no pixel may be brighter than the active mode's ceiling, and
 * every visible pixel must be red-dominant. The Playwright harness decodes the
 * screenshots; this module only judges the bytes, so it is property-tested.
 *
 * In the amber variant (NS-21) the ceiling is the same luminance, measured as
 * WCAG relative luminance because amber carries green, and the hue rule admits
 * the amber family: anything from pure red to the amber ramp's own hue.
 */

/** The largest red channel any pixel may have in `mode`: the mode's text ceiling. */
export function ceilingRed(mode: LuminanceMode): number {
  return parseHex(ramp[textCeiling[mode]] as string).r;
}

/**
 * Channels this small are rendering noise (compression and colour-management
 * rounding on near-black pixels), not a visible hue.
 */
export const HUE_NOISE_FLOOR = 2;

export interface Offender {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly reason: 'too bright' | 'not red' | 'not amber';
}

export interface ScanResult {
  readonly pixels: number;
  readonly maxRed: number;
  readonly offenders: number;
  /** The first few, in reading order, for the failure message. */
  readonly examples: readonly Offender[];
  readonly ok: boolean;
}

/** The relative luminance of a mode's text ceiling, the amber variant's pixel limit. */
export function ceilingLuminance(mode: LuminanceMode): number {
  return relativeLuminance(ceilingHex(mode));
}

/**
 * The greenest hue in the amber family: the largest G/R in the amber ramp. A pixel
 * redder than this (down to pure red) is amber-family; a greener one is not.
 */
export const AMBER_MAX_GREEN_RATIO: number = Math.max(
  ...Object.values(amberRamp)
    .map(parseHex)
    .filter((c) => c.r > 0)
    .map((c) => c.g / c.r),
);

/** Each 8-bit channel value, linearised once, so the amber scan stays fast. */
const LINEAR: readonly number[] = Array.from({ length: 256 }, (_, c) => linearise(c));

/** Tolerance for floating-point rounding when a pixel sits exactly at the ceiling. */
const LUMINANCE_EPSILON = 1e-12;

function classify(r: number, g: number, b: number, limit: number): Offender['reason'] | null {
  if (r > limit) return 'too bright';
  const stray = Math.max(g, b);
  return stray > HUE_NOISE_FLOOR && r < 3 * stray ? 'not red' : null;
}

function classifyAmber(r: number, g: number, b: number, limitL: number): Offender['reason'] | null {
  const l =
    0.2126 * (LINEAR[r] as number) +
    0.7152 * (LINEAR[g] as number) +
    0.0722 * (LINEAR[b] as number);
  if (l > limitL + LUMINANCE_EPSILON) return 'too bright';
  if (b > HUE_NOISE_FLOOR && r < 3 * b) return 'not amber';
  if (g > HUE_NOISE_FLOOR && g - HUE_NOISE_FLOOR > r * AMBER_MAX_GREEN_RATIO) return 'not amber';
  return null;
}

/** The judge for one hue, with the mode's limit resolved once. */
function judgeFor(
  mode: LuminanceMode,
  hue: Hue,
): (r: number, g: number, b: number) => Offender['reason'] | null {
  if (hue === 'amber') {
    const limitL = ceilingLuminance(mode);
    return (r, g, b) => classifyAmber(r, g, b, limitL);
  }
  const limit = ceilingRed(mode);
  return (r, g, b) => classify(r, g, b, limit);
}

/** Why one pixel violates the rules, or null when it is allowed. */
export function judgePixel(
  r: number,
  g: number,
  b: number,
  mode: LuminanceMode,
  hue: Hue = 'red',
): Offender['reason'] | null {
  return judgeFor(mode, hue)(r, g, b);
}

/**
 * Scan an RGBA buffer (row-major, 4 bytes per pixel). Alpha is ignored: a
 * screenshot is composited onto the page already. Fails closed: a buffer whose
 * length does not match the stated size is not ok.
 */
export function scanRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  mode: LuminanceMode,
  maxExamples = 5,
  hue: Hue = 'red',
): ScanResult {
  const valid =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    rgba.length === width * height * 4;
  if (!valid) return { pixels: 0, maxRed: 0, offenders: 1, examples: [], ok: false };
  const judge = judgeFor(mode, hue);
  let maxRed = 0;
  let offenders = 0;
  const examples: Offender[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] as number;
    const g = rgba[i + 1] as number;
    const b = rgba[i + 2] as number;
    if (r > maxRed) maxRed = r;
    const reason = judge(r, g, b);
    if (reason !== null) {
      offenders += 1;
      if (examples.length < maxExamples) {
        const p = i / 4;
        examples.push({ x: p % width, y: Math.floor(p / width), r, g, b, reason });
      }
    }
  }
  return { pixels: width * height, maxRed, offenders, examples, ok: offenders === 0 };
}
