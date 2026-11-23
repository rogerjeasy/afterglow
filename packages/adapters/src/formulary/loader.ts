/**
 * Signed-formulary loader (spec `formulary`, FM-15..FM-18).
 *
 * The core is synchronous and imports no crypto, so it takes an injected
 * `Verifier`. This adapter owns the part the core must not: it verifies Ed25519
 * signatures asynchronously against public keys **pinned in the app**, remembers
 * exactly which (payload, signature) pairs verified, and hands the core a
 * synchronous verifier that accepts only those pairs. Admission, validation and
 * conflict handling stay in the core's `buildFormulary` (FM-18).
 *
 * It also refuses a snapshot older than the last one accepted (rollback
 * protection, FM-16). Persisting the accepted version is the caller's job.
 *
 * Nothing here throws for hostile input.
 */
import { formulary } from '@afterglow/core';
import { fromBase64Url, utf8 } from '../crypto/bytes.js';

export interface TrustAnchor {
  /** `[A-Za-z0-9_-]{1,64}`. Appears in each signature as `<keyId>.<signature>`. */
  readonly keyId: string;
  /** Raw 32-byte Ed25519 public key, base64url without padding. */
  readonly publicKey: string;
}

export type RefusalCode = 'badAnchors' | 'badSnapshot' | 'badState' | 'badManifest' | 'tooLarge';

export type LoadResult =
  | {
      readonly kind: 'loaded';
      readonly formulary: formulary.Formulary;
      /** Persist this as the new last-accepted version. */
      readonly version: number;
    }
  | { readonly kind: 'rollback'; readonly offered: number; readonly lastAccepted: number }
  | { readonly kind: 'refused'; readonly code: RefusalCode; readonly reason: string };

/** More than this and verification would stall a phone; refuse instead of truncating. */
export const MAX_ENTRIES = 20_000;

/** Domain tag for the manifest signature (FM-19). */
export const MANIFEST_TAG = 'afterglow-formulary-manifest/v1';

const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION = /^[1-9][0-9]{0,14}$/;
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

const refused = (code: RefusalCode, reason: string): LoadResult => ({
  kind: 'refused',
  code,
  reason,
});

async function importAnchors(
  anchors: unknown,
): Promise<Map<string, CryptoKey> | { readonly error: string }> {
  if (!Array.isArray(anchors) || anchors.length === 0) return { error: 'No trust anchors.' };
  const keys = new Map<string, CryptoKey>();
  for (const a of anchors as unknown[]) {
    if (typeof a !== 'object' || a === null) return { error: 'An anchor is not an object.' };
    const { keyId, publicKey } = a as Record<string, unknown>;
    if (typeof keyId !== 'string' || !KEY_ID.test(keyId))
      return { error: 'An anchor key id is invalid.' };
    if (keys.has(keyId)) return { error: 'Two anchors share a key id.' };
    if (typeof publicKey !== 'string') return { error: 'An anchor public key is invalid.' };
    let raw: Uint8Array;
    try {
      raw = fromBase64Url(publicKey);
    } catch {
      return { error: 'An anchor public key is not base64url.' };
    }
    if (raw.length !== ED25519_PUBLIC_KEY_BYTES)
      return { error: 'An anchor public key has the wrong length.' };
    try {
      keys.set(
        keyId,
        await globalThis.crypto.subtle.importKey('raw', raw as BufferSource, 'Ed25519', false, [
          'verify',
        ]),
      );
    } catch {
      return { error: 'An anchor public key could not be imported.' };
    }
  }
  return keys;
}

/** Split `<keyId>.<base64url>`; null when it does not have exactly that shape. */
function splitSignature(sig: string): { keyId: string; bytes: Uint8Array } | null {
  const dot = sig.indexOf('.');
  if (dot <= 0 || dot !== sig.lastIndexOf('.')) return null;
  const keyId = sig.slice(0, dot);
  if (!KEY_ID.test(keyId)) return null;
  try {
    const bytes = fromBase64Url(sig.slice(dot + 1));
    return bytes.length === ED25519_SIGNATURE_BYTES ? { keyId, bytes } : null;
  } catch {
    return null;
  }
}

/** The exact bytes the pipeline signs for a snapshot (FM-19). */
export function manifestPayload(
  formularyVersion: string,
  entrySignatures: readonly string[],
): string {
  const sorted = [...entrySignatures].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([MANIFEST_TAG, formularyVersion, sorted]);
}

/**
 * Verify a snapshot against pinned anchors and build the table with the core.
 *
 * @param lastAcceptedVersion the highest `formularyVersion` accepted before
 *   (0 when none). A lower offered version is refused as a rollback.
 */
export async function loadFormulary(
  snapshot: unknown,
  anchors: readonly TrustAnchor[],
  lastAcceptedVersion: number,
): Promise<LoadResult> {
  try {
    return await loadUnsafe(snapshot, anchors, lastAcceptedVersion);
  } catch {
    return refused('badSnapshot', 'The snapshot could not be read.');
  }
}

async function loadUnsafe(
  snapshot: unknown,
  anchors: unknown,
  lastAcceptedVersion: number,
): Promise<LoadResult> {
  if (!Number.isSafeInteger(lastAcceptedVersion) || lastAcceptedVersion < 0) {
    return refused('badState', 'The last accepted version is not valid.');
  }
  const keys = await importAnchors(anchors);
  if ('error' in keys) return refused('badAnchors', keys.error);

  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    return refused('badSnapshot', 'The snapshot is not an object.');
  }
  const { formularyVersion, entries } = snapshot as Record<string, unknown>;
  if (typeof formularyVersion !== 'string' || !VERSION.test(formularyVersion)) {
    return refused('badSnapshot', 'The snapshot version is not a positive whole number.');
  }
  if (!Array.isArray(entries)) return refused('badSnapshot', 'The snapshot has no entries.');
  if (entries.length > MAX_ENTRIES)
    return refused('tooLarge', 'The snapshot has too many entries.');

  const offered = Number(formularyVersion);
  if (!Number.isSafeInteger(offered))
    return refused('badSnapshot', 'The snapshot version is too large.');
  if (offered < lastAcceptedVersion) {
    return { kind: 'rollback', offered, lastAccepted: lastAcceptedVersion };
  }

  // FM-19: the whole snapshot must be signed, so the version and the exact set of
  // entries cannot be changed, and an old entry cannot be replayed under a new version.
  const entrySignatures: string[] = [];
  for (const raw of entries as unknown[]) {
    const sig =
      typeof raw === 'object' && raw !== null
        ? (raw as { signature?: unknown }).signature
        : undefined;
    if (typeof sig !== 'string') return refused('badSnapshot', 'An entry has no signature.');
    entrySignatures.push(sig);
  }
  const manifest = (snapshot as Record<string, unknown>).manifestSignature;
  const m = typeof manifest === 'string' ? splitSignature(manifest) : null;
  const manifestKey = m ? keys.get(m.keyId) : undefined;
  let manifestOk = false;
  if (m && manifestKey) {
    try {
      manifestOk = await globalThis.crypto.subtle.verify(
        'Ed25519',
        manifestKey,
        m.bytes as BufferSource,
        utf8(manifestPayload(formularyVersion, entrySignatures)) as BufferSource,
      );
    } catch {
      manifestOk = false;
    }
  }
  if (manifestOk !== true) {
    return refused(
      'badManifest',
      'The snapshot signature is missing or does not match its contents.',
    );
  }

  // Verify asynchronously now; the core then asks a synchronous question.
  const verified = new Set<string>();
  for (const raw of entries as unknown[]) {
    const parsed = formulary.parseEntry(raw);
    if (!parsed.ok) continue; // the core rejects it again with a reason
    const { entry } = parsed;
    const sig = splitSignature(entry.signature);
    const key = sig ? keys.get(sig.keyId) : undefined;
    if (!sig || !key) continue;
    const payload = formulary.canonicalPayload(entry);
    let ok = false;
    try {
      ok = await globalThis.crypto.subtle.verify(
        'Ed25519',
        key,
        sig.bytes as BufferSource,
        utf8(payload) as BufferSource,
      );
    } catch {
      ok = false;
    }
    if (ok === true) verified.add(`${payload}\u0000${entry.signature}`);
  }

  const verifier: formulary.Verifier = (payload, signature) =>
    verified.has(`${payload}\u0000${signature}`);
  const table = formulary.buildFormulary({ formularyVersion, entries }, verifier);
  return { kind: 'loaded', formulary: table, version: offered };
}
