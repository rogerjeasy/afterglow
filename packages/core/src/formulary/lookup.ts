import { isValidatedEntry } from './admit.js';
import { normaliseProduct } from './entry.js';
import type { Condition, Formulary, LookupResult, ValidatedEntry } from './types.js';

export const DEFAULT_SEARCH_LIMIT = 10;

export const NOT_IN_TABLE_MESSAGE =
  'This medicine is not in the pharmacist-approved table, so there is no clock. I will not estimate. Ask your pharmacist.';

function admittedEntries(f: unknown): readonly ValidatedEntry[] {
  const entries = (f as { entries?: unknown } | null | undefined)?.entries;
  return Array.isArray(entries) ? (entries as unknown[]).filter(isValidatedEntry) : [];
}

const notInTable = (): LookupResult => ({
  kind: 'notInTable',
  message: NOT_IN_TABLE_MESSAGE,
  canSubmitLabelForReview: true,
});

/**
 * Exact lookup (FM-02): normalised product name and condition, nothing else.
 * No prefix, substring, similarity or class matching. A formulary whose
 * entries were not produced by `buildFormulary` finds nothing (FM-03).
 */
export function lookupEntry(f: Formulary, product: string, condition: Condition): LookupResult {
  if (typeof product !== 'string') return notInTable();
  if (condition !== 'unopened' && condition !== 'inUse') return notInTable();
  const wanted = normaliseProduct(product);
  if (wanted === '') return notInTable();
  const hit = admittedEntries(f).find(
    (e) => e.condition === condition && normaliseProduct(e.product) === wanted,
  );
  return hit ? { kind: 'found', entry: hit } : notInTable();
}

/**
 * Picker search (FM-13): admitted entries whose normalised name starts with the
 * query. An empty query returns nothing. Search is for choosing a product;
 * only `lookupEntry` decides which entry a clock uses.
 */
export function searchFormulary(
  f: Formulary,
  query: string,
  limit: number = DEFAULT_SEARCH_LIMIT,
): readonly ValidatedEntry[] {
  if (typeof query !== 'string') return [];
  const q = normaliseProduct(query);
  if (q === '') return [];
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : DEFAULT_SEARCH_LIMIT;
  return admittedEntries(f)
    .filter((e) => normaliseProduct(e.product).startsWith(q))
    .slice(0, cap);
}
