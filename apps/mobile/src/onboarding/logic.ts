import type { StorageLike } from '../household/store';

/**
 * Onboarding rules, kept pure so they are testable and the screen only draws them.
 *
 * Design 11.1: short, every step skippable, each step collects something the dark
 * will need, and a first-time visitor is never trapped in it. Steps for things the
 * web build cannot do yet (calibrating the ear needs the phone's microphone sensing,
 * which is native work) are left out rather than faked.
 */

export const STEPS = ['welcome', 'cold', 'home', 'people', 'done'] as const;
export type StepId = (typeof STEPS)[number];

export const FLAG_KEY = 'afterglow.onboarding.v1';
export type OnboardingFlag = 'done' | 'skipped';

export function readFlag(storage: StorageLike): OnboardingFlag | null {
  try {
    const v = storage.getItem(FLAG_KEY);
    return v === 'done' || v === 'skipped' ? v : null;
  } catch {
    return null;
  }
}

export function writeFlag(storage: StorageLike, flag: OnboardingFlag): void {
  try {
    storage.setItem(FLAG_KEY, flag);
  } catch {
    // Storage blocked: the welcome may show again next visit, which is harmless.
  }
}

export function clearFlag(storage: StorageLike): void {
  try {
    storage.removeItem(FLAG_KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * Show the welcome only to a first visit to the real (guest) space: never in the
 * demo or an account, never over data the person already entered, and never for a
 * deep link that asks for a specific scenario (`?phase=`, used by demos and tests).
 */
export function shouldOnboard(input: {
  readonly flag: OnboardingFlag | null;
  readonly spaceKind: 'guest' | 'demo' | 'account';
  readonly hasHouseholdData: boolean;
  readonly search: string;
}): boolean {
  return (
    input.flag === null &&
    input.spaceKind === 'guest' &&
    !input.hasHouseholdData &&
    !new URLSearchParams(input.search).has('phase')
  );
}

export function stepIndex(step: StepId): number {
  return STEPS.indexOf(step);
}

export function nextStep(step: StepId): StepId {
  return STEPS[Math.min(STEPS.length - 1, stepIndex(step) + 1)] as StepId;
}

export function previousStep(step: StepId): StepId {
  return STEPS[Math.max(0, stepIndex(step) - 1)] as StepId;
}

/** "Step 2 of 4": the welcome and the closing page are not counted. */
export function progressText(step: StepId): string {
  const middle = STEPS.slice(1, -1);
  const i = middle.indexOf(step);
  return i < 0 ? '' : `Step ${i + 1} of ${middle.length}`;
}

export interface Summary {
  readonly appliances: number;
  readonly homeSet: boolean;
  readonly people: number;
}

/** What was entered, in words, and what is still open. Never claims more than was entered. */
export function summaryLines(s: Summary): { done: string[]; open: string[] } {
  const done: string[] = [];
  const open: string[] = [];
  if (s.appliances > 0) {
    done.push(
      `${s.appliances} cold thing${s.appliances === 1 ? '' : 's'}: the Cold tab can say how long food is covered.`,
    );
  } else open.push('Cold things: add a fridge or freezer on the Cold tab.');
  if (s.homeSet) done.push('Your home: the Hearth can show hours of safety as a band.');
  else open.push('Your home: without it hours of safety is a wide band, clearly marked.');
  if (s.people > 0) {
    done.push(
      `${s.people} ${s.people === 1 ? 'person' : 'people'} on your list: they show as ghosts until you hear from them.`,
    );
  } else open.push('Your people: add them on the Séance tab.');
  open.push('Medicines: pick from the pharmacist-approved table on the Cold tab.');
  open.push('Batteries and devices: add them on the Plan tab for a power plan.');
  return { done, open };
}
