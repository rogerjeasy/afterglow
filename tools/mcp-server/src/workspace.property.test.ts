import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isInside, resolveInsideRoot } from './workspace.js';

let base: string;
let root: string;
let outside: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), 'mcp-fence-')));
  root = path.join(base, 'workspace');
  outside = path.join(base, 'outside');
  mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(root, 'theme.json'), '{}');
  writeFileSync(path.join(root, 'a', 'shot.png'), 'x');
  writeFileSync(path.join(root, 'a', 'b', 'deep.json'), '{}');
  writeFileSync(path.join(root, 'secret.env'), 'X=1');
  writeFileSync(path.join(outside, 'theme.json'), '{}');
  writeFileSync(path.join(base, 'theme.json'), '{}');
  symlinkSync(path.join(outside, 'theme.json'), path.join(root, 'link.json'));
  symlinkSync(outside, path.join(root, 'a', 'out'));
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

const segment = fc.constantFrom('..', '.', 'a', 'b', 'out', 'outside', 'workspace', 'x');
const file = fc.constantFrom('theme.json', 'deep.json', 'shot.png', 'link.json', 'secret.env');
const pathArb = fc
  .tuple(fc.boolean(), fc.array(segment, { maxLength: 6 }), file)
  .map(([absolute, segs, f]) => {
    const rel = [...segs, f].join('/');
    return absolute ? path.join(base, rel) : rel;
  });

describe('workspace fence', () => {
  it('MCP-06 property: an accepted path always resolves, through links, to a file inside the root', () => {
    fc.assert(
      fc.property(pathArb, (p) => {
        const r = resolveInsideRoot(root, p, ['.json', '.png']);
        if (r.ok) {
          expect(isInside(root, realpathSync(r.absolute))).toBe(true);
          expect(r.absolute).toBe(realpathSync(path.resolve(root, p)));
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('MCP-06 property: a path that escapes the root lexically is always refused', () => {
    fc.assert(
      fc.property(pathArb, (p) => {
        fc.pre(!isInside(root, path.resolve(root, p)));
        const r = resolveInsideRoot(root, p, ['.json', '.png']);
        expect(r.ok).toBe(false);
      }),
      { numRuns: 1000 },
    );
  });

  it('MCP-06 traversal, absolute, symlinked and wrong-extension paths are refused with a reason', () => {
    const cases: [string, RegExp][] = [
      ['../theme.json', /path is outside the workspace/],
      ['a/../../theme.json', /path is outside the workspace/],
      [path.join(outside, 'theme.json'), /path is outside the workspace/],
      ['link.json', /links outside/],
      ['a/out/theme.json', /links outside/],
      ['secret.env', /only \.json/],
      ['missing.json', /Not found/],
      ['a/b', /only/],
      ['', /No path/],
      ['theme.json\0.png', /NUL/],
    ];
    for (const [p, reason] of cases) {
      const r = resolveInsideRoot(root, p, ['.json', '.png']);
      expect(r.ok, p).toBe(false);
      if (!r.ok) expect(r.reason, p).toMatch(reason);
    }
  });

  it('MCP-06 files inside the root are accepted with a root-relative path', () => {
    const r = resolveInsideRoot(root, 'a/./b/deep.json', ['.json']);
    expect(r).toEqual({
      ok: true,
      absolute: path.join(root, 'a', 'b', 'deep.json'),
      relative: path.join('a', 'b', 'deep.json'),
    });
    expect(resolveInsideRoot(root, path.join(root, 'theme.json'), ['.json']).ok).toBe(true);
  });
});
