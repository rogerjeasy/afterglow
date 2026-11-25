import { type TrustAnchor, loadFormulary, manifestPayload } from '@afterglow/adapters';
import { formulary } from '@afterglow/core';
import type { Signer } from './keys.js';

/**
 * Build the published snapshot (FP-06). It is checked with the app's own loader before it
 * is returned, so nothing is published that the app would refuse.
 */

export interface Snapshot {
  readonly formularyVersion: string;
  readonly entries: readonly formulary.FormularyEntry[];
  readonly manifestSignature: string;
}

export type SnapshotResult =
  | { readonly ok: true; readonly snapshot: Snapshot }
  | { readonly ok: false; readonly reasons: readonly string[] };

const byKey = (a: formulary.FormularyEntry, b: formulary.FormularyEntry): number => {
  const ka = `${formulary.normaliseProduct(a.product)}\u0000${a.condition}`;
  const kb = `${formulary.normaliseProduct(b.product)}\u0000${b.condition}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

export async function buildSnapshot(input: {
  readonly entries: readonly formulary.FormularyEntry[];
  readonly anchors: readonly TrustAnchor[];
  /** The version of the last published snapshot, or 0 when there is none. */
  readonly previousVersion: number;
  readonly sign: Signer;
}): Promise<SnapshotResult> {
  const reasons: string[] = [];
  if (input.entries.length === 0) {
    return {
      ok: false,
      reasons: ['There are no validated entries, so there is nothing to publish.'],
    };
  }
  if (!Number.isSafeInteger(input.previousVersion) || input.previousVersion < 0) {
    return { ok: false, reasons: ['The previous version is not valid.'] };
  }
  const seen = new Set<string>();
  for (const e of input.entries) {
    const k = `${formulary.normaliseProduct(e.product)}\u0000${e.condition}`;
    if (seen.has(k)) reasons.push(`Two entries for ${e.product} (${e.condition}).`);
    seen.add(k);
  }
  if (reasons.length > 0) return { ok: false, reasons };

  const entries = [...input.entries].sort(byKey);
  const version = String(input.previousVersion + 1);
  const manifestSignature = await input.sign(
    manifestPayload(
      version,
      entries.map((e) => e.signature),
    ),
  );
  const snapshot: Snapshot = { formularyVersion: version, entries, manifestSignature };

  // The proof: the real app loader, with the real pinned keys, must load all of it.
  const loaded = await loadFormulary(snapshot, input.anchors, input.previousVersion);
  if (loaded.kind !== 'loaded') {
    return { ok: false, reasons: [`The app loader refused the snapshot: ${loaded.kind}.`] };
  }
  if (loaded.formulary.rejected.length > 0) {
    return {
      ok: false,
      reasons: loaded.formulary.rejected.map(
        (r) => `The app rejected ${r.product ?? 'an entry'} (${r.reason}): ${r.detail}`,
      ),
    };
  }
  if (loaded.formulary.entries.length !== entries.length) {
    return { ok: false, reasons: ['The app admitted fewer entries than were signed.'] };
  }
  return { ok: true, snapshot };
}
