import { APPLIANCE_MODEL_VERSION } from '../thermal/archetypes.js';
import { InvalidThermalInputError, crossingTime, temperatureAt } from '../thermal/model.js';
import type { CompartmentState } from '../thermal/types.js';
import { findProduct } from './search.js';
import type {
  Citation,
  CompartmentKind,
  FoodIndex,
  FoodVerdict,
  IceCrystals,
  IndexedProduct,
  VerdictProvenance,
} from './types.js';

/** FK-10: attached to every verdict that is not a discard. */
export const SENSORY_CAVEAT =
  'Never taste food to test it. If it has an unusual odour, colour or texture, throw it out.';

export interface AssessInput {
  readonly productId: number;
  readonly compartment: CompartmentKind;
  /** Thermal state at the moment power was lost, with any door events already applied. */
  readonly state: CompartmentState;
  /** Minutes since power was lost. */
  readonly minutesSincePowerLoss: number;
  /** The user's answer to the ice-crystals question, if they have looked. */
  readonly iceCrystals?: IceCrystals | undefined;
}

function provenanceOf(index: FoodIndex): VerdictProvenance {
  return {
    rulesVersion: index.rules.rulesVersion,
    snapshotVersion: index.snapshotVersion,
    thermalModelVersion: APPLIANCE_MODEL_VERSION,
  };
}

function unknown(index: FoodIndex, reason: string, resolve: string): FoodVerdict {
  return {
    kind: 'unknown',
    reason,
    whatWouldResolveIt: resolve,
    provenance: provenanceOf(index),
  };
}

/**
 * Minutes until the compartment first reaches `thresholdC` **from below**
 * (the danger direction), or null when it never does.
 *
 * `thermal.crossingTime` answers "when is the threshold passed in the direction
 * of travel", so a fridge that is cooling toward a cold room counts a warmer
 * threshold as already crossed at minute 0. A food clock needs the upward
 * meaning: a cooling fridge is not heading for the danger temperature.
 * (Found by property FK-05; see docs/kiro/pbt-catches.md.)
 */
export function minutesUntilAtLeast(state: CompartmentState, thresholdC: number): number | null {
  temperatureAt(state, 0); // validates the state; throws InvalidThermalInputError
  if (state.startC >= thresholdC) return 0;
  if (state.ambientC <= thresholdC) return null;
  const c = crossingTime(state, thresholdC);
  return c.kind === 'at' ? c.minute : null;
}

/**
 * The minute (since power loss) at which a compartment stops covering its food:
 * refrigerated is `min(USDA 4 h, modelled 40 F crossing)`; frozen is the modelled
 * time to reach 0 C, or null when the model expects it to stay frozen.
 */
export function applianceWindowMinutes(
  index: FoodIndex,
  compartment: CompartmentKind,
  state: CompartmentState,
): number | null {
  const th = index.rules.thresholds;
  if (compartment === 'frozen') return minutesUntilAtLeast(state, th.frozenIceDangerC);
  const modelled = minutesUntilAtLeast(state, th.refrigeratedDangerC);
  return modelled === null
    ? th.refrigeratorHoldMinutes
    : Math.min(th.refrigeratorHoldMinutes, modelled);
}

/**
 * Assess one food in one compartment (FK-03..FK-10).
 *
 * Fail closed: an unknown product, an invalid time or state, or an unlisted
 * product yields `unknown` or the conservative perishable clock, never a
 * confident "safe".
 */
export function assessFood(index: FoodIndex, input: AssessInput): FoodVerdict {
  const t = input.minutesSincePowerLoss;
  if (!Number.isFinite(t) || t < 0) {
    return unknown(
      index,
      'The time since power was lost is not a valid number.',
      'Enter when the power went out.',
    );
  }
  const item = findProduct(index, input.productId);
  if (!item) {
    return unknown(
      index,
      'This food is not in the USDA FoodKeeper list.',
      'Pick a food from the list, or ask the USDA Meat and Poultry Hotline.',
    );
  }

  try {
    return assessKnown(index, item, input, t);
  } catch (e) {
    if (e instanceof InvalidThermalInputError) {
      return unknown(
        index,
        'The appliance model has an invalid value.',
        'Check the appliance type, fullness and room temperature.',
      );
    }
    throw e;
  }
}

function assessKnown(
  index: FoodIndex,
  item: IndexedProduct,
  input: AssessInput,
  t: number,
): FoodVerdict {
  const { rules } = index;
  const th = rules.thresholds;
  const c = item.classification;
  const citation: Citation = {
    source: `${rules.source.publisher}: ${rules.source.title}`,
    url: rules.source.url,
    ruleId: c.ruleId,
    usdaItem: c.usdaItem,
  };
  const base = {
    productId: item.product.id,
    displayName: item.displayName,
    listed: c.listed,
    citation,
    provenance: provenanceOf(index),
  };
  const unlistedNote = c.listed
    ? []
    : ["This food is not named in USDA's outage lists, so it is treated like a perishable."];
  const caveatNote = c.caveat ? [c.caveat] : [];
  const isSafeClass = c.class === 'safeNoRefrigeration' || c.class === 'safeHighAcid';

  // ---- Foods that do not need refrigeration (USDA allowlist) ----
  if (input.compartment === 'refrigerated' && isSafeClass) {
    const notes = [
      ...caveatNote,
      ...(c.class === 'safeHighAcid' ? ['High-acid foods are safe but may spoil sooner.'] : []),
      SENSORY_CAVEAT,
    ];
    return { ...base, kind: 'ok', windowEndsAtMinute: null, notes };
  }
  if (input.compartment === 'frozen' && c.class === 'safeNoRefrigeration' && c.alsoSafeInFreezer) {
    return {
      ...base,
      kind: 'ok',
      windowEndsAtMinute: null,
      notes: [...caveatNote, 'This food does not need to stay frozen.', SENSORY_CAVEAT],
    };
  }

  // ---- Refrigerated perishables ----
  if (input.compartment === 'refrigerated') {
    if (c.class === 'discardIfWarmEightHours') {
      const cross = minutesUntilAtLeast(input.state, th.warmHeldDangerC);
      if (cross === null) {
        return {
          ...base,
          kind: 'ok',
          windowEndsAtMinute: null,
          notes: [
            ...caveatNote,
            'The model does not expect this to reach 50 F (10 C).',
            SENSORY_CAVEAT,
          ],
        };
      }
      const limit = cross + th.warmHeldMinutes;
      return t < limit
        ? {
            ...base,
            kind: 'ok',
            windowEndsAtMinute: limit,
            notes: [...caveatNote, SENSORY_CAVEAT],
          }
        : {
            ...base,
            kind: 'discard',
            sinceMinute: limit,
            reason: 'Held above 50 F (10 C) for more than 8 hours.',
            notes: caveatNote,
          };
    }

    // discardAfterFourHours, including the unlisted fallback.
    const modelled = minutesUntilAtLeast(input.state, th.refrigeratedDangerC);
    // The USDA cap is the ceiling; a faster-warming fridge can only shorten it.
    const limit =
      modelled === null
        ? th.refrigeratorHoldMinutes
        : Math.min(th.refrigeratorHoldMinutes, modelled);
    return t < limit
      ? {
          ...base,
          kind: 'ok',
          windowEndsAtMinute: limit,
          notes: [...unlistedNote, 'USDA assumes the door stays closed.', SENSORY_CAVEAT],
        }
      : {
          ...base,
          kind: 'discard',
          sinceMinute: limit,
          reason:
            limit < th.refrigeratorHoldMinutes
              ? 'The fridge passed 40 F (4.4 C) and the food is past its safe window.'
              : 'More than 4 hours without power.',
          notes: unlistedNote,
        };
  }

  // ---- Frozen perishables (ice-crystals rule) ----
  const iceAt = minutesUntilAtLeast(input.state, th.frozenIceDangerC);
  const fortyAt = minutesUntilAtLeast(input.state, th.refrigeratedDangerC);

  if (iceAt === null || t < iceAt) {
    return {
      ...base,
      kind: 'ok',
      windowEndsAtMinute: iceAt,
      notes: [...unlistedNote, 'The model expects it to still be frozen.', SENSORY_CAVEAT],
    };
  }
  if (input.iceCrystals === 'present') {
    return {
      ...base,
      kind: 'ok',
      windowEndsAtMinute: null,
      notes: [
        ...unlistedNote,
        'It still contains ice crystals, so it can be refrozen or used. Quality may suffer.',
        'This answer holds for when you looked. Look again if time passes.',
        SENSORY_CAVEAT,
      ],
    };
  }
  if (input.iceCrystals === 'absent') {
    if (fortyAt !== null && t >= fortyAt) {
      return {
        ...base,
        kind: 'discard',
        sinceMinute: fortyAt,
        reason: 'No ice crystals remain and the freezer has passed 40 F (4.4 C).',
        notes: unlistedNote,
      };
    }
    return {
      ...base,
      kind: 'ok',
      windowEndsAtMinute: fortyAt,
      notes: [
        ...unlistedNote,
        'No ice crystals, but the model says it has stayed at or below 40 F (4.4 C).',
        SENSORY_CAVEAT,
      ],
    };
  }
  return {
    ...base,
    kind: 'lookRequired',
    question: 'Look at the food. Do ice crystals remain?',
    notes: [
      ...unlistedNote,
      'Safe if ice crystals remain, or if it has stayed at or below 40 F (4.4 C).',
      SENSORY_CAVEAT,
    ],
  };
}
