import {
  type CompartmentKind,
  type FoodIndex,
  type FoodVerdict,
  applianceWindowMinutes,
  assessFood,
} from '../foodkeeper/index.js';
import {
  type ApplianceClass,
  BUILDING_MODEL_VERSION,
  buildingCrossing,
  compartmentFor,
} from '../thermal/archetypes.js';
import { InvalidThermalInputError, applyDoorEvents } from '../thermal/model.js';
import type { CompartmentState, CrossingTime } from '../thermal/types.js';
import type { Appliance, FoodItem, HouseholdView } from './view.js';

export function compartmentKindOf(cls: ApplianceClass): CompartmentKind {
  return cls === 'freezer' || cls === 'chestFreezer' ? 'frozen' : 'refrigerated';
}

export interface CompartmentModel {
  readonly appliance: Appliance;
  readonly kind: CompartmentKind;
  /** The state at the moment power was lost, with this outage's door openings folded in (HH-04). */
  readonly state: CompartmentState;
  readonly doorMinutes: number;
  /** True when the appliance's tau is the class default rather than a measured one. */
  readonly usedDefaultTau: boolean;
}

/** Minutes since the outage began, or null when the power is on. A clock set before the start counts as 0. */
export function elapsedMinutes(view: HouseholdView, nowMs: number): number | null {
  if (view.outageStartedAtMs === null || !Number.isFinite(nowMs)) return null;
  return Math.max(0, (nowMs - view.outageStartedAtMs) / 60000);
}

/** Build the thermal state for one appliance (HH-04). */
export function compartmentModel(
  view: HouseholdView,
  applianceId: string,
): CompartmentModel | undefined {
  const appliance = view.appliances.find((a) => a.id === applianceId);
  if (!appliance) return undefined;
  const base = compartmentFor(appliance.class, appliance.fullness, appliance.ambientC);
  // Door openings only count during the current outage.
  const since = view.outageStartedAtMs;
  const openings =
    since === null
      ? []
      : view.doors
          .filter((d) => d.applianceId === appliance.id && d.atMs >= since)
          .map((d) => ({ openMinutes: d.openMinutes }));
  const state = openings.length > 0 ? applyDoorEvents(base.state, openings) : base.state;
  return {
    appliance,
    kind: compartmentKindOf(appliance.class),
    state,
    doorMinutes: openings.reduce((sum, o) => sum + o.openMinutes, 0),
    usedDefaultTau: !base.usedMeasured,
  };
}

export type ApplianceHeadline =
  /** No outage: the window is a prediction ("holds about ..."). */
  | { readonly kind: 'holds'; readonly minutes: number }
  | { readonly kind: 'remaining'; readonly minutes: number }
  | { readonly kind: 'pastWindow'; readonly sinceMinutes: number }
  /** Frozen and the model expects it to stay frozen. */
  | { readonly kind: 'staysFrozen' }
  | { readonly kind: 'unknown'; readonly reason: string };

export interface ItemAssessment {
  readonly item: FoodItem;
  readonly verdict: FoodVerdict;
}

export interface ApplianceAssessment {
  readonly model: CompartmentModel;
  readonly headline: ApplianceHeadline;
  readonly windowMinutes: number | null;
  readonly items: readonly ItemAssessment[];
  /** Items needing action now: discard, or a look at the ice crystals. */
  readonly needAttention: number;
}

/** Assess one appliance and everything in it at `nowMs` (HH-05). */
export function assessAppliance(
  view: HouseholdView,
  index: FoodIndex,
  applianceId: string,
  nowMs: number,
): ApplianceAssessment | undefined {
  const model = compartmentModel(view, applianceId);
  if (!model) return undefined;
  const elapsed = elapsedMinutes(view, nowMs);
  const t = elapsed ?? 0;

  let windowMinutes: number | null;
  let headline: ApplianceHeadline;
  try {
    windowMinutes = applianceWindowMinutes(index, model.kind, model.state);
    if (windowMinutes === null) headline = { kind: 'staysFrozen' };
    else if (elapsed === null) headline = { kind: 'holds', minutes: windowMinutes };
    else if (t < windowMinutes) headline = { kind: 'remaining', minutes: windowMinutes - t };
    else headline = { kind: 'pastWindow', sinceMinutes: t - windowMinutes };
  } catch (e) {
    if (!(e instanceof InvalidThermalInputError)) throw e;
    windowMinutes = null;
    headline = { kind: 'unknown', reason: 'The appliance model has an invalid value.' };
  }

  const items = view.items
    .filter((i) => i.applianceId === applianceId)
    .map((item): ItemAssessment => {
      const check = view.iceChecks[item.id];
      return {
        item,
        verdict: assessFood(index, {
          productId: item.productId,
          compartment: model.kind,
          state: model.state,
          minutesSincePowerLoss: t,
          iceCrystals: check?.answer,
        }),
      };
    });
  const needAttention = items.filter(
    (a) => a.verdict.kind === 'discard' || a.verdict.kind === 'lookRequired',
  ).length;
  return { model, headline, windowMinutes, items, needAttention };
}

export function assessAll(
  view: HouseholdView,
  index: FoodIndex,
  nowMs: number,
): readonly ApplianceAssessment[] {
  return view.appliances
    .map((a) => assessAppliance(view, index, a.id, nowMs))
    .filter((a): a is ApplianceAssessment => a !== undefined);
}

// ---------------------------------------------------------------- hours of safety

export type HoursOfSafety =
  | { readonly kind: 'unknown'; readonly reason: string }
  /** The outdoor temperature never carries the home to the threshold. */
  | { readonly kind: 'notReached'; readonly reason: string; readonly thresholdC: number }
  | {
      readonly kind: 'band';
      /** Minutes remaining from now; 0 once the threshold has been reached. */
      readonly earliestMinutes: number;
      readonly midMinutes: number;
      readonly latestMinutes: number | null;
      readonly isDefaultBand: boolean;
      readonly thresholdC: number;
      readonly modelVersion: string;
    };

const remainingOf = (c: CrossingTime, elapsed: number): number | null =>
  c.kind === 'at' ? Math.max(0, c.minute - elapsed) : null;

/**
 * Hours of safety for the home (HH-06): a band, never a point estimate. The
 * home is modelled as a first-order system from the indoor to the outdoor
 * temperature; the band comes from the archetype's tau range, or the wide
 * default band when the building is unknown.
 */
export function hoursOfSafety(view: HouseholdView, nowMs: number): HoursOfSafety {
  const home = view.home;
  if (!home) {
    return {
      kind: 'unknown',
      reason: 'I do not know your home yet.',
    };
  }
  const elapsed = elapsedMinutes(view, nowMs) ?? 0;
  const result = buildingCrossing(home.archetype, home.indoorC, home.outdoorC, home.thresholdC);
  const mid = remainingOf(result.crossing, elapsed);
  const earliest = remainingOf(result.bandEarliest, elapsed);
  const latest = remainingOf(result.bandLatest, elapsed);
  if (mid === null || earliest === null) {
    return {
      kind: 'notReached',
      reason:
        home.mode === 'cold'
          ? 'At this outdoor temperature the model does not take your home down to the threshold.'
          : 'At this outdoor temperature the model does not take your home up to the threshold.',
      thresholdC: home.thresholdC,
    };
  }
  return {
    kind: 'band',
    earliestMinutes: earliest,
    midMinutes: mid,
    latestMinutes: latest,
    isDefaultBand: result.isDefaultBand,
    thresholdC: home.thresholdC,
    modelVersion: BUILDING_MODEL_VERSION,
  };
}
