/*
 * Afterglow's service worker (product description principle 3, "offline first").
 * - Every file of this build is cached at install, so the app opens and works with
 *   no connection at all. Old builds' caches are removed when this one activates.
 * - Pages fall back to the cached app shell when the network is down.
 * - Only this site's own files are cached: the public API and the vault are never
 *   cached here (the app keeps its own last answers, with their times).
 * - Push: shows the notification the server sent (crowd changes in a followed cell)
 *   and opens the app on a tap.
 * The file list and version are injected at build time (vite.config.ts).
 */
const PRECACHE = __PRECACHE__;
const VERSION = __VERSION__;
const CACHE = `afterglow-${VERSION}`;
const scopeUrl = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE.map(scopeUrl)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('afterglow-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Network first for the page, so a new build is seen at once; the cached shell
    // when offline.
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(scopeUrl('index.html')).then((r) => r ?? Response.error()),
      ),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && url.pathname.includes('/assets/')) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title.slice(0, 80) : 'Afterglow';
  const body = typeof data.body === 'string' ? data.body.slice(0, 240) : '';
  const tag = typeof data.tag === 'string' ? data.tag.slice(0, 64) : 'afterglow';
  const path = typeof data.path === 'string' && data.path.startsWith('#/') ? data.path : '#/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: scopeUrl('icon-192.png'),
      badge: scopeUrl('icon-192.png'),
      data: { path },
      // The haptic grammar (design 13): one long for an outage, two short for power back.
      vibrate: data.kind === 'restoration' ? [150, 120, 150] : data.kind === 'outage' ? [700] : [200],
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.path ?? '#/';
  const target = scopeUrl(path);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate?.(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
