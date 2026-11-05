import { fromBase64Url, randomBytes, toBase64Url, unutf8, utf8 } from './bytes.js';

/**
 * The vault: zero-knowledge encryption for one account's data (ACC-04..ACC-09).
 *
 *   passphrase --PBKDF2--> KEK --wraps--> DEK --AES-GCM--> data
 *   recovery code --PBKDF2--> KEK' --wraps--> the same DEK
 *
 * Only wrapped keys and ciphertext are ever stored. The passphrase, the KEKs and
 * the raw DEK are never stored. A passphrase is checked only by successfully
 * unwrapping the DEK with authenticated encryption, never against a stored hash.
 * Every ciphertext is bound to its account and purpose through AAD, so it cannot
 * be moved to another account (ACC-06).
 */

export const VAULT_VERSION = 1 as const;
/** OWASP's floor for PBKDF2-HMAC-SHA256 (ACC-08). Tests may inject less; production may not. */
export const DEFAULT_KDF_ITERATIONS = 600_000;
const IV_BYTES = 12;
const SALT_BYTES = 16;

/** One generic failure for every way unlocking can go wrong (ACC-05). */
export class VaultError extends Error {
  constructor() {
    super('Could not unlock. Check the passphrase, or use your recovery code.');
    this.name = 'VaultError';
  }
}

export interface KdfParams {
  readonly name: 'PBKDF2-SHA256';
  readonly iterations: number;
  readonly salt: string;
}
export interface Sealed {
  readonly iv: string;
  readonly ct: string;
}

export function newKdf(iterations: number = DEFAULT_KDF_ITERATIONS): KdfParams {
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('bad iteration count');
  return { name: 'PBKDF2-SHA256', iterations, salt: toBase64Url(randomBytes(SALT_BYTES)) };
}

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

/** Derive a key-encryption key from a secret. Non-extractable; can only wrap and unwrap. */
export async function deriveKek(secret: string, kdf: KdfParams): Promise<CryptoKey> {
  if (kdf.name !== 'PBKDF2-SHA256' || !Number.isInteger(kdf.iterations) || kdf.iterations < 1) {
    throw new VaultError();
  }
  const base = await subtle().importKey('raw', utf8(secret.normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** A fresh random data key. Extractable only so it can be wrapped twice at creation. */
export function generateDek(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey, aad: string): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES); // ACC-09: fresh IV every time
  const ct = await subtle().wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv,
    additionalData: utf8(aad),
  });
  return { iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

/**
 * Unwrap the DEK. By default the result is non-extractable: it can encrypt and
 * decrypt but can never be read back out (ACC-07). `extractable` is true only
 * inside re-authenticated operations that must re-wrap the key.
 */
export async function unwrapDek(
  wrapped: Sealed,
  kek: CryptoKey,
  aad: string,
  extractable = false,
): Promise<CryptoKey> {
  try {
    return await subtle().unwrapKey(
      'raw',
      fromBase64Url(wrapped.ct),
      kek,
      { name: 'AES-GCM', iv: fromBase64Url(wrapped.iv), additionalData: utf8(aad) },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new VaultError();
  }
}

export async function seal(key: CryptoKey, plaintext: Uint8Array, aad: string): Promise<Sealed> {
  const iv = randomBytes(IV_BYTES); // ACC-09
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    key,
    plaintext,
  );
  return { iv: toBase64Url(iv), ct: toBase64Url(new Uint8Array(ct)) };
}

export async function open(key: CryptoKey, sealed: Sealed, aad: string): Promise<Uint8Array> {
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(sealed.iv), additionalData: utf8(aad) },
      key,
      fromBase64Url(sealed.ct),
    );
    return new Uint8Array(pt);
  } catch {
    throw new VaultError();
  }
}

export async function sealText(key: CryptoKey, text: string, aad: string): Promise<Sealed> {
  return seal(key, utf8(text), aad);
}
export async function openText(key: CryptoKey, sealed: Sealed, aad: string): Promise<string> {
  const bytes = await open(key, sealed, aad);
  try {
    return unutf8(bytes);
  } catch {
    throw new VaultError();
  }
}

// ----- additional authenticated data: binds each ciphertext to account and purpose (ACC-06)

export const aad = {
  passphraseWrap: (accountId: string): string => `afterglow:v1:dek:pass:${accountId}`,
  recoveryWrap: (accountId: string): string => `afterglow:v1:dek:recovery:${accountId}`,
  data: (accountId: string, rev: number): string => `afterglow:v1:data:${accountId}:${rev}`,
};

// ----- recovery code (ACC-12): 25 symbols x 5 bits = 125 bits of entropy

/** 32 symbols, no I or O, no 0 or 1, so it can be read aloud and copied by hand. */
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const RECOVERY_LENGTH = 25;

export function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_LENGTH);
  let raw = '';
  // 256 is a multiple of 32, so masking is uniform: no modulo bias.
  for (const b of bytes) raw += RECOVERY_ALPHABET[b & 31];
  return formatRecoveryCode(raw);
}

export function formatRecoveryCode(raw: string): string {
  return raw.match(/.{1,5}/g)?.join('-') ?? raw;
}

/** Canonical form for deriving the key: upper case, no separators. Null if it cannot be a code. */
export function normaliseRecoveryCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, '');
  if (raw.length !== RECOVERY_LENGTH) return null;
  for (const ch of raw) if (!RECOVERY_ALPHABET.includes(ch)) return null;
  return raw;
}
