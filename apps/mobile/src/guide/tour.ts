/**
 * The One Night tour as a pure state machine (guide spec GD-04), the demo power
 * reconcile (GD-03, GD-05) and Wisp's progress opacity (GD-07).
 *
 * Nothing here touches a store. The shell asks `planPower` what to do and does it.
 */

export type TourState =
  | { readonly kind: 'off' }
  | { readonly kind: 'on'; readonly index: number }
  | { readonly kind: 'done' };

export type TourAction = 'start' | 'next' | 'back' | 'skip' | 'restart' | 'close';

export const TOUR_OFF: TourState = { kind: 'off' };

/** Every action is defined from every state, so no sequence of taps can strand a visitor (GD-04). */
export function step(state: TourState, action: TourAction, length: number): TourState {
  if (length <= 0) return TOUR_OFF;
  switch (action) {
    case 'start':
    case 'restart':
      return { kind: 'on', index: 0 };
    case 'close':
      return TOUR_OFF;
    case 'skip':
      return state.kind === 'on' ? { kind: 'done' } : state;
    case 'next':
      if (state.kind !== 'on') return state;
      return state.index >= length - 1 ? { kind: 'done' } : { kind: 'on', index: state.index + 1 };
    case 'back':
      if (state.kind !== 'on') return state;
      return { kind: 'on', index: Math.max(0, state.index - 1) };
  }
}

/** The demo's power, as a step sees it. `back` means an outage ran during this tour and has ended. */
export type Power = 'on' | 'out' | 'back';
export type PowerNeed = Power;
export type PowerAction = 'startOutage' | 'endOutage' | 'cycle';

/** Whether a power state meets a step's need. Power that came back is also power on. */
export function satisfies(need: PowerNeed, power: Power): boolean {
  if (need === 'on') return power === 'on' || power === 'back';
  return need === power;
}

/** The one action that brings the demo to the need, or null when it already meets it (GD-05). */
export function reconcile(need: PowerNeed, power: Power): PowerAction | null {
  if (satisfies(need, power)) return null;
  if (need === 'out') return 'startOutage';
  if (need === 'back') return power === 'out' ? 'endOutage' : 'cycle';
  return 'endOutage'; // need 'on' while 'out'
}

/** What an action leaves behind. Ending an outage, directly or by a cycle, is "back". */
export function afterAction(action: PowerAction): Power {
  return action === 'startOutage' ? 'out' : 'back';
}

/**
 * What the shell should do for a step, given the active space. The tour never acts
 * on a real household: outside the demo there is nothing to do (GD-03).
 */
export function planPower(
  spaceKind: 'guest' | 'demo' | 'account',
  need: PowerNeed,
  power: Power,
): PowerAction | null {
  if (spaceKind !== 'demo') return null;
  return reconcile(need, power);
}

/** How long before "now" the tour's outage begins: the same evening for every visitor. */
export const TOUR_OUTAGE_OFFSET_MINUTES = 45;

/** Wisp's opacity at a step: 0.35 on the first, 1.0 on the last, rising in between (GD-07). */
export function opacity(index: number, length: number): number {
  if (length <= 1) return 1;
  const i = Math.min(Math.max(0, index), length - 1);
  return 0.35 + (0.65 * i) / (length - 1);
}
