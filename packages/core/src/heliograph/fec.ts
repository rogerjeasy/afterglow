/**
 * Forward error correction and error detection for the frame body.
 * Bits are arrays of 0 and 1, most significant first. Pure.
 */
export type Bit = 0 | 1;

/** Data bit positions (1-indexed) in a Hamming(12,8) word; 1, 2, 4 and 8 hold parity. */
const DATA_POSITIONS = [3, 5, 6, 7, 9, 10, 11, 12] as const;
const PARITY_POSITIONS = [1, 2, 4, 8] as const;

export function byteToBits(byte: number): Bit[] {
  const out: Bit[] = [];
  for (let i = 7; i >= 0; i--) out.push(((byte >> i) & 1) as Bit);
  return out;
}

export function bitsToNumber(bits: readonly number[]): number {
  let n = 0;
  for (const b of bits) n = (n << 1) | (b & 1);
  return n;
}

export function numberToBits(n: number, width: number): Bit[] {
  const out: Bit[] = [];
  for (let i = width - 1; i >= 0; i--) out.push(((n >> i) & 1) as Bit);
  return out;
}

/** Encode 8 data bits into a 12-bit single-error-correcting word. */
export function hammingEncode(data: readonly Bit[]): Bit[] {
  if (data.length !== 8) throw new RangeError('hammingEncode needs exactly 8 bits');
  const word: Bit[] = new Array(13).fill(0); // index 0 unused
  DATA_POSITIONS.forEach((pos, i) => {
    word[pos] = data[i] as Bit;
  });
  for (const p of PARITY_POSITIONS) {
    let parity = 0;
    for (let pos = 1; pos <= 12; pos++)
      if (pos !== p && (pos & p) !== 0) parity ^= word[pos] as number;
    word[p] = parity as Bit;
  }
  return word.slice(1);
}

export type HammingResult =
  | { readonly ok: true; readonly data: Bit[]; readonly corrected: boolean }
  /** The syndrome points outside the word: at least two bits are wrong. Never guessed. */
  | { readonly ok: false };

/** Decode a 12-bit word: corrects one flipped bit, refuses what it cannot correct. */
export function hammingDecode(word12: readonly number[]): HammingResult {
  if (word12.length !== 12 || word12.some((b) => b !== 0 && b !== 1)) return { ok: false };
  const word: number[] = [0, ...word12];
  let syndrome = 0;
  for (let pos = 1; pos <= 12; pos++) if (word[pos] === 1) syndrome ^= pos;
  let corrected = false;
  if (syndrome !== 0) {
    if (syndrome > 12) return { ok: false };
    word[syndrome] = (word[syndrome] as number) ^ 1;
    corrected = true;
  }
  return { ok: true, data: DATA_POSITIONS.map((pos) => word[pos] as Bit), corrected };
}

/** CRC-4 with generator x^4 + x + 1, zero initial value, over `bits`. Returns 0..15. */
export function crc4(bits: readonly number[]): number {
  let reg = 0;
  for (const bit of bits) {
    const feedback = ((reg >> 3) & 1) ^ (bit & 1);
    reg = (reg << 1) & 0xf;
    if (feedback === 1) reg ^= 0x3;
  }
  return reg;
}
