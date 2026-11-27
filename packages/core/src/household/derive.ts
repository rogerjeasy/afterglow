import { type WardResult, assessWard } from '../coguard/ward.js';
import { planEnergy } from '../energy/plan.js';
import type { PlanResult } from '../energy/types.js';
import {
  type CompartmentKind,
  type FoodIndex,
  type FoodVerdict,
  applianceWindowMinutes,
  assessFood,
} from '../foodkeeper/index.js';
import {
  type ClockResult,
  type Formulary,
  type ValidatedEntry,
  excursionClock,
  lookupEntry,
  modelledSeries,
} from '../formulary/index.js';
import { MAX_SLOT, type MessageName } from '../heliograph/codes.js';
import {
  type ApplianceClass,
  BUILDING_MODEL_VERSION,
  buildingBand,
  buildingCrossing,
  compartmentFor,
} from '../thermal/archetypes.js';
import { InvalidThermalInputError, applyDoorEvents, temperatureAt } from '../thermal/model.js';
import type { CompartmentState, CrossingTime } from '../thermal/types.js';
import type { Appliance, FoodItem, HouseholdView, MedicineItem, RosterMember } from './view.js';

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
  // FC-03, FC-07: a thermometer-measured time constant is used only when it makes the
  // clock shorter than the class default. A slower measured fridge keeps the default.
  const defaults = compartmentFor(appliance.class, appliance.fullness, appliance.ambientC);
  const measured = appliance.measuredTauMinutes;
  const base =
    measured !== undefined && measured < defaults.state.tauMinutes
      ? compartmentFor(appliance.class, appliance.fullness, appliance.ambientC, measured)
      : defaults;
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

// ---------------------------------------------------------------- graveyard shift

/** The night axis is sampled this often (minutes). */
export const GRAVEYARD_STEP_MINUTES = 30;

export interface GraveyardPoint {
  /** Minutes from now. */
  readonly tMinutes: number;
  /** The likely indoor temperature (the archetype's mid time constant). */
  readonly midC: number;
  /** The home changing fastest (the archetype's smallest time constant). */
  readonly fastC: number;
  /** The home changing slowest (the archetype's largest time constant). */
  readonly slowC: number;
}

export type GraveyardShift =
  | { readonly kind: 'unknown'; readonly reason: string }
  | {
      readonly kind: 'night';
      readonly points: readonly GraveyardPoint[];
      /** The axis runs from now to this many minutes ahead (the plan horizon). */
      readonly spanMinutes: number;
      readonly spanIsDefault: boolean;
      readonly mode: 'cold' | 'heat';
      readonly thresholdC: number;
      readonly outdoorC: number;
      /** Minutes from now to the threshold: the headstone, with its band. Null when never reached. */
      readonly crossing: {
        readonly earliestMinutes: number;
        readonly midMinutes: number;
        readonly latestMinutes: number | null;
      } | null;
      readonly notReachedReason: string | null;
      readonly isDefaultBand: boolean;
      readonly modelVersion: string;
    };

/**
 * The night at a glance (design 7.7, 11.7): the indoor temperature from now to the
 * end of the plan horizon, as a likely curve inside a band, and where it meets the
 * threshold. It is the same model as `hoursOfSafety`, sampled, so the headstone and the
 * hours-of-safety figure cannot disagree. A home I know nothing about is `unknown`;
 * a building with no archetype gets the wide band and says so.
 */
export function graveyardShift(view: HouseholdView, nowMs: number): GraveyardShift {
  const home = view.home;
  if (!home) return { kind: 'unknown', reason: 'I do not know your home yet.' };
  const hours = hoursOfSafety(view, nowMs);
  if (hours.kind === 'unknown') return { kind: 'unknown', reason: hours.reason };

  const elapsed = elapsedMinutes(view, nowMs) ?? 0;
  const band = buildingBand(home.archetype);
  const at = (tauHours: number, t: number): number =>
    temperatureAt(
      { startC: home.indoorC, ambientC: home.outdoorC, tauMinutes: tauHours * 60 },
      elapsed + t,
    );
  const spanMinutes = (view.horizonHours ?? DEFAULT_HORIZON_HOURS) * 60;
  const points: GraveyardPoint[] = [];
  for (let t = 0; t <= spanMinutes; t += GRAVEYARD_STEP_MINUTES) {
    points.push({
      tMinutes: t,
      midC: at(band.midHours, t),
      fastC: at(band.minHours, t),
      slowC: at(band.maxHours, t),
    });
  }
  return {
    kind: 'night',
    points,
    spanMinutes,
    spanIsDefault: view.horizonHours === null,
    mode: home.mode,
    thresholdC: home.thresholdC,
    outdoorC: home.outdoorC,
    crossing:
      hours.kind === 'band'
        ? {
            earliestMinutes: hours.earliestMinutes,
            midMinutes: hours.midMinutes,
            latestMinutes: hours.latestMinutes,
          }
        : null,
    notReachedReason: hours.kind === 'notReached' ? hours.reason : null,
    isDefaultBand: band.isDefault,
    modelVersion: BUILDING_MODEL_VERSION,
  };
}

// ---------------------------------------------------------------- medicines
/** HH-10: a long outage is sampled at a coarser step instead of using more samples. */
export const MEDICINE_MAX_SAMPLES = 2001;

const NO_TABLE: Formulary = { formularyVersion: 'none', entries: [], rejected: [] };

export type MedicineAssessment =
  /** No validated entry: no clock, ask your pharmacist (label-only-medicine rule 2). */
  | {
      readonly kind: 'notInTable';
      readonly medicine: MedicineItem;
      readonly applianceName: string;
      readonly message: string;
    }
  /** Found, but the power is on, so there is nothing to count yet. */
  | {
      readonly kind: 'noOutage';
      readonly medicine: MedicineItem;
      readonly applianceName: string;
      readonly entry: ValidatedEntry;
    }
  | {
      readonly kind: 'clock';
      readonly medicine: MedicineItem;
      readonly applianceName: string;
      readonly entry: ValidatedEntry;
      readonly clock: ClockResult;
    };

/**
 * Assess every medicine at `nowMs` (HH-09, HH-10).
 *
 * `table` is the validated formulary, or null when none is loaded. A medicine
 * gets a clock only through `formulary.excursionClock`, which itself accepts
 * only entries the formulary admitted. The temperature is the modelled
 * temperature of the appliance the medicine is in, from the start of the
 * outage, door openings included.
 */
export function assessMedicines(
  view: HouseholdView,
  table: Formulary | null,
  nowMs: number,
): readonly MedicineAssessment[] {
  const formulary = table ?? NO_TABLE;
  const elapsed = elapsedMinutes(view, nowMs);
  const out: MedicineAssessment[] = [];
  for (const medicine of view.medicines) {
    const model = compartmentModel(view, medicine.applianceId);
    if (!model) continue;
    const applianceName = model.appliance.name;
    const hit = lookupEntry(formulary, medicine.product, medicine.condition);
    if (hit.kind === 'notInTable') {
      out.push({ kind: 'notInTable', medicine, applianceName, message: hit.message });
      continue;
    }
    if (elapsed === null) {
      out.push({ kind: 'noOutage', medicine, applianceName, entry: hit.entry });
      continue;
    }
    const step = Math.max(1, elapsed / (MEDICINE_MAX_SAMPLES - 1));
    const series = modelledSeries(model.state, 0, elapsed, step);
    const clock: ClockResult =
      series.kind === 'ok'
        ? excursionClock(hit.entry, { startMinute: 0, nowMinute: elapsed, samples: series.samples })
        : {
            kind: 'unknown',
            reason: series.reason,
            whatWouldResolveIt: 'Check the appliance type, fullness and room temperature.',
          };
    out.push({ kind: 'clock', medicine, applianceName, entry: hit.entry, clock });
  }
  return out;
}

// ---------------------------------------------------------------- roster
export type RosterState =
  /** Nothing heard, or nothing since the outage began. Shown translucent. */
  'ghost' | 'help' | 'heard';

export interface RosterEntry {
  readonly member: RosterMember;
  readonly state: RosterState;
  /** True only when the latest word is SAFE and is not older than the outage. */
  readonly safe: boolean;
}

const RANK: Record<RosterState, number> = { help: 0, ghost: 1, heard: 2 };

/** The board (HH-12): help first, then ghosts, then everyone heard from. Ties by name then id. */
export function assessRoster(view: HouseholdView): readonly RosterEntry[] {
  const since = view.outageStartedAtMs;
  const entries = view.roster.map((member): RosterEntry => {
    const h = member.heard;
    const current = h !== null && (since === null || h.atMs >= since);
    const state: RosterState = !h || !current ? 'ghost' : h.code === 'HELP' ? 'help' : 'heard';
    return { member, state, safe: current && h !== null && h.code === 'SAFE' };
  });
  return entries.sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] ||
      (a.member.name < b.member.name ? -1 : a.member.name > b.member.name ? 1 : 0) ||
      (a.member.id < b.member.id ? -1 : a.member.id > b.member.id ? 1 : 0),
  );
}

export type Attribution =
  | { readonly kind: 'known'; readonly member: RosterMember; readonly code: MessageName }
  | { readonly kind: 'unknownSlot'; readonly slot: number }
  | { readonly kind: 'ambiguousSlot'; readonly slot: number; readonly count: number };

/** Who a received message is from (HH-13). Never guesses between two people. */
export function attributeMessage(
  view: HouseholdView,
  message: { readonly code: MessageName; readonly slot: number },
): Attribution {
  const matches = view.roster.filter((m) => m.slot === message.slot);
  const [only] = matches;
  if (matches.length === 1 && only) return { kind: 'known', member: only, code: message.code };
  if (matches.length === 0) return { kind: 'unknownSlot', slot: message.slot };
  return { kind: 'ambiguousSlot', slot: message.slot, count: matches.length };
}

/** The lowest slot no member uses, or null when all 64 are taken (HH-13). */
export function freeSlot(view: HouseholdView): number | null {
  const used = new Set(view.roster.map((m) => m.slot));
  for (let slot = 0; slot <= MAX_SLOT; slot++) if (!used.has(slot)) return slot;
  return null;
}

// ---------------------------------------------------------------- energy and the ward
/** HH-15: used when the user has not chosen, and always labelled as a default. */
export const DEFAULT_HORIZON_HOURS = 12;

export interface EnergyAssessment {
  readonly result: PlanResult;
  readonly horizonHours: number;
  readonly horizonIsDefault: boolean;
}

/** The candle plan for the household's stores and loads (HH-14, HH-15). */
export function assessEnergy(view: HouseholdView): EnergyAssessment {
  const horizonHours = view.horizonHours ?? DEFAULT_HORIZON_HOURS;
  return {
    result: planEnergy({ stores: view.energyStores, loads: view.energyLoads, horizonHours }),
    horizonHours,
    horizonIsDefault: view.horizonHours === null,
  };
}

/**
 * The ward for this household at `nowMs` (HH-16). `symptoms` is asked on the
 * screen and never stored.
 */
export function assessWardOf(view: HouseholdView, nowMs: number, symptoms = false): WardResult {
  return assessWard(view.wardAnswers, nowMs, symptoms);
}
