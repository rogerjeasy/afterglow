import type { CellStateValue } from '../cells/types.js';

/**
 * Restoration estimate (RS-01..RS-09). When will the power come back?
 *
 * The provider promises a time; utilities run late. This takes the promise and
 * the utility's own overrun history for the area and returns a band or an honest
 * refusal. Pure, deterministic and not on the AI path. Minutes are absolute
 * integers since an epoch.
 */

/** Past outages needed, still possible now, before a band is shown (RS-03). */
export const MIN_HISTORY = 5;

/** An earlier outage in the same area: what was promised and what happened. */
export interface PastOutage {
  readonly promisedEndMinute: number;
  readonly actualEndMinute: number;
}

export interface RestorationInput {
  readonly nowMinute: number;
  /** The provider's promised end of the current outage, or null when there is none. */
  readonly promisedEndMinute: number | null;
  readonly history: readonly PastOutage[];
  /** The crowd's state for the user's cell. */
  readonly crowdState: CellStateValue;
}

export type RestorationEstimate =
  | {
      readonly kind: 'estimate';
      readonly atMinute: number;
      readonly lowMinute: number;
      readonly highMinute: number;
      readonly promisedEndMinute: number;
      /** How many past outages the band is drawn from (RS-09). */
      readonly basedOn: number;
    }
  | { readonly kind: 'promiseOnly'; readonly promisedEndMinute: number }
  | { readonly kind: 'underway' }
  | { readonly kind: 'unknown'; readonly reason: string };

const unknown = (reason: string): RestorationEstimate => ({ kind: 'unknown', reason });

const isMinute = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** Nearest-rank percentile of an ascending list: exact and reproducible on integers. */
function nearestRank(sortedAsc: readonly number[], percent: number): number {
  const index = Math.max(0, Math.ceil((percent / 100) * sortedAsc.length) - 1);
  return sortedAsc[index] as number;
}

/**
 * Estimate when the power returns, or say why it cannot (RS-01..RS-09).
 *
 * The estimate is the promise plus the median past overrun, with the band from the
 * 10th to the 90th percentile, taken over overruns that are still possible now.
 */
export function estimateRestoration(input: RestorationInput): RestorationEstimate {
  const { nowMinute, promisedEndMinute, history, crowdState } = input;

  if (!isMinute(nowMinute)) return unknown('the current time is not usable');
  if (crowdState === 'comingBack') return { kind: 'underway' };
  if (crowdState === 'lit') return unknown('this cell is not dark');
  if (promisedEndMinute === null) return unknown('the provider has promised no end time');
  if (!isMinute(promisedEndMinute)) return unknown('the promised end time is not usable');

  // Overruns that are still possible now: the outage cannot already have ended.
  const overruns: number[] = [];
  for (const past of history) {
    if (!isMinute(past.promisedEndMinute) || !isMinute(past.actualEndMinute)) continue;
    const overrun = past.actualEndMinute - past.promisedEndMinute;
    if (promisedEndMinute + overrun > nowMinute) overruns.push(overrun);
  }

  if (overruns.length < MIN_HISTORY) {
    return promisedEndMinute > nowMinute
      ? { kind: 'promiseOnly', promisedEndMinute }
      : unknown(
          `the promised time has passed and fewer than ${MIN_HISTORY} past outages ran this late`,
        );
  }

  overruns.sort((a, b) => a - b);
  return {
    kind: 'estimate',
    atMinute: promisedEndMinute + nearestRank(overruns, 50),
    lowMinute: promisedEndMinute + nearestRank(overruns, 10),
    highMinute: promisedEndMinute + nearestRank(overruns, 90),
    promisedEndMinute,
    basedOn: overruns.length,
  };
}
