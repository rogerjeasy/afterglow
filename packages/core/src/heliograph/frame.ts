import {
  type HeliographMessage,
  MAX_SEQUENCE,
  MAX_SLOT,
  MESSAGE_CODES,
  nameOfCode,
} from './codes.js';
import { type Bit, bitsToNumber, crc4, hammingDecode, hammingEncode, numberToBits } from './fec.js';

/** Seven alternating pairs to lock the clock, then one inverted bit as the marker (design). */
export const PREAMBLE: readonly Bit[] = [1, 1, 1, 1, 1, 1, 1, 0];
export const CODED_BITS = 24;
export const FRAME_BITS = PREAMBLE.length + CODED_BITS;
export const SYMBOLS_PER_BIT = 2;
export const FRAME_SYMBOLS = FRAME_BITS * SYMBOLS_PER_BIT;
/** 5 symbols per second (product spec 7.4). */
export const SYMBOL_MS = 200;
export const FRAME_MS = FRAME_SYMBOLS * SYMBOL_MS;

const isWhole = (n: unknown, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= max;

/** The 24 coded bits (two Hamming words) for a message, or null when it is out of range (HL-02). */
export function encodeCoded(msg: HeliographMessage): Bit[] | null {
  if (typeof msg !== 'object' || msg === null) return null;
  // An own-property check: `MESSAGE_CODES['toString']` would otherwise find Object.prototype.
  const code = Object.prototype.hasOwnProperty.call(MESSAGE_CODES, msg.code)
    ? (MESSAGE_CODES as Record<string, number>)[msg.code]
    : undefined;
  if (code === undefined || !isWhole(msg.slot, MAX_SLOT) || !isWhole(msg.sequence, MAX_SEQUENCE)) {
    return null;
  }
  const head = [
    ...numberToBits(msg.sequence, 4),
    ...numberToBits(code, 4),
    ...numberToBits(msg.slot, 4),
  ];
  const body = [...head, ...numberToBits(crc4(head), 4)];
  return [
    ...hammingEncode(body.slice(0, 8) as Bit[]),
    ...hammingEncode(body.slice(8, 16) as Bit[]),
  ];
}

/** The full 32-bit frame, or null for an invalid message. */
export function encodeFrame(msg: HeliographMessage): Bit[] | null {
  const coded = encodeCoded(msg);
  return coded === null ? null : [...PREAMBLE, ...coded];
}

export type DecodeFailure = 'length' | 'hamming' | 'crc' | 'reservedCode';

export type FrameDecode =
  | { readonly ok: true; readonly message: HeliographMessage; readonly correctedWords: number }
  | { readonly ok: false; readonly reason: DecodeFailure };

/**
 * Decode 24 coded bits: Hamming (correct one flip per word), then the CRC over
 * the corrected body, then the message-code range (HL-03, HL-04, HL-01).
 * Anything that fails any step is refused, never guessed.
 */
export function decodeCoded(coded: readonly number[]): FrameDecode {
  if (!Array.isArray(coded) && !ArrayBuffer.isView(coded)) return { ok: false, reason: 'length' };
  if (coded.length !== CODED_BITS) return { ok: false, reason: 'length' };
  const a = hammingDecode(coded.slice(0, 12));
  const b = hammingDecode(coded.slice(12, 24));
  if (!a.ok || !b.ok) return { ok: false, reason: 'hamming' };
  const body = [...a.data, ...b.data];
  const head = body.slice(0, 12);
  if (crc4(head) !== bitsToNumber(body.slice(12, 16))) return { ok: false, reason: 'crc' };
  const code = nameOfCode(bitsToNumber(head.slice(4, 8)));
  if (code === null) return { ok: false, reason: 'reservedCode' };
  return {
    ok: true,
    message: {
      code,
      slot: bitsToNumber(head.slice(8, 12)),
      sequence: bitsToNumber(head.slice(0, 4)),
    },
    correctedWords: (a.corrected ? 1 : 0) + (b.corrected ? 1 : 0),
  };
}

/** Two messages are the same message when code, slot and sequence all match. */
export function sameMessage(a: HeliographMessage, b: HeliographMessage): boolean {
  return a.code === b.code && a.slot === b.slot && a.sequence === b.sequence;
}
