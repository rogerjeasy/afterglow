import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The workspace fence (MCP-06). Every tool that reads a file resolves the
 * requested path against one root and refuses anything that lands outside it,
 * lexically or through a symlink. A refusal is an answer, not an exception.
 */

export type Resolved =
  | { readonly ok: true; readonly absolute: string; readonly relative: string }
  | { readonly ok: false; readonly reason: string };

/** The largest file a tool will read (a 4K screenshot is well under this). */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

/** True when `candidate` is `root` itself or a path below it. Both must be absolute. */
export function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function realpathOrNull(p: string): string | null {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

/**
 * Resolve `requested` (relative to `root`, or absolute) to an existing regular
 * file inside `root` with one of the allowed extensions. Fails closed: a path
 * that escapes, does not exist, is not a file, is too large or has another
 * extension is refused with the reason.
 */
export function resolveInsideRoot(
  root: string,
  requested: string,
  extensions: readonly string[],
): Resolved {
  if (typeof requested !== 'string' || requested.length === 0) {
    return { ok: false, reason: 'No path was given.' };
  }
  if (requested.includes('\0')) return { ok: false, reason: 'The path contains a NUL byte.' };
  const rootReal = realpathOrNull(path.resolve(root));
  if (rootReal === null) return { ok: false, reason: 'The workspace root does not exist.' };

  const lexical = path.resolve(rootReal, requested);
  if (!isInside(rootReal, lexical)) {
    return { ok: false, reason: 'Refused: the path is outside the workspace root.' };
  }
  const ext = path.extname(lexical).toLowerCase();
  if (!extensions.includes(ext)) {
    return {
      ok: false,
      reason: `Refused: only ${extensions.join(', ')} files are read by this tool.`,
    };
  }
  const real = realpathOrNull(lexical);
  if (real === null) return { ok: false, reason: 'Not found inside the workspace.' };
  if (!isInside(rootReal, real)) {
    return { ok: false, reason: 'Refused: the path links outside the workspace root.' };
  }
  const stat = statSync(real);
  if (!stat.isFile()) return { ok: false, reason: 'Refused: the path is not a regular file.' };
  if (stat.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `Refused: the file is larger than ${MAX_FILE_BYTES} bytes.` };
  }
  return { ok: true, absolute: real, relative: path.relative(rootReal, real) || '.' };
}
