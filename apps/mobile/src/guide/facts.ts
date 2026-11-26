import { cells, type foodkeeper, household } from '@afterglow/core';
import { formatClockTime, formatTemp } from '../format';
import { applianceTileText } from '../household/present';
import { buildLanternModel, estimateAt, toMinute, toMs, viewAt } from '../lantern/model';
import { clock } from '../plan/graveyard';
import type { TourFacts } from './render';

/**
 * The facts Wisp may quote (guide spec GD-01, design §3). Each one is the same
 * text a screen already shows, taken from the same core call and presenter. A
 * fact that cannot be computed is left out, never defaulted; the line then falls
 * back to its words-only version.
 */

export interface FactsInput {
  readonly view: household.HouseholdView;
  readonly nowMs: number;
  /** Only the demo has a neighbourhood; outside it there are no crowd facts. */
  readonly demo: boolean;
  readonly foodIndex: foodkeeper.FoodIndex;
}

export function readFacts({ view, nowMs, demo, foodIndex }: FactsInput): TourFacts {
  const facts: { -readonly [K in keyof TourFacts]: TourFacts[K] } = {
    k: String(cells.K_ANONYMITY),
  };

  const assessments = household.assessAll(view, foodIndex, nowMs);
  const fridge = assessments.find((a) => a.model.appliance.class === 'fridge');
  if (fridge && fridge.headline.kind === 'remaining') {
    facts.fridge = applianceTileText(fridge).value;
  }
  if (view.outageStartedAtMs === null && assessments.length > 0) {
    const decisions = assessments.reduce((n, a) => n + a.needAttention, 0);
    if (decisions === 0) facts.foodVerdict = 'no food needs a decision';
  }

  const roster = household.assessRoster(view);
  const ghosts = roster.filter((r) => r.state === 'ghost').length;
  if (ghosts > 0) facts.ghosts = String(ghosts);

  if (demo && view.outageStartedAtMs !== null) {
    const model = buildLanternModel(toMinute(view.outageStartedAtMs));
    const at = viewAt(model, toMinute(nowMs));
    if (at.user.state === 'dark') facts.devices = String(at.user.deviceCount);
    const est = estimateAt(model, at);
    if (est.kind === 'estimate') {
      facts.promise = formatClockTime(toMs(est.promisedEndMinute));
      facts.estimate = formatClockTime(toMs(est.atMinute));
    }
  }

  const night = household.graveyardShift(view, nowMs);
  if (
    night.kind === 'night' &&
    night.crossing !== null &&
    night.crossing.midMinutes > 0 &&
    night.crossing.midMinutes <= night.spanMinutes
  ) {
    facts.threshold = formatTemp(night.thresholdC);
    facts.crossing = clock(nowMs, night.crossing.midMinutes);
  }

  return facts;
}
