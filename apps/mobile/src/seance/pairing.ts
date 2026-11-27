import { href } from '../router';
/**
 * Pairing in person (product description 7.9 "roster and pairing"): a link that says
 * "this is me, and this is my number on your list". It is shown as a QR code to be
 * scanned, or sent as an invitation. Opening it never adds anyone by itself: the
 * person who opens it confirms. Mutual pairing is each side scanning the other's.
 * The number is local to the pair (a Heliograph slot), never a global identifier,
 * and nothing passes through a server.
 */

export interface PairOffer {
  readonly slot: number;
  readonly name: string;
}

const NAME_KEY = 'afterglow.seance.myname.v1';
export const MAX_NAME = 40;

export function cleanName(raw: string): string {
  // Printable text only, single spaces, bounded: it lands on someone else's list.
  return raw
    .normalize('NFKC')
    .replace(/[\p{C}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

export function getMyName(): string {
  try {
    return cleanName(localStorage.getItem(NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

export function setMyName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, cleanName(name));
  } catch {
    // private mode
  }
}

export function pairLink(offer: PairOffer, origin = window.location.origin): string {
  const q = new URLSearchParams({ s: String(offer.slot), n: cleanName(offer.name) });
  // The Séance's real path, with the offer in the hash so it never reaches a server log.
  return `${origin}${href('/app/seance')}#/seance/pair?${q.toString()}`;
}

/** The offer in a hash or a scanned text, or null for anything else. */
export function parsePair(text: string): PairOffer | null {
  const i = text.indexOf('#/seance/pair?');
  if (i < 0) return null;
  const q = new URLSearchParams(text.slice(i + '#/seance/pair?'.length));
  const s = q.get('s') ?? '';
  if (!/^\d{1,2}$/.test(s)) return null;
  const slot = Number(s);
  if (slot < 0 || slot > 63) return null;
  const name = cleanName(q.get('n') ?? '');
  if (name === '') return null;
  return { slot, name };
}
