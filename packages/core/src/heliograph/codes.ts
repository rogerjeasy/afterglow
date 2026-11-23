/**
 * The Heliograph message set (product spec 7.4). The 4-bit code space has room
 * for 15 messages; 11 are assigned and 0 and 12..15 are reserved. A frame that
 * carries a reserved code is refused, never shown (HL-10).
 */
export const MESSAGE_CODES = {
  SAFE: 1,
  HELP: 2,
  NEED_MEDS: 3,
  NEED_WATER: 4,
  NEED_HEAT: 5,
  NEED_COOL: 6,
  CHARGE_HERE: 7,
  WATER_HERE: 8,
  OPEN_HERE: 9,
  COMING: 10,
  ACK: 11,
} as const;

export type MessageName = keyof typeof MESSAGE_CODES;

const BY_NUMBER: ReadonlyMap<number, MessageName> = new Map(
  (Object.entries(MESSAGE_CODES) as [MessageName, number][]).map(([name, n]) => [n, name]),
);

/** The name for an assigned code, or null for a reserved or out-of-range one. */
export function nameOfCode(n: number): MessageName | null {
  return BY_NUMBER.get(n) ?? null;
}

/** Roster slots are 4 bits: a receiver tells at most 16 senders apart (spec Analysis). */
export const MAX_SLOT = 15;
/** The sequence counter is 4 bits and wraps; it only groups the repeats of one message. */
export const MAX_SEQUENCE = 15;

/** What a frame carries. `slot` is the sender's pair-local roster slot on the receiver. */
export interface HeliographMessage {
  readonly code: MessageName;
  readonly slot: number;
  readonly sequence: number;
}
