import { type StorageLike, browserStorage } from '../household/store';

/**
 * Two small settings of the sender: its own number on the watcher's list and the
 * message counter. Neither is personal data. A bad stored value is ignored.
 */
export const SLOT_KEY = 'afterglow.seance.slot.v1';
export const SEQ_KEY = 'afterglow.seance.seq.v1';

function readInt(
  storage: StorageLike,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  try {
    const raw = storage.getItem(key);
    // Plain digits only: Number('') and Number(' ') are 0, which would pass as a real slot.
    if (raw === null || !/^\d{1,3}$/.test(raw)) return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  } catch {
    return fallback;
  }
}

function write(storage: StorageLike, key: string, value: number): void {
  try {
    storage.setItem(key, String(value));
  } catch {
    /* in-memory only */
  }
}

export const getMySlot = (s: StorageLike = browserStorage()): number =>
  readInt(s, SLOT_KEY, 0, 63, 1);
export const setMySlot = (slot: number, s: StorageLike = browserStorage()): void =>
  write(s, SLOT_KEY, slot);

/** The next message counter (0..3, wrapping). Returns the value to send now. */
export function nextSequence(s: StorageLike = browserStorage()): number {
  const current = readInt(s, SEQ_KEY, 0, 3, 0);
  write(s, SEQ_KEY, (current + 1) % 4);
  return current;
}
