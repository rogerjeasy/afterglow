import { type BrightnessSample, MAX_SAMPLES, MIN_CONTRAST } from './receive.js';

/** One camera frame reduced to a grid of cell brightnesses (0..255, row-major). */
export interface GridFrame {
  readonly tMs: number;
  readonly cells: readonly number[];
}

/** HL-13: a grid larger than this is refused (the app uses 8 x 6 = 48). */
export const MAX_CELLS = 1024;

function percentile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] as number;
}

/**
 * Pick the cell that blinks the most and return its brightness series (HL-13).
 *
 * A cell that never changes (a lamp left on, a window) has no contrast and is
 * never chosen. Returns null for malformed frames or when no cell changes
 * enough to be a signal, so the caller shows "no signal" and not a guess.
 */
export function trackSeries(frames: readonly GridFrame[]): BrightnessSample[] | null {
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > MAX_SAMPLES) return null;
  const first = frames[0];
  if (!first || !Array.isArray(first.cells)) return null;
  const n = first.cells.length;
  if (n < 1 || n > MAX_CELLS) return null;

  let prev = Number.NEGATIVE_INFINITY;
  for (const f of frames) {
    if (typeof f !== 'object' || f === null || !Array.isArray(f.cells) || f.cells.length !== n) {
      return null;
    }
    if (!Number.isFinite(f.tMs) || f.tMs <= prev) return null;
    prev = f.tMs;
    for (const c of f.cells) if (!Number.isFinite(c) || c < 0) return null;
  }

  let best = -1;
  let bestContrast = -1;
  for (let i = 0; i < n; i++) {
    const sorted = frames.map((f) => f.cells[i] as number).sort((a, b) => a - b);
    const contrast = percentile(sorted, 0.9) - percentile(sorted, 0.1);
    if (contrast > bestContrast) {
      bestContrast = contrast;
      best = i;
    }
  }
  if (best < 0 || bestContrast < MIN_CONTRAST) return null;
  return frames.map((f) => ({ tMs: f.tMs, level: f.cells[best] as number }));
}
