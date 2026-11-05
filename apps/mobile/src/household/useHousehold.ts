import { useEffect, useState, useSyncExternalStore } from 'react';
import { useSpace } from '../spaces/useSpace';
import type { HouseholdStore, StoreState } from './store';

/**
 * The household store of the ACTIVE space (guest, demo or the unlocked
 * account). When the space changes the previous store is no longer reachable
 * from any component.
 */
export function useHousehold(): { store: HouseholdStore; state: StoreState; demo: boolean } {
  const { space } = useSpace();
  const store = space.store;
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { store, state, demo: space.kind === 'demo' };
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
