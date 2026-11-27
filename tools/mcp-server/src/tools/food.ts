import { foodkeeper, household, thermal } from '@afterglow/core';
import rulesJson from '../../../../data/foodkeeper/outage-rules.json' with { type: 'json' };
import snapshotJson from '../../../../data/foodkeeper/snapshot.json' with { type: 'json' };

/**
 * food_verdict (MCP-07). Searches the vendored USDA FoodKeeper snapshot with
 * the core's deterministic search and returns the core's verdict unchanged.
 * A food the search cannot find gets the core's own `unknown` verdict; a food
 * USDA does not name in its outage lists comes back as the core's perishable
 * clock with `listed: false`.
 */

let cached: foodkeeper.FoodIndex | null = null;

/** Built once; `buildFoodIndex` throws on malformed data, so bad data fails loudly. */
export function foodIndex(): foodkeeper.FoodIndex {
  cached ??= foodkeeper.buildFoodIndex(
    snapshotJson as unknown as foodkeeper.FoodKeeperSnapshot,
    rulesJson as unknown as foodkeeper.OutageRules,
  );
  return cached;
}

export type Appliance = 'refrigerator' | 'freezer';

export interface FoodQuery {
  readonly food: string;
  readonly appliance: Appliance;
  readonly minutesWithoutPower: number;
  readonly roomTemperatureC?: number | undefined;
  readonly fullness?: thermal.Fullness | undefined;
  readonly iceCrystals?: foodkeeper.IceCrystals | undefined;
}

export interface FoodAnswer {
  readonly query: string;
  readonly matchedFood: string | null;
  readonly otherMatches: readonly string[];
  /** True when several foods match: the first in the core's ranking is used; ask again more precisely. */
  readonly ambiguous: boolean;
  readonly verdict: foodkeeper.FoodVerdict;
  readonly assumptions: readonly string[];
}

/** An id no FoodKeeper product has, so the core itself answers "not in the list". */
const NOT_A_PRODUCT = -1;

export function foodVerdict(q: FoodQuery): FoodAnswer {
  const index = foodIndex();
  const matches = foodkeeper.searchFood(index, q.food, 5);
  const top = matches[0];
  const ambientC = q.roomTemperatureC ?? household.DEFAULT_AMBIENT_C;
  const fullness = q.fullness ?? 'half';
  const cls: thermal.ApplianceClass = q.appliance === 'freezer' ? 'freezer' : 'fridge';
  const compartment: foodkeeper.CompartmentKind =
    q.appliance === 'freezer' ? 'frozen' : 'refrigerated';
  const { state } = thermal.compartmentFor(cls, fullness, ambientC);

  const assumptions = [
    ...(q.roomTemperatureC === undefined
      ? [
          `Room temperature not given: the core default of ${household.DEFAULT_AMBIENT_C} C is used.`,
        ]
      : []),
    ...(q.fullness === undefined
      ? ['Fullness not given: "half" is used, which warms faster than "full".']
      : []),
    'The door is assumed closed since the power went out.',
  ];

  const verdict = foodkeeper.assessFood(index, {
    productId: top ? top.product.id : NOT_A_PRODUCT,
    compartment,
    state,
    minutesSincePowerLoss: q.minutesWithoutPower,
    iceCrystals: q.iceCrystals,
  });
  return {
    query: q.food,
    matchedFood: top ? top.displayName : null,
    otherMatches: matches.slice(1).map((m) => m.displayName),
    ambiguous: matches.length > 1,
    verdict,
    assumptions,
  };
}
