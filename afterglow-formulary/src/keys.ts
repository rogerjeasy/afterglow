import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { type TrustAnchor, fromBase64Url, toBase64Url, utf8 } from '@afterglow/adapters';
import { isInside } from './safe.js';

/**
 * Signing keys (FP-07). The private key is created outside the repository with
 * owner-only permissions and is never printed. Only the public half is kept here.
 */

const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;

export interface GeneratedKey {
  readonly anchor: TrustAnchor;
  /** PKCS#8, base64url. Written to a file by the caller; never logged. */
  readonly privatePkcs8: string;
}

export async function generateKey(keyId: string): Promise<GeneratedKey> {
  if (!KEY_ID.test(keyId)) throw new Error('A key id is 1 to 64 letters, digits, - or _.');
  const pair = (await globalThis.crypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', pair.publicKey));
  const pkcs8 = new Uint8Array(await globalThis.crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { anchor: { keyId, publicKey: toBase64Url(raw) }, privatePkcs8: toBase64Url(pkcs8) };
}

/** Write a new private key file: outside the repo, new, owner-only. Refuses anything else. */
export function writePrivateKey(path: string, repoRoot: string, privatePkcs8: string): void {
  if (isInside(repoRoot, path)) {
    throw new Error('Refusing to write a private key inside the repository.');
  }
  if (existsSync(path)) throw new Error('Refusing to overwrite an existing key file.');
  writeFileSync(path, privatePkcs8, { flag: 'wx', mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Read a private key file, refusing one outside owner-only permissions or inside the repo. */
export function readPrivateKey(path: string, repoRoot: string): string {
  if (isInside(repoRoot, path)) {
    throw new Error('Refusing to read a private key from inside the repository.');
  }
  const st = statSync(path);
  if (!st.isFile()) throw new Error('The key path is not a file.');
  if (process.platform !== 'win32' && (st.mode & 0o077) !== 0) {
    throw new Error('Refusing a private key that group or others can read. Run: chmod 600 <file>');
  }
  return readFileSync(path, 'utf8').trim();
}

/** A signer that returns `<keyId>.<base64url signature>`, the form the app verifies. */
export async function makeSigner(
  keyId: string,
  privatePkcs8: string,
): Promise<(payload: string) => Promise<string>> {
  if (!KEY_ID.test(keyId)) throw new Error('A key id is 1 to 64 letters, digits, - or _.');
  const key = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    fromBase64Url(privatePkcs8) as BufferSource,
    'Ed25519',
    false,
    ['sign'],
  );
  return async (payload) => {
    const sig = new Uint8Array(
      await globalThis.crypto.subtle.sign('Ed25519', key, utf8(payload) as BufferSource),
    );
    return `${keyId}.${toBase64Url(sig)}`;
  };
}

export type Signer = (payload: string) => Promise<string>;

/** Anchors file: public keys only. Refuses anything that looks like a private key. */
export function parseAnchors(raw: unknown): TrustAnchor[] {
  if (!Array.isArray(raw)) throw new Error('anchors.json must be a list.');
  return raw.map((a) => {
    if (typeof a !== 'object' || a === null) throw new Error('An anchor is not an object.');
    const keys = Object.keys(a).sort().join();
    if (keys !== 'keyId,publicKey')
      throw new Error('An anchor has fields other than keyId and publicKey.');
    const { keyId, publicKey } = a as TrustAnchor;
    if (typeof keyId !== 'string' || !KEY_ID.test(keyId))
      throw new Error('An anchor key id is invalid.');
    if (typeof publicKey !== 'string' || fromBase64Url(publicKey).length !== 32) {
      throw new Error('An anchor public key must be a raw 32-byte Ed25519 key.');
    }
    return { keyId, publicKey };
  });
}
