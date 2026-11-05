/**
 * FoodKeeper types. Pure data shapes; the snapshot and rules are injected, so
 * the core does no I/O (structure.md). Times are minutes since power loss.
 */

/** One product from the USDA FoodKeeper list (compact snapshot). */
export interface FoodKeeperProduct {
  readonly id: number;
  readonly name: string;
  readonly subtitle: string | null;
  readonly categoryId: number;
  readonly category: string;
  readonly subcategory: string | null;
  readonly keywords: string;
}

export interface FoodKeeperSnapshot {
  readonly snapshotVersion: string;
  readonly products: readonly FoodKeeperProduct[];
}

/** How a product behaves in a power outage (USDA FSIS outage guidance). */
export type OutageClass =
  | 'discardAfterFourHours'
  | 'discardIfWarmEightHours'
  | 'safeNoRefrigeration'
  | 'safeHighAcid';

export interface RuleMatch {
  readonly categoryIds?: readonly number[];
  /** Case-insensitive regular expressions tested against the display name. */
  readonly namePatterns?: readonly string[];
  readonly excludeNamePatterns?: readonly string[];
}

export interface OutageRule {
  readonly id: string;
  readonly class: OutageClass;
  /** The USDA list item this rule encodes, shown to the user as the citation. */
  readonly usdaItem: string;
  readonly caveat?: string;
  /** True when the USDA list also names this as not needing the freezer. */
  readonly alsoSafeInFreezer?: boolean;
  readonly match: RuleMatch;
}

export interface OutageSource {
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
}

export interface OutageThresholds {
  /** 40 F expressed in Celsius. */
  readonly refrigeratedDangerC: number;
  /** USDA: a closed refrigerator keeps food safe for up to this long. */
  readonly refrigeratorHoldMinutes: number;
  /** 50 F expressed in Celsius (opened mayonnaise and similar). */
  readonly warmHeldDangerC: number;
  /** USDA: discard if held above the warm threshold longer than this. */
  readonly warmHeldMinutes: number;
  /** Ice-crystal rule: frozen food that has reached this temperature must be looked at. */
  readonly frozenIceDangerC: number;
}

export interface OutageRules {
  readonly rulesVersion: string;
  readonly source: OutageSource;
  readonly thresholds: OutageThresholds;
  readonly fallback: {
    readonly class: 'discardAfterFourHours';
    readonly ruleId: string;
    readonly usdaItem: string;
  };
  readonly rules: readonly OutageRule[];
}

export interface Classification {
  readonly class: OutageClass;
  readonly ruleId: string;
  /** False when no explicit rule matched and the conservative fallback applied. */
  readonly listed: boolean;
  readonly usdaItem: string;
  readonly alsoSafeInFreezer: boolean;
  readonly caveat: string | null;
}

export interface IndexedProduct {
  readonly product: FoodKeeperProduct;
  /** "Name (subtitle)" as shown to people. */
  readonly displayName: string;
  readonly classification: Classification;
  /** Lower-cased, punctuation-free search tokens from name, subtitle and keywords. */
  readonly nameTokens: readonly string[];
  readonly keywordTokens: readonly string[];
  readonly searchName: string;
}

export interface FoodIndex {
  readonly snapshotVersion: string;
  readonly rules: OutageRules;
  readonly products: readonly IndexedProduct[];
}

export type CompartmentKind = 'refrigerated' | 'frozen';

/** The user's answer to "do ice crystals remain?" (frozen compartments only). */
export type IceCrystals = 'present' | 'absent';

export interface Citation {
  readonly source: string;
  readonly url: string;
  readonly ruleId: string;
  readonly usdaItem: string;
}

export interface VerdictProvenance {
  readonly rulesVersion: string;
  readonly snapshotVersion: string;
  readonly thermalModelVersion: string;
}

interface VerdictBase {
  readonly productId: number;
  readonly displayName: string;
  readonly listed: boolean;
  readonly citation: Citation;
  readonly provenance: VerdictProvenance;
}

export type FoodVerdict =
  | (VerdictBase & {
      readonly kind: 'ok';
      /** Minute after which the food is no longer covered; absent when the model expects no limit to be reached. */
      readonly windowEndsAtMinute: number | null;
      readonly notes: readonly string[];
    })
  | (VerdictBase & {
      readonly kind: 'lookRequired';
      readonly question: string;
      readonly notes: readonly string[];
    })
  | (VerdictBase & {
      readonly kind: 'discard';
      /** The minute the discard condition was first met. */
      readonly sinceMinute: number;
      readonly reason: string;
      readonly notes: readonly string[];
    })
  | {
      readonly kind: 'unknown';
      readonly reason: string;
      readonly whatWouldResolveIt: string;
      readonly provenance: VerdictProvenance;
    };
