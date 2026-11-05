import type {
  Classification,
  FoodIndex,
  FoodKeeperProduct,
  FoodKeeperSnapshot,
  IndexedProduct,
  OutageRule,
  OutageRules,
} from './types.js';

/** Thrown when the rules or snapshot are malformed. Configuration errors fail loudly, never silently. */
export class InvalidFoodRulesError extends Error {
  constructor(reason: string) {
    super(`Invalid FoodKeeper rules: ${reason}`);
    this.name = 'InvalidFoodRulesError';
  }
}

/** "Name (subtitle)" as shown to people and matched by the rules. */
export function displayNameOf(product: FoodKeeperProduct): string {
  return product.subtitle ? `${product.name} (${product.subtitle})` : product.name;
}

/** Lower-case, strip diacritics and punctuation, fold simple plurals. */
export function normaliseText(text: string): string {
  return tokenise(text).join(' ');
}

function foldPlural(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokenise(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0)
    .map(foldPlural);
}

interface CompiledRule {
  readonly rule: OutageRule;
  readonly names: readonly RegExp[] | null;
  readonly excludes: readonly RegExp[];
}

const OUTAGE_CLASSES: ReadonlySet<string> = new Set([
  'discardAfterFourHours',
  'discardIfWarmEightHours',
  'safeNoRefrigeration',
  'safeHighAcid',
]);

const compileCache = new WeakMap<OutageRules, readonly CompiledRule[]>();

function compilePattern(rule: OutageRule, pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    throw new InvalidFoodRulesError(`rule "${rule.id}" has an invalid pattern: ${pattern}`);
  }
}

/** Validate the rules and compile their patterns once. */
function compile(rules: OutageRules): readonly CompiledRule[] {
  const cached = compileCache.get(rules);
  if (cached) return cached;

  if (rules.fallback.class !== 'discardAfterFourHours') {
    throw new InvalidFoodRulesError('the fallback must be the conservative perishable class');
  }
  const t = rules.thresholds;
  for (const [name, value] of Object.entries(t)) {
    if (!Number.isFinite(value)) throw new InvalidFoodRulesError(`threshold ${name} is not finite`);
  }
  if (!(t.refrigeratorHoldMinutes > 0) || !(t.warmHeldMinutes > 0)) {
    throw new InvalidFoodRulesError('hold durations must be positive');
  }
  const seen = new Set<string>();
  const compiled = rules.rules.map((rule): CompiledRule => {
    if (seen.has(rule.id)) throw new InvalidFoodRulesError(`duplicate rule id "${rule.id}"`);
    seen.add(rule.id);
    if (!OUTAGE_CLASSES.has(rule.class)) {
      throw new InvalidFoodRulesError(`rule "${rule.id}" has unknown class "${rule.class}"`);
    }
    if (!rule.usdaItem) throw new InvalidFoodRulesError(`rule "${rule.id}" cites no USDA item`);
    const hasCategory = (rule.match.categoryIds?.length ?? 0) > 0;
    const hasName = (rule.match.namePatterns?.length ?? 0) > 0;
    if (!hasCategory && !hasName) {
      throw new InvalidFoodRulesError(`rule "${rule.id}" matches everything`);
    }
    return {
      rule,
      names: hasName ? (rule.match.namePatterns ?? []).map((p) => compilePattern(rule, p)) : null,
      excludes: (rule.match.excludeNamePatterns ?? []).map((p) => compilePattern(rule, p)),
    };
  });
  compileCache.set(rules, compiled);
  return compiled;
}

function matches(c: CompiledRule, product: FoodKeeperProduct, displayName: string): boolean {
  const { categoryIds } = c.rule.match;
  if (categoryIds && categoryIds.length > 0 && !categoryIds.includes(product.categoryId)) {
    return false;
  }
  if (c.names && !c.names.some((re) => re.test(displayName))) return false;
  if (c.excludes.some((re) => re.test(displayName))) return false;
  return true;
}

/**
 * Classify one product (FK-01, FK-02). First matching rule wins. When no rule
 * matches the conservative fallback applies and `listed` is false.
 */
export function classifyProduct(product: FoodKeeperProduct, rules: OutageRules): Classification {
  const displayName = displayNameOf(product);
  for (const c of compile(rules)) {
    if (matches(c, product, displayName)) {
      return {
        class: c.rule.class,
        ruleId: c.rule.id,
        listed: true,
        usdaItem: c.rule.usdaItem,
        alsoSafeInFreezer: c.rule.alsoSafeInFreezer === true,
        caveat: c.rule.caveat ?? null,
      };
    }
  }
  return {
    class: rules.fallback.class,
    ruleId: rules.fallback.ruleId,
    listed: false,
    usdaItem: rules.fallback.usdaItem,
    alsoSafeInFreezer: false,
    caveat: null,
  };
}

/** Build the searchable, classified index from a snapshot and rules. */
export function buildFoodIndex(snapshot: FoodKeeperSnapshot, rules: OutageRules): FoodIndex {
  const ids = new Set<number>();
  const products: IndexedProduct[] = snapshot.products.map((product) => {
    if (ids.has(product.id)) {
      throw new InvalidFoodRulesError(`duplicate product id ${product.id}`);
    }
    ids.add(product.id);
    const displayName = displayNameOf(product);
    return {
      product,
      displayName,
      classification: classifyProduct(product, rules),
      nameTokens: tokenise(displayName),
      keywordTokens: tokenise(product.keywords),
      searchName: normaliseText(displayName),
    };
  });
  return { snapshotVersion: snapshot.snapshotVersion, rules, products };
}
