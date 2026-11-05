import {
  type CompartmentState,
  type CrossingTime,
  type DiscardResult,
  type DoorEvent,
  type PerishableItem,
} from './types.js';

/** Thrown when a thermal input is invalid. */
export class InvalidThermalInputError extends Error {
  constructor(reason: string) {
    super(`Invalid thermal input: ${reason}`);
    this.name = 'InvalidThermalInputError';
  }
}

function assertState(s: CompartmentState): void {
  if (!(s.tauMinutes > 0) || !Number.isFinite(s.tauMinutes)) {
    throw new InvalidThermalInputError('tauMinutes must be a positive finite number');
  }
  if (!Number.isFinite(s.startC) || !Number.isFinite(s.ambientC)) {
    throw new InvalidThermalInputError('temperatures must be finite');
  }
}

/**
 * Temperature at time t (minutes) per the RC model (TH-01). Bounded between
 * startC and ambientC and monotone toward ambient.
 */
export function temperatureAt(state: CompartmentState, t: number): number {
  assertState(state);
  if (t < 0) throw new InvalidThermalInputError('t must be >= 0');
  const { startC, ambientC, tauMinutes } = state;
  return ambientC + (startC - ambientC) * Math.exp(-t / tauMinutes);
}

/**
 * The first time the body reaches `thresholdC` (TH-02). Closed-form inverse of
 * the RC model. Returns `never` when the threshold is unreachable (on the far
 * side of ambient), and 0 when already past it at t=0.
 */
export function crossingTime(state: CompartmentState, thresholdC: number): CrossingTime {
  assertState(state);
  const { startC, ambientC, tauMinutes } = state;

  if (startC === ambientC) {
    // Never moves. Crossed only if the threshold equals the (constant) temp.
    return thresholdC === startC
      ? { kind: 'at', minute: 0 }
      : { kind: 'never', reason: 'body is already at ambient and cannot move' };
  }

  const warming = ambientC > startC;
  // Already past the threshold in the direction of travel?
  if (warming && thresholdC <= startC) return { kind: 'at', minute: 0 };
  if (!warming && thresholdC >= startC) return { kind: 'at', minute: 0 };

  // Reachable only if the threshold is strictly between start and ambient.
  const reachable = warming
    ? thresholdC > startC && thresholdC < ambientC
    : thresholdC < startC && thresholdC > ambientC;
  if (!reachable) {
    return { kind: 'never', reason: 'threshold is on the far side of ambient (unreachable)' };
  }

  const minute = -tauMinutes * Math.log((ambientC - thresholdC) / (ambientC - startC));
  return { kind: 'at', minute: Math.max(0, minute) };
}

/**
 * Apply door-open events as multiplicative gap-closings toward ambient (TH-03).
 * Each event closes a fraction of the remaining gap; because multiplication
 * commutes, the final temperature is order-independent. Returns a new state
 * whose startC reflects the warming, never past ambient.
 *
 * The per-minute-open closing fraction `alpha` defaults to a small value; it
 * can be tuned per appliance later. The result is clamped to never overshoot.
 */
export function applyDoorEvents(
  state: CompartmentState,
  events: readonly DoorEvent[],
  alphaPerMinute = 0.02,
): CompartmentState {
  assertState(state);
  if (!(alphaPerMinute >= 0 && alphaPerMinute <= 1)) {
    throw new InvalidThermalInputError('alphaPerMinute must be in [0,1]');
  }
  const gap0 = state.startC - state.ambientC; // signed distance from ambient
  let remainingFraction = 1;
  for (const e of events) {
    if (!(e.openMinutes >= 0) || !Number.isFinite(e.openMinutes)) {
      throw new InvalidThermalInputError('openMinutes must be a non-negative finite number');
    }
    // closing factor for this event; product over events is order-independent
    remainingFraction *= (1 - alphaPerMinute) ** e.openMinutes;
  }
  const newStart = state.ambientC + gap0 * remainingFraction;
  return { ...state, startC: newStart };
}

/**
 * Discard decision for a perishable (TH-04): the budget starts at the modelled
 * crossing of the item's danger temperature, and discardAt = crossing + budget.
 * The budget is never extended. If the danger temp is never crossed, the item
 * is not yet at risk.
 */
export function discardTime(state: CompartmentState, item: PerishableItem): DiscardResult {
  if (!(item.budgetMinutes >= 0) || !Number.isFinite(item.budgetMinutes)) {
    throw new InvalidThermalInputError('budgetMinutes must be a non-negative finite number');
  }
  const crossing = crossingTime(state, item.dangerC);
  if (crossing.kind === 'never') {
    return { kind: 'notYetAtRisk', name: item.name };
  }
  return { kind: 'discardAt', name: item.name, minute: crossing.minute + item.budgetMinutes };
}
