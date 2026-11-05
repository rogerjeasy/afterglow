import { describe, expect, it } from 'vitest';
import { KEYS, createHouseholdStore, memoryStorage } from './store';

const make = (initial: Record<string, string> = {}, startMs = 1_000_000) => {
  const storage = memoryStorage(initial);
  let n = 0;
  let t = startMs;
  const store = createHouseholdStore({
    storage,
    now: () => t,
    randomId: () => `id${++n}`,
  });
  return {
    storage,
    store,
    tick: (ms: number) => {
      t += ms;
    },
  };
};

const FRIDGE = { name: 'Fridge', class: 'fridge', fullness: 'full', ambientC: null } as const;

describe('household store', () => {
  it('turns user actions into view state', () => {
    const { store } = make();
    const id = store.addAppliance(FRIDGE);
    store.addItem(id, 113);
    store.startOutage(5000);
    const v = store.getState().view;
    expect(v.appliances.map((a) => a.name)).toEqual(['Fridge']);
    expect(v.items).toHaveLength(1);
    expect(v.outageStartedAtMs).toBe(5000);
    store.endOutage();
    expect(store.getState().view.outageStartedAtMs).toBeNull();
  });

  it('persists and restores the same view', () => {
    const a = make();
    const id = a.store.addAppliance(FRIDGE);
    a.store.addItem(id, 113);
    a.store.openDoor(id, 3);
    const saved = a.storage.getItem(KEYS.events) as string;
    const b = make({ [KEYS.events]: saved });
    expect(b.store.getState().view).toEqual(a.store.getState().view);
  });

  it('keeps issuing strictly increasing lamports after a reload (no identity collisions)', () => {
    const a = make();
    a.store.addAppliance(FRIDGE);
    a.store.addAppliance({ ...FRIDGE, name: 'Freezer', class: 'freezer' });
    const saved = a.storage.getItem(KEYS.events) as string;
    const epoch = a.storage.getItem(KEYS.epoch) as string;
    const b = make({ [KEYS.events]: saved, [KEYS.epoch]: epoch });
    b.store.addAppliance({ ...FRIDGE, name: 'Cooler', class: 'coolerBox' });
    expect(b.store.getState().view.appliances).toHaveLength(3);
  });

  it('survives corrupt storage without throwing', () => {
    for (const bad of ['not json', '{"a":1}', '[null, 5, "x", {"lamport": "no"}]', '']) {
      const { store } = make({ [KEYS.events]: bad });
      expect(store.getState().view.appliances).toEqual([]);
    }
  });

  it('records door openings with the current time', () => {
    const { store, tick } = make();
    const id = store.addAppliance(FRIDGE);
    tick(60_000);
    store.openDoor(id, 2);
    expect(store.getState().view.doors[0]?.atMs).toBe(1_060_000);
  });

  it('deletes everything, including the device identity', () => {
    const { store, storage } = make();
    store.addAppliance(FRIDGE);
    const epochBefore = storage.getItem(KEYS.epoch);
    store.deleteAllData();
    expect(store.getState().view.appliances).toEqual([]);
    expect(storage.getItem(KEYS.events)).toBeNull();
    expect(storage.getItem(KEYS.epoch)).not.toBe(epochBefore);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const { store } = make();
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.addAppliance(FRIDGE);
    expect(calls).toBe(1);
    off();
    store.addAppliance(FRIDGE);
    expect(calls).toBe(1);
  });
});
