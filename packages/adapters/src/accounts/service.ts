import { fromBase64Url, randomBytes, toBase64Url } from '../crypto/bytes.js';
import {
  DEFAULT_KDF_ITERATIONS,
  type KdfParams,
  type Sealed,
  VAULT_VERSION,
  VaultError,
  aad,
  deriveKek,
  generateDek,
  generateRecoveryCode,
  newKdf,
  normaliseRecoveryCode,
  openText,
  sealText,
  unwrapDek,
  wrapDek,
} from '../crypto/vault.js';
import { checkPassphrase } from './policy.js';

/**
 * Accounts on one device: a directory of names, one encrypted vault per account,
 * and sign-in that succeeds only by unwrapping the account's data key.
 *
 * Nothing here stores a passphrase, a passphrase hash, a derived key or any
 * plaintext (ACC-04). Every failure to unlock looks the same (ACC-05). The
 * vault record is the exact thing a future server would store (ACC-18).
 */

export interface RawStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AccountSummary {
  readonly id: string;
  readonly name: string;
}

export type AccountErrorCode =
  | 'auth-failed'
  | 'throttled'
  | 'policy'
  | 'name'
  | 'exists'
  | 'adult-required'
  | 'session-closed'
  | 'not-found';

export class AccountError extends Error {
  readonly code: AccountErrorCode;
  readonly retryAfterMs: number | undefined;
  constructor(code: AccountErrorCode, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'AccountError';
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

const GENERIC_AUTH = new VaultError().message;
const authFailed = (): AccountError => new AccountError('auth-failed', GENERIC_AUTH);

/** An unlocked account. Holds the data key in memory only, and only until closed (ACC-07). */
export class Session {
  readonly accountId: string;
  readonly name: string;
  private key: CryptoKey | null;
  constructor(accountId: string, name: string, key: CryptoKey) {
    this.accountId = accountId;
    this.name = name;
    this.key = key;
  }
  get active(): boolean {
    return this.key !== null;
  }
  /** @internal */
  useKey(): CryptoKey {
    if (!this.key) throw new AccountError('session-closed', 'This account is locked.');
    return this.key;
  }
  close(): void {
    this.key = null;
  }
}

interface VaultRecord {
  readonly v: typeof VAULT_VERSION;
  readonly accountId: string;
  readonly kdf: KdfParams;
  readonly wrappedDek: Sealed;
  readonly recovery: { readonly kdf: KdfParams; readonly wrappedDek: Sealed };
  readonly data: (Sealed & { readonly rev: number }) | null;
}

const KEYS = {
  directory: 'afterglow.accounts.directory.v1',
  throttle: 'afterglow.accounts.throttle.v1',
  vault: (id: string): string => `afterglow.accounts.vault.v1.${id}`,
} as const;

const MAX_KDF_ITERATIONS = 10_000_000; // refuse absurd values from a tampered record
const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;
const MAX_NAME_LENGTH = 40;

const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length < 4096;
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function parseKdf(x: unknown): KdfParams | null {
  if (!isRecord(x) || x.name !== 'PBKDF2-SHA256' || !isStr(x.salt)) return null;
  const it = x.iterations;
  if (typeof it !== 'number' || !Number.isInteger(it) || it < 1 || it > MAX_KDF_ITERATIONS) {
    return null;
  }
  return { name: 'PBKDF2-SHA256', iterations: it, salt: x.salt };
}
function parseSealed(x: unknown): Sealed | null {
  if (!isRecord(x) || !isStr(x.iv) || !isStr(x.ct)) return null;
  return { iv: x.iv, ct: x.ct };
}

/** Strict parse: anything unexpected is "no vault", which presents as a generic failure. */
function parseVault(raw: string | null, expectedId: string): VaultRecord | null {
  if (!raw) return null;
  try {
    const x: unknown = JSON.parse(raw);
    if (!isRecord(x) || x.v !== VAULT_VERSION || x.accountId !== expectedId) return null;
    const kdf = parseKdf(x.kdf);
    const wrappedDek = parseSealed(x.wrappedDek);
    const rec = isRecord(x.recovery) ? x.recovery : null;
    const rkdf = rec ? parseKdf(rec.kdf) : null;
    const rwrapped = rec ? parseSealed(rec.wrappedDek) : null;
    if (!kdf || !wrappedDek || !rkdf || !rwrapped) return null;
    let data: VaultRecord['data'] = null;
    if (x.data !== null) {
      const sealed = isRecord(x.data) ? parseSealed(x.data) : null;
      const rev = isRecord(x.data) ? x.data.rev : undefined;
      if (!sealed || typeof rev !== 'number' || !Number.isInteger(rev) || rev < 1) return null;
      data = { ...sealed, rev };
    }
    return {
      v: VAULT_VERSION,
      accountId: expectedId,
      kdf,
      wrappedDek,
      recovery: { kdf: rkdf, wrappedDek: rwrapped },
      data,
    };
  } catch {
    return null;
  }
}

export interface AccountServiceOptions {
  readonly storage: RawStorage;
  readonly now?: () => number;
  /** Tests inject a small number; production uses the default (>= 600,000). */
  readonly kdfIterations?: number;
}

export interface CreateAccountInput {
  readonly name: string;
  readonly passphrase: string;
  /** ACC-16: must be true. Not stored. */
  readonly confirmedAdult: boolean;
}

export interface AccountService {
  listAccounts(): readonly AccountSummary[];
  createAccount(input: CreateAccountInput): Promise<{ session: Session; recoveryCode: string }>;
  signIn(accountId: string, passphrase: string): Promise<Session>;
  recover(
    accountId: string,
    recoveryCode: string,
    newPassphrase: string,
  ): Promise<{ session: Session; recoveryCode: string }>;
  changePassphrase(session: Session, current: string, next: string): Promise<void>;
  regenerateRecoveryCode(session: Session, passphrase: string): Promise<string>;
  deleteAccount(session: Session, passphrase: string): Promise<void>;
  loadData(session: Session): Promise<Record<string, string> | null>;
  saveData(session: Session, data: Readonly<Record<string, string>>): Promise<void>;
  exportData(session: Session): Promise<string>;
  /**
   * The account's vault record exactly as stored: the only thing a server may hold
   * (ACC-18, cloud-accounts CA-03). Null when there is none.
   */
  exportRecord(accountId: string): string | null;
  /**
   * Install a vault record received from the server as this device's copy, under the
   * given display name, and open it. The record is written only after the passphrase
   * has unwrapped its key, and never over an account already on this device, so an
   * untrusted record can neither replace local data nor linger after a failed sign-in.
   */
  adoptRecord(raw: string, name: string, passphrase: string): Promise<Session>;
  /** Prove the passphrase for an open session (throttled, generic on failure). */
  verifyPassphrase(session: Session, passphrase: string): Promise<void>;
  /**
   * Decrypt the data of another copy of this same account's record (from another
   * device) with the open session's key, without touching the stored copy (CA-10).
   */
  openRecordData(session: Session, raw: string): Promise<Record<string, string> | null>;
  /** Milliseconds until another attempt is allowed, or 0. */
  retryAfterMs(accountId: string): number;
}

export function createAccountService(opts: AccountServiceOptions): AccountService {
  const { storage } = opts;
  const now = opts.now ?? ((): number => Date.now());
  const iterations = opts.kdfIterations ?? DEFAULT_KDF_ITERATIONS;
  const saveQueue = new Map<string, Promise<unknown>>();

  // ---- directory
  const readDirectory = (): AccountSummary[] => {
    try {
      const x: unknown = JSON.parse(storage.getItem(KEYS.directory) ?? '[]');
      if (!Array.isArray(x)) return [];
      return x
        .filter((e): e is Record<string, unknown> => isRecord(e) && isStr(e.id) && isStr(e.name))
        .map((e) => ({ id: e.id as string, name: e.name as string }));
    } catch {
      return [];
    }
  };
  const writeDirectory = (list: readonly AccountSummary[]): void =>
    storage.setItem(KEYS.directory, JSON.stringify(list));

  // ---- throttling (ACC-11)
  type Throttle = Record<string, { failures: number; lockedUntil: number }>;
  const readThrottle = (): Throttle => {
    try {
      const x: unknown = JSON.parse(storage.getItem(KEYS.throttle) ?? '{}');
      return isRecord(x) ? (x as Throttle) : {};
    } catch {
      return {};
    }
  };
  const retryAfterMs = (id: string): number => {
    const entry = readThrottle()[id];
    return entry && Number.isFinite(entry.lockedUntil) ? Math.max(0, entry.lockedUntil - now()) : 0;
  };
  const guard = (id: string): void => {
    const wait = retryAfterMs(id);
    if (wait > 0) {
      throw new AccountError(
        'throttled',
        `Too many attempts. Try again in ${Math.ceil(wait / 1000)} seconds.`,
        wait,
      );
    }
  };
  const recordFailure = (id: string): void => {
    const all = readThrottle();
    const failures = (all[id]?.failures ?? 0) + 1;
    const delay =
      failures >= FREE_ATTEMPTS
        ? Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - FREE_ATTEMPTS))
        : 0;
    all[id] = { failures, lockedUntil: delay > 0 ? now() + delay : 0 };
    storage.setItem(KEYS.throttle, JSON.stringify(all));
  };
  const clearFailures = (id: string): void => {
    const all = readThrottle();
    if (id in all) {
      delete all[id];
      storage.setItem(KEYS.throttle, JSON.stringify(all));
    }
  };

  // ---- helpers
  const loadVault = (id: string): VaultRecord | null =>
    parseVault(storage.getItem(KEYS.vault(id)), id);
  const nameOf = (id: string): string =>
    readDirectory().find((a) => a.id === id)?.name ?? 'Account';

  /** Prove knowledge of the passphrase by unwrapping the data key. Throttled; generic on failure. */
  async function unlockWithPassphrase(
    id: string,
    passphrase: string,
    extractable: boolean,
  ): Promise<{ record: VaultRecord; dek: CryptoKey }> {
    guard(id);
    const record = loadVault(id);
    if (!record || !readDirectory().some((a) => a.id === id)) throw authFailed();
    try {
      const kek = await deriveKek(passphrase, record.kdf);
      const dek = await unwrapDek(record.wrappedDek, kek, aad.passphraseWrap(id), extractable);
      clearFailures(id);
      return { record, dek };
    } catch {
      recordFailure(id);
      throw authFailed();
    }
  }

  async function newPassphraseWrap(
    id: string,
    dek: CryptoKey,
    passphrase: string,
  ): Promise<{ kdf: KdfParams; wrappedDek: Sealed; kek: CryptoKey }> {
    const kdf = newKdf(iterations);
    const kek = await deriveKek(passphrase, kdf);
    return { kdf, wrappedDek: await wrapDek(dek, kek, aad.passphraseWrap(id)), kek };
  }

  async function newRecoveryWrap(
    id: string,
    dek: CryptoKey,
  ): Promise<{ code: string; kdf: KdfParams; wrappedDek: Sealed }> {
    const code = generateRecoveryCode();
    const kdf = newKdf(iterations);
    const raw = normaliseRecoveryCode(code) as string;
    const kek = await deriveKek(raw, kdf);
    return { code, kdf, wrappedDek: await wrapDek(dek, kek, aad.recoveryWrap(id)) };
  }

  const writeVault = (record: VaultRecord): void =>
    storage.setItem(KEYS.vault(record.accountId), JSON.stringify(record));

  const requireOwn = (session: Session): VaultRecord => {
    session.useKey(); // throws if closed
    const record = loadVault(session.accountId);
    if (!record) throw new AccountError('not-found', 'This account no longer exists.');
    return record;
  };

  /** Serialise writes per account so revisions never race within a tab. */
  const enqueue = <T>(id: string, job: () => Promise<T>): Promise<T> => {
    const prev = saveQueue.get(id) ?? Promise.resolve();
    const next = prev.then(job, job);
    saveQueue.set(
      id,
      next.catch(() => undefined),
    );
    return next;
  };

  return {
    listAccounts: readDirectory,
    retryAfterMs,

    async createAccount({ name, passphrase, confirmedAdult }) {
      if (confirmedAdult !== true) {
        throw new AccountError('adult-required', 'Accounts are for people aged 18 or over.');
      }
      const clean = name.normalize('NFKC').trim();
      if (clean.length < 1 || clean.length > MAX_NAME_LENGTH || /\p{Cc}/u.test(clean)) {
        throw new AccountError('name', `Use a name of 1 to ${MAX_NAME_LENGTH} characters.`);
      }
      if (readDirectory().some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
        throw new AccountError('exists', 'That account name is already used on this device.');
      }
      const policy = checkPassphrase(passphrase, clean);
      if (!policy.ok) throw new AccountError('policy', policy.reason);

      const id = toBase64Url(randomBytes(12));
      const dek = await generateDek();
      const pass = await newPassphraseWrap(id, dek, passphrase);
      const rec = await newRecoveryWrap(id, dek);
      const record: VaultRecord = {
        v: VAULT_VERSION,
        accountId: id,
        kdf: pass.kdf,
        wrappedDek: pass.wrappedDek,
        recovery: { kdf: rec.kdf, wrappedDek: rec.wrappedDek },
        data: null,
      };
      // Vault first, directory second: the directory never points at nothing.
      writeVault(record);
      writeDirectory([...readDirectory(), { id, name: clean }]);
      // The session key is a separate, non-extractable unwrap of the stored wrap.
      const sessionKey = await unwrapDek(pass.wrappedDek, pass.kek, aad.passphraseWrap(id), false);
      return { session: new Session(id, clean, sessionKey), recoveryCode: rec.code };
    },

    async signIn(accountId, passphrase) {
      const { dek } = await unlockWithPassphrase(accountId, passphrase, false);
      return new Session(accountId, nameOf(accountId), dek);
    },

    async recover(accountId, recoveryCode, newPassphrase) {
      guard(accountId);
      const record = loadVault(accountId);
      const raw = normaliseRecoveryCode(recoveryCode);
      if (!record || !raw || !readDirectory().some((a) => a.id === accountId)) {
        if (record) recordFailure(accountId);
        throw authFailed();
      }
      let dek: CryptoKey;
      try {
        const kek = await deriveKek(raw, record.recovery.kdf);
        dek = await unwrapDek(record.recovery.wrappedDek, kek, aad.recoveryWrap(accountId), true);
      } catch {
        recordFailure(accountId);
        throw authFailed();
      }
      clearFailures(accountId);
      const policy = checkPassphrase(newPassphrase, nameOf(accountId));
      if (!policy.ok) throw new AccountError('policy', policy.reason);
      // Re-wrap under the new passphrase and rotate the recovery code: the one just used is spent.
      const pass = await newPassphraseWrap(accountId, dek, newPassphrase);
      const rec = await newRecoveryWrap(accountId, dek);
      writeVault({
        ...record,
        kdf: pass.kdf,
        wrappedDek: pass.wrappedDek,
        recovery: { kdf: rec.kdf, wrappedDek: rec.wrappedDek },
      });
      const sessionKey = await unwrapDek(
        pass.wrappedDek,
        pass.kek,
        aad.passphraseWrap(accountId),
        false,
      );
      return {
        session: new Session(accountId, nameOf(accountId), sessionKey),
        recoveryCode: rec.code,
      };
    },

    async changePassphrase(session, current, next) {
      requireOwn(session);
      const { record, dek } = await unlockWithPassphrase(session.accountId, current, true);
      const policy = checkPassphrase(next, session.name);
      if (!policy.ok) throw new AccountError('policy', policy.reason);
      const pass = await newPassphraseWrap(session.accountId, dek, next);
      writeVault({ ...record, kdf: pass.kdf, wrappedDek: pass.wrappedDek });
    },

    async regenerateRecoveryCode(session, passphrase) {
      requireOwn(session);
      const { record, dek } = await unlockWithPassphrase(session.accountId, passphrase, true);
      const rec = await newRecoveryWrap(session.accountId, dek);
      writeVault({ ...record, recovery: { kdf: rec.kdf, wrappedDek: rec.wrappedDek } });
      return rec.code;
    },

    async deleteAccount(session, passphrase) {
      requireOwn(session);
      await unlockWithPassphrase(session.accountId, passphrase, false);
      storage.removeItem(KEYS.vault(session.accountId));
      writeDirectory(readDirectory().filter((a) => a.id !== session.accountId));
      clearFailures(session.accountId);
      session.close();
    },

    async loadData(session) {
      const record = requireOwn(session);
      if (!record.data) return null;
      const text = await openText(
        session.useKey(),
        record.data,
        aad.data(session.accountId, record.data.rev),
      );
      const x: unknown = JSON.parse(text);
      if (!isRecord(x)) throw authFailed();
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(x)) {
        if (typeof v !== 'string') throw authFailed();
        out[k] = v;
      }
      return out;
    },

    saveData(session, data) {
      return enqueue(session.accountId, async () => {
        // Read the record fresh so a passphrase change in another tab is not overwritten.
        const record = requireOwn(session);
        const rev = (record.data?.rev ?? 0) + 1;
        const sealed = await sealText(
          session.useKey(),
          JSON.stringify(data),
          aad.data(session.accountId, rev),
        );
        writeVault({ ...record, data: { ...sealed, rev } });
      });
    },

    exportRecord(accountId) {
      const raw = storage.getItem(KEYS.vault(accountId));
      return parseVault(raw, accountId) ? raw : null;
    },

    async adoptRecord(raw, name, passphrase) {
      let id: unknown;
      try {
        id = (JSON.parse(raw) as { accountId?: unknown }).accountId;
      } catch {
        throw authFailed();
      }
      if (typeof id !== 'string' || !isWellFormedAccountId(id)) throw authFailed();
      const record = parseVault(raw, id);
      const clean = name.trim();
      if (!record || clean === '' || clean.length > MAX_NAME_LENGTH || /\p{Cc}/u.test(clean)) {
        throw authFailed();
      }
      if (loadVault(id) !== null || readDirectory().some((a) => a.id === id)) {
        throw new AccountError('exists', 'This account is already on this device. Sign in to it.');
      }
      let dek: CryptoKey;
      try {
        const kek = await deriveKek(passphrase, record.kdf);
        dek = await unwrapDek(record.wrappedDek, kek, aad.passphraseWrap(id), false);
      } catch {
        throw authFailed();
      }
      // Proven: now, and only now, it becomes this device's copy.
      writeVault(record);
      writeDirectory([...readDirectory(), { id, name: clean }]);
      return new Session(id, clean, dek);
    },

    async verifyPassphrase(session, passphrase) {
      requireOwn(session);
      await unlockWithPassphrase(session.accountId, passphrase, false);
    },

    async openRecordData(session, raw) {
      session.useKey();
      const record = parseVault(raw, session.accountId);
      if (!record) throw authFailed();
      if (!record.data) return null;
      const text = await openText(
        session.useKey(),
        record.data,
        aad.data(session.accountId, record.data.rev),
      );
      const x: unknown = JSON.parse(text);
      if (!isRecord(x)) throw authFailed();
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(x)) {
        if (typeof v !== 'string') throw authFailed();
        out[k] = v;
      }
      return out;
    },

    async exportData(session) {
      const data = (await this.loadData(session)) ?? {};
      return JSON.stringify(
        {
          app: 'afterglow',
          format: 1,
          account: session.name,
          exportedAt: new Date(now()).toISOString(),
          data,
        },
        null,
        2,
      );
    },
  };
}

// Re-exported for callers that need to recognise malformed ids without importing the codec.
export const isWellFormedAccountId = (id: string): boolean => {
  try {
    return fromBase64Url(id).length === 12;
  } catch {
    return false;
  }
};
