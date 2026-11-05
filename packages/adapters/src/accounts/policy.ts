/**
 * Passphrase policy (ACC-10). A passphrase is the only thing between a copy of
 * the stored vault and the data, so the policy is strict and says why.
 */

export const MIN_PASSPHRASE_LENGTH = 12;
const MIN_DISTINCT = 5;

/** Small deny list; the real defence is length, variety and the slow KDF. */
const COMMON = new Set([
  'password',
  'passphrase',
  'letmein',
  'iloveyou',
  'qwerty',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  'welcome',
  'administrator',
  'trustno1',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'princess',
  'sunshine',
  'afterglow',
  'blackout',
  'loadshedding',
  'eskom',
  'abc123',
  'changeme',
  'secret',
  'master',
]);

export type PolicyResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const codePoints = (s: string): string[] => [...s];

function longestRun(chars: readonly string[]): number {
  let best = 1;
  let run = 1;
  let prev = chars[0]?.codePointAt(0) ?? 0;
  for (let i = 1; i < chars.length; i++) {
    const cur = chars[i]?.codePointAt(0) ?? 0;
    if (Math.abs(cur - prev) === 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
    prev = cur;
  }
  return best;
}

export function checkPassphrase(passphrase: string, accountName: string): PolicyResult {
  const chars = codePoints(passphrase.normalize('NFKC'));
  if (chars.length < MIN_PASSPHRASE_LENGTH) {
    return {
      ok: false,
      reason: `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A few ordinary words strung together works well.`,
    };
  }
  if (new Set(chars).size < MIN_DISTINCT) {
    return { ok: false, reason: 'Too repetitive. Use a mix of different characters or words.' };
  }
  if (longestRun(chars) >= 6) {
    return { ok: false, reason: 'Avoid runs like 123456 or abcdef.' };
  }
  const lower = passphrase.toLowerCase();
  const name = accountName.trim().toLowerCase();
  if (name.length >= 3 && lower.includes(name)) {
    return { ok: false, reason: 'Do not include your account name in the passphrase.' };
  }
  // Strip digits and separators, then look for a common word that makes up most of it.
  const letters = lower.replace(/[^a-z]/g, '');
  for (const word of COMMON) {
    if (letters === word || (letters.startsWith(word) && letters.length - word.length <= 2)) {
      return { ok: false, reason: 'That is too common. Pick something only you would think of.' };
    }
  }
  return { ok: true };
}
