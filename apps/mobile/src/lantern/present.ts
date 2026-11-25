import type { cells, restoration } from '@afterglow/core';
import { formatClockTime, formatDuration } from '../format';
import { toMs } from './model';

/**
 * Plain-language text for the Lantern. Every state is said in words as well as a
 * shape, and "unknown" says why and what would resolve it (fail-closed rule 10).
 */

const K = 5;

export const STATE_WORD: Record<cells.CellStateValue, string> = {
  lit: 'Lit',
  dark: 'Dark',
  mixed: 'Mixed',
  comingBack: 'Coming back',
  unknown: 'Unknown',
};

const devices = (n: number): string => `${n} device${n === 1 ? '' : 's'}`;

/** What a cell's state means, with the count that stands behind it. */
export function explainCell(state: cells.CellState): string {
  const n = state.deviceCount;
  switch (state.state) {
    case 'lit':
      return `${devices(n)} report mains power here in the last 30 minutes.`;
    case 'dark':
      return `${devices(n)} report no mains power here in the last 30 minutes.`;
    case 'mixed':
      return `${devices(n)} disagree: some have power and some do not. This is usual in the first minutes of an outage and the last minutes of one.`;
    case 'comingBack':
      return `${devices(n)} here are reporting power again, and several began charging in the last 10 minutes. Power is returning.`;
    case 'unknown':
      return n === 0
        ? 'No device has reported from this cell in the last 30 minutes. I will not guess.'
        : `Only ${devices(n)} reported here. A cell is shown only when at least ${K} devices stand behind it, so nobody can be singled out.`;
  }
}

/** The line shown with the cell: how it is known and how solid that is. */
export function provenanceWords(state: cells.CellState): string {
  if (state.state === 'unknown') return 'not enough reports';
  return state.provenance.join(' + ');
}

export interface EstimateText {
  readonly headline: string;
  readonly detail: string;
  /** Source chips: where the figures come from. */
  readonly sources: readonly string[];
}

/** The restoration estimate as the Lantern says it. */
export function estimateText(
  est: restoration.RestorationEstimate,
  providerLabel: string,
): EstimateText {
  switch (est.kind) {
    case 'estimate':
      return {
        headline: `Estimate ${formatClockTime(toMs(est.atMinute))}`,
        detail: `Likely between ${formatClockTime(toMs(est.lowMinute))} and ${formatClockTime(
          toMs(est.highMinute),
        )}. The provider promised ${formatClockTime(toMs(est.promisedEndMinute))}; this adds how late the utility ran in ${est.basedOn} past outages here.`,
        sources: [providerLabel, `${est.basedOn} past outages`, 'restoration baseline'],
      };
    case 'promiseOnly':
      return {
        headline: `Provider says ${formatClockTime(toMs(est.promisedEndMinute))}`,
        detail:
          'That is the provider’s promise only. There are not yet enough past outages here to say how late it tends to run, so I show no estimate.',
        sources: [providerLabel],
      };
    case 'underway':
      return {
        headline: 'Power is coming back',
        detail:
          'Phones in your cell are charging again. That is stronger evidence than any schedule, so I show no estimate.',
        sources: ['crowd'],
      };
    case 'unknown':
      return {
        headline: 'No estimate',
        detail: `${est.reason.charAt(0).toUpperCase()}${est.reason.slice(1)}. I will not guess a time.`,
        sources: [],
      };
  }
}

/**
 * The Hearth's one line about the neighbourhood: what the crowd says, what the
 * provider promised and what the estimate adds. Each piece appears only when the
 * core can back it.
 */
export function hearthLine(
  user: cells.CellState,
  estimate: restoration.RestorationEstimate,
  outageStartedAtMs: number,
): string {
  const n = user.deviceCount;
  const when = formatClockTime(outageStartedAtMs);
  switch (user.state) {
    case 'comingBack':
      return `Power is coming back in your cell: ${devices(n)} are charging again.`;
    case 'lit':
      return 'Your neighbours have power again. If yours is back, tell me with the button below.';
    case 'unknown':
      return `You reported the power out at ${when}. ${
        n === 0 ? 'No device has' : `Only ${devices(n)} ${n === 1 ? 'has' : 'have'}`
      } reported from your cell so far. At least ${K} are needed to show it.`;
    default: {
      const crowd = `${devices(n)} in your cell lost power`;
      if (estimate.kind === 'estimate') {
        return `${crowd} · provider says ${formatClockTime(toMs(estimate.promisedEndMinute))} · estimate ${formatClockTime(
          toMs(estimate.atMinute),
        )} (likely ${formatClockTime(toMs(estimate.lowMinute))} to ${formatClockTime(toMs(estimate.highMinute))})`;
      }
      if (estimate.kind === 'promiseOnly') {
        return `${crowd} · provider says ${formatClockTime(toMs(estimate.promisedEndMinute))} · no estimate yet`;
      }
      return `${crowd} · no estimate: ${estimate.kind === 'unknown' ? estimate.reason : 'not enough to say'}`;
    }
  }
}

export interface LateStats {
  readonly late: number;
  readonly total: number;
  /** Median minutes over the promise across the late outages, or null when none was late. */
  readonly medianLateMinutes: number | null;
}

/** How often this utility ran past its promise, from the area's own history. */
export function lateStats(history: readonly restoration.PastOutage[]): LateStats {
  const valid = history.filter(
    (h) => Number.isInteger(h.promisedEndMinute) && Number.isInteger(h.actualEndMinute),
  );
  const overruns = valid
    .map((h) => h.actualEndMinute - h.promisedEndMinute)
    .filter((o) => o > 0)
    .sort((a, b) => a - b);
  const median =
    overruns.length === 0
      ? null
      : (overruns[Math.max(0, Math.ceil(overruns.length / 2) - 1)] as number);
  return { late: overruns.length, total: valid.length, medianLateMinutes: median };
}

export function lateText(stats: LateStats): string {
  if (stats.total === 0) return 'No past outages are recorded for this area.';
  if (stats.late === 0) return `Power returned on time in all ${stats.total} past outages here.`;
  const when =
    stats.medianLateMinutes === null
      ? ''
      : `, typically ${formatDuration(stats.medianLateMinutes)} late`;
  return `Power came back after the promise in ${stats.late} of ${stats.total} past outages here${when}.`;
}

/** The playback label: where in the night the map is showing. */
export function playbackText(viewMinute: number, nowMinute: number): string {
  const at = formatClockTime(toMs(viewMinute));
  const delta = viewMinute - nowMinute;
  if (Math.abs(delta) < 3) return `Now · ${at}`;
  return delta > 0
    ? `${at} · ${formatDuration(delta)} ahead (simulated)`
    : `${at} · ${formatDuration(-delta)} ago`;
}
