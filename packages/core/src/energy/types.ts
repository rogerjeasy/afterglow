/**
 * Energy (Candles) types. Pure module: no I/O, no timers, no randomness.
 * Every store of energy is a candle; the planner says what each one carries.
 */
export type StoreKind =
  | 'phone'
  | 'powerBank'
  | 'laptop'
  | 'car'
  | 'homeBattery'
  | 'ups'
  | 'generator';

export type LoadClass = 'medical' | 'communication' | 'light' | 'food' | 'comfort';
export type Need = 'usb' | 'ac';

export interface EnergyStore {
  readonly id: string;
  readonly name: string;
  readonly kind: StoreKind;
  /** Rated capacity in watt-hours. Never defaulted: an unknown capacity leaves the store out (EN-06). */
  readonly capacityWh: number;
  /** 0 to 100. */
  readonly chargePct: number;
  /** True when it has a mains-style outlet. Every store is assumed to have USB. */
  readonly ac: boolean;
  /** Overrides the planning default for this kind, in (0, 1]. */
  readonly usableFraction?: number | undefined;
}

export interface EnergyLoad {
  readonly id: string;
  readonly name: string;
  readonly watts: number;
  readonly class: LoadClass;
  readonly needs: Need;
  /** Pins the load to one store (a phone running on its own battery). */
  readonly drawsFrom?: string | undefined;
}

export interface PlanInput {
  readonly stores: readonly EnergyStore[];
  readonly loads: readonly EnergyLoad[];
  readonly horizonHours: number;
}

export interface Excluded {
  readonly kind: 'store' | 'load';
  readonly id: string;
  readonly reason: string;
}

export interface Draw {
  readonly storeId: string;
  readonly wh: number;
}

export type LoadStatus = 'covered' | 'partial' | 'unsupplied';

export interface LoadOutcome {
  readonly load: EnergyLoad;
  readonly status: LoadStatus;
  readonly neededWh: number;
  readonly allocatedWh: number;
  /** min(horizon, allocatedWh / watts). */
  readonly runtimeHours: number;
  readonly draws: readonly Draw[];
  /** Number of times the load must be moved to another store. */
  readonly switches: number;
  readonly message: string;
}

export interface StoreOutcome {
  readonly store: EnergyStore;
  readonly usableFraction: number;
  readonly usableFractionIsDefault: boolean;
  readonly usableWh: number;
  readonly usedWh: number;
  readonly remainingWh: number;
  /** The charge it started at, and what is left of it after the plan, as percent of capacity. */
  readonly startPct: number;
  readonly afterPct: number;
}

export interface Plan {
  readonly modelVersion: string;
  readonly horizonHours: number;
  readonly loads: readonly LoadOutcome[];
  readonly stores: readonly StoreOutcome[];
  readonly excluded: readonly Excluded[];
  /** Every planning default in use, in words, so a default is never silent (EN-08). */
  readonly defaultsUsed: readonly string[];
}

export type PlanResult =
  | { readonly kind: 'plan'; readonly plan: Plan }
  | { readonly kind: 'noPlan'; readonly reason: string };
