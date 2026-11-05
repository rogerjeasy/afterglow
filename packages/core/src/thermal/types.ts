/**
 * Thermal model types. Lumped RC: T(t) = T_amb + (T_0 - T_amb) e^(-t/tau).
 * Temperatures in Celsius, times and tau in minutes. Pure module.
 */

/** A compartment's thermal state at the start of modelling. */
export interface CompartmentState {
  /** Temperature at t=0 (Celsius). */
  readonly startC: number;
  /** Ambient the body relaxes toward (Celsius). */
  readonly ambientC: number;
  /** Time constant in minutes (tau). */
  readonly tauMinutes: number;
}

/** A recorded door-open event (TH-03). */
export interface DoorEvent {
  /** How long the door was open, in minutes; longer = bigger step toward ambient. */
  readonly openMinutes: number;
}

/** A crossing-time result; `never` when the threshold is unreachable (TH-02). */
export type CrossingTime =
  | { readonly kind: 'at'; readonly minute: number }
  | { readonly kind: 'never'; readonly reason: string };

/** A food item with a safety budget keyed off a danger temperature (TH-04). */
export interface PerishableItem {
  readonly name: string;
  /** Danger temperature; the clock starts when the model crosses this (Celsius). */
  readonly dangerC: number;
  /** Safety budget in minutes once past the danger temperature; never exceeded. */
  readonly budgetMinutes: number;
}

/** A discard decision; `notYetAtRisk` when the danger temp is never crossed. */
export type DiscardResult =
  | { readonly kind: 'discardAt'; readonly name: string; readonly minute: number }
  | { readonly kind: 'notYetAtRisk'; readonly name: string };

/** A building crossing with an uncertainty band from the archetype tau range (TH-05). */
export interface BuildingCrossing {
  readonly crossing: CrossingTime;
  readonly bandEarliest: CrossingTime;
  readonly bandLatest: CrossingTime;
  readonly isDefaultBand: boolean;
}

/** Every output carries the model version in force (TH-06). */
export interface Versioned<T> {
  readonly value: T;
  readonly modelVersion: string;
}
