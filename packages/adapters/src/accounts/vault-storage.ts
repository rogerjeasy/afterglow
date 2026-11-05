import type { AccountService, RawStorage, Session } from './service.js';

/**
 * A storage object whose contents live inside one account's encrypted vault.
 *
 * The app's stores read and write synchronously, so the decrypted key/value map
 * is held in memory while the account is unlocked. Writes are encrypted and
 * flushed to the vault shortly after (and on `flush`/`close`). Nothing is ever
 * written to disk in plaintext (ACC-04). After `close` the map is dropped and
 * further writes are refused (ACC-07).
 */

export interface VaultStorage extends RawStorage {
  /** Encrypt and persist now. */
  flush(): Promise<void>;
  /** Flush, then drop the in-memory data. */
  close(): Promise<void>;
  /** Drop the in-memory data without writing (used when the account itself was deleted). */
  discard(): void;
  /** Replace the contents (used to bring guest data into a new account). */
  seed(entries: Readonly<Record<string, string>>): Promise<void>;
  /** The most recent flush failure, if any, so the UI can say data is not yet saved. */
  readonly lastError: Error | null;
}

export async function openVaultStorage(
  service: AccountService,
  session: Session,
  debounceMs = 150,
): Promise<VaultStorage> {
  let map = new Map<string, string>(Object.entries((await service.loadData(session)) ?? {}));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let lastError: Error | null = null;
  let chain: Promise<void> = Promise.resolve();

  const flush = (): Promise<void> => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (closed && map.size === 0) return chain;
    const snapshot = Object.fromEntries(map);
    chain = chain.then(async () => {
      try {
        await service.saveData(session, snapshot);
        lastError = null;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error('save failed');
      }
    });
    return chain;
  };
  const schedule = (): void => {
    if (timer === null) timer = setTimeout(() => void flush(), debounceMs);
  };
  const assertOpen = (): void => {
    if (closed) throw new Error('This account is locked.');
  };

  return {
    getItem: (key) => (closed ? null : (map.get(key) ?? null)),
    setItem(key, value) {
      assertOpen();
      map.set(key, value);
      schedule();
    },
    removeItem(key) {
      assertOpen();
      map.delete(key);
      schedule();
    },
    flush,
    async seed(entries) {
      assertOpen();
      map = new Map(Object.entries(entries));
      await flush();
    },
    discard() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      closed = true;
      map = new Map();
    },
    async close() {
      if (closed) return;
      await flush();
      closed = true;
      map = new Map();
    },
    get lastError() {
      return lastError;
    },
  };
}
