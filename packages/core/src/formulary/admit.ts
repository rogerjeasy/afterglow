import { canonicalPayload, normaliseProduct, parseApprovedAt, parseEntry } from './entry.js';
import type { Formulary, FormularyEntry, Rejection, ValidatedEntry, Verifier } from './types.js';

/**
 * Entries produced by `buildFormulary`. A TypeScript brand cannot stop a cast,
 * so trust is also recorded here, out of reach of callers (FM-03). A copy, a
 * spread, a structured clone or a hand-built object is not in this set.
 */
const ADMITTED = new WeakSet<object>();

/** True only for an object that `buildFormulary` admitted. */
export function isValidatedEntry(x: unknown): x is ValidatedEntry {
  return typeof x === 'object' && x !== null && ADMITTED.has(x);
}

/** Only an exact `true` counts; a throw, a Promise or any truthy value is a failure (FM-01). */
function verifies(verify: unknown, payload: string, signature: string): boolean {
  if (typeof verify !== 'function') return false;
  try {
    return (verify as Verifier)(payload, signature) === true;
  } catch {
    return false;
  }
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function emptyFormulary(detail: string): Formulary {
  return {
    formularyVersion: 'invalid',
    entries: [],
    rejected: [{ product: null, reason: 'malformed', detail }],
  };
}

interface Candidate {
  readonly entry: FormularyEntry;
  readonly payload: string;
  readonly key: string;
  readonly approvedAtMs: number;
}

/**
 * Admit entries into a formulary (FM-01, FM-11).
 *
 * `snapshot` is `{ formularyVersion: string, entries: unknown[] }`, untrusted.
 * An entry is admitted only if it is well formed **and** `verify` returns
 * exactly `true` for its canonical payload and signature. Nothing here throws.
 * The result does not depend on the order of the input entries.
 */
export function buildFormulary(snapshot: unknown, verify: Verifier): Formulary {
  try {
    return buildUnsafe(snapshot, verify);
  } catch {
    return emptyFormulary('The snapshot could not be read.');
  }
}

function buildUnsafe(snapshot: unknown, verify: Verifier): Formulary {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    return emptyFormulary('Snapshot is not an object.');
  }
  const { formularyVersion, entries } = snapshot as Record<string, unknown>;
  if (
    typeof formularyVersion !== 'string' ||
    formularyVersion.length === 0 ||
    formularyVersion.length > 100
  ) {
    return emptyFormulary('Snapshot has no valid formularyVersion.');
  }
  if (!Array.isArray(entries)) return emptyFormulary('Snapshot has no entries array.');

  const rejected: Rejection[] = [];
  const candidates: Candidate[] = [];

  for (const raw of entries as unknown[]) {
    const parsed = parseEntry(raw);
    if (!parsed.ok) {
      rejected.push({ product: parsed.product, reason: 'malformed', detail: parsed.detail });
      continue;
    }
    const { entry } = parsed;
    const payload = canonicalPayload(entry);
    if (!verifies(verify, payload, entry.signature)) {
      rejected.push({
        product: entry.product,
        reason: 'signature',
        detail: 'The signature did not verify.',
      });
      continue;
    }
    const approvedAtMs = parseApprovedAt(entry.approvedAt);
    if (approvedAtMs === null) continue; // unreachable: parseEntry checked it
    candidates.push({
      entry,
      payload,
      key: `${normaliseProduct(entry.product)}\u0000${entry.condition}`,
      approvedAtMs,
    });
  }

  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const g = groups.get(c.key);
    if (g) g.push(c);
    else groups.set(c.key, [c]);
  }

  const admitted: ValidatedEntry[] = [];
  for (const group of groups.values()) {
    const latest = Math.max(...group.map((c) => c.approvedAtMs));
    const top = group.filter((c) => c.approvedAtMs === latest);
    const distinct = new Set(top.map((c) => c.payload));
    if (distinct.size > 1) {
      for (const c of group) {
        rejected.push({
          product: c.entry.product,
          reason: 'conflict',
          detail: 'Two approvals with the same date disagree, so neither is used.',
        });
      }
      continue;
    }
    // Same payload may carry different (both valid) signatures: pick one deterministically.
    const chosen = top.reduce((a, b) =>
      compare(b.entry.signature, a.entry.signature) < 0 ? b : a,
    );
    const frozen = Object.freeze({
      ...chosen.entry,
      source: Object.freeze({ ...chosen.entry.source }),
    }) as ValidatedEntry;
    ADMITTED.add(frozen);
    admitted.push(frozen);
  }

  admitted.sort(
    (a, b) =>
      compare(normaliseProduct(a.product), normaliseProduct(b.product)) ||
      compare(a.condition, b.condition),
  );
  rejected.sort(
    (a, b) =>
      compare(a.reason, b.reason) ||
      compare(a.product ?? '', b.product ?? '') ||
      compare(a.detail, b.detail),
  );
  return { formularyVersion, entries: admitted, rejected };
}
