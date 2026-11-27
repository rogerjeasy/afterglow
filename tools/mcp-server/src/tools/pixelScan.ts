import {
  type LuminanceMode,
  type Offender,
  ceilingRed,
  judgePixel,
  scanRgba,
} from '@afterglow/design-system';
import { PNG } from 'pngjs';

/**
 * pixel_scan_png (MCP-04). Decodes a PNG and hands the bytes to the
 * design-system pixel scanner, which decides pass or fail. When it fails, the
 * worst offenders are ranked by how far each pixel is past the rule, using the
 * scanner's own `judgePixel`.
 */

export const MAX_PIXELS = 40_000_000;

export interface RankedOffender {
  readonly x: number;
  readonly y: number;
  readonly hex: string;
  readonly reason: Offender['reason'];
  /** Channel steps past the rule: R above the ceiling, or 3 x max(G, B) above R. */
  readonly excess: number;
}

export type PngScan =
  | {
      readonly ok: boolean;
      readonly mode: LuminanceMode;
      readonly width: number;
      readonly height: number;
      readonly pixels: number;
      readonly offenders: number;
      readonly maxRed: number;
      readonly ceilingRed: number;
      readonly worstOffenders: readonly RankedOffender[];
      readonly note: string;
    }
  | { readonly refused: true; readonly reason: string };

const hex2 = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Width and height from a PNG's IHDR chunk (always the first chunk), or null. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || PNG_SIGNATURE.some((v, i) => bytes[i] !== v)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Scan PNG bytes. Pure apart from decoding; never throws. */
export function scanPng(bytes: Uint8Array, mode: LuminanceMode, maxOffenders: number): PngScan {
  // Read the size from the IHDR header before decoding, so a small file that inflates to
  // billions of pixels (a decompression bomb) is refused without allocating them.
  const header = pngSize(bytes);
  if (!header) return { refused: true, reason: 'Not a readable PNG; not judged.' };
  if (header.width * header.height > MAX_PIXELS) {
    return { refused: true, reason: `Refused: more than ${MAX_PIXELS} pixels.` };
  }
  let png: PNG;
  try {
    png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  } catch {
    return { refused: true, reason: 'Not a readable PNG; not judged.' };
  }
  const { width, height, data } = png;
  if (width * height > MAX_PIXELS) {
    return { refused: true, reason: `Refused: more than ${MAX_PIXELS} pixels.` };
  }
  const result = scanRgba(data, width, height, mode, 0);
  const limit = ceilingRed(mode);
  const worst: RankedOffender[] = [];
  if (!result.ok && result.pixels > 0) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] as number;
      const g = data[i + 1] as number;
      const b = data[i + 2] as number;
      const reason = judgePixel(r, g, b, mode);
      if (reason === null) continue;
      const excess = reason === 'too bright' ? r - limit : 3 * Math.max(g, b) - r;
      const worstSoFar = worst[worst.length - 1];
      if (worst.length >= maxOffenders && worstSoFar && worstSoFar.excess >= excess) continue;
      const p = i / 4;
      worst.push({
        x: p % width,
        y: Math.floor(p / width),
        hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`,
        reason,
        excess,
      });
      // Stable: equal excess keeps reading order.
      worst.sort((a, b2) => b2.excess - a.excess);
      if (worst.length > maxOffenders) worst.pop();
    }
  }
  return {
    ok: result.ok,
    mode,
    width,
    height,
    pixels: result.pixels,
    offenders: result.offenders,
    maxRed: result.maxRed,
    ceilingRed: limit,
    worstOffenders: worst,
    note: 'Alpha is ignored: the PNG is judged as composited. Channels of 2 or less are rendering noise, not hue.',
  };
}
