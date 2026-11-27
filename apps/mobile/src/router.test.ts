import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The history router (.kiro/specs/web-experience WX-01): real paths under the hosting
 * base, and every legacy `#/` link lands where it meant to before the first render.
 * Run against a minimal window (location and history), at a domain root and a subpath.
 */

const ORIGIN = 'https://afterglow.example';
const LEGACY: Record<string, string> = {
  '': '/app',
  lantern: '/app/lantern',
  seance: '/app/seance',
  cold: '/app/cold',
  plan: '/app/plan',
  you: '/app/account',
  alerts: '/app/alerts',
  business: '/app/business',
  beacon: '/app/beacon',
  welcome: '/app/welcome',
};

function fakeWindow(start: string) {
  const loc = new URL(start, ORIGIN);
  const calls: { kind: 'push' | 'replace'; url: string }[] = [];
  const set = (url: string) => {
    const next = new URL(url, loc.href);
    loc.href = next.href;
  };
  const win = {
    location: loc,
    history: {
      replaceState: (_s: unknown, _t: string, url: string) => {
        calls.push({ kind: 'replace', url });
        set(url);
      },
      pushState: (_s: unknown, _t: string, url: string) => {
        calls.push({ kind: 'push', url });
        set(url);
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    scrollTo: () => {},
  };
  return { win, loc, calls };
}

/** The router module as built for a hosting base ('/' or '/afterglow/'). */
async function routerAt(base: string) {
  vi.stubEnv('BASE_URL', base);
  vi.resetModules();
  return import('./router');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const baseArb = fc.constantFrom('/', '/afterglow/');
const prefixOf = (base: string) => base.replace(/\/$/, '');
const queryArb = fc.oneof(
  fc.constant(''),
  fc
    .dictionary(fc.stringMatching(/^[a-z]{1,5}$/), fc.stringMatching(/^[a-z0-9]{0,5}$/), {
      maxKeys: 3,
    })
    .map((d) => {
      const q = new URLSearchParams(d).toString();
      return q ? `?${q}` : '';
    }),
);
const segArb = fc.stringMatching(/^[a-z0-9-]{1,10}$/);
const pathArb = fc.array(segArb, { maxLength: 3 }).map((s) => `/${s.join('/')}`);

describe('Real paths and legacy links (WX-01)', () => {
  it('WX-01 every legacy #/<tab> link is replaced by its /app path, keeping the query, before the first render', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseArb,
        fc.constantFrom(...Object.keys(LEGACY)),
        fc.constantFrom('', '/', '/x', '?a=1', '/deep/er?z=2'),
        queryArb,
        async (base, tab, rest, search) => {
          const r = await routerAt(base);
          const { win, loc, calls } = fakeWindow(
            `${prefixOf(base)}/${search}#/${tab}${tab ? rest : ''}`,
          );
          vi.stubGlobal('window', win);
          r.redirectLegacy();
          expect(calls.map((c) => c.kind)).toEqual(['replace']);
          expect(loc.pathname).toBe(`${prefixOf(base)}${LEGACY[tab]}`);
          expect(loc.search).toBe(search);
          expect(loc.hash).toBe('');
          expect(r.currentPath()).toBe(LEGACY[tab]);
        },
      ),
      { numRuns: 80 },
    );
  });

  it('WX-01 an unknown #/ name opens the product, never a crash', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseArb,
        fc.oneof(
          segArb,
          fc.string(),
          // Names a plain object answers for itself: a lookup must not mistake them for routes.
          fc.constantFrom(...Object.getOwnPropertyNames(Object.prototype), '__proto__'),
        ),
        async (base, name) => {
          fc.pre(!Object.hasOwn(LEGACY, name) && !/[/?#%\s]/.test(name));
          const r = await routerAt(base);
          const { win } = fakeWindow(`${prefixOf(base)}/#/${name}`);
          vi.stubGlobal('window', win);
          expect(() => r.redirectLegacy()).not.toThrow();
          expect(r.currentPath()).toBe('/app');
        },
      ),
      { numRuns: 120 },
    );
  });

  it('WX-01 regression: #/constructor and #/__proto__ open the product', async () => {
    // Shrunk counterexample (2026-11-27): "constructor" (and "toString", "__proto__")
    // found a property of the plain lookup object, and href() threw on it.
    for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      const r = await routerAt('/');
      const { win } = fakeWindow(`/#/${name}`);
      vi.stubGlobal('window', win);
      expect(() => r.redirectLegacy()).not.toThrow();
      expect(r.currentPath()).toBe('/app');
    }
  });

  it('WX-01 a pairing invitation keeps its offer in the hash and opens the Séance', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseArb,
        fc.integer({ min: 0, max: 63 }),
        segArb,
        queryArb,
        async (base, slot, name, search) => {
          const r = await routerAt(base);
          const hash = `#/seance/pair?s=${slot}&n=${name}`;
          const { win, loc } = fakeWindow(`${prefixOf(base)}/${search}${hash}`);
          vi.stubGlobal('window', win);
          r.redirectLegacy();
          expect(r.currentPath()).toBe('/app/seance');
          expect(loc.hash).toBe(hash);
          expect(loc.search).toBe(search);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('WX-01 the tour and an outage deep link at / open /app with the same query; anything else stays', async () => {
    await fc.assert(
      fc.asyncProperty(
        baseArb,
        queryArb,
        fc.constantFrom('', 'tour=1', 'phase=outage', 'tour=0', 'phase=calm'),
        async (base, q, deep) => {
          const r = await routerAt(base);
          const search = deep ? (q ? `${q}&${deep}` : `?${deep}`) : q;
          const { win, loc, calls } = fakeWindow(`${prefixOf(base)}/${search}`);
          vi.stubGlobal('window', win);
          r.redirectLegacy();
          const params = new URLSearchParams(search);
          const opens = params.get('tour') === '1' || params.get('phase') === 'outage';
          expect(r.currentPath()).toBe(opens ? '/app' : '/');
          expect(loc.search).toBe(search);
          expect(calls.length).toBe(opens ? 1 : 0);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('WX-01 href and currentPath round-trip under the hosting base', async () => {
    await fc.assert(
      fc.asyncProperty(baseArb, pathArb, fc.boolean(), async (base, path, trailing) => {
        const r = await routerAt(base);
        const link = r.href(path);
        expect(link.startsWith(prefixOf(base) || '/')).toBe(true);
        const { win } = fakeWindow(`${link}${trailing && path !== '/' ? '/' : ''}`);
        vi.stubGlobal('window', win);
        expect(r.currentPath()).toBe(path);
        expect(r.href(path.slice(1))).toBe(link);
      }),
      { numRuns: 80 },
    );
    for (const base of ['/', '/afterglow/']) {
      const r = await routerAt(base);
      for (const p of [
        prefixOf(base) || '/',
        `${prefixOf(base)}/`,
        `${prefixOf(base)}/index.html`,
      ]) {
        vi.stubGlobal('window', fakeWindow(p).win);
        expect(r.currentPath()).toBe('/');
      }
    }
  });

  it('WX-01 navigate pushes (or replaces) the base-aware path and leaves the hash behind', async () => {
    const r = await routerAt('/afterglow/');
    const { win, loc, calls } = fakeWindow('/afterglow/features#/old');
    vi.stubGlobal('window', win);
    r.navigate('/app/cold');
    r.navigate('/signin', { replace: true });
    expect(calls).toEqual([
      { kind: 'push', url: '/afterglow/app/cold' },
      { kind: 'replace', url: '/afterglow/signin' },
    ]);
    expect(loc.pathname).toBe('/afterglow/signin');
    expect(loc.hash).toBe('');
  });
});
