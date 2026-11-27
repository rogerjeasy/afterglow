import type { fieldcheck, household, thermal } from '@afterglow/core';
import { useSyncExternalStore } from 'react';
import { type StorageLike, browserStorage } from '../household/store';

/**
 * Field-check runs (spec `field-checks`, FC-08): what a person measured with a real
 * thermometer, or counted with two phones, kept so it can be compared and exported.
 *
 * A run is a test, never an outage: starting one does not start the outage clock and
 * never sends a crowd report. Runs live on this device only. In the demo they live in
 * memory, so the demo's "nothing is saved" stays true.
 */

export const FIELD_KEY = 'afterglow.fieldcheck.v1';

export interface TimedReading {
  readonly atMs: number;
  readonly c: number;
}

/** A fridge or freezer unplugged on purpose, with the setup it was tested in. */
export interface ColdRun {
  readonly id: string;
  readonly kind: 'cold';
  readonly startedAtMs: number;
  readonly applianceId: string;
  readonly applianceName: string;
  readonly applianceClass: thermal.ApplianceClass;
  readonly fullness: thermal.Fullness;
  /** The room the appliance stands in, as set up or typed for the test. */
  readonly ambientC: number;
  /** The thermometer inside the appliance when the plug was pulled. */
  readonly startC: number;
  readonly readings: readonly TimedReading[];
  readonly endedAtMs: number | null;
}

/** A night with the heating (or cooling) off, against the Graveyard Shift. */
export interface HomeRun {
  readonly id: string;
  readonly kind: 'home';
  readonly startedAtMs: number;
  readonly archetype: thermal.ArchetypeQuery | null;
  readonly mode: household.HomeRiskMode;
  readonly thresholdC: number;
  readonly outdoorC: number;
  /** The thermometer indoors when the heating went off. */
  readonly startC: number;
  readonly readings: readonly TimedReading[];
  readonly endedAtMs: number | null;
}

/** Two phones, one sending and one watching, at a measured distance. */
export interface SeanceRun {
  readonly id: string;
  readonly kind: 'seance';
  readonly startedAtMs: number;
  readonly distanceM: number;
  /** Free words about the place: "indoors, lights off", "through a window". */
  readonly setting: string;
  readonly profile: 'standard' | 'fast';
  readonly trials: readonly (fieldcheck.Trial & { readonly atMs: number })[];
  readonly endedAtMs: number | null;
}

export type FieldRun = ColdRun | HomeRun | SeanceRun;

interface Snapshot {
  readonly runs: readonly FieldRun[];
}

const EMPTY: Snapshot = { runs: [] };

function parse(raw: string | null): Snapshot {
  if (!raw) return EMPTY;
  try {
    const x = JSON.parse(raw) as { runs?: unknown };
    return Array.isArray(x.runs) ? { runs: x.runs as FieldRun[] } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export interface FieldStore {
  getState(): Snapshot;
  subscribe(listener: () => void): () => void;
  start(run: FieldRun): void;
  update(id: string, change: (run: FieldRun) => FieldRun): void;
  remove(id: string): void;
}

export function createFieldStore(storage: StorageLike | null): FieldStore {
  let state: Snapshot = storage ? parse(storage.getItem(FIELD_KEY)) : EMPTY;
  const listeners = new Set<() => void>();
  const commit = (next: Snapshot): void => {
    state = next;
    if (storage) {
      try {
        storage.setItem(FIELD_KEY, JSON.stringify(next));
      } catch {
        // Storage full or blocked: the run stays in memory for this visit.
      }
    }
    for (const l of listeners) l();
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start(run) {
      commit({ runs: [run, ...state.runs] });
    },
    update(id, change) {
      commit({ runs: state.runs.map((r) => (r.id === id ? change(r) : r)) });
    },
    remove(id) {
      commit({ runs: state.runs.filter((r) => r.id !== id) });
    },
  };
}

let deviceStore: FieldStore | null = null;
let demoStore: FieldStore | null = null;

/** The store for this space: the device's own, or a throwaway one in the demo. */
export function fieldStore(demo: boolean): FieldStore {
  if (demo) {
    demoStore ??= createFieldStore(null);
    return demoStore;
  }
  deviceStore ??= createFieldStore(browserStorage());
  return deviceStore;
}

export function useFieldRuns(demo: boolean): { store: FieldStore; runs: readonly FieldRun[] } {
  const store = fieldStore(demo);
  const snap = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { store, runs: snap.runs };
}

/** A new run id: time-based, and unique within this device's list. */
export function newRunId(kind: FieldRun['kind'], nowMs: number): string {
  return `${kind}-${nowMs.toString(36)}`;
}

/** Parse a typed temperature: "3.4", "3,4", "-18". Null when it is not one. */
export function parseTemp(text: string): number | null {
  const t = text
    .trim()
    .replace(',', '.')
    .replace(/\s*°?\s*c$/i, '');
  if (!/^-?\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const c = Number(t);
  return Number.isFinite(c) && c >= -60 && c <= 80 ? c : null;
}
