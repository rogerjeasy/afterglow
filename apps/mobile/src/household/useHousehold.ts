import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  type HouseholdStore,
  type StoreState,
  browserStorage,
  createHouseholdStore,
} from './store';

let singleton: HouseholdStore | null = null;

/** The one store for the running app, created on first use. */
export function getHouseholdStore(): HouseholdStore {
  if (!singleton) {
    singleton = createHouseholdStore({
      storage: browserStorage(),
      now: () => Date.now(),
      randomId: () =>
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID().slice(0, 12)
          : Math.random().toString(36).slice(2, 14),
    });
  }
  return singleton;
}

export function useHousehold(): { store: HouseholdStore; state: StoreState } {
  const store = getHouseholdStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { store, state };
}

/** Wall-clock time, refreshed every `intervalMs`, for live clocks. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
