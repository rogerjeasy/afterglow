/**
 * Alerts (spec `.kiro/specs/alerts`, AL-01..AL-08).
 *
 * An alert is a module's own verdict, quoted with its source and its number. The
 * alerts module decides nothing new; it gathers, deduplicates and orders.
 */

export type AlertPriority = 'critical' | 'high' | 'normal';

export type AlertKind =
  /** An outage is under way. */
  | 'outage'
  /** A compartment's window closes within FOOD_SOON_MINUTES. */
  | 'foodSoon'
  /** A compartment is past its window. */
  | 'foodPast'
  /** The home's earliest crossing is within HOME_SOON_MINUTES. */
  | 'homeSoon'
  /** The earliest edge of the band has been reached: the home may be at its line. */
  | 'homeReached'
  /** A roster member's latest word is HELP. */
  | 'help'
  /** A person with a check-in rhythm has missed one (high) or two or more (critical). */
  | 'missedCheckIn'
  /** The user's cell is coming back, by the crowd. */
  | 'comingBack';

export interface Alert {
  /** Identity for deduplication: kind, subject and the outage it belongs to (AL-02). */
  readonly key: string;
  readonly kind: AlertKind;
  readonly priority: AlertPriority;
  /** What it is about, in the household's own words: "Fridge", "Mrs Dlamini", "Your home". */
  readonly subject: string;
  /** When the condition began, in ms. */
  readonly sinceMs: number;
  /** Minutes from the core where the alert carries a number (remaining, past, earliest edge). */
  readonly minutes: number | null;
  /** At least one, non-empty, model version included where a model produced the number (AL-01). */
  readonly sources: readonly string[];
}

/** A window closing within this many minutes is worth an alert (AL-04). */
export const FOOD_SOON_MINUTES = 30;
/** A home within this many minutes of its line, on the early edge, is worth an alert (AL-05). */
export const HOME_SOON_MINUTES = 120;

export const PRIORITY_RANK: Readonly<Record<AlertPriority, number>> = {
  critical: 0,
  high: 1,
  normal: 2,
};
