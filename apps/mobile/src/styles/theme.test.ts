import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The utility theme (.kiro/specs/web-experience WX-02): built from the semantic tokens
 * only. Tailwind's default palette, every shadow and every text size below 16 px are
 * removed, and every colour utility is a CSS variable, so a mode change repaints it all.
 */

const css = readFileSync(new URL('./tailwind.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
/** The `@theme { ... }` blocks, with nested braces (keyframes) kept inside. */
function themeBlocks(src: string): string[] {
  const out: string[] = [];
  let i = src.indexOf('@theme');
  while (i >= 0) {
    const open = src.indexOf('{', i);
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}' && --depth === 0) break;
    }
    out.push(src.slice(open + 1, j));
    i = src.indexOf('@theme', j);
  }
  return out;
}
const theme = themeBlocks(css).join('\n');
const decls = [...theme.matchAll(/(--[a-z0-9-*]+)\s*:\s*([^;]+);/g)].map(
  (m) => [m[1] as string, (m[2] as string).trim()] as const,
);

describe('Theme from tokens only (WX-02)', () => {
  it('WX-02 the default palette, every shadow and the default type scale are removed', () => {
    const resets = new Map(decls.filter(([, v]) => v === 'initial'));
    for (const ns of [
      '--color-*',
      '--shadow-*',
      '--inset-shadow-*',
      '--drop-shadow-*',
      '--text-shadow-*',
      '--text-*',
    ]) {
      expect(resets.has(ns)).toBe(true);
    }
    // Nothing re-adds a shadow.
    expect(decls.filter(([k]) => /shadow/.test(k) && !k.endsWith('*'))).toEqual([]);
  });

  it('WX-02 every colour utility is a CSS variable set by the mode, or transparent, currentColor or inherit', () => {
    const colours = decls.filter(([k]) => k.startsWith('--color-') && k !== '--color-*');
    expect(colours.length).toBeGreaterThan(5);
    for (const [k, v] of colours) {
      expect(`${k}: ${v}`).toMatch(/: (var\(--[a-z0-9-]+\)|transparent|currentColor|inherit)$/);
    }
  });

  it('WX-02 no text size in the theme is below 16 px', () => {
    const sizes = decls.filter(
      ([k]) => k.startsWith('--text-') && !k.includes('--line-height') && !k.endsWith('*'),
    );
    expect(sizes.length).toBeGreaterThan(5);
    for (const [k, v] of sizes) {
      const px = [...v.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
      expect(px.length, k).toBeGreaterThan(0);
      // The smallest a clamp() can reach is its first value.
      expect(Math.min(...px), k).toBeGreaterThanOrEqual(16);
    }
  });
});
