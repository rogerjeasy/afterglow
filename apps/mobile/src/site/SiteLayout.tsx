import type { LuminanceMode } from '@afterglow/design-system';
import { type ReactNode, useEffect, useState } from 'react';
import { ModeSwitch } from '../night-shell/components';
import { applyMode } from '../night-shell/theme';
import { Link, useLocation } from '../router';
import { Icon } from '../ui/icons';
import { Logo, LogoMark, cx } from '../ui/kit';

/**
 * The public site's frame (web-experience WX-04): real pages at real paths, a header
 * that settles onto a surface as you scroll, a full-screen menu on phones, and a
 * footer. The site opens in Ember (a lit room); the mode switch dims the whole page.
 */

/** The three pages a household needs before trying it. Everything else is in the footer. */
export const SITE_NAV: readonly { to: string; label: string }[] = [
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/science', label: 'Science & privacy' },
];

/** Pages for organisations and buyers: in the phone menu's second group and the footer. */
const SECONDARY_NAV: readonly { to: string; label: string }[] = [
  { to: '/organisations', label: 'For organisations' },
  { to: '/pricing', label: 'Pricing' },
];

const CYCLE: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

/** The site's luminance mode, shared so a page section can switch it too. */
let siteMode: LuminanceMode = 'ember';
const modeListeners = new Set<(m: LuminanceMode) => void>();
export function setSiteMode(m: LuminanceMode): void {
  siteMode = m;
  applyMode(m);
  for (const l of modeListeners) l(m);
}
export function useSiteMode(): LuminanceMode {
  const [m, setM] = useState<LuminanceMode>(siteMode);
  useEffect(() => {
    modeListeners.add(setM);
    return () => {
      modeListeners.delete(setM);
    };
  }, []);
  return m;
}

function useScrolled(threshold = 12): boolean {
  const [s, setS] = useState(false);
  useEffect(() => {
    const on = (): void => setS(window.scrollY > threshold);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return s;
}

function MobileMenu({
  open,
  onClose,
  path,
}: { open: boolean; onClose: () => void; path: string }): ReactNode {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  return (
    <div
      id="site-menu"
      aria-hidden={!open}
      className={cx(
        'fixed inset-0 top-[72px] z-30 overflow-y-auto bg-bg transition-[opacity,transform] duration-300 ease-out lg:hidden',
        open
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none -translate-y-2 opacity-0',
      )}
    >
      <nav aria-label="Site" className="container-x flex flex-col gap-1 pt-6 pb-12">
        {SITE_NAV.map((n, i) => (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            aria-current={path === n.to ? 'page' : undefined}
            className={cx(
              'flex min-h-16 items-center justify-between border-b border-hairline font-display text-[30px] text-primary no-underline transition-[opacity,transform] duration-500 ease-out',
              open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
            )}
            style={{ transitionDelay: open ? `${60 + i * 40}ms` : '0ms' }}
          >
            {n.label}
            <Icon name="arrowRight" size={24} className="block text-secondary" />
          </Link>
        ))}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
          {SECONDARY_NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={onClose}
              tabIndex={open ? 0 : -1}
              aria-current={path === n.to ? 'page' : undefined}
              className="inline-flex min-h-11 items-center text-label text-secondary no-underline hover:text-primary"
            >
              {n.label}
            </Link>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            to="/app?tour=1"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className="press inline-flex min-h-14 items-center justify-center rounded-full border border-hairline bg-control text-label font-bold text-primary no-underline"
          >
            Take the tour
          </Link>
          <Link
            to="/app"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className="press inline-flex min-h-14 items-center justify-center rounded-full border border-ring bg-control-primary text-label font-bold text-control-label no-underline"
          >
            Open the app
          </Link>
          <Link
            to="/signin"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className="press inline-flex min-h-14 items-center justify-center rounded-full border border-hairline bg-control text-label font-bold text-primary no-underline"
          >
            Sign in
          </Link>
        </div>
      </nav>
    </div>
  );
}

function Header(): ReactNode {
  const { path } = useLocation();
  const scrolled = useScrolled();
  const mode = useSiteMode();
  const [open, setOpen] = useState(false);
  // A navigation closes the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on every path change
  useEffect(() => setOpen(false), [path]);
  const cycle = (): void =>
    setSiteMode(CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length] as LuminanceMode);

  return (
    <>
      <header
        className={cx(
          'sticky top-0 z-40 border-b transition-colors duration-300',
          scrolled || open
            ? 'border-hairline bg-bg/85 backdrop-blur-md'
            : 'border-transparent bg-transparent',
        )}
      >
        <div className="container-x flex h-[72px] items-center justify-between gap-4">
          <Logo />
          <nav aria-label="Site" className="hidden items-center gap-0.5 lg:flex">
            {SITE_NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-current={path === n.to ? 'page' : undefined}
                className={cx(
                  'nav-link inline-flex min-h-11 items-center rounded-full px-3 text-caption whitespace-nowrap no-underline transition-colors duration-200 xl:px-4',
                  path === n.to ? 'text-emphasis' : 'text-secondary hover:text-primary',
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <ModeSwitch mode={mode} onCycle={cycle} />
            </span>
            <span className="sm:hidden">
              <ModeSwitch mode={mode} onCycle={cycle} compact />
            </span>
            <Link
              to="/signin"
              className="hidden min-h-11 items-center rounded-full px-3 text-caption whitespace-nowrap text-secondary no-underline transition-colors hover:text-primary lg:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/app"
              className="press hidden min-h-11 items-center gap-2 rounded-full border border-ring bg-control-primary px-5 text-caption font-bold whitespace-nowrap text-control-label no-underline transition-transform duration-200 hover:-translate-y-px sm:inline-flex"
            >
              Open the app
            </Link>
            <button
              type="button"
              className="press flex size-11 items-center justify-center rounded-full border border-hairline bg-control text-primary lg:hidden"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              onClick={() => setOpen((o) => !o)}
            >
              <Icon name={open ? 'close' : 'menu'} size={22} />
            </button>
          </div>
        </div>
      </header>
      <MobileMenu open={open} onClose={() => setOpen(false)} path={path} />
    </>
  );
}

const FOOTER: readonly {
  title: string;
  links: readonly { to: string; label: string; external?: boolean }[];
}[] = [
  {
    title: 'Product',
    links: [
      { to: '/features', label: 'Features' },
      { to: '/how-it-works', label: 'How it works' },
      { to: '/pricing', label: 'Pricing' },
      { to: '/app?tour=1', label: 'Take the tour' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { to: '/science', label: 'The science' },
      { to: '/science#privacy', label: 'Privacy by construction' },
      { to: '/science#sources', label: 'Data sources' },
    ],
  },
  {
    title: 'Organisations',
    links: [
      { to: '/organisations#business', label: 'Afterglow Business' },
      { to: '/organisations#beacon', label: 'Afterglow Beacon' },
      { to: '/organisations#voice', label: 'Voice for feature phones' },
    ],
  },
  {
    title: 'Open source',
    links: [
      { to: 'https://github.com/rogerjeasy/afterglow', label: 'Source code', external: true },
      {
        to: 'https://github.com/rogerjeasy/afterglow/tree/main/.kiro',
        label: 'How it was built with Kiro',
        external: true,
      },
      {
        to: 'https://github.com/rogerjeasy/afterglow/blob/main/docs/kiro/session-evidence.md',
        label: 'What was built where',
        external: true,
      },
      { to: '/openapi.json', label: 'Platform API', external: true },
    ],
  },
];

function Footer(): ReactNode {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-hairline bg-surface-1">
      <div
        aria-hidden="true"
        className="halo-soft pointer-events-none absolute -bottom-1/2 left-1/2 h-[120%] w-[90%] -translate-x-1/2 opacity-60"
      />
      <div className="container-x relative grid gap-12 py-16 lg:grid-cols-[1.4fr_repeat(4,1fr)] lg:gap-8">
        <div className="flex max-w-sm flex-col gap-5">
          <div className="flex items-center gap-3 text-emphasis">
            <LogoMark size={40} />
            <span className="font-display text-[28px] font-semibold">Afterglow</span>
          </div>
          <p className="m-0 text-label text-secondary">
            The only app you can read when the grid dies. Free for every household, open source
            under Apache-2.0.
          </p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title} className="flex flex-col gap-1">
            <h2 className="m-0 mb-2 text-caption font-bold text-primary">{col.title}</h2>
            {col.links.map((l) =>
              l.external ? (
                <a
                  key={l.label}
                  href={
                    l.to.startsWith('http') ? l.to : `${import.meta.env.BASE_URL}${l.to.slice(1)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-caption text-secondary no-underline transition-colors hover:text-primary"
                >
                  {l.label}
                  <Icon name="arrowUpRight" size={16} />
                </a>
              ) : (
                <Link
                  key={l.label}
                  to={l.to}
                  className="inline-flex min-h-11 items-center text-caption text-secondary no-underline transition-colors hover:text-primary"
                >
                  {l.label}
                </Link>
              ),
            )}
          </div>
        ))}
      </div>
      <div className="container-x relative">
        <div
          aria-hidden="true"
          className="select-none pb-4 font-display text-giant leading-none font-semibold tracking-[-0.04em] text-ember opacity-60"
        >
          Afterglow
        </div>
      </div>
      <div className="container-x relative flex flex-col gap-3 border-t border-hairline py-6 text-caption text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>Built for Kiroween 2026 · Costume Contest</span>
        <span>Red on pure black, under a measured luminance ceiling.</span>
      </div>
    </footer>
  );
}

export function SiteLayout({ children }: { children: ReactNode }): ReactNode {
  const { path } = useLocation();
  // The site always opens in the mode it was left in; arriving from the app resets the tokens.
  useEffect(() => {
    applyMode(siteMode);
  }, []);
  // Jump to an in-page anchor after a navigation (`/science#privacy`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each path change
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const t = window.setTimeout(() => document.getElementById(id)?.scrollIntoView(), 60);
    return () => window.clearTimeout(t);
  }, [path]);
  return (
    <div className="relative min-h-dvh overflow-x-clip bg-bg text-primary">
      <a
        href="#content"
        className="sr-only z-50 rounded-full bg-control-primary px-4 py-2 text-control-label focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Header />
      <main id="content" key={path} className="page-enter">
        {children}
      </main>
      <Footer />
    </div>
  );
}
