import { foodkeeper } from '@afterglow/core';
import rulesJson from '../../../../data/foodkeeper/outage-rules.json';
import snapshotJson from '../../../../data/foodkeeper/snapshot.json';

/**
 * The vendored USDA FoodKeeper snapshot and the outage rules, built into the
 * pure core's index once. The JSON is cast at this boundary only;
 * `buildFoodIndex` validates rule classes, patterns and thresholds and throws
 * on anything malformed, so a bad data file fails loudly at start-up rather
 * than silently misclassifying food.
 */
export const foodIndex: foodkeeper.FoodIndex = foodkeeper.buildFoodIndex(
  snapshotJson as unknown as foodkeeper.FoodKeeperSnapshot,
  rulesJson as unknown as foodkeeper.OutageRules,
);

/** Where the snapshot came from, for the source chips and the trust centre. */
export const foodSourceNote = `USDA FoodKeeper ${foodIndex.snapshotVersion} · ${foodIndex.rules.source.publisher}`;
