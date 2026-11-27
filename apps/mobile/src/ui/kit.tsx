import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Link } from '../router';
import { Icon, type IconName } from './icons';

/**
 * The shared kit for the redesigned web experience (web-experience spec WX-03).
 * Tailwind utilities on semantic tokens only; motion is opacity and transform.
 */

/** Join class names, dropping falsy ones. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * The mark: a sun that has just set behind the horizon, its afterglow still on the
 * sky. Drawn from tokens, so it dims with the luminance mode like everything else.
 */
export function LogoMark({
  size = 32,
  className,
}: { size?: number; className?: string }): ReactNode {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={cx('block flex-none', className)}
    >
      <defs>
        <radialGradient id={`g${id}`} cx="50%" cy="78%" r="62%">
          <stop offset="0%" style={{ stopColor: 'var(--text-emphasis)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--control-fill-primary)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--bg)' }} />
        </radialGradient>
      </defs>
      <rect x="0.5" y="0.5" width="39" height="39" rx="11" fill={`url(#g${id})`} />
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="39"
        rx="11"
        fill="none"
        style={{ stroke: 'var(--glow)' }}
      />
      <path
        d="M9 27a11 11 0 0 1 22 0"
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{ stroke: 'var(--text-emphasis)' }}
      />
      <path
        d="M6 27h28"
        strokeWidth="2.4"
        strokeLinecap="round"
        style={{ stroke: 'var(--text-emphasis)' }}
      />
      <path
        d="M20 13.5v-4M12.2 16.8l-2.6-2.6M27.8 16.8l2.6-2.6"
        strokeWidth="2"
        strokeLinecap="round"
        style={{ stroke: 'var(--text-secondary)' }}
      />
    </svg>
  );
}

export function Logo({
  to = '/',
  label = 'Afterglow',
}: { to?: string; label?: string }): ReactNode {
  return (
    <Link
      to={to}
      className="group inline-flex min-h-11 items-center gap-3 rounded-xl pr-2 text-emphasis no-underline"
      aria-label={`${label}, home`}
    >
      <LogoMark
        size={34}
        className="transition-transform duration-500 ease-out group-hover:scale-105"
      />
      <span className="font-display text-[24px] font-semibold tracking-[-0.01em]">{label}</span>
    </Link>
  );
}

/** Adds `is-in` once the element scrolls into view; reveal-on-scroll, played once. */
export function useReveal<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}): ReactNode {
  const ref = useReveal<HTMLDivElement>();
  return (
    <Tag
      // biome-ignore lint/suspicious/noExplicitAny: one ref type for the few tags allowed
      ref={ref as any}
      className={cx('reveal', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** A small label above a heading. */
export function Eyebrow({
  children,
  icon,
}: { children: ReactNode; icon?: IconName | undefined }): ReactNode {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-1 px-3.5 py-1.5 text-caption text-secondary">
      {icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </span>
  );
}

const CTA_BASE =
  'press inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full px-7 text-label font-bold no-underline transition-[transform,opacity] duration-200 ease-out';
export const ctaPrimary = cx(
  CTA_BASE,
  'border border-ring bg-control-primary text-control-label hover:-translate-y-0.5',
);
export const ctaSecondary = cx(
  CTA_BASE,
  'border border-hairline bg-control text-primary hover:-translate-y-0.5',
);
export const ctaGhost = cx(CTA_BASE, 'text-secondary hover:text-primary');

export function CtaLink({
  to,
  children,
  variant = 'primary',
  icon,
  className,
}: {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  className?: string;
}): ReactNode {
  const cls =
    variant === 'primary' ? ctaPrimary : variant === 'secondary' ? ctaSecondary : ctaGhost;
  return (
    <Link to={to} className={cx(cls, 'group', className)}>
      {children}
      {icon ? (
        <span className="transition-transform duration-300 ease-out group-hover:translate-x-1">
          <Icon name={icon} size={22} />
        </span>
      ) : null}
    </Link>
  );
}

/** A section heading block for the public pages. */
export function SectionHead({
  eyebrow,
  title,
  lead,
  align = 'left',
  icon,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'left' | 'center';
  icon?: IconName;
}): ReactNode {
  return (
    <Reveal
      className={cx(
        'flex flex-col items-start gap-5',
        align === 'center' && 'items-center text-center',
      )}
    >
      {eyebrow ? <Eyebrow icon={icon}>{eyebrow}</Eyebrow> : null}
      <h2 className="m-0 max-w-[20ch] font-display text-h2 font-medium tracking-[-0.02em] text-emphasis">
        {title}
      </h2>
      {lead ? (
        <p
          className={cx(
            'm-0 max-w-[62ch] text-lead text-secondary',
            align === 'center' && 'mx-auto',
          )}
        >
          {lead}
        </p>
      ) : null}
    </Reveal>
  );
}

/** A live, ticking clock in the outage format (`00:45:12`), from a start time. */
export function useTicker(startMs: number | null, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [startMs, everyMs]);
  return now;
}
