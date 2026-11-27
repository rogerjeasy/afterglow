import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { cx } from './kit';

/**
 * The frame every product screen sits in (web-experience WX-06): one column on a
 * phone, a wide responsive canvas on a desk, cleared of the tab bar at the bottom.
 */
export function Page({
  children,
  width = 'wide',
  className,
}: {
  children: ReactNode;
  /** `narrow` for reading and forms, `wide` for dashboards. */
  width?: 'narrow' | 'wide' | undefined;
  className?: string | undefined;
}): ReactNode {
  return (
    <main
      className={cx(
        'page-enter mx-auto flex w-full min-w-0 flex-col gap-6 px-5 pt-3 pb-28 sm:gap-8 sm:px-8 lg:px-10 lg:pt-8 lg:pb-20',
        width === 'narrow' ? 'max-w-[820px]' : 'max-w-[1240px]',
        className,
      )}
    >
      {children}
    </main>
  );
}

/** A screen's title block: kicker, title, one plain line, and the screen's own actions. */
export function PageHeader({
  title,
  lead,
  eyebrow,
  icon,
  actions,
  compact,
}: {
  title: string;
  /** On a phone, show only the title: for screens whose lead is said again below. */
  compact?: boolean | undefined;
  lead?: ReactNode | undefined;
  eyebrow?: string | undefined;
  icon?: IconName | undefined;
  actions?: ReactNode | undefined;
}): ReactNode {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <div
            className={cx(
              'mb-3 items-center gap-2 text-caption text-secondary',
              compact ? 'hidden sm:flex' : 'flex',
            )}
          >
            {icon ? <Icon name={icon} size={20} /> : null}
            <span>{eyebrow}</span>
          </div>
        ) : null}
        <h1 className="m-0 font-display text-display font-medium tracking-[-0.02em] text-emphasis">
          {title}
        </h1>
        {lead ? (
          <p
            className={cx(
              'm-0 mt-3 max-w-[62ch] text-body text-secondary',
              compact && 'hidden sm:block',
            )}
          >
            {lead}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-none flex-wrap gap-2.5">{actions}</div> : null}
    </header>
  );
}

/** A framed panel on the first surface tier, with an optional heading row. */
export function Panel({
  title,
  icon,
  right,
  children,
  className,
  live,
  tourId,
}: {
  title?: string | undefined;
  icon?: IconName | undefined;
  right?: ReactNode | undefined;
  children: ReactNode;
  className?: string | undefined;
  live?: boolean | undefined;
  tourId?: string | undefined;
}): ReactNode {
  return (
    <section
      data-tour={tourId}
      // Frameless on a phone (every pixel of width goes to the content), a framed card from `sm`.
      className={cx(
        'flex min-w-0 flex-col gap-4 sm:rounded-[24px] sm:border sm:border-hairline sm:bg-surface-1 sm:p-6',
        live && 'sm:border-t-glow',
        className,
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 flex items-center gap-2.5 text-headline font-bold text-emphasis">
            {icon ? (
              <span className="flex size-9 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-icon">
                <Icon name={icon} size={20} />
              </span>
            ) : null}
            {title}
          </h2>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}
