import { crossingTime } from './model.js';
import type { BuildingCrossing, CompartmentState, CrossingTime } from './types.js';

/**
 * Thermal constants embedded in the pure core.
 *
 * The canonical, human-facing snapshots with full provenance live in
 * `data/thermal/appliance-tau.json` and `data/thermal/building-archetypes.json`.
 * The same values are mirrored here so `packages/core` imports nothing outside
 * itself (architecture: the core is self-contained). Keep the two in sync; the
 * values are anchored to USDA power-outage guidance (appliances) and published
 * passive-survivability figures (buildings). See the data files for sources.
 */

export const APPLIANCE_MODEL_VERSION = 'thermal-appliance-v1';
export const BUILDING_MODEL_VERSION = 'thermal-building-v1';

export type Fullness = 'full' | 'half';

interface ApplianceTau {
  readonly full: number;
  readonly half: number;
  readonly dangerC: number;
  readonly startC: number;
}

/** Appliance tau (minutes), anchored to USDA 4 h fridge / 48 h full / 24 h half-full freezer. */
const APPLIANCE_CLASSES = {
  fridge: { full: 2163, half: 1700, dangerC: 5, startC: 3 },
  fridgeFreezerCombo: { full: 2400, half: 1900, dangerC: 5, startC: 3 },
  freezer: { full: 4815, half: 2408, dangerC: 0, startC: -18 },
  chestFreezer: { full: 6000, half: 3000, dangerC: 0, startC: -18 },
  coolerBox: { full: 900, half: 600, dangerC: 5, startC: 3 },
  pharmacyFridge: { full: 2000, half: 1600, dangerC: 8, startC: 5 },
  vaccineColdBox: { full: 2880, half: 2000, dangerC: 8, startC: 4 },
} as const satisfies Record<string, ApplianceTau>;

export type ApplianceClass = keyof typeof APPLIANCE_CLASSES;

/** Look up the default appliance thermal constants (TH-07). */
export function applianceDefaults(cls: ApplianceClass): ApplianceTau {
  return APPLIANCE_CLASSES[cls];
}

/**
 * Build a compartment state from an appliance class and fullness, using the
 * default tau unless the household supplied a measured tau (TH-07).
 */
export function compartmentFor(
  cls: ApplianceClass,
  fullness: Fullness,
  ambientC: number,
  measuredTauMinutes?: number,
): { state: CompartmentState; dangerC: number; usedMeasured: boolean } {
  const d = applianceDefaults(cls);
  const tau = measuredTauMinutes ?? (fullness === 'full' ? d.full : d.half);
  return {
    state: { startC: d.startC, ambientC, tauMinutes: tau },
    dangerC: d.dangerC,
    usedMeasured: measuredTauMinutes !== undefined,
  };
}

export interface ArchetypeQuery {
  readonly type: string;
  readonly vintage: string;
  readonly insulation: string;
  readonly climate: string;
}

interface Archetype {
  readonly type: string;
  readonly vintage: string;
  readonly insulation: string;
  readonly climate: string;
  readonly tauHours: number;
  readonly tauMinHours: number;
  readonly tauMaxHours: number;
}

/** Building archetype tau (hours), anchored to passive-survivability literature. */
const ARCHETYPES: readonly Archetype[] = [
  { type: 'apartment', vintage: 'pre1980', insulation: 'poor', climate: 'cold', tauHours: 24, tauMinHours: 16, tauMaxHours: 36 },
  { type: 'apartment', vintage: 'post2000', insulation: 'good', climate: 'cold', tauHours: 60, tauMinHours: 45, tauMaxHours: 80 },
  { type: 'detachedHouse', vintage: 'pre1980', insulation: 'poor', climate: 'cold', tauHours: 18, tauMinHours: 12, tauMaxHours: 28 },
  { type: 'detachedHouse', vintage: 'post2000', insulation: 'good', climate: 'cold', tauHours: 90, tauMinHours: 70, tauMaxHours: 120 },
  { type: 'detachedHouse', vintage: 'post2010', insulation: 'passive', climate: 'cold', tauHours: 180, tauMinHours: 140, tauMaxHours: 220 },
  { type: 'townhouse', vintage: '1980to2000', insulation: 'medium', climate: 'temperate', tauHours: 48, tauMinHours: 32, tauMaxHours: 64 },
  { type: 'informalDwelling', vintage: 'any', insulation: 'poor', climate: 'hot', tauHours: 6, tauMinHours: 3, tauMaxHours: 12 },
];

const DEFAULT_BAND = { tauMinHours: 12, tauMaxHours: 48 } as const;

/** Find the best-matching building archetype, or null if none matches. */
export function findArchetype(q: ArchetypeQuery): Archetype | null {
  return (
    ARCHETYPES.find(
      (a) =>
        a.type === q.type &&
        (a.vintage === q.vintage || a.vintage === 'any') &&
        a.insulation === q.insulation &&
        (a.climate === q.climate || a.climate === 'any'),
    ) ?? null
  );
}

/**
 * Building crossing time with an uncertainty band from the archetype tau range
 * (TH-05). When no archetype matches, use the wide default band and flag it.
 */
export function buildingCrossing(
  query: ArchetypeQuery | null,
  startC: number,
  ambientC: number,
  thresholdC: number,
): BuildingCrossing {
  const archetype = query ? findArchetype(query) : null;
  const band = archetype
    ? {
        min: archetype.tauMinHours,
        mid: archetype.tauHours,
        max: archetype.tauMaxHours,
        isDefault: false,
      }
    : {
        min: DEFAULT_BAND.tauMinHours,
        mid: (DEFAULT_BAND.tauMinHours + DEFAULT_BAND.tauMaxHours) / 2,
        max: DEFAULT_BAND.tauMaxHours,
        isDefault: true,
      };

  const at = (tauHours: number): CrossingTime =>
    crossingTime({ startC, ambientC, tauMinutes: tauHours * 60 }, thresholdC);

  // Larger tau = slower change, so the LATEST crossing uses tauMax, EARLIEST tauMin.
  return {
    crossing: at(band.mid),
    bandEarliest: at(band.min),
    bandLatest: at(band.max),
    isDefaultBand: band.isDefault,
  };
}
