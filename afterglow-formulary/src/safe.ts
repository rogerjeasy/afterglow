import { realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';

/** FP-08: an id is lower-case letters, digits and hyphens, so it can never name a path. */
const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && ID.test(id);
}

/** True when `child` is `parent` or inside it, after resolving symlinks where the path exists. */
export function isInside(parent: string, child: string): boolean {
  const real = (p: string): string => {
    let cur = resolve(p);
    const tail: string[] = [];
    // Resolve the deepest existing ancestor, so a symlinked directory cannot hide an escape.
    for (;;) {
      try {
        return resolve(realpathSync(cur), ...tail.reverse());
      } catch {
        const up = dirname(cur);
        if (up === cur) return resolve(p);
        tail.push(cur.slice(up.length + 1));
        cur = up;
      }
    }
  };
  const a = real(parent);
  const b = real(child);
  return b === a || b.startsWith(a.endsWith(sep) ? a : a + sep);
}
