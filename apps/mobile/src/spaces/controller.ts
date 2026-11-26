import {
  AccountError,
  type AccountService,
  type AccountSummary,
  type RawStorage,
  type Session,
  type VaultStorage,
  checkPassphrase,
  createAccountService,
  openVaultStorage,
} from '@afterglow/adapters';
import type { VaultApi } from '../cloud/api';
import { type CloudAuth, CloudError } from '../cloud/auth';
import { type CloudLink, type SyncState, createCloudLink } from '../cloud/link';
import { deriveLoginSecret, isPlausibleEmail, normaliseEmail } from '../cloud/loginSecret';
import { mergeData } from '../cloud/merge';
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
  /** True when this build is connected to a deployed account service (cloud-accounts). */
  readonly cloudAvailable: boolean;
  /** The signed-in cloud account and how its sync stands, or null. */
  readonly cloud: CloudStatus | null;
  /** A sign-up waiting for the emailed code, or null. Holds no secret. */
  readonly cloudPending: { readonly email: string } | null;
  /** Account ids on this device that are linked to a cloud account, with their email. */
  readonly cloudLinks: Readonly<Record<string, string>>;
}

export interface CloudStatus {
  readonly email: string;
  readonly sync: SyncState;
  readonly lastSyncedAt: number | null;
}

export interface CloudSignUpArgs {
  readonly email: string;
  readonly passphrase: string;
  readonly confirmedAdult: boolean;
  readonly moveGuestData: boolean;
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
  /** Start a cloud account: Cognito sends a code to the email (CA-09). */
  cloudSignUp(args: CloudSignUpArgs): Promise<boolean>;
  /** Finish sign-up with the emailed code: sign in, create the vault, upload it. */
  cloudConfirm(code: string): Promise<boolean>;
  cloudResend(): Promise<boolean>;
  cloudCancel(): void;
  /** Sign in on any device; opens offline from this device's encrypted copy when there is one (CA-10). */
  cloudSignIn(email: string, passphrase: string): Promise<boolean>;
  /** Try to reach the server again (after reconnecting). */
  cloudRetry(): Promise<void>;
}

/** The account service and API, injected so tests can run without AWS. */
export interface CloudDeps {
  readonly auth: CloudAuth;
  readonly api: VaultApi;
  /** Tests inject a small number; production leaves it unset (600,000). */
  readonly loginIterations?: number;
}

export interface SpaceDeps {
  readonly rawStorage: RawStorage;
  readonly now: () => number;
  readonly randomId: () => string;
  /** Fill a demo store with simulated data. Injected so tests need not load the USDA files. */
  readonly seedDemo: (store: HouseholdStore) => void;
  /** Tests inject a small number; production leaves it unset. */
  readonly kdfIterations?: number;
  /** The cloud account service, when this build has one. */
  readonly cloud?: CloudDeps;
}

interface CloudActive {
  readonly accountId: string;
  readonly email: string;
  /** In memory only while unlocked, to reconnect after an offline sign-in (CA-11 drops it). */
  secret: string;
  link: CloudLink;
  signedIn: boolean;
  /**
   * Other sessions still need ending after a passphrase change. Saved on the device
   * (REVOKE_KEY) so a lock, reload or restart cannot forget it; cleared only once
   * ending them has succeeded.
   */
  pendingRevocation: boolean;
}

interface Active {
  readonly session: Session;
  readonly vault: VaultStorage;
  store: HouseholdStore;
  cloud: CloudActive | null;
}

const LINKS_KEY = 'afterglow.cloud.links.v1';
/** Account ids whose other sessions still need ending. Ids only; no secret. */
const REVOKE_KEY = 'afterglow.cloud.revoke.v1';
/** Account names on the device are at most 40 characters; long emails are shortened for display only. */
const displayName = (email: string): string =>
  email.length <= 40 ? email : `${email.slice(0, 39)}…`;

function describe(e: unknown): { message: string; retryAfterMs?: number } {
  if (e instanceof CloudError) return { message: e.message };
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
  const cloud = deps.cloud ?? null;

  const readLinks = (): Record<string, string> => {
    try {
      const x: unknown = JSON.parse(rawStorage.getItem(LINKS_KEY) ?? '{}');
      if (typeof x !== 'object' || x === null || Array.isArray(x)) return {};
      const known = new Set(service.listAccounts().map((a) => a.id));
      const out: Record<string, string> = {};
      for (const [id, email] of Object.entries(x)) {
        if (typeof email === 'string' && known.has(id)) out[id] = email;
      }
      return out;
    } catch {
      return {};
    }
  };
  const writeLinks = (links: Record<string, string>): void =>
    rawStorage.setItem(LINKS_KEY, JSON.stringify(links));
  const readPendingRevocations = (): Set<string> => {
    try {
      const x: unknown = JSON.parse(rawStorage.getItem(REVOKE_KEY) ?? '[]');
      return new Set(Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const markPendingRevocation = (accountId: string, pendingNow: boolean): void => {
    const ids = readPendingRevocations();
    if (pendingNow) ids.add(accountId);
    else ids.delete(accountId);
    rawStorage.setItem(REVOKE_KEY, JSON.stringify([...ids]));
  };

  const linkFor = (email: string): string | null =>
    Object.entries(readLinks()).find(([, e]) => e === email)?.[0] ?? null;

  // A sign-up waiting for its code. Held in memory only; dropped on cancel or success.
  let pending: (CloudSignUpArgs & { readonly secret: string }) | null = null;

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
    cloudAvailable: cloud !== null,
    cloud: null,
    cloudPending: null,
    cloudLinks: readLinks(),
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
      // Give the last change its chance to reach the server before the key goes.
      if (a.cloud?.signedIn) await a.cloud.link.push();
    } finally {
      a.cloud?.link.close();
      if (a.cloud) cloud?.auth.signOut();
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

  interface CloudEntry {
    readonly email: string;
    readonly secret: string;
    readonly version: number | null;
    readonly signedIn: boolean;
    /** First time this device opens the account: give it its own event epoch (CA-10). */
    readonly freshDevice: boolean;
  }

  async function enter(
    session: Session,
    extra: Partial<SpaceState> = {},
    cloudEntry: CloudEntry | null = null,
  ): Promise<void> {
    const vault = await openVaultStorage(service, session, 150, () =>
      active?.cloud?.link.schedule(),
    );
    if (cloudEntry?.freshDevice) vault.setItem(KEYS.epoch, `dev-${randomId()}`);
    const store = createHouseholdStore({ storage: vault, ...storeDeps });
    const a: Active = { session, vault, store, cloud: null };
    active = a;
    if (cloudEntry && cloud) {
      const setSync = (sync: SyncState, at: number | null): void => {
        if (active !== a) return;
        set({
          cloud: {
            email: cloudEntry.email,
            sync,
            lastSyncedAt: at ?? state.cloud?.lastSyncedAt ?? null,
          },
        });
      };
      const link = createCloudLink(
        {
          service,
          session,
          api: cloud.api,
          auth: cloud.auth,
          now,
          onStatus: setSync,
          flush: () => vault.flush(),
          onMerged: async (data) => {
            if (active !== a) return;
            // Merge once more with what is in memory now, so an edit made while the
            // network round-trip ran is kept, never overwritten (CA-10).
            await vault.seed(mergeData(vault.snapshot(), data));
            a.store = createHouseholdStore({ storage: vault, ...storeDeps });
            set({ store: a.store });
          },
        },
        cloudEntry.version,
      );
      a.cloud = {
        email: cloudEntry.email,
        secret: cloudEntry.secret,
        accountId: session.accountId,
        link,
        signedIn: cloudEntry.signedIn,
        pendingRevocation: readPendingRevocations().has(session.accountId),
      };
      const links = readLinks();
      links[session.accountId] = cloudEntry.email;
      writeLinks(links);
      setSync(cloudEntry.signedIn ? 'syncing' : 'offline', null);
    }
    lastActivity = now();
    set({
      kind: 'account',
      store,
      account: { id: session.accountId, name: session.name },
      accounts: refreshAccounts(),
      cloudLinks: readLinks(),
      ...extra,
    });
    if (a.cloud?.signedIn) {
      // A revocation left over from an earlier passphrase change is retried on every
      // online sign-in until it succeeds.
      if (a.cloud.pendingRevocation) await revokeOtherSessions(a.cloud);
      void a.cloud.link.push();
    }
  }

  /**
   * End every session of a cloud account, then sign this device back in with the current
   * secret. True when the other sessions are gone; false leaves the flag set for a retry.
   */
  async function revokeOtherSessions(c: CloudActive): Promise<boolean> {
    if (!cloud) return false;
    try {
      await cloud.auth.signOutEverywhere();
    } catch {
      return false;
    }
    c.pendingRevocation = false;
    markPendingRevocation(c.accountId, false);
    try {
      await cloud.auth.signIn(c.email, c.secret);
      c.signedIn = true;
    } catch {
      c.signedIn = false; // offline now: the next retry signs in with the new secret
    }
    return true;
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
      cloud: null,
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
          if (accountId in readLinks()) {
            // The account's login secret would not follow a passphrase reset done here.
            throw new CloudError(
              'unknown',
              'This account signs in with an email. Resetting its passphrase with the recovery code is not available in this build yet.',
            );
          }
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
          const a = active;
          if (!a) return false;
          const c = a.cloud;
          if (c && cloud) {
            // The login secret comes from the passphrase, so both change together, online
            // only, as one transaction: the device and the account never disagree.
            if (!c.signedIn) {
              throw new CloudError(
                'network',
                'Changing the passphrase of a cloud account needs a connection.',
              );
            }
            await service.verifyPassphrase(a.session, current);
            // The same checks the local step makes, so it cannot fail after the remote one.
            for (const label of [a.session.name, c.email]) {
              const policy = checkPassphrase(next, label);
              if (!policy.ok) throw new AccountError('policy', policy.reason);
            }
            const newSecret = await deriveLoginSecret(c.email, next, cloud.loginIterations);
            // 1. The device first: reversible, and nothing reaches the server yet.
            await service.changePassphrase(a.session, current, next);
            // 2. The account. If it refuses, undo step 1 so the old passphrase still opens both.
            try {
              await cloud.auth.changePassword(c.secret, newSecret);
            } catch (e) {
              await service.changePassphrase(a.session, next, current);
              throw e;
            }
            // 3. Accepted: from now on only the new secret signs in.
            c.secret = newSecret;
            // 4. End other sessions. Separate and retried: a failure here changes nothing above.
            c.pendingRevocation = true;
            markPendingRevocation(c.accountId, true);
            const revoked = await revokeOtherSessions(c);
            await c.link.push();
            set({
              notice: revoked
                ? 'Passphrase changed here and on your account. Other phones must sign in again with the new one.'
                : 'Passphrase changed here and on your account. Other phones could not be signed out yet and may stay signed in until they are; Afterglow keeps trying.',
            });
            return true;
          }
          await service.changePassphrase(a.session, current, next);
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
          // The record changed (new recovery wrap): the server copy must follow.
          if (active.cloud?.signedIn) await active.cloud.link.push();
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
          if (a.cloud && cloud) {
            // Prove the passphrase BEFORE anything irreversible: an unlocked phone in someone
            // else's hand must not be enough to wipe the account (ACC-14).
            await service.verifyPassphrase(a.session, passphrase);
            // CA-05: the server copy and the Cognito user go next, so nothing is left behind
            // if the device step then fails. This needs a connection; offline, nothing changes.
            if (!a.cloud.signedIn) {
              throw new CloudError('network', 'Deleting a cloud account needs a connection.');
            }
            a.cloud.link.close();
            const token = await cloud.auth.accessToken();
            await cloud.api.delete(token);
            await cloud.auth.deleteUser();
            const links = readLinks();
            delete links[a.session.accountId];
            writeLinks(links);
            markPendingRevocation(a.session.accountId, false);
          }
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
            cloud: null,
            cloudLinks: readLinks(),
            notice: a.cloud
              ? 'Account deleted, here and on the server.'
              : 'Account deleted. Its encrypted data is gone from this device.',
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

    cloudSignUp(args) {
      return run(async () => {
        if (!cloud || state.kind !== 'guest') return false;
        const email = normaliseEmail(args.email);
        if (!isPlausibleEmail(email))
          throw new CloudError('unknown', 'Enter a valid email address.');
        if (!args.confirmedAdult) {
          throw new AccountError('adult-required', 'Accounts are for people aged 18 or over.');
        }
        const policy = checkPassphrase(args.passphrase, email);
        if (!policy.ok) throw new AccountError('policy', policy.reason);
        const secret = await deriveLoginSecret(email, args.passphrase, cloud.loginIterations);
        await cloud.auth.signUp(email, secret);
        pending = { ...args, email, secret };
        set({ cloudPending: { email } });
        return true;
      });
    },

    cloudConfirm(code) {
      return run(async () => {
        const p = pending;
        if (!cloud || !p || state.kind !== 'guest') return false;
        await cloud.auth.confirm(p.email, code);
        await cloud.auth.signIn(p.email, p.secret);
        const { session, recoveryCode } = await service.createAccount({
          name: displayName(p.email),
          passphrase: p.passphrase,
          confirmedAdult: p.confirmedAdult,
        });
        if (p.moveGuestData) {
          const raw = rawStorage.getItem(KEYS.events);
          if (raw) {
            const v = await openVaultStorage(service, session);
            await v.seed({ [KEYS.events]: raw });
            v.discard();
            guestStore().deleteAllData();
          }
        }
        pending = null;
        await enter(
          session,
          { recoveryCode, cloudPending: null },
          { email: p.email, secret: p.secret, version: null, signedIn: true, freshDevice: false },
        );
        return true;
      });
    },

    cloudResend() {
      return run(async () => {
        if (!cloud || !pending) return false;
        await cloud.auth.resend(pending.email);
        set({ notice: `A new code was sent to ${pending.email}.` });
        return true;
      });
    },

    cloudCancel() {
      pending = null;
      set({ cloudPending: null, error: null });
    },

    cloudSignIn(rawEmail, passphrase) {
      const email = normaliseEmail(rawEmail);
      return run(
        async () => {
          if (!cloud || state.kind !== 'guest') return false;
          const secret = await deriveLoginSecret(email, passphrase, cloud.loginIterations);
          const localId = linkFor(email);
          try {
            await cloud.auth.signIn(email, secret);
          } catch (e) {
            // Offline with a copy on this device: open it; sync waits for the network (CA-10).
            if (e instanceof CloudError && e.code === 'network' && localId) {
              const session = await service.signIn(localId, passphrase);
              await enter(
                session,
                { notice: 'Opened from this device. Changes will sync when you are back online.' },
                { email, secret, version: null, signedIn: false, freshDevice: false },
              );
              return true;
            }
            throw e;
          }
          const remote = await cloud.api.get(await cloud.auth.accessToken());
          if (localId) {
            // This device has its own copy, possibly with offline changes. Open it and let
            // the first push merge with the server's copy (expected version null -> 409 -> merge).
            const session = await service.signIn(localId, passphrase);
            await enter(
              session,
              {},
              { email, secret, version: null, signedIn: true, freshDevice: false },
            );
            return true;
          }
          if (remote) {
            // Installed only once the passphrase has opened it, never over a local account.
            const session = await service.adoptRecord(
              remote.record,
              displayName(email),
              passphrase,
            );
            await enter(
              session,
              {},
              { email, secret, version: remote.version, signedIn: true, freshDevice: true },
            );
            return true;
          }
          // Confirmed but never uploaded (sign-up was interrupted): start the vault here.
          const { session, recoveryCode } = await service.createAccount({
            name: displayName(email),
            passphrase,
            confirmedAdult: true,
          });
          await enter(
            session,
            { recoveryCode },
            { email, secret, version: null, signedIn: true, freshDevice: false },
          );
          return true;
        },
        () => linkFor(email),
      );
    },

    async cloudRetry() {
      const a = active;
      if (!a?.cloud || !cloud) return;
      if (a.cloud.pendingRevocation && a.cloud.signedIn) await revokeOtherSessions(a.cloud);
      if (!a.cloud.signedIn) {
        try {
          await cloud.auth.signIn(a.cloud.email, a.cloud.secret);
          a.cloud.signedIn = true;
        } catch {
          set({ cloud: state.cloud ? { ...state.cloud, sync: 'offline' } : null });
          return;
        }
      }
      await a.cloud.link.push();
    },
  };
}
