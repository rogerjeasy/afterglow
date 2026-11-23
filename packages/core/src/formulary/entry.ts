import type { Condition, FormularyEntry } from './types.js';

/**
 * Upper edge of the refrigerated range (the 2-8 C cold chain). This is a
 * stated assumption of the model, not a label claim (see the spec Analysis).
 */
export const REFRIGERATED_MAX_C = 8;

export const MINUTES_PER_DAY = 1440;

/** Domain tag so a signature over an entry can never be replayed as another document type. */
export const PAYLOAD_TAG = 'afterglow-formulary-entry/v1';

const ENTRY_KEYS = [
  'product',
  'labelVersion',
  'condition',
  'maxTempC',
  'maxDays',
  'notes',
  'source',
  'approver',
  'approvedAt',
  'signature',
] as const;
const SOURCE_KEYS = ['title', 'url', 'excerpt'] as const;

const MAX_NAME = 200;
const MAX_SHORT = 200;
const MAX_NOTES = 2000;
const MAX_EXCERPT = 5000;
const MAX_SIGNATURE = 2000;
const MAX_TEMP_C = 60;
const MAX_DAYS = 3650;

/** Normalised product key: Unicode NFKC, lower case, collapsed whitespace. */
export function normaliseProduct(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The exact bytes that are signed (FM-01). Strings are used as written, not
 * normalised, so any change to any field breaks the signature. The review
 * pipeline must sign this same function's output.
 */
export function canonicalPayload(e: Omit<FormularyEntry, 'signature'>): string {
  return JSON.stringify([
    PAYLOAD_TAG,
    e.product,
    e.labelVersion,
    e.condition,
    e.maxTempC,
    e.maxDays,
    e.notes,
    [e.source.title, e.source.url, e.source.excerpt],
    e.approver,
    e.approvedAt,
  ]);
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
const CONTROL = /[\u0000-\u001f\u007f]/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function hasExactKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(o);
  return (
    own.length === keys.length && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k))
  );
}

function text(v: unknown, min: number, max: number, allowControl = false): string | null {
  if (typeof v !== 'string') return null;
  if (v.length < min || v.length > max) return null;
  if (!allowControl && CONTROL.test(v)) return null;
  return v;
}

/**
 * Parse `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SS[.sss]Z` to epoch milliseconds,
 * or null when it is not a real calendar instant.
 */
export function parseApprovedAt(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z)?$/.exec(s);
  if (!m) return null;
  const num = (x: string | undefined): number => (x === undefined ? 0 : Number(x));
  const y = num(m[1]);
  const mo = num(m[2]);
  const d = num(m[3]);
  const h = num(m[4]);
  const mi = num(m[5]);
  const se = num(m[6]);
  const millis = m[7] === undefined ? 0 : Number(m[7].padEnd(3, '0'));
  const t = Date.UTC(y, mo - 1, d, h, mi, se, millis);
  if (!Number.isFinite(t)) return null;
  const back = new Date(t);
  const ok =
    back.getUTCFullYear() === y &&
    back.getUTCMonth() === mo - 1 &&
    back.getUTCDate() === d &&
    back.getUTCHours() === h &&
    back.getUTCMinutes() === mi &&
    back.getUTCSeconds() === se;
  return ok ? t : null;
}

export type ParseResult =
  | { readonly ok: true; readonly entry: FormularyEntry }
  | { readonly ok: false; readonly detail: string; readonly product: string | null };

/**
 * Validate one untrusted value into a fresh entry (FM-01). Reads each field
 * once into a new object so a getter or later mutation cannot change what was
 * checked. Never throws.
 */
export function parseEntry(raw: unknown): ParseResult {
  try {
    return parseEntryUnsafe(raw);
  } catch {
    return { ok: false, detail: 'The entry could not be read.', product: null };
  }
}

function safeName(raw: unknown): string | null {
  if (!isPlainObject(raw)) return null;
  const p = raw.product;
  return typeof p === 'string' && p.length <= MAX_NAME && !CONTROL.test(p) ? p : null;
}

function parseEntryUnsafe(raw: unknown): ParseResult {
  const name = safeName(raw);
  const bad = (detail: string): ParseResult => ({ ok: false, detail, product: name });
  if (!isPlainObject(raw)) return bad('Not an object.');
  if (!hasExactKeys(raw, ENTRY_KEYS)) return bad('Fields do not match the entry shape exactly.');

  const product = text(raw.product, 1, MAX_NAME);
  if (product === null || normaliseProduct(product) === '') return bad('Invalid product.');
  const labelVersion = text(raw.labelVersion, 1, MAX_SHORT);
  if (labelVersion === null) return bad('Invalid labelVersion.');
  const condition = raw.condition;
  if (condition !== 'unopened' && condition !== 'inUse') return bad('Invalid condition.');

  const maxTempC = raw.maxTempC;
  if (typeof maxTempC !== 'number' || !Number.isFinite(maxTempC)) return bad('Invalid maxTempC.');
  if (maxTempC < REFRIGERATED_MAX_C || maxTempC > MAX_TEMP_C) {
    return bad('maxTempC is outside the range this model can represent.');
  }
  const maxDays = raw.maxDays;
  if (typeof maxDays !== 'number' || !Number.isFinite(maxDays)) return bad('Invalid maxDays.');
  if (maxDays < 0 || maxDays > MAX_DAYS) return bad('maxDays is out of range.');

  const notes = text(raw.notes, 0, MAX_NOTES, true);
  if (notes === null) return bad('Invalid notes.');

  const src = raw.source;
  if (!isPlainObject(src) || !hasExactKeys(src, SOURCE_KEYS)) return bad('Invalid source shape.');
  const title = text(src.title, 1, MAX_SHORT);
  const url = text(src.url, 1, 2000);
  const excerpt = text(src.excerpt, 1, MAX_EXCERPT, true);
  if (title === null || url === null || excerpt === null) return bad('Invalid source.');
  if (!/^https:\/\/[^\s/?#]+([/?#]\S*)?$/.test(url)) return bad('Source URL must be https.');

  const approver = text(raw.approver, 1, MAX_SHORT);
  if (approver === null || approver.trim() === '') return bad('Invalid approver.');
  const approvedAt = text(raw.approvedAt, 1, 40);
  if (approvedAt === null || parseApprovedAt(approvedAt) === null)
    return bad('Invalid approvedAt.');
  const signature = text(raw.signature, 1, MAX_SIGNATURE);
  if (signature === null || /\s/.test(signature)) return bad('Invalid signature.');

  const entry: FormularyEntry = {
    product,
    labelVersion,
    condition: condition as Condition,
    maxTempC,
    maxDays,
    notes,
    source: { title, url, excerpt },
    approver,
    approvedAt,
    signature,
  };
  return { ok: true, entry };
}
