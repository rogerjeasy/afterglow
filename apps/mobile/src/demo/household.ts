import type { foodkeeper } from '@afterglow/core';
import type { HouseholdStore } from '../household/store';

/**
 * A simulated household for demo mode. It is written to an in-memory demo store
 * that is never persisted, so it can never mix with a real household (ACC-03).
 *
 * It is plain user data (appliances, food, a home profile) entered through the
 * same store actions a person would use, so every number the app shows for it
 * comes from the same deterministic core. Nothing is faked downstream. Foods are
 * looked up by exact FoodKeeper display name; a missing name is skipped, never
 * guessed.
 */
const FRIDGE_FOODS = [
  'Chicken (whole)',
  'Milk (plain or flavored)',
  'Eggs (in shell)',
  'Yogurt',
  'Butter',
  'Mayonnaise (commercial)',
] as const;
const FREEZER_FOODS = ['Ice cream', 'Shrimp, shellfish', 'Vegetables'] as const;

export function loadDemoHousehold(store: HouseholdStore, index: foodkeeper.FoodIndex): void {
  const byName = (name: string): number | undefined =>
    index.products.find((p) => p.displayName === name)?.product.id;

  if (store.getState().view.appliances.length === 0) {
    const fridge = store.addAppliance({
      name: 'Fridge',
      class: 'fridge',
      fullness: 'half',
      ambientC: null,
    });
    for (const name of FRIDGE_FOODS) {
      const id = byName(name);
      if (id !== undefined) store.addItem(fridge, id);
    }
    const freezer = store.addAppliance({
      name: 'Freezer',
      class: 'freezer',
      fullness: 'full',
      ambientC: null,
    });
    for (const name of FREEZER_FOODS) {
      const id = byName(name);
      if (id !== undefined) store.addItem(freezer, id);
    }
  }
  if (store.getState().view.home === null) {
    store.setHome({
      archetype: { type: 'apartment', vintage: 'pre1980', insulation: 'poor', climate: 'cold' },
      indoorC: 20,
      outdoorC: 2,
      mode: 'cold',
      thresholdC: 15,
    });
  }
}

/**
 * The simulated neighbourhood shown beside a demo outage. There is no crowd
 * network in this build, so these figures are a labelled simulation, never real
 * evidence. They stand where the Ember Map and provider adapters will plug in.
 */
export function simulatedNeighbourhood(outageStartedAtMs: number): {
  readonly neighboursAbsent: number;
  readonly providerRestoreAtMs: number;
  readonly crowdRestoreAtMs: number;
} {
  const minute = 60_000;
  return {
    neighboursAbsent: 14,
    providerRestoreAtMs: outageStartedAtMs + 143 * minute,
    crowdRestoreAtMs: outageStartedAtMs + 163 * minute,
  };
}
