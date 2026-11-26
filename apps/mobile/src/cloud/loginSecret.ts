/**
 * The login secret (cloud-accounts CA-09): what Cognito sees instead of the
 * passphrase. PBKDF2-SHA256 over the passphrase, salted with a fixed label and the
 * normalised email, at the same cost as the vault key. The vault key uses its own
 * random salt, so the login secret cannot be turned into it, and stealing Cognito's
 * SRP verifier gives an attacker nothing cheaper than attacking the vault itself.
 * Sign-in uses SRP, so even this secret is never sent.
 */

export const LOGIN_KDF_ITERATIONS = 600_000;
const LABEL = 'afterglow:v1:login:';

/** Emails are compared case-insensitively and without surrounding space, as Cognito does. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  const e = normaliseEmail(email);
  return e.length >= 5 && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

const toB64Url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export async function deriveLoginSecret(
  email: string,
  passphrase: string,
  iterations: number = LOGIN_KDF_ITERATIONS,
): Promise<string> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: enc.encode(LABEL + normaliseEmail(email)),
      iterations,
    },
    base,
    256,
  );
  // 43 characters of base64url: long, and within Cognito's password rules.
  return toB64Url(new Uint8Array(bits));
}
