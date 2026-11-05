import {
  AccountError,
  type AccountService,
  type AccountSummary,
  type RawStorage,
  type Session,
  type VaultStorage,
  createAccountService,
  openVaultStorage,
} from '@afterglow/adapters';
import { type HouseholdStore, KEYS, createHouseholdStore, memoryStorage } from '../household/store';

/**
 * Spaces: which data context the app is running in.
 *
 *  - guest   the anonymous device space; works with no account (ACC-01).
 *  - demo    a throwaway sandbox of simulated data, in memory only (ACC-03).
 *  - account an encrypted vault unlocked by a passphrase (ACC-04).
 *
 * Switching space always drops the previous store and key before the next one
 * exists (ACC-02), and an account is only ever reachable through a live
 * Session, which exists only after the passphrase unwrapped its key.
 */

export type SpaceKind = 'guest' | 'demo' | 'account';

export const IDLE_LOCK_MS = 10 * 60_000; // ACC-13

export interface SpaceState {
  readonly kind: SpaceKind;
  readonly store: HouseholdStore;
  readonly accounts: readonly AccountSummary[];
  readonly account: AccountSummary | null;
  readonly busy: boolean;
  /** A plain-language error from the last action, or null. Never says which part of a credential was wrong. */
  readonly error: string | null;
  /** A neutral message such as "Locked after 10 minutes". */
  readonly notice: string | null;
  /** Shown exactly once, then cleared by `acknowledgeRecoveryCode` (ACC-12). */
  readonly recoveryCode: string | null;
  /** Wall-clock ms until sign-in may be tried again, when throttled. */
  readonly retryUntilMs: number | null;
  /** True when the last encrypted save failed, so the UI can say changes are not yet stored. */
  readonly saveFailed: boolean;
}

export interface CreateAccountArgs {
  readonly name: string;
  readonly passphrase: string;
  readonly confirmedAdult: boolean;
  /** Move the current guest data into the new account, then erase it from the guest space. */
  readonly moveGuestData: boolean;
}

export interface SpaceController {
  getState(): SpaceState;
  subscribe(listener: () => void): () => void;
  enterDemo(): void;
  exitDemo(): void;
  createAccount(args: CreateAccountArgs): Promise<boolean>;
  signIn(accountId: string, passphrase: string): Promise<boolean>;
  recover(accountId: string, code: string, newPassphrase: string): Promise<boolean>;
  lock(): Promise<void>;
  changePassphrase(current: string, next: string): Promise<boolean>;
  regenerateRecoveryCode(passphrase: string): Promise<boolean>;
  deleteAccount(passphrase: string): Promise<boolean>;
  exportData(): Promise<string | null>;
  acknowledgeRecoveryCode(): void;
  clearMessages(): void;
  /** Wall-clock ms when this account may be tried again, or null. Read from the service, so it survives navigation. */
  retryUntil(accountId: string | null): number | null;
  /** Record user activity for the idle lock. */
  touch(): void;
  /** Lock if idle (ACC-13). Called on a timer by the UI. */
  checkIdle(): void;
  /** Surface a failed encrypted save instead of losing data silently. */
  checkSaveHealth(): void;
}

export interface SpaceDeps {
  readonly rawStorage: RawStorage;
  readonly now: () => number;
  readonly randomId: () => string;
  /** Fill a demo store with simulated data. Injected so tests need not load the USDA files. */
  readonly seedDemo: (store: HouseholdStore) => void;
  /** Tests inject a small number; production leaves it unset. */
  readonly kdfIterations?: number;
}

interface Active {
  readonly session: Session;
  readonly vault: VaultStorage;
  readonly store: HouseholdStore;
}

function describe(e: unknown): { message: string; retryAfterMs?: number } {
  if (e instanceof AccountError) {
    return e.retryAfterMs === undefined
      ? { message: e.message }
      : { message: e.message, retryAfterMs: e.retryAfterMs };
  }
  return { message: 'Something went wrong. Nothing was changed.' };
}

export function createSpaceController(deps: SpaceDeps): SpaceController {
  const { rawStorage, now, randomId } = deps;
  const service: AccountService = createAccountService({
    storage: rawStorage,
    now,
    ...(deps.kdfIterations === undefined ? {} : { kdfIterations: deps.kdfIterations }),
  });
  const storeDeps = { now, randomId };

  let guest: HouseholdStore | null = null;
  const guestStore = (): HouseholdStore => {
    if (!guest) guest = createHouseholdStore({ storage: rawStorage, ...storeDeps });
    return guest;
  };

  let active: Active | null = null;
  let lastActivity = now();
  let busy = false;
  const listeners = new Set<() => void>();

  let state: SpaceState = {
    kind: 'guest',
    store: guestStore(),
    accounts: service.listAccounts(),
    account: null,
    busy: false,
    error: null,
    notice: null,
    recoveryCode: null,
    retryUntilMs: null,
    saveFailed: false,
  };
  const set = (patch: Partial<SpaceState>): void => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };
  const refreshAccounts = (): readonly AccountSummary[] => service.listAccounts();

  /** Drop the active account's key and store. The UI never sees an unlocked store after this returns to guest. */
  async function closeActive(): Promise<void> {
    const a = active;
    active = null;
    if (!a) return;
    try {
      await a.vault.close();
    } finally {
      a.session.close();
    }
  }

  /**
   * Run one account action. `accountId` is the account whose lockout to report: a
   * failed attempt may itself start a lockout, and the person must be told at
   * once instead of discovering it on the next try.
   */
  async function run(
    job: () => Promise<boolean>,
    accountId?: () => string | null,
  ): Promise<boolean> {
    if (busy) return false;
    busy = true;
    set({ busy: true, error: null, notice: null, retryUntilMs: null });
    try {
      return await job();
    } catch (e) {
      const d = describe(e);
      const id = accountId?.() ?? null;
      const wait = Math.max(d.retryAfterMs ?? 0, id ? service.retryAfterMs(id) : 0);
      set({ error: d.message, retryUntilMs: wait > 0 ? now() + wait : null });
      return false;
    } finally {
      busy = false;
      set({ busy: false });
    }
  }

  async function enter(session: Session, extra: Partial<SpaceState> = {}): Promise<void> {
    const vault = await openVaultStorage(service, session);
    const store = createHouseholdStore({ storage: vault, ...storeDeps });
    active = { session, vault, store };
    lastActivity = now();
    set({
      kind: 'account',
      store,
      account: { id: session.accountId, name: session.name },
      accounts: refreshAccounts(),
      ...extra,
    });
  }

  /** Lock: swap the UI to guest FIRST so nothing can hold an unlocked store, then flush and drop the key. */
  async function lock(): Promise<void> {
    if (!active) return;
    set({
      kind: 'guest',
      store: guestStore(),
      account: null,
      recoveryCode: null,
      saveFailed: false,
    });
    await closeActive();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    enterDemo() {
      if (state.kind !== 'guest') return; // never from inside an account
      const store = createHouseholdStore({ storage: memoryStorage(), ...storeDeps });
      deps.seedDemo(store);
      set({ kind: 'demo', store, error: null, notice: null });
    },
    exitDemo() {
      if (state.kind !== 'demo') return;
      set({ kind: 'guest', store: guestStore(), error: null, notice: null });
    },

    createAccount(args) {
      return run(async () => {
        if (state.kind !== 'guest') return false;
        const { session, recoveryCode } = await service.createAccount({
          name: args.name,
          passphrase: args.passphrase,
          confirmedAdult: args.confirmedAdult,
        });
        if (args.moveGuestData) {
          // Only from the guest space, and only after the account exists.
          const raw = rawStorage.getItem(KEYS.events);
          if (raw) {
            const v = await openVaultStorage(service, session);
            await v.seed({ [KEYS.events]: raw });
            v.discard();
            guestStore().deleteAllData();
          }
        }
        await enter(session, { recoveryCode });
        return true;
      });
    },

    signIn(accountId, passphrase) {
      return run(
        async () => {
          if (state.kind !== 'guest') return false;
          const session = await service.signIn(accountId, passphrase);
          await enter(session);
          return true;
        },
        () => accountId,
      );
    },

    recover(accountId, code, newPassphrase) {
      return run(
        async () => {
          if (state.kind !== 'guest') return false;
          const { session, recoveryCode } = await service.recover(accountId, code, newPassphrase);
          await enter(session, { recoveryCode });
          return true;
        },
        () => accountId,
      );
    },

    lock,

    changePassphrase(current, next) {
      return run(
        async () => {
          if (!active) return false;
          await service.changePassphrase(active.session, current, next);
          set({ notice: 'Passphrase changed. Your recovery code still works.' });
          return true;
        },
        () => active?.session.accountId ?? null,
      );
    },

    regenerateRecoveryCode(passphrase) {
      return run(
        async () => {
          if (!active) return false;
          const recoveryCode = await service.regenerateRecoveryCode(active.session, passphrase);
          set({ recoveryCode });
          return true;
        },
        () => active?.session.accountId ?? null,
      );
    },

    deleteAccount(passphrase) {
      return run(
        async () => {
          const a = active;
          if (!a) return false;
          await service.deleteAccount(a.session, passphrase);
          a.vault.discard();
          active = null;
          // The device gets a new anonymous identity (ACC-15).
          guestStore().rotateIdentity();
          set({
            kind: 'guest',
            store: guestStore(),
            account: null,
            accounts: refreshAccounts(),
            recoveryCode: null,
            notice: 'Account deleted. Its encrypted data is gone from this device.',
          });
          return true;
        },
        () => active?.session.accountId ?? null,
      );
    },

    async exportData() {
      const a = active;
      if (!a) return null;
      try {
        await a.vault.flush();
        return await service.exportData(a.session);
      } catch (e) {
        set({ error: describe(e).message });
        return null;
      }
    },

    acknowledgeRecoveryCode() {
      set({ recoveryCode: null });
    },
    clearMessages() {
      set({ error: null, notice: null, retryUntilMs: null });
    },

    retryUntil(accountId) {
      if (!accountId) return null;
      const wait = service.retryAfterMs(accountId);
      return wait > 0 ? now() + wait : null;
    },

    touch() {
      lastActivity = now();
    },

    checkIdle() {
      const a = active;
      if (!a || now() - lastActivity < IDLE_LOCK_MS) return;
      // ACC-13: never lock during an outage. A lock screen in a blackout costs safety.
      if (a.store.getState().view.outageStartedAtMs !== null) return;
      void lock().then(() =>
        set({ notice: 'Locked after 10 minutes without activity. Sign in to continue.' }),
      );
    },

    checkSaveHealth() {
      const failed = active?.vault.lastError != null;
      if (failed !== state.saveFailed) set({ saveFailed: failed });
    },
  };
}
