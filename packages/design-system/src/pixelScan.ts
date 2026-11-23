import { parseHex } from './luminance.js';
import { type LuminanceMode, ramp, textCeiling } from './tokens.js';

/**
 * The pixel scan (night-vision.md rule 3; NS-10). Pure analysis of a decoded
 * screenshot: no pixel may be brighter than the active mode's ceiling, and
 * every visible pixel must be red-dominant. The Playwright harness decodes the
 * screenshots; this module only judges the bytes, so it is property-tested.
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
  readonly reason: 'too bright' | 'not red';
}

export interface ScanResult {
  readonly pixels: number;
  readonly maxRed: number;
  readonly offenders: number;
  /** The first few, in reading order, for the failure message. */
  readonly examples: readonly Offender[];
  readonly ok: boolean;
}

function classify(r: number, g: number, b: number, limit: number): Offender['reason'] | null {
  if (r > limit) return 'too bright';
  const stray = Math.max(g, b);
  return stray > HUE_NOISE_FLOOR && r < 3 * stray ? 'not red' : null;
}

/** Why one pixel violates the rules, or null when it is allowed. */
export function judgePixel(
  r: number,
  g: number,
  b: number,
  mode: LuminanceMode,
): Offender['reason'] | null {
  return classify(r, g, b, ceilingRed(mode));
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
): ScanResult {
  const valid =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    rgba.length === width * height * 4;
  if (!valid) return { pixels: 0, maxRed: 0, offenders: 1, examples: [], ok: false };
  const limit = ceilingRed(mode);
  let maxRed = 0;
  let offenders = 0;
  const examples: Offender[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] as number;
    const g = rgba[i + 1] as number;
    const b = rgba[i + 2] as number;
    if (r > maxRed) maxRed = r;
    const reason = classify(r, g, b, limit);
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
