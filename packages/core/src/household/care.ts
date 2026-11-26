import type { CareNeed, HomeRiskMode } from './events.js';
import type { HouseholdView, RosterMember } from './view.js';

/**
 * Guardians and check-ins (product description 7.10): during an outage, a person
 * with a check-in rhythm is expected to send a word (any code, by light, sound or
 * marked by hand) at least once per rhythm. The count of missed check-ins starts
 * from the later of the outage start and their last word; the escalation is at two.
 */

export interface CheckIn {
  readonly member: RosterMember;
  readonly cadenceHours: number;
  /** When the next word is due. */
  readonly dueMs: number;
  /** Whole rhythms passed with no word. */
  readonly missed: number;
  /** When the first missed one was due (the alert's "since"), or null. */
  readonly overdueSinceMs: number | null;
}

export const ESCALATE_AFTER_MISSED = 2;

export function checkIns(view: HouseholdView, nowMs: number): readonly CheckIn[] {
  const start = view.outageStartedAtMs;
  if (start === null) return [];
  const out: CheckIn[] = [];
  for (const m of view.roster) {
    const h = m.care?.cadenceHours ?? null;
    if (h === null) continue;
    const every = h * 3_600_000;
    const base = Math.max(start, m.heard?.atMs ?? Number.NEGATIVE_INFINITY);
    const missed = Math.max(0, Math.floor((nowMs - base) / every));
    out.push({
      member: m,
      cadenceHours: h,
      dueMs: base + (missed + 1) * every,
      missed,
      overdueSinceMs: missed > 0 ? base + every : null,
    });
  }
  return out.sort((a, b) => b.missed - a.missed || a.dueMs - b.dueMs);
}

/**
 * Stricter home lines for vulnerable people (7.6 "personal risk profiles"):
 * 18 °C is the WHO housing guideline's minimum indoor temperature; for heat
 * Afterglow uses 30 °C for vulnerable people instead of 32 °C. Null when no one
 * in the household has a need recorded.
 */
export const CARE_COLD_C = 18;
export const CARE_HEAT_C = 30;
export function careThresholdC(mode: HomeRiskMode, needs: readonly CareNeed[]): number | null {
  if (needs.length === 0) return null;
  return mode === 'cold' ? CARE_COLD_C : CARE_HEAT_C;
}

/** Everyone's needs, once each. */
export function householdNeeds(view: HouseholdView): readonly CareNeed[] {
  return [...new Set(view.roster.flatMap((m) => m.care?.needs ?? []))].sort();
}
