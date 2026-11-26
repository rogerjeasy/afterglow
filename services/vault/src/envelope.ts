/**
 * The only thing this service stores: an account's vault record, exactly as the
 * device's account service writes it (`.kiro/specs/accounts`, ACC-18). It is
 * ciphertext, KDF parameters and wrapped keys. This check is structural: the server
 * cannot read the data, so it refuses anything that is not shaped like the record
 * (CA-03).
 */

/** 256 KiB: a household is a few kilobytes; this leaves room and stays under DynamoDB's 400 KB item limit. */
export const MAX_RECORD_BYTES = 256 * 1024;
export const MAX_KDF_ITERATIONS = 10_000_000;
const MIN_KDF_ITERATIONS = 100_000;

const B64URL = /^[A-Za-z0-9_-]+$/;

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isB64 = (x: unknown, max = MAX_RECORD_BYTES): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max && B64URL.test(x);

const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(o).every((k) => keys.includes(k));

function isKdf(x: unknown): boolean {
  if (!isObj(x) || !onlyKeys(x, ['name', 'iterations', 'salt'])) return false;
  const it = x.iterations;
  return (
    x.name === 'PBKDF2-SHA256' &&
    typeof it === 'number' &&
    Number.isInteger(it) &&
    it >= MIN_KDF_ITERATIONS &&
    it <= MAX_KDF_ITERATIONS &&
    isB64(x.salt, 128)
  );
}

function isSealed(x: unknown, extra: readonly string[] = []): boolean {
  return isObj(x) && onlyKeys(x, ['iv', 'ct', ...extra]) && isB64(x.iv, 64) && isB64(x.ct);
}

/** True only for a well-formed vault record of at most MAX_RECORD_BYTES (UTF-8). */
export function isVaultRecord(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  if (new TextEncoder().encode(raw).length > MAX_RECORD_BYTES) return false;
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!isObj(x) || !onlyKeys(x, ['v', 'accountId', 'kdf', 'wrappedDek', 'recovery', 'data'])) {
    return false;
  }
  if (x.v !== 1 || typeof x.accountId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(x.accountId)) {
    return false;
  }
  if (!isKdf(x.kdf) || !isSealed(x.wrappedDek)) return false;
  const rec = x.recovery;
  if (
    !isObj(rec) ||
    !onlyKeys(rec, ['kdf', 'wrappedDek']) ||
    !isKdf(rec.kdf) ||
    !isSealed(rec.wrappedDek)
  ) {
    return false;
  }
  if (x.data === null) return true;
  if (!isSealed(x.data, ['rev'])) return false;
  const rev = (x.data as Record<string, unknown>).rev;
  return typeof rev === 'number' && Number.isInteger(rev) && rev >= 1;
}
