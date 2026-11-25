import { createHash } from 'node:crypto';
import { isSafeId } from './safe.js';

/**
 * A label text as it was fetched (FP-09). The pipeline reasons only about this stored
 * text, never about a live page, so a proposal can be re-checked at any time and a
 * changed source is noticed by its hash.
 */
export interface Source {
  readonly id: string;
  readonly product: string;
  readonly labelVersion: string;
  readonly title: string;
  readonly url: string;
  readonly fetchedAt: string;
  readonly sha256: string;
  readonly text: string;
}

export const sha256Hex = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

export type SourceInput = Omit<Source, 'sha256'>;

export function makeSource(input: SourceInput): Source {
  if (!isSafeId(input.id)) throw new Error('The source id is not safe.');
  if (!/^https:\/\/[^\s/?#]+([/?#]\S*)?$/.test(input.url)) {
    throw new Error('A source URL must be https.');
  }
  if (input.text.trim() === '') throw new Error('The source text is empty.');
  return { ...input, sha256: sha256Hex(input.text) };
}

/** FP-09: a source whose text no longer matches its hash is refused. */
export function sourceIsIntact(source: Source): boolean {
  return typeof source.text === 'string' && sha256Hex(source.text) === source.sha256;
}

const KEYS = [
  'id',
  'product',
  'labelVersion',
  'title',
  'url',
  'fetchedAt',
  'sha256',
  'text',
] as const;

export function parseSource(raw: unknown): Source | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== KEYS.length || !KEYS.every((k) => typeof o[k] === 'string')) {
    return null;
  }
  const s = o as unknown as Source;
  return isSafeId(s.id) && sourceIsIntact(s) ? s : null;
}
