import { type CSSProperties, type ReactNode, useId, useState } from 'react';
import { cx } from '../ui/kit';
import { sourcesSummary } from './sources';
import { token } from './theme';

/**
 * Night Shell primitives. Every colour is a semantic token via token(); no raw
 * hex appears here (NS-05). Depth is surface tiers + hairline + ember edge.
 */

export function StatusLine({
  timer,
  line,
  live,
  tourId,
}: {
  timer: string;
  line: string;
  live?: boolean;
  /** The guide's anchor for this element (`data-tour`). */
  tourId?: string;
}): ReactNode {
  // "GRID DOWN 00:45:12": the words as a label over one large clock, so it never wraps.
  const split = /^(.+) (\d{2,}:\d{2}:\d{2})$/.exec(timer);
  return (
    <div
      data-tour={tourId}
      className={cx(
        'relative overflow-hidden rounded-[28px] border border-hairline bg-surface-1 p-5 sm:p-8',
        live && 'border-t-glow',
      )}
    >
      {/* The ember halo behind the clock: light, never a shadow (night-vision rule 8). */}
      <div aria-hidden="true" className="halo-corner pointer-events-none absolute inset-0" />
      <div className="relative">
        {split ? (
          <>
            {/* One text run ("GRID DOWN 00:45:12") for readers and search, set as label and clock. */}
            <div>
              <span className="block text-label font-bold tracking-[0.08em] text-secondary">
                {split[1]}
              </span>{' '}
              <span className="clock mt-1 block text-[length:var(--type-clock-xl)] leading-none tracking-[-0.01em] text-emphasis">
                {split[2]}
              </span>
            </div>
          </>
        ) : (
          <div className="clock text-[length:var(--type-clock-xl)] leading-none tracking-[-0.01em] text-emphasis">
            {timer}
          </div>
        )}
        <div className="mt-3 max-w-[60ch] text-body [overflow-wrap:anywhere] sm:mt-4">{line}</div>
      </div>
    </div>
  );
}

export function Tile({
  title,
  value,
  note,
  sources,
  live,
  onClick,
  tourId,
  visual,
}: {
  title: string;
  value: string;
  /** A costume row under the number that encodes the same data (NS-16); decorative to screen readers. */
  visual?: ReactNode;
  /** One plain-language line under the number. */
  note?: string;
  /** Where the number comes from; every number shows its source (one tap away, NS-13). */
  sources?: readonly string[];
  live?: boolean;
  onClick?: () => void;
  /** The guide's anchor for this element (`data-tour`). */
  tourId?: string | undefined;
}): ReactNode {
  const body = (
    <>
      <span className="block text-label text-secondary">{title}</span>
      <span className="clock mt-2 block text-[length:var(--type-clock-lg)] leading-tight text-primary [overflow-wrap:anywhere]">
        {value}
      </span>
      {visual ? (
        <span aria-hidden="true" className="mt-2.5 flex flex-wrap gap-1.5">
          {visual}
        </span>
      ) : null}
      {note ? (
        <span className="mt-1.5 block text-caption text-secondary [overflow-wrap:anywhere]">
          {note}
        </span>
      ) : null}
    </>
  );
  // The tappable area and the source control are siblings, never nested buttons.
  return (
    <div
      data-tour={tourId}
      className={cx(
        'group/tile flex h-full min-w-0 flex-col items-stretch justify-start rounded-[var(--radius-tile)] border border-hairline bg-surface-2 p-4 text-left transition-transform duration-300 ease-out sm:p-5',
        live && 'border-t-glow',
        onClick && 'hover:-translate-y-0.5',
      )}
    >
      {onClick ? (
        <button
          type="button"
          className="press block min-h-11 w-full border-none bg-transparent p-0 text-left text-inherit [font:inherit]"
          onClick={onClick}
        >
          {body}
        </button>
      ) : (
        <div>{body}</div>
      )}
      {sources && sources.length > 0 ? <Sources labels={sources} /> : null}
    </div>
  );
}

/**
 * The working behind a number, one tap away (NS-13; design 8.3). Closed, it says
 * "How I know", and "uses defaults" whenever a default is in play, so a default is
 * never hidden (fail-closed rule 6). Open, it lists every source with its version.
 */
export function Sources({
  labels,
  link,
  children,
}: {
  labels: readonly string[];
  link?: { readonly href: string; readonly label: string } | undefined;
  /** Extra lines shown when open: the rule's details, management actions. */
  children?: ReactNode;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  const summary = sourcesSummary(labels);
  return (
    <div className="mt-2.5">
      <button
        type="button"
        className={cx(
          'press inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-solid bg-transparent px-3 text-caption text-secondary transition-colors duration-200 hover:text-primary',
          summary.usesDefaults ? 'border-ring' : 'border-hairline',
        )}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {summary.label} {open ? '▴' : '▾'}
      </button>
      {open ? (
        <div id={id} data-sources="open" className="mt-1 animate-fade">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((label) => (
              <SourceChip key={label} label={label} />
            ))}
          </div>
          {children ? <div className="mt-2.5 text-caption text-secondary">{children}</div> : null}
          {link ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex min-h-11 items-center text-caption text-secondary"
            >
              {link.label}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SourceChip({ label }: { label: string }): ReactNode {
  return (
    <span className="mt-2.5 inline-block rounded-full border border-hairline px-2.5 py-1 text-caption text-secondary">
      {label}
    </span>
  );
}

export function PrimaryButton({
  children,
  onClick,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        minHeight: 72,
        borderRadius: 999,
        border: `1px solid ${token('focus.ring')}`,
        background: token('control.fill.primary'),
        color: token('control.label.primary'),
        fontSize: 'var(--type-label)',
        letterSpacing: 'inherit',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

const MODE_LEVEL: Record<string, number> = { night: 1, dusk: 2, ember: 3 };

/**
 * The luminance mode switch: three bars light up to the mode's level, and the
 * name says it in words. The label is the contract the pixel scan drives.
 */
export function ModeSwitch({
  mode,
  onCycle,
  compact = false,
}: {
  mode: string;
  onCycle: () => void;
  /** Bars only, for the tightest headers; the name stays in the label. */
  compact?: boolean;
}): ReactNode {
  const level = MODE_LEVEL[mode] ?? 0;
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Luminance mode: ${mode}. Tap to change.`}
      title="Change how bright Afterglow is"
      className="press inline-flex min-h-11 flex-none items-center gap-2.5 rounded-full border border-hairline bg-control px-3.5 text-caption text-secondary capitalize transition-colors duration-200 hover:text-primary"
    >
      <span aria-hidden="true" className="flex h-4 items-end gap-[3px]">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cx(
              'w-[4px] rounded-full transition-opacity duration-300',
              n <= level ? 'bg-emphasis opacity-100' : 'bg-muted opacity-60',
            )}
            style={{ height: `${6 + n * 3}px` }}
          />
        ))}
      </span>
      {compact ? null : <span>{mode}</span>}
    </button>
  );
}
