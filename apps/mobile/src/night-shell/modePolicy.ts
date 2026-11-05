/**
 * When the luminance mode changes by itself (night-vision rule 3 / design 3.3).
 *
 * Going dark is always allowed; brightening happens only when the power comes
 * back. A change of space (demo, lock, sign-in) is a change of context, not of
 * the power, so it must never brighten the screen: a person who locks their
 * account in a blackout must not be flashed with a lit screen.
 */
export interface ModeInputs {
  /** An outage is active in the space now shown. */
  readonly outage: boolean;
  /** An outage was active in the space shown a moment ago. */
  readonly wasOutage: boolean;
  /** The space (guest, demo, account) changed in this same update. */
  readonly spaceChanged: boolean;
}

export type ModeDecision =
  /** Leave the mode as it is. */
  | 'keep'
  /** Run the Lights-Out moment and land in Night. */
  | 'lightsOut'
  /** Go straight to Night, no animation (context changed while dark). */
  | 'night'
  /** Power is back: return to Ember. */
  | 'ember';

export function decideMode({ outage, wasOutage, spaceChanged }: ModeInputs): ModeDecision {
  if (spaceChanged) return outage ? 'night' : 'keep';
  if (outage && !wasOutage) return 'lightsOut';
  if (!outage && wasOutage) return 'ember';
  return 'keep';
}
