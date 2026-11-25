import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { TrustAnchor } from '@afterglow/adapters';
import { formulary } from '@afterglow/core';
import type { ReviewLogLine } from './approve.js';
import { parseAnchors } from './keys.js';
import { isSafeId } from './safe.js';
import { type Source, parseSource } from './sources.js';

/**
 * The repository's folders. Every path is built from a checked id, never from raw input.
 * Only `approve` (the pharmacist's step) writes `validated/`; see FP-05.
 */

const MAX_BYTES = 2_000_000;

export const DIRS = {
  sources: 'sources',
  proposals: 'proposals',
  queue: 'review-queue',
  rejected: 'rejected',
  validated: 'validated',
  reviews: 'reviews',
  dist: 'dist',
  docs: 'docs',
} as const;

export function readJson(path: string): unknown {
  const text = readFileSync(path, 'utf8');
  if (text.length > MAX_BYTES) throw new Error(`${path} is too large to read.`);
  return JSON.parse(text);
}

export function writeJson(path: string, value: unknown, exclusive = false): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, exclusive ? { flag: 'wx' } : {});
}

function pathFor(root: string, dir: keyof typeof DIRS, id: string): string {
  if (!isSafeId(id))
    throw new Error('That id is not safe: use lower-case letters, digits and hyphens.');
  return join(root, DIRS[dir], `${id}.json`);
}

export const sourcePath = (root: string, id: string): string => pathFor(root, 'sources', id);
export const proposalPath = (root: string, id: string): string => pathFor(root, 'proposals', id);
export const queuePath = (root: string, id: string): string => pathFor(root, 'queue', id);
export const rejectedPath = (root: string, id: string): string => pathFor(root, 'rejected', id);
export const validatedPath = (root: string, id: string): string => pathFor(root, 'validated', id);

export function loadSource(root: string, id: string): Source {
  const s = parseSource(readJson(sourcePath(root, id)));
  if (!s) throw new Error(`Source ${id} is missing, malformed, or no longer matches its hash.`);
  return s;
}

export function appendReviewLog(root: string, line: ReviewLogLine): void {
  mkdirSync(join(root, DIRS.reviews), { recursive: true });
  appendFileSync(join(root, DIRS.reviews, 'log.jsonl'), `${JSON.stringify(line)}\n`);
}

export function loadAnchors(root: string): TrustAnchor[] {
  const path = join(root, 'anchors.json');
  return existsSync(path) ? parseAnchors(readJson(path)) : [];
}

export function saveAnchors(root: string, anchors: readonly TrustAnchor[]): void {
  writeJson(join(root, 'anchors.json'), anchors);
}

/** Every validated entry, each re-parsed by the app's own rules. A bad file is an error, not skipped. */
export function loadValidated(root: string): formulary.FormularyEntry[] {
  const dir = join(root, DIRS.validated);
  if (!existsSync(dir)) return [];
  const out: formulary.FormularyEntry[] = [];
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort()) {
    const parsed = formulary.parseEntry(readJson(join(dir, name)));
    if (!parsed.ok) throw new Error(`validated/${name} is not a valid entry: ${parsed.detail}`);
    out.push(parsed.entry);
  }
  return out;
}

export function previousVersion(root: string): number {
  const path = join(root, DIRS.dist, 'snapshot.json');
  if (!existsSync(path)) return 0;
  const v = Number((readJson(path) as { formularyVersion?: unknown }).formularyVersion);
  return Number.isSafeInteger(v) && v > 0 ? v : 0;
}

export function removeQueued(root: string, id: string): void {
  rmSync(queuePath(root, id), { force: true });
}

/** A file name for an entry: its product and condition, reduced to a safe id. */
export function entryFileId(e: Pick<formulary.FormularyEntry, 'product' | 'condition'>): string {
  const base = formulary
    .normaliseProduct(e.product)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const id = `${base || 'entry'}-${e.condition === 'inUse' ? 'in-use' : 'unopened'}`;
  if (!isSafeId(id)) throw new Error('Could not make a safe file name for this entry.');
  return id;
}
