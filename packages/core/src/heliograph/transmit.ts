import type { HeliographMessage } from './codes.js';
import { FRAME_SYMBOLS, SYMBOL_MS, encodeFrame } from './frame.js';
import { manchesterEncode } from './manchester.js';

export interface Run {
  readonly lit: boolean;
  readonly ms: number;
}

export interface TransmitPlan {
  /** Alternating lit and dark intervals, starting with the first symbol. */
  readonly runs: readonly Run[];
  readonly totalMs: number;
  readonly repeats: number;
  readonly symbols: number;
}

export const MAX_REPEATS = 5;
export const DEFAULT_REPEATS = 3;

/**
 * The schedule a torch (or a screen) follows (HL-06): the frame, Manchester
 * coded, repeated back to back, merged into alternating lit and dark runs.
 * Null for an invalid message or repeat count.
 */
export function planTransmission(
  msg: HeliographMessage,
  repeats: number = DEFAULT_REPEATS,
): TransmitPlan | null {
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_REPEATS) return null;
  const frame = encodeFrame(msg);
  if (frame === null) return null;
  const one = manchesterEncode(frame);
  const runs: { lit: boolean; ms: number }[] = [];
  for (let r = 0; r < repeats; r++) {
    for (const s of one) {
      const lit = s === 1;
      const last = runs[runs.length - 1];
      if (last && last.lit === lit) last.ms += SYMBOL_MS;
      else runs.push({ lit, ms: SYMBOL_MS });
    }
  }
  return {
    runs,
    totalMs: runs.reduce((n, r) => n + r.ms, 0),
    repeats,
    symbols: FRAME_SYMBOLS * repeats,
  };
}
