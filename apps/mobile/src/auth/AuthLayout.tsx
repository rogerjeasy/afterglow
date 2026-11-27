import type { LuminanceMode } from '@afterglow/design-system';
import { type ReactNode, useEffect } from 'react';
import { ModeSwitch } from '../night-shell/components';
import { applyMode } from '../night-shell/theme';
import { Link } from '../router';
import { setSiteMode, useSiteMode } from '../site/SiteLayout';
import { Icon, type IconName } from '../ui/icons';
import { Logo, cx } from '../ui/kit';

/**
 * The frame for signing in and creating an account (web-experience WX-08): a brand
 * panel beside the form on a desk, one calm column on a phone. Same tokens, same
 * luminance modes as the rest of the site.
 */

const CYCLE: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

const TRUST: readonly { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'key',
    title: 'Zero-knowledge encryption',
    body: 'Your household is encrypted on this device. The server keeps ciphertext it cannot read.',
  },
  {
    icon: 'cloudOff',
    title: 'Works with no network',
    body: 'Every clock and every answer runs offline, signed in or not.',
  },
  {
    icon: 'heart',
    title: 'Free for every household',
    body: 'Safety is free, forever, without ads. No account is needed to use it.',
  },
];

export function AuthLayout({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: ReactNode | undefined;
  children: ReactNode;
  /** The line under the card: "New here? Create an account". */
  footer?: ReactNode | undefined;
}): ReactNode {
  const mode = useSiteMode();
  // The auth pages share the site's luminance mode; arriving from the app resets the tokens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: applies the mode once, on mount
  useEffect(() => {
    applyMode(mode);
  }, []);
  const cycle = (): void =>
    setSiteMode(CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length] as LuminanceMode);

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-bg text-primary lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ------------------------------------------------------------ brand panel */}
      <aside
        aria-label="Why Afterglow"
        className="relative hidden overflow-hidden border-r border-hairline bg-surface-1 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start"
      >
        <div
          aria-hidden="true"
          className="halo pointer-events-none absolute -bottom-1/4 -left-1/4 h-[90%] w-[110%] opacity-90"
        />
        <div
          aria-hidden="true"
          className="dot-grid pointer-events-none absolute inset-0 opacity-70 [mask-image:radial-gradient(ellipse_at_top_left,black_10%,transparent_65%)]"
        />
        <div className="relative flex h-full flex-col justify-between gap-12 p-10 xl:p-14">
          <Logo />
          <div className="flex flex-col gap-10">
            <p className="m-0 max-w-[16ch] animate-rise font-display text-h2 font-medium tracking-[-0.025em] text-emphasis">
              Be ready <span className="text-ember italic">before</span> the dark.
            </p>
            <ul className="m-0 flex list-none flex-col gap-6 p-0">
              {TRUST.map((t, i) => (
                <li
                  key={t.title}
                  className="flex animate-rise items-start gap-4"
                  style={{ animationDelay: `${120 + i * 90}ms` }}
                >
                  <span className="flex size-11 flex-none items-center justify-center rounded-xl border border-hairline bg-surface-2 text-emphasis">
                    <Icon name={t.icon} size={22} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-label font-bold text-primary">{t.title}</span>
                    <span className="max-w-[44ch] text-caption text-secondary">{t.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="m-0 text-caption text-muted">
            Open source under Apache-2.0 · Red on pure black, under a measured luminance ceiling.
          </p>
        </div>
      </aside>

      {/* ------------------------------------------------------------------- form */}
      <div className="relative flex min-h-dvh min-w-0 flex-col">
        <header className="flex h-[72px] flex-none items-center justify-between gap-3 px-5 sm:px-8 lg:px-12">
          <span className="lg:invisible">
            <Logo />
          </span>
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="hidden min-h-11 items-center gap-2 rounded-full px-3 text-caption whitespace-nowrap text-secondary no-underline transition-colors hover:text-primary sm:inline-flex"
            >
              <span className="rotate-180">
                <Icon name="arrowRight" size={18} />
              </span>
              Back to the site
            </Link>
            <span className="hidden sm:inline-flex">
              <ModeSwitch mode={mode} onCycle={cycle} />
            </span>
            <span className="sm:hidden">
              <ModeSwitch mode={mode} onCycle={cycle} compact />
            </span>
          </div>
        </header>

        <main
          id="content"
          className="flex flex-1 items-start justify-center px-5 pt-4 pb-16 sm:px-8 sm:pt-10 lg:items-center lg:px-12"
        >
          <div className="w-full max-w-[480px] animate-rise">
            <h1 className="m-0 font-display text-display font-medium tracking-[-0.02em] text-emphasis">
              {title}
            </h1>
            {lead ? <p className="m-0 mt-3 text-body text-secondary">{lead}</p> : null}
            <div className={cx('card mt-8 flex flex-col gap-5 p-5 sm:p-7')}>{children}</div>
            {footer ? (
              <div className="mt-6 flex flex-col items-center gap-1 text-center text-caption text-secondary">
                {footer}
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
