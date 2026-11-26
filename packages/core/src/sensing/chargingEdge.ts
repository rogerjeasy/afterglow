import type { SenseVote } from '../fusion/types.js';

/**
 * Charging edge (product description 7.2). A phone that has been plugged in and
 * charging for a while and then starts discharging, without being touched, is a
 * candidate outage; charging again after that is a candidate restoration.
 *
 * Pure state machine: battery observations in, a vote out. On its own it cannot
 * tell an outage from someone pulling the plug, which is why fusion needs a second
 * negative sense (or the crowd) before it says "absent".
 */

/** How long the phone must have been on the charger before an unplug counts. */
export const PLUGGED_MINUTES = 10;
/** How long it must charge before charging counts as mains being present. */
export const CHARGING_MINUTES = 2;
/** A discharge edge stays fresh evidence for this long. */
export const EDGE_FRESH_MINUTES = 6 * 60;

export interface ChargingState {
  readonly charging: boolean | null;
  /** When the current charging run began. */
  readonly chargingSinceMs: number | null;
  /** When the phone last stopped charging after a long enough run (the candidate outage). */
  readonly dropAtMs: number | null;
  /** When charging resumed after a drop (the candidate restoration). */
  readonly restoreAtMs: number | null;
}

export const INITIAL_CHARGING: ChargingState = {
  charging: null,
  chargingSinceMs: null,
  dropAtMs: null,
  restoreAtMs: null,
};

export interface BatteryObservation {
  readonly charging: boolean;
  readonly atMs: number;
}

const MIN = 60_000;

export function observeCharging(state: ChargingState, o: BatteryObservation): ChargingState {
  if (!Number.isFinite(o.atMs)) return state;
  if (state.charging === o.charging) return state;
  if (o.charging) {
    // Plugged in, or power came back.
    return {
      charging: true,
      chargingSinceMs: o.atMs,
      dropAtMs: state.dropAtMs,
      restoreAtMs: state.dropAtMs !== null ? o.atMs : state.restoreAtMs,
    };
  }
  // Stopped charging. Only a stop after a long enough charging run is a candidate outage.
  const longRun =
    state.chargingSinceMs !== null && o.atMs - state.chargingSinceMs >= PLUGGED_MINUTES * MIN;
  return {
    charging: false,
    chargingSinceMs: null,
    dropAtMs: longRun ? o.atMs : null,
    restoreAtMs: longRun ? null : state.restoreAtMs,
  };
}

export interface ChargingVote {
  readonly vote: SenseVote | null;
  /** True when this vote is a fresh restoration edge (for crowd "coming back"). */
  readonly restoreEdge: boolean;
  readonly reason: string;
}

export function chargingVote(state: ChargingState, nowMs: number): ChargingVote {
  if (state.charging === true && state.chargingSinceMs !== null) {
    if (nowMs - state.chargingSinceMs < CHARGING_MINUTES * MIN) {
      return { vote: null, restoreEdge: false, reason: 'Charging just started.' };
    }
    const restoreEdge = state.restoreAtMs !== null && nowMs - state.restoreAtMs <= 10 * MIN;
    return {
      vote: { sense: 'chargingEdge', direction: 'present', confidence: 0.7 },
      restoreEdge,
      reason: restoreEdge
        ? 'This phone started charging again after losing power.'
        : 'This phone is charging from the wall.',
    };
  }
  if (state.charging === false && state.dropAtMs !== null) {
    if (nowMs - state.dropAtMs > EDGE_FRESH_MINUTES * MIN) {
      return {
        vote: null,
        restoreEdge: false,
        reason: 'The last charging drop is too old to count.',
      };
    }
    return {
      vote: { sense: 'chargingEdge', direction: 'absent', confidence: 0.8 },
      restoreEdge: false,
      reason: 'This phone was on the charger and stopped charging.',
    };
  }
  return {
    vote: null,
    restoreEdge: false,
    reason: state.charging === null ? 'No battery reading yet.' : 'Not on a charger.',
  };
}
