import { type TrustAnchor, loadFormulary } from '@afterglow/adapters';
import type { formulary } from '@afterglow/core';
import { useEffect, useState } from 'react';
import { type StorageLike, browserStorage } from '../household/store';

/**
 * The public keys of the review pipeline, pinned in the app (FM-15).
 *
 * Empty until the `afterglow-formulary` pipeline exists and publishes its key.
 * With no anchors nothing can be trusted, so no medicine clock is ever shown.
 * Adding a key here is a release decision, reviewed like code.
 */
export const TRUST_ANCHORS: readonly TrustAnchor[] = [];

export const SNAPSHOT_URL = './formulary/snapshot.json';
export const VERSION_KEY = 'afterglow.formulary.version.v1';
/** Refuse absurd responses instead of parsing them. */
const MAX_BYTES = 10_000_000;

export type FormularyState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'none'; readonly reason: string }
  | {
      readonly kind: 'loaded';
      readonly formulary: formulary.Formulary;
      readonly version: number;
    };

export interface FormularyDeps {
  readonly fetchText: (url: string) => Promise<string | null>;
  readonly storage: StorageLike;
  readonly anchors: readonly TrustAnchor[];
}

const none = (reason: string): FormularyState => ({ kind: 'none', reason });

function lastAccepted(storage: StorageLike): number {
  try {
    const n = Number(storage.getItem(VERSION_KEY));
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Load the validated table, or say honestly why there is none. Every failure is
 * a "none": the app then shows no medicine clock (fail closed).
 */
export async function loadFormularyState(deps: FormularyDeps): Promise<FormularyState> {
  let text: string | null;
  try {
    text = await deps.fetchText(SNAPSHOT_URL);
  } catch {
    return none('The approved table could not be reached, and none is saved on this device.');
  }
  if (text === null || text.length === 0 || text.length > MAX_BYTES) {
    return none('No pharmacist-approved table is published with this build.');
  }
  let snapshot: unknown;
  try {
    snapshot = JSON.parse(text);
  } catch {
    // A host that answers a missing file with its home page lands here.
    return none('No pharmacist-approved table is published with this build.');
  }
  const last = lastAccepted(deps.storage);
  const result = await loadFormulary(snapshot, deps.anchors, last);
  switch (result.kind) {
    case 'loaded':
      try {
        deps.storage.setItem(VERSION_KEY, String(result.version));
      } catch {
        // Not persisted: the next load re-checks against what was saved before.
      }
      return { kind: 'loaded', formulary: result.formulary, version: result.version };
    case 'rollback':
      return none(
        'The approved table on offer is older than the one this device already accepted, so it was refused.',
      );
    case 'refused':
      return none(
        result.code === 'badAnchors'
          ? 'This build has no pinned review key, so no table can be trusted.'
          : 'The approved table failed its signature check, so none of it is used.',
      );
  }
}

export async function fetchTextOrNull(url: string): Promise<string | null> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'omit' });
  return res.ok ? await res.text() : null;
}

let cached: Promise<FormularyState> | null = null;

/** The table is public data: one load per page, shared by every space. */
export function useFormulary(): FormularyState {
  const [state, setState] = useState<FormularyState>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    cached ??= loadFormularyState({
      fetchText: fetchTextOrNull,
      storage: browserStorage(),
      anchors: TRUST_ANCHORS,
    });
    void cached.then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
