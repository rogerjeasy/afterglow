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

export const APPLIANCE_MODEL_VERSION = 'thermal-appliance-v2';
export const BUILDING_MODEL_VERSION = 'thermal-building-v1';

export type Fullness = 'full' | 'half';

interface ApplianceTau {
  readonly full: number;
  readonly half: number;
  readonly dangerC: number;
  readonly startC: number;
}

/**
 * Appliance tau (minutes), anchored to USDA 4 h fridge / 48 h full / 24 h half-full freezer.
 * Refrigerated danger is 40 F = 4.4 C (USDA), not 5 C.
 */
const APPLIANCE_CLASSES = {
  fridge: { full: 3136, half: 2464, dangerC: 4.4, startC: 3 },
  fridgeFreezerCombo: { full: 3479, half: 2754, dangerC: 4.4, startC: 3 },
  freezer: { full: 4815, half: 2408, dangerC: 0, startC: -18 },
  chestFreezer: { full: 6000, half: 3000, dangerC: 0, startC: -18 },
  coolerBox: { full: 900, half: 600, dangerC: 4.4, startC: 3 },
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
  {
    type: 'apartment',
    vintage: 'pre1980',
    insulation: 'poor',
    climate: 'cold',
    tauHours: 24,
    tauMinHours: 16,
    tauMaxHours: 36,
  },
  {
    type: 'apartment',
    vintage: 'post2000',
    insulation: 'good',
    climate: 'cold',
    tauHours: 60,
    tauMinHours: 45,
    tauMaxHours: 80,
  },
  {
    type: 'detachedHouse',
    vintage: 'pre1980',
    insulation: 'poor',
    climate: 'cold',
    tauHours: 18,
    tauMinHours: 12,
    tauMaxHours: 28,
  },
  {
    type: 'detachedHouse',
    vintage: 'post2000',
    insulation: 'good',
    climate: 'cold',
    tauHours: 90,
    tauMinHours: 70,
    tauMaxHours: 120,
  },
  {
    type: 'detachedHouse',
    vintage: 'post2010',
    insulation: 'passive',
    climate: 'cold',
    tauHours: 180,
    tauMinHours: 140,
    tauMaxHours: 220,
  },
  {
    type: 'townhouse',
    vintage: '1980to2000',
    insulation: 'medium',
    climate: 'temperate',
    tauHours: 48,
    tauMinHours: 32,
    tauMaxHours: 64,
  },
  {
    type: 'informalDwelling',
    vintage: 'any',
    insulation: 'poor',
    climate: 'hot',
    tauHours: 6,
    tauMinHours: 3,
    tauMaxHours: 12,
  },
];

const DEFAULT_BAND = { tauMinHours: 12, tauMaxHours: 48 } as const;

/** The archetypes the table knows, so a UI can offer only combinations that have data. */
export function listArchetypes(): readonly (ArchetypeQuery & { readonly tauHours: number })[] {
  return ARCHETYPES.map((a) => ({
    type: a.type,
    vintage: a.vintage,
    insulation: a.insulation,
    climate: a.climate,
    tauHours: a.tauHours,
  }));
}

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

/** The time-constant range for a building, in hours, and whether it is the wide default (TH-05). */
export interface BuildingBand {
  readonly minHours: number;
  readonly midHours: number;
  readonly maxHours: number;
  readonly isDefault: boolean;
}

/**
 * The tau band for a building: the archetype's range, or the wide default band
 * when the archetype is unknown (never a point estimate).
 */
export function buildingBand(query: ArchetypeQuery | null): BuildingBand {
  const archetype = query ? findArchetype(query) : null;
  return archetype
    ? {
        minHours: archetype.tauMinHours,
        midHours: archetype.tauHours,
        maxHours: archetype.tauMaxHours,
        isDefault: false,
      }
    : {
        minHours: DEFAULT_BAND.tauMinHours,
        midHours: (DEFAULT_BAND.tauMinHours + DEFAULT_BAND.tauMaxHours) / 2,
        maxHours: DEFAULT_BAND.tauMaxHours,
        isDefault: true,
      };
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
  const band = buildingBand(query);
  const at = (tauHours: number): CrossingTime =>
    crossingTime({ startC, ambientC, tauMinutes: tauHours * 60 }, thresholdC);

  // Larger tau = slower change, so the LATEST crossing uses tauMax, EARLIEST tauMin.
  return {
    crossing: at(band.midHours),
    bandEarliest: at(band.minHours),
    bandLatest: at(band.maxHours),
    isDefaultBand: band.isDefault,
  };
}
