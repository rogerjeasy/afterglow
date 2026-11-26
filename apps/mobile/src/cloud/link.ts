import type { AccountService, Session } from '@afterglow/adapters';
import type { VaultApi } from './api';
import { type CloudAuth, CloudError } from './auth';
import { mergeData } from './merge';

/**
 * Keeps one account's server copy in step with the device (cloud-accounts CA-10).
 *
 * The device saves first; this pushes the encrypted record afterwards. When the
 * server holds a newer version (another device wrote), it fetches that copy,
 * decrypts it with the open session's key, merges the two households (every event
 * of both), saves the result locally and pushes again. A lost connection is
 * "offline", never an error that loses data: the next save or reconnection retries.
 */

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error';

export interface CloudLinkDeps {
  readonly service: AccountService;
  readonly session: Session;
  readonly api: VaultApi;
  readonly auth: CloudAuth;
  readonly now: () => number;
  readonly onStatus: (state: SyncState, at: number | null) => void;
  /** Replace the device's data with the merged data, save it, and refresh the UI. */
  readonly onMerged: (data: Record<string, string>) => Promise<void>;
  /** Save any edit still in memory, so what is sent and merged is current. */
  readonly flush: () => Promise<void>;
  /**
   * This device may no longer write: the session was revoked (401), or the passphrase was
   * changed on another device (the server copy's key wrapping differs). Never push over it.
   */
  readonly onSignedOut: (reason: 'revoked' | 'passphraseChanged') => void;
  /** How long to wait after a save before pushing, so bursts of edits are one request. */
  readonly debounceMs?: number;
}

export interface CloudLink {
  /** A save happened; push soon. */
  schedule(): void;
  /** Push now and resolve when this push (and any it caused) is done. */
  push(): Promise<void>;
  readonly version: number | null;
  close(): void;
}

const MAX_ROUNDS = 4;

/** The parts of a vault record that a passphrase change rewrites. */
function keyWrapping(raw: string): string {
  try {
    const x = JSON.parse(raw) as { kdf?: unknown; wrappedDek?: unknown; recovery?: unknown };
    return JSON.stringify([x.kdf, x.wrappedDek, x.recovery]);
  } catch {
    return 'unreadable';
  }
}

export function createCloudLink(deps: CloudLinkDeps, initialVersion: number | null): CloudLink {
  const { service, session, api, auth } = deps;
  let version = initialVersion;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let closed = false;

  const round = async (): Promise<'done' | 'retry'> => {
    await deps.flush();
    // That save was ours, not a new edit: only edits made from here on need another round.
    again = false;
    const raw = service.exportRecord(session.accountId);
    if (raw === null) throw new CloudError('unknown', 'No local record to send.');
    const token = await auth.accessToken();
    const put = await api.put(token, raw, version);
    if (put.ok) {
      version = put.version;
      return 'done';
    }
    // Someone else wrote first. Merge their copy into ours, then try again.
    const remote = await api.get(token);
    if (remote === null) {
      version = null; // deleted elsewhere: our copy becomes the first again
      return 'retry';
    }
    // A different key wrapping means the passphrase changed elsewhere. Pushing our record
    // would put the old passphrase back; stop and have the person sign in with the new one.
    if (keyWrapping(remote.record) !== keyWrapping(raw)) {
      closed = true;
      deps.onSignedOut('passphraseChanged');
      return 'done';
    }
    const theirs = (await service.openRecordData(session, remote.record)) ?? {};
    const mine = (await service.loadData(session)) ?? {};
    version = remote.version;
    await deps.onMerged(mergeData(mine, theirs));
    return 'retry';
  };

  const run = async (): Promise<void> => {
    deps.onStatus('syncing', null);
    try {
      for (let i = 0; i < MAX_ROUNDS && !closed; i++) {
        again = false;
        if ((await round()) === 'done' && !again) {
          deps.onStatus('synced', deps.now());
          return;
        }
      }
      if (!closed) deps.onStatus('error', null);
    } catch (e) {
      if (closed) return;
      const code = e instanceof CloudError ? e.code : 'unknown';
      if (code === 'signed-out') {
        closed = true;
        deps.onSignedOut('revoked');
        return;
      }
      deps.onStatus(code === 'network' || code === 'limit' ? 'offline' : 'error', null);
    }
  };

  const push = (): Promise<void> => {
    if (closed) return Promise.resolve();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (running) {
      again = true;
      return running;
    }
    running = run().finally(() => {
      running = null;
    });
    return running;
  };

  return {
    schedule() {
      if (closed) return;
      if (running) {
        again = true;
        return;
      }
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void push(), deps.debounceMs ?? 600);
    },
    push,
    get version() {
      return version;
    },
    close() {
      closed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
