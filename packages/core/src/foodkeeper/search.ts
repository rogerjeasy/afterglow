import { normaliseText, tokenise } from './classify.js';
import type { FoodIndex, IndexedProduct } from './types.js';

export const DEFAULT_SEARCH_LIMIT = 10;

function allTokensPrefixMatch(queryTokens: readonly string[], pool: readonly string[]): boolean {
  return queryTokens.every((q) => pool.some((t) => t.startsWith(q)));
}

function score(p: IndexedProduct, query: string, queryTokens: readonly string[]): number {
  if (p.searchName === query) return 100;
  if (p.searchName.startsWith(query)) return 85;
  if (allTokensPrefixMatch(queryTokens, p.nameTokens)) return 70;
  if (allTokensPrefixMatch(queryTokens, [...p.nameTokens, ...p.keywordTokens])) return 40;
  return 0;
}

/**
 * Deterministic product search (FK-07). Ranked by match quality, ties broken by
 * display name then id. An empty or whitespace query returns nothing; it never
 * lists the whole table as if everything matched.
 */
export function searchFood(
  index: FoodIndex,
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): readonly IndexedProduct[] {
  const queryTokens = tokenise(query);
  if (queryTokens.length === 0) return [];
  const normalised = normaliseText(query);
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DEFAULT_SEARCH_LIMIT;

  return index.products
    .map((p) => ({ p, s: score(p, normalised, queryTokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => {
      if (a.s !== b.s) return b.s - a.s;
      if (a.p.displayName !== b.p.displayName) return a.p.displayName < b.p.displayName ? -1 : 1;
      return a.p.product.id - b.p.product.id;
    })
    .slice(0, cap)
    .map((x) => x.p);
}

/** Look a product up by id. */
export function findProduct(index: FoodIndex, id: number): IndexedProduct | undefined {
  return index.products.find((p) => p.product.id === id);
}
