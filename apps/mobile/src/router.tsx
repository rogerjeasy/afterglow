import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useSyncExternalStore,
} from 'react';

/**
 * A small history router (web-experience spec WX-01). Real paths, never `#/...`:
 * the public site lives at `/`, `/features`, ... and the signed-in product at
 * `/app/...`. The build can be hosted at a domain root or under a subpath
 * (GitHub Pages), so every path here is relative to Vite's BASE_URL.
 */

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');

/** The path inside the app, without the base, always starting with `/` and with no trailing slash. */
export function currentPath(): string {
  let p = window.location.pathname;
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
  if (p === '' || p === '/index.html') return '/';
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/** A full href for an in-app path, with the hosting base in front. */
export function href(to: string): string {
  return `${BASE}${to.startsWith('/') ? to : `/${to}`}`;
}

const listeners = new Set<() => void>();
const notify = (): void => {
  for (const l of listeners) l();
};

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (listeners.size === 1) window.addEventListener('popstate', notify);
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) window.removeEventListener('popstate', notify);
  };
}

const snapshot = (): string => `${currentPath()}${window.location.search}`;

/** The current path and query (`/app/cold?x=1`); re-renders on every navigation. */
export function useLocation(): { path: string; search: string } {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const i = s.indexOf('?');
  return i < 0 ? { path: s, search: '' } : { path: s.slice(0, i), search: s.slice(i) };
}

/** Go to an in-app path. Scrolls to the top unless only the query changed. */
export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}): void {
  const before = currentPath();
  const target = href(to);
  if (opts.replace) window.history.replaceState(null, '', target);
  else window.history.pushState(null, '', target);
  notify();
  if (!opts.keepScroll && currentPath() !== before) window.scrollTo({ top: 0 });
}

/**
 * Links written before real paths existed (`#/cold`, `#/welcome`, `?tour=1` at the
 * root) keep working: README links, push notifications and printed QR codes all
 * land where they meant to. Runs once, before the first render.
 */
export function redirectLegacy(): void {
  const { hash, search } = window.location;
  const path = currentPath();
  if (hash.startsWith('#/')) {
    // An invitation link carries its offer in the hash; keep it for the Séance to read.
    if (hash.startsWith('#/seance/pair?')) {
      window.history.replaceState(null, '', `${href('/app/seance')}${search}${hash}`);
      return;
    }
    const name = hash.slice(2).split(/[/?]/)[0] ?? '';
    const map: Record<string, string> = {
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
    window.history.replaceState(null, '', `${href(map[name] ?? '/app')}${search}`);
    return;
  }
  // Deep links for the tour and a blackout in progress open the product, not the site.
  if (path === '/') {
    const q = new URLSearchParams(search);
    if (q.get('tour') === '1' || q.get('phase') === 'outage') {
      window.history.replaceState(null, '', `${href('/app')}${search}`);
    }
  }
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  children: ReactNode;
};

/** An anchor that navigates in place; modified clicks (new tab, etc.) behave as normal links. */
export function Link({ to, children, onClick, ...rest }: LinkProps): ReactNode {
  const handle = (e: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if (rest.target && rest.target !== '_self') return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={href(to)} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
