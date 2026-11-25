import type {
  Draw,
  EnergyLoad,
  EnergyStore,
  Excluded,
  LoadClass,
  LoadOutcome,
  Plan,
  PlanInput,
  PlanResult,
  StoreKind,
  StoreOutcome,
} from './types.js';

export const ENERGY_MODEL_VERSION = 'energy-plan-v1';

/** Priority order (product spec 7.8): medical, communication, light, food, comfort. */
const CLASS_RANK: Readonly<Record<LoadClass, number>> = {
  medical: 0,
  communication: 1,
  light: 2,
  food: 3,
  comfort: 4,
};

/**
 * Planning defaults per kind. These are Afterglow's own conservative figures,
 * not any manufacturer's, and every plan lists the ones it used (EN-08). The
 * car's is low on purpose so a plan never drains a starting battery.
 */
export const DEFAULT_USABLE_FRACTION: Readonly<Record<StoreKind, number>> = {
  phone: 0.9,
  powerBank: 0.85,
  laptop: 0.8,
  car: 0.3,
  homeBattery: 0.9,
  ups: 0.8,
  generator: 1,
};

const KIND_LABEL: Readonly<Record<StoreKind, string>> = {
  phone: 'phone',
  powerBank: 'power bank',
  laptop: 'laptop',
  car: 'car battery',
  homeBattery: 'home battery',
  ups: 'UPS',
  generator: 'generator',
};

export const MIN_HORIZON_HOURS = 0.25;
export const MAX_HORIZON_HOURS = 168;
const MAX_ID = 64;
const MAX_CAPACITY_WH = 1_000_000;
const MAX_WATTS = 100_000;
const EPS = 1e-9;

const isStoreKind = (k: unknown): k is StoreKind =>
  typeof k === 'string' && Object.prototype.hasOwnProperty.call(DEFAULT_USABLE_FRACTION, k);
const isLoadClass = (c: unknown): c is LoadClass =>
  typeof c === 'string' && Object.prototype.hasOwnProperty.call(CLASS_RANK, c);
const isId = (x: unknown): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= MAX_ID;
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Why a store is not usable, or null when it is. The one definition (HH-14 reuses it). */
export function storeProblem(s: unknown): string | null {
  if (typeof s !== 'object' || s === null) return 'Not a store.';
  const x = s as Record<string, unknown>;
  if (!isId(x.id)) return 'It has no usable id.';
  if (typeof x.name !== 'string' || x.name.trim() === '') return 'It has no name.';
  if (!isStoreKind(x.kind)) return 'Its kind is not one I know.';
  if (typeof x.capacityWh !== 'number' || !Number.isFinite(x.capacityWh) || x.capacityWh <= 0) {
    return 'Its capacity is not known. Add the capacity in watt-hours.';
  }
  if (x.capacityWh > MAX_CAPACITY_WH) return 'Its capacity is out of range.';
  if (
    typeof x.chargePct !== 'number' ||
    !Number.isFinite(x.chargePct) ||
    x.chargePct < 0 ||
    x.chargePct > 100
  ) {
    return 'Its charge must be from 0 to 100 percent.';
  }
  if (typeof x.ac !== 'boolean') return 'It must say whether it has an AC outlet.';
  if (
    x.usableFraction !== undefined &&
    (typeof x.usableFraction !== 'number' ||
      !Number.isFinite(x.usableFraction) ||
      x.usableFraction <= 0 ||
      x.usableFraction > 1)
  ) {
    return 'Its usable fraction must be above 0 and at most 1.';
  }
  return null;
}

/** Why a load is not usable, or null when it is. */
export function loadProblem(l: unknown): string | null {
  if (typeof l !== 'object' || l === null) return 'Not a load.';
  const x = l as Record<string, unknown>;
  if (!isId(x.id)) return 'It has no usable id.';
  if (typeof x.name !== 'string' || x.name.trim() === '') return 'It has no name.';
  if (
    typeof x.watts !== 'number' ||
    !Number.isFinite(x.watts) ||
    x.watts <= 0 ||
    x.watts > MAX_WATTS
  ) {
    return 'Its power draw in watts is not known.';
  }
  if (!isLoadClass(x.class)) return 'Its class is not one I know.';
  if (x.needs !== 'usb' && x.needs !== 'ac') return 'It must say whether it needs USB or AC.';
  if (x.drawsFrom !== undefined && !isId(x.drawsFrom)) return 'Its pinned store is not valid.';
  return null;
}

const hours = (h: number): string => `${Math.round(h * 10) / 10} h`;

interface Pool {
  readonly store: EnergyStore;
  readonly fraction: number;
  readonly isDefault: boolean;
  readonly usableWh: number;
  remainingWh: number;
}

/**
 * Plan what each store carries (EN-01..EN-09).
 *
 * Greedy by priority: medical, communication, light, food, comfort, then id.
 * A load draws from compatible stores; where one store can carry it for the
 * whole horizon it uses exactly one (best fit), otherwise it takes the largest
 * remainders first to keep swaps few. The plan is an estimate that assumes
 * loads run continuously, and it says what it could not cover.
 */
export function planEnergy(input: PlanInput): PlanResult {
  try {
    return planUnsafe(input);
  } catch {
    return { kind: 'noPlan', reason: 'The plan could not be worked out from these numbers.' };
  }
}

function planUnsafe(input: PlanInput): PlanResult {
  if (typeof input !== 'object' || input === null) {
    return { kind: 'noPlan', reason: 'There is nothing to plan.' };
  }
  const horizon = input.horizonHours;
  if (
    typeof horizon !== 'number' ||
    !Number.isFinite(horizon) ||
    horizon < MIN_HORIZON_HOURS ||
    horizon > MAX_HORIZON_HOURS
  ) {
    return {
      kind: 'noPlan',
      reason: `The time to cover must be from ${MIN_HORIZON_HOURS} to ${MAX_HORIZON_HOURS} hours.`,
    };
  }
  const storesIn: unknown[] = Array.isArray(input.stores) ? input.stores : [];
  const loadsIn: unknown[] = Array.isArray(input.loads) ? input.loads : [];

  const excluded: Excluded[] = [];
  const seenStore = new Set<string>();
  const seenLoad = new Set<string>();
  const dupStore = new Set<string>();
  const dupLoad = new Set<string>();
  for (const s of storesIn) {
    const id = (s as { id?: unknown } | null)?.id;
    if (isId(id)) (seenStore.has(id) ? dupStore : seenStore).add(id);
  }
  for (const l of loadsIn) {
    const id = (l as { id?: unknown } | null)?.id;
    if (isId(id)) (seenLoad.has(id) ? dupLoad : seenLoad).add(id);
  }

  const stores: EnergyStore[] = [];
  for (const s of storesIn) {
    const problem = storeProblem(s);
    const id = (s as { id?: unknown } | null)?.id;
    if (problem !== null) {
      excluded.push({ kind: 'store', id: isId(id) ? id : '', reason: problem });
    } else if (dupStore.has((s as EnergyStore).id)) {
      excluded.push({
        kind: 'store',
        id: (s as EnergyStore).id,
        reason: 'Two stores share this id.',
      });
    } else stores.push(s as EnergyStore);
  }
  const loads: EnergyLoad[] = [];
  for (const l of loadsIn) {
    const problem = loadProblem(l);
    const id = (l as { id?: unknown } | null)?.id;
    if (problem !== null) {
      excluded.push({ kind: 'load', id: isId(id) ? id : '', reason: problem });
    } else if (dupLoad.has((l as EnergyLoad).id)) {
      excluded.push({ kind: 'load', id: (l as EnergyLoad).id, reason: 'Two loads share this id.' });
    } else loads.push(l as EnergyLoad);
  }

  stores.sort((a, b) => cmp(a.id, b.id));
  const pools = new Map<string, Pool>();
  const defaultsUsed = new Set<string>();
  for (const store of stores) {
    const isDefault = store.usableFraction === undefined;
    const fraction = store.usableFraction ?? DEFAULT_USABLE_FRACTION[store.kind];
    if (isDefault) {
      defaultsUsed.add(
        `${KIND_LABEL[store.kind]}: ${Math.round(fraction * 100)}% of the charge counted as usable (Afterglow planning default)`,
      );
    }
    const usableWh = store.capacityWh * (store.chargePct / 100) * fraction;
    pools.set(store.id, { store, fraction, isDefault, usableWh, remainingWh: usableWh });
  }

  loads.sort((a, b) => CLASS_RANK[a.class] - CLASS_RANK[b.class] || cmp(a.id, b.id));
  const outcomes: LoadOutcome[] = [];

  for (const load of loads) {
    const neededWh = load.watts * horizon;
    const candidates: Pool[] = [];
    if (load.drawsFrom !== undefined) {
      const pinned = pools.get(load.drawsFrom);
      if (pinned) candidates.push(pinned);
    } else {
      for (const p of pools.values()) {
        // A phone runs only what is pinned to it; an AC load needs an AC outlet (EN-05).
        if (p.store.kind === 'phone') continue;
        if (load.needs === 'ac' && !p.store.ac) continue;
        candidates.push(p);
      }
    }

    const usbFirst = (p: Pool): number => (load.needs === 'usb' && p.store.ac ? 1 : 0);
    const draws: Draw[] = [];
    let remainingNeed = neededWh;

    // One store for the whole horizon, if any can (best fit: the smallest that suffices).
    const fits = candidates
      .filter((p) => p.remainingWh >= neededWh * (1 - EPS))
      .sort(
        (a, b) =>
          usbFirst(a) - usbFirst(b) || a.remainingWh - b.remainingWh || cmp(a.store.id, b.store.id),
      );
    const single = fits[0];
    if (single) {
      const wh = Math.min(neededWh, single.remainingWh);
      single.remainingWh -= wh;
      draws.push({ storeId: single.store.id, wh });
      remainingNeed -= wh;
    } else {
      // Otherwise take the largest remainders first, to keep the number of swaps low.
      const order = [...candidates].sort(
        (a, b) =>
          usbFirst(a) - usbFirst(b) || b.remainingWh - a.remainingWh || cmp(a.store.id, b.store.id),
      );
      for (const p of order) {
        if (remainingNeed <= neededWh * EPS) break;
        if (p.remainingWh <= 0) continue;
        const wh = Math.min(remainingNeed, p.remainingWh);
        p.remainingWh -= wh;
        draws.push({ storeId: p.store.id, wh });
        remainingNeed -= wh;
      }
    }

    const allocatedWh = draws.reduce((n, d) => n + d.wh, 0);
    const runtimeHours = Math.min(horizon, allocatedWh / load.watts);
    const status =
      allocatedWh >= neededWh * (1 - EPS) ? 'covered' : allocatedWh > 0 ? 'partial' : 'unsupplied';
    const medical = load.class === 'medical';
    const message =
      status === 'covered'
        ? `Runs the whole ${hours(horizon)}${draws.length > 1 ? `, moved between ${draws.length} stores` : ''}.`
        : status === 'partial'
          ? `Runs ${hours(runtimeHours)} of the ${hours(horizon)}.${medical ? ' It cannot be sustained for the whole time. Plan another source or go where there is power.' : ''}`
          : `No store can run this${load.drawsFrom !== undefined ? ' from the store it is tied to' : load.needs === 'ac' ? ' (it needs an AC outlet)' : ''}.${medical ? ' It cannot be sustained. Plan another source or go where there is power.' : ''}`;
    outcomes.push({
      load,
      status,
      neededWh,
      allocatedWh,
      runtimeHours,
      draws,
      switches: Math.max(0, draws.length - 1),
      message,
    });
  }

  const storeOutcomes: StoreOutcome[] = [...pools.values()].map((p) => {
    const used = p.usableWh - p.remainingWh;
    return {
      store: p.store,
      usableFraction: p.fraction,
      usableFractionIsDefault: p.isDefault,
      usableWh: p.usableWh,
      usedWh: used,
      remainingWh: p.remainingWh,
      startPct: p.store.chargePct,
      afterPct: p.usableWh > 0 ? p.store.chargePct * (p.remainingWh / p.usableWh) : 0,
    };
  });

  excluded.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.id, b.id) || cmp(a.reason, b.reason));
  const plan: Plan = {
    modelVersion: ENERGY_MODEL_VERSION,
    horizonHours: horizon,
    loads: outcomes,
    stores: storeOutcomes,
    excluded,
    defaultsUsed: [...defaultsUsed].sort(),
  };
  return { kind: 'plan', plan };
}
