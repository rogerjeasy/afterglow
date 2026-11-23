import { events, household } from '@afterglow/core';

/**
 * The household store: an append-only event log persisted to local storage.
 *
 * This is the web adapter for the event log; native uses SQLite (Wave 2.2). All
 * state is the log, and the view is a pure reduction of it (`household`), so
 * the same reducers run everywhere. Nothing here leaves the device.
 *
 * Storage is untrusted input: malformed entries are skipped, never thrown on.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const KEYS = {
  events: 'afterglow.household.events.v1',
  epoch: 'afterglow.household.epoch.v1',
} as const;

export interface StoreState {
  readonly log: events.EventLog;
  readonly view: household.HouseholdView;
}

export interface ApplianceInput {
  readonly name: string;
  readonly class: household.AppliancePayload['class'];
  readonly fullness: household.AppliancePayload['fullness'];
  readonly ambientC: number | null;
}

export interface HouseholdStore {
  getState(): StoreState;
  subscribe(listener: () => void): () => void;
  addAppliance(input: ApplianceInput): string;
  updateAppliance(id: string, input: ApplianceInput): void;
  removeAppliance(id: string): void;
  addItem(applianceId: string, productId: number): string;
  removeItem(itemId: string): void;
  addMedicine(applianceId: string, product: string, condition: 'unopened' | 'inUse'): string;
  removeMedicine(medicineId: string): void;
  openDoor(applianceId: string, openMinutes: number): void;
  startOutage(atMs: number): void;
  endOutage(): void;
  checkIce(itemId: string, answer: 'present' | 'absent'): void;
  setHome(home: household.HomePayload): void;
  /** Give this store a new anonymous device identity, keeping its data (used after account deletion). */
  rotateIdentity(): void;
  deleteAllData(): void;
}

export interface StoreDeps {
  readonly storage: StorageLike;
  readonly now: () => number;
  readonly randomId: () => string;
}

function loadLog(storage: StorageLike): events.EventLog {
  let log = events.EventLog.empty();
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEYS.events);
  } catch {
    return log;
  }
  if (!raw) return log;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return log;
  }
  if (!Array.isArray(parsed)) return log;
  for (const candidate of parsed) {
    try {
      log = log.append(candidate as events.AfterglowEvent);
    } catch {
      // A malformed stored event is skipped, not trusted and not fatal.
    }
  }
  return log;
}

function safeSet(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage full or blocked: the app keeps working in memory.
  }
}

export function createHouseholdStore(deps: StoreDeps): HouseholdStore {
  const { storage, now } = deps;

  let epoch = ((): string => {
    try {
      const saved = storage.getItem(KEYS.epoch);
      if (saved && saved.length > 0 && saved.length <= 64) return saved;
    } catch {
      /* fall through to a fresh epoch */
    }
    const fresh = `dev-${deps.randomId()}`;
    safeSet(storage, KEYS.epoch, fresh);
    return fresh;
  })();

  let log = loadLog(storage);
  let lamport = log.toArray().reduce((max, e) => Math.max(max, e.lamport), 0);
  let state: StoreState = { log, view: household.buildHouseholdView(log) };
  const listeners = new Set<() => void>();

  const emit = (): void => {
    state = { log, view: household.buildHouseholdView(log) };
    for (const l of listeners) l();
  };
  const persist = (): void => safeSet(storage, KEYS.events, JSON.stringify(log.toArray()));

  const append = (type: household.HouseholdEventType, payload: unknown): void => {
    lamport += 1;
    log = log.append(household.householdEvent(type, payload, epoch, lamport));
    persist();
    emit();
  };
  const nextId = (prefix: string): string => `${prefix}${lamport + 1}`;

  const E = household.HOUSEHOLD_EVENT;
  const appliancePayload = (id: string, input: ApplianceInput) => ({
    applianceId: id,
    name: input.name,
    class: input.class,
    fullness: input.fullness,
    ambientC: input.ambientC,
  });

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addAppliance(input) {
      const id = nextId('a');
      append(E.applianceSet, appliancePayload(id, input));
      return id;
    },
    updateAppliance(id, input) {
      append(E.applianceSet, appliancePayload(id, input));
    },
    removeAppliance(id) {
      append(E.applianceRemoved, { applianceId: id });
    },
    addItem(applianceId, productId) {
      const id = nextId('i');
      append(E.itemAdded, { itemId: id, applianceId, productId });
      return id;
    },
    removeItem(itemId) {
      append(E.itemRemoved, { itemId });
    },
    addMedicine(applianceId, product, condition) {
      const id = nextId('m');
      // Only the names are stored. Storage limits come from the validated table at
      // display time and are never written to the log (HH-08).
      append(E.medicineAdded, { medicineId: id, applianceId, product, condition });
      return id;
    },
    removeMedicine(medicineId) {
      append(E.medicineRemoved, { medicineId });
    },
    openDoor(applianceId, openMinutes) {
      append(E.doorOpened, { applianceId, openMinutes, atMs: now() });
    },
    startOutage(atMs) {
      append(E.outageSet, { startedAtMs: atMs });
    },
    endOutage() {
      append(E.outageSet, { startedAtMs: null });
    },
    checkIce(itemId, answer) {
      append(E.iceChecked, { itemId, answer, atMs: now() });
    },
    setHome(home) {
      append(E.homeSet, home);
    },
    rotateIdentity() {
      epoch = `dev-${deps.randomId()}`;
      safeSet(storage, KEYS.epoch, epoch);
    },
    deleteAllData() {
      for (const key of [KEYS.events]) {
        try {
          storage.removeItem(key);
        } catch {
          /* nothing to do */
        }
      }
      log = events.EventLog.empty();
      lamport = 0;
      // A fresh epoch: after deletion the device does not keep its old identity.
      epoch = `dev-${deps.randomId()}`;
      safeSet(storage, KEYS.epoch, epoch);
      emit();
    },
  };
}

/** Browser storage if available, otherwise memory (private mode, tests, SSR). */
export function browserStorage(): StorageLike {
  try {
    const probe = '__afterglow_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return memoryStorage();
  }
}

export function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}
