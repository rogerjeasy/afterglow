import type { CellState } from '../cells/types.js';
import type { FoodIndex } from '../foodkeeper/types.js';
import { assessAll, assessRoster, hoursOfSafety } from '../household/derive.js';
import type { HouseholdView } from '../household/view.js';
import { APPLIANCE_MODEL_VERSION, BUILDING_MODEL_VERSION } from '../thermal/archetypes.js';
import { mergeAlerts } from './merge.js';
import { type Alert, FOOD_SOON_MINUTES, HOME_SOON_MINUTES } from './types.js';

/**
 * Raise the alerts a household needs now (AL-01, AL-03..AL-06, AL-08). Every
 * number is the core's own; nothing is rounded or recomputed here. Unknown
 * verdicts raise nothing timed (fail-closed rules 5 and 10).
 */

export const FOOD_SOURCE = 'USDA FSIS outage guidance';

export interface AlertInput {
  readonly view: HouseholdView;
  readonly foodIndex: FoodIndex;
  readonly nowMs: number;
  /** Who says the power is out: "you reported it", "Grid Sense". Never empty in an alert. */
  readonly outageSource: string;
  /** The user's cell from the crowd, when there is one. */
  readonly cell?: CellState | null;
}

const nonEmpty = (s: string, fallback: string): string => (s.trim() === '' ? fallback : s);

export function evaluateAlerts(input: AlertInput): readonly Alert[] {
  const { view, foodIndex, nowMs } = input;
  const start = view.outageStartedAtMs;
  const epoch = start === null ? 'none' : String(start);
  const out: Alert[] = [];

  // HELP is the one alert that does not wait for an outage (AL-03).
  for (const r of assessRoster(view)) {
    if (r.state !== 'help' || r.member.heard === null) continue;
    out.push({
      key: `help:${r.member.id}:${epoch}`,
      kind: 'help',
      priority: 'critical',
      subject: r.member.name,
      sinceMs: r.member.heard.atMs,
      minutes: null,
      sources: [`heard by ${r.member.heard.channel}`],
    });
  }

  if (start === null) return mergeAlerts(out);

  out.push({
    key: `outage:${epoch}`,
    kind: 'outage',
    priority: 'high',
    subject: 'Power',
    sinceMs: start,
    minutes: null,
    sources: [nonEmpty(input.outageSource, 'reported outage')],
  });

  // Food: the clock the Cold screen shows, or nothing (AL-04).
  for (const a of assessAll(view, foodIndex, nowMs)) {
    const id = a.model.appliance.id;
    const sources = [FOOD_SOURCE, APPLIANCE_MODEL_VERSION];
    const h = a.headline;
    if (h.kind === 'remaining' && h.minutes > 0 && h.minutes <= FOOD_SOON_MINUTES) {
      out.push({
        key: `foodSoon:${id}:${epoch}`,
        kind: 'foodSoon',
        priority: 'high',
        subject: a.model.appliance.name,
        sinceMs: start,
        minutes: h.minutes,
        sources,
      });
    } else if (h.kind === 'pastWindow') {
      out.push({
        key: `foodPast:${id}:${epoch}`,
        kind: 'foodPast',
        priority: 'critical',
        subject: a.model.appliance.name,
        sinceMs: start,
        minutes: h.sinceMinutes,
        sources,
      });
    }
  }

  // Home: the early edge of the band, never the average (AL-05).
  const hours = hoursOfSafety(view, nowMs);
  if (hours.kind === 'band') {
    const sources = [
      BUILDING_MODEL_VERSION,
      hours.isDefaultBand ? 'default band' : 'archetype band',
    ];
    if (hours.earliestMinutes === 0) {
      out.push({
        key: `homeReached:${epoch}`,
        kind: 'homeReached',
        priority: 'critical',
        subject: 'Your home',
        sinceMs: start,
        minutes: 0,
        sources,
      });
    } else if (hours.earliestMinutes <= HOME_SOON_MINUTES) {
      out.push({
        key: `homeSoon:${epoch}`,
        kind: 'homeSoon',
        priority: 'high',
        subject: 'Your home',
        sinceMs: start,
        minutes: hours.earliestMinutes,
        sources,
      });
    }
  }

  // Coming back: the crowd's word, with its count (AL-06).
  const cell = input.cell ?? null;
  if (cell !== null && cell.state === 'comingBack') {
    out.push({
      key: `comingBack:${epoch}`,
      kind: 'comingBack',
      priority: 'normal',
      subject: 'Your area',
      sinceMs: start,
      minutes: null,
      sources: ['crowd', `${cell.deviceCount} devices`],
    });
  }

  return mergeAlerts(out);
}
