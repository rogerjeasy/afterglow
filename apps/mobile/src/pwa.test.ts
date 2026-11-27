import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { MEDICAL_DEVICES } from './plan/devices';

/**
 * Offline and installable (.kiro/specs/device-features DF-18, DF-19): the service worker
 * from `sw/sw.template.js` run against an in-memory Cache Storage, and the manifest and
 * icons as shipped. Plus the medical device profiles of the Plan (energy EN-06).
 */

const ORIGIN = 'https://afterglow.example';
const SCOPE = `${ORIGIN}/`;
type Req = { method: string; url: string; mode: string };
type Handler = (e: Record<string, unknown>) => void;

function loadServiceWorker(files: readonly string[], version: string, online: () => boolean) {
  const src = readFileSync(new URL('../sw/sw.template.js', import.meta.url), 'utf8')
    .replace('__PRECACHE__', JSON.stringify(files))
    .replace('__VERSION__', JSON.stringify(version));
  const handlers = new Map<string, Handler>();
  const store = new Map<string, Map<string, Response>>();
  const keyOf = (r: string | Req) => (typeof r === 'string' ? r : r.url);
  const cacheFor = (name: string) => {
    let c = store.get(name);
    if (!c) {
      c = new Map();
      store.set(name, c);
    }
    const cache = c;
    return {
      addAll: async (urls: string[]) => {
        for (const u of urls) cache.set(u, new Response(`file ${u}`));
      },
      put: async (r: Req, res: Response) => {
        cache.set(keyOf(r), res);
      },
    };
  };
  const caches = {
    open: async (name: string) => cacheFor(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (r: string | Req) => {
      for (const c of store.values()) {
        const hit = c.get(keyOf(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const fetched: string[] = [];
  const fetchStub = async (r: Req) => {
    fetched.push(r.url);
    if (!online()) throw new TypeError('offline');
    return new Response(`net ${r.url}`);
  };
  const self = {
    registration: { scope: SCOPE, showNotification: async () => {} },
    location: { origin: ORIGIN },
    addEventListener: (t: string, f: Handler) => handlers.set(t, f),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  new Function('self', 'caches', 'fetch', 'Response', src)(self, caches, fetchStub, Response);
  /** Fire an event; resolve with what the worker answered (or undefined if it let it pass). */
  const fire = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> = Promise.resolve();
    let answer: Promise<Response> | undefined;
    handlers.get(type)?.({
      ...extra,
      waitUntil: (p: Promise<unknown>) => {
        waited = p;
      },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    });
    await waited;
    return answer ? await answer : undefined;
  };
  // Let a cache.put scheduled after a response settle.
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { fire, store, fetched, settle };
}

const FILES = [
  './',
  'index.html',
  'assets/index-abc.js',
  'assets/index-abc.css',
  'icon-192.png',
  'manifest.webmanifest',
];

describe('Service worker (DF-18)', () => {
  it('DF-18 install caches every file of the build; activate removes only older Afterglow caches', async () => {
    const sw = loadServiceWorker(FILES, 'v2', () => true);
    sw.store.set('afterglow-v1', new Map());
    sw.store.set('someone-elses-cache', new Map());
    await sw.fire('install');
    expect([...(sw.store.get('afterglow-v2')?.keys() ?? [])].sort()).toEqual(
      FILES.map((f) => new URL(f, SCOPE).href).sort(),
    );
    await sw.fire('activate');
    expect([...sw.store.keys()].sort()).toEqual(['afterglow-v2', 'someone-elses-cache']);
  });

  it('DF-18 the public API, the vault and any other origin are never answered or cached by the worker', async () => {
    const sw = loadServiceWorker(FILES, 'v2', () => true);
    await sw.fire('install');
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.webUrl({ validSchemes: ['https'] }),
          fc.constantFrom(
            'https://z52uri28c1.execute-api.eu-central-1.amazonaws.com/v1/cells?center=u4pruy',
            'https://vault.execute-api.eu-central-1.amazonaws.com/v1/vault',
          ),
        ),
        fc.constantFrom('GET', 'POST', 'PUT'),
        fc.constantFrom('cors', 'navigate', 'no-cors'),
        async (url, method, mode) => {
          fc.pre(new URL(url).origin !== ORIGIN);
          const before = JSON.stringify([...sw.store].map(([k, v]) => [k, [...v.keys()]]));
          expect(await sw.fire('fetch', { request: { method, url, mode } })).toBeUndefined();
          await sw.settle();
          expect(JSON.stringify([...sw.store].map(([k, v]) => [k, [...v.keys()]]))).toBe(before);
        },
      ),
    );
  });

  it('DF-18 same-origin pages and files: cached files first, only build assets are added, nothing else is stored', async () => {
    const sw = loadServiceWorker(FILES, 'v2', () => true);
    await sw.fire('install');
    await fc.assert(
      fc.asyncProperty(fc.webPath(), fc.boolean(), async (path, asset) => {
        const url = new URL(`${asset ? '/assets/' : '/'}${path.replace(/^\/+/, '')}`, ORIGIN).href;
        const cachedBefore = sw.store.get('afterglow-v2')?.has(url) ?? false;
        const res = await sw.fire('fetch', { request: { method: 'GET', url, mode: 'cors' } });
        expect(res).toBeDefined();
        await sw.settle();
        const cachedAfter = sw.store.get('afterglow-v2')?.has(url) ?? false;
        expect(cachedAfter).toBe(cachedBefore || new URL(url).pathname.includes('/assets/'));
      }),
    );
  });

  it('DF-18 offline, a page opens from the cached app shell', async () => {
    let online = true;
    const sw = loadServiceWorker(FILES, 'v2', () => online);
    await sw.fire('install');
    online = false;
    for (const path of ['/app', '/app/cold', '/', '/features']) {
      const res = await sw.fire('fetch', {
        request: { method: 'GET', url: `${ORIGIN}${path}`, mode: 'navigate' },
      });
      expect(await res?.text()).toBe(`file ${SCOPE}index.html`);
    }
    // A cached build file is served with no network at all.
    const js = await sw.fire('fetch', {
      request: { method: 'GET', url: `${SCOPE}assets/index-abc.js`, mode: 'cors' },
    });
    expect(await js?.text()).toBe(`file ${SCOPE}assets/index-abc.js`);
  });
});

describe('Installable (DF-19)', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
  ) as {
    start_url: string;
    display: string;
    background_color: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };

  it('DF-19 the web manifest makes the app installable and opens the product', () => {
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('./app');
    expect(manifest.background_color).toBe('#000000');
    expect(manifest.icons.map((i) => i.sizes).sort()).toEqual(['192x192', '512x512']);
    for (const i of manifest.icons) expect(i.purpose.split(' ')).toContain('maskable');
  });

  it('DF-19 every icon keeps the ember inside the maskable safe zone, on black', () => {
    for (const icon of manifest.icons) {
      const png = PNG.sync.read(readFileSync(new URL(`../public/${icon.src}`, import.meta.url)));
      expect(`${png.width}x${png.height}`).toBe(icon.sizes);
      const c = png.width / 2;
      let lit = 0;
      let farthest = 0;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          const i = (y * png.width + x) * 4;
          const v = Math.max(
            png.data[i] as number,
            png.data[i + 1] as number,
            png.data[i + 2] as number,
          );
          if (v <= 8) continue;
          lit++;
          farthest = Math.max(farthest, Math.hypot(x + 0.5 - c, y + 0.5 - c));
        }
      }
      expect(lit).toBeGreaterThan(0);
      // The maskable safe zone is the centred circle of radius 40% of the icon.
      expect(farthest).toBeLessThanOrEqual(0.4 * png.width);
    }
  });
});

describe('Medical device profiles (EN-06)', () => {
  it('EN-06 a profile names the device and its plug but never fills the watts', () => {
    expect(MEDICAL_DEVICES.length).toBeGreaterThan(0);
    expect(new Set(MEDICAL_DEVICES.map((d) => d.name)).size).toBe(MEDICAL_DEVICES.length);
    for (const d of MEDICAL_DEVICES) {
      expect(Object.keys(d).sort()).toEqual(['name', 'needs', 'typical']);
      expect(['ac', 'usb']).toContain(d.needs);
      // The typical range is a guide to reading the label, not a value.
      expect(d.typical).toMatch(/\d+.*W/);
    }
    for (const kind of [
      'CPAP',
      'Oxygen concentrator',
      'Home ventilator',
      'Feeding pump',
      'Dialysis cycler',
    ]) {
      expect(MEDICAL_DEVICES.map((d) => d.name)).toContain(kind);
    }
  });
});
