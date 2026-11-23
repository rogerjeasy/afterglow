import type { Bit } from './fec.js';

/** A symbol is lit (1) or dark (0). */
export type Symbol01 = 0 | 1;

/** Bit 1 is lit then dark; bit 0 is dark then lit (HL-05). */
export function manchesterEncode(bits: readonly Bit[]): Symbol01[] {
  const out: Symbol01[] = [];
  for (const b of bits) {
    if (b === 1) out.push(1, 0);
    else out.push(0, 1);
  }
  return out;
}

/**
 * One pair of symbols to a bit. `[0,0]`, `[1,1]` and a missing symbol are
 * invalid and give null: they are never turned into a bit (HL-05).
 */
export function manchesterPair(
  a: number | null | undefined,
  b: number | null | undefined,
): Bit | null {
  if (a === 1 && b === 0) return 1;
  if (a === 0 && b === 1) return 0;
  return null;
}

/** Decode a whole symbol sequence; any invalid pair, or an odd length, gives null. */
export function manchesterDecode(symbols: readonly (number | null)[]): Bit[] | null {
  if (symbols.length % 2 !== 0) return null;
  const out: Bit[] = [];
  for (let i = 0; i < symbols.length; i += 2) {
    const bit = manchesterPair(symbols[i], symbols[i + 1]);
    if (bit === null) return null;
    out.push(bit);
  }
  return out;
}
