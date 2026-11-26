import { type CSSProperties, type ReactNode, useId, useState } from 'react';
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
  return (
    <div
      data-tour={tourId}
      style={{
        padding: '20px',
        borderRadius: 'var(--radius-tile)',
        background: token('surface.1'),
        borderTop: live ? `1px solid ${token('glow')}` : undefined,
      }}
    >
      <div
        className="clock"
        style={{
          fontSize: 'var(--type-clock-xl)',
          lineHeight: 1,
          color: token('text.emphasis'),
        }}
      >
        {timer}
      </div>
      <div
        style={{
          marginTop: 12,
          fontSize: 'var(--type-body)',
          overflowWrap: 'anywhere',
        }}
      >
        {line}
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
      <span
        style={{ display: 'block', fontSize: 'var(--type-label)', color: token('text.secondary') }}
      >
        {title}
      </span>
      <span
        className="clock"
        style={{
          display: 'block',
          marginTop: 8,
          fontSize: 'var(--type-clock-lg)',
          color: token('text.primary'),
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
      {visual ? (
        <span
          aria-hidden="true"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}
        >
          {visual}
        </span>
      ) : null}
      {note ? (
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontSize: 'var(--type-caption)',
            color: token('text.secondary'),
            overflowWrap: 'anywhere',
          }}
        >
          {note}
        </span>
      ) : null}
    </>
  );
  const frame: CSSProperties = {
    padding: '16px',
    borderRadius: 'var(--radius-tile)',
    background: token('surface.2'),
    // Longhands only: mixing `border` and `borderTop` makes React warn and can drop the edge on rerender.
    borderStyle: 'solid',
    borderWidth: '1px 0 0 0',
    borderColor: live ? token('glow') : 'transparent',
    minWidth: 0,
    textAlign: 'left',
    // Top-aligned content, so tiles in a row line up.
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  };
  // The tappable area and the source control are siblings, never nested buttons.
  return (
    <div data-tour={tourId} style={frame}>
      {onClick ? (
        <button
          type="button"
          className="press"
          onClick={onClick}
          style={{
            display: 'block',
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'transparent',
            textAlign: 'left',
            color: 'inherit',
            font: 'inherit',
            minHeight: 44,
          }}
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
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        className="press"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        style={{
          minHeight: 44,
          padding: '0 12px',
          borderRadius: 22,
          borderStyle: 'solid',
          borderWidth: 1,
          borderColor: summary.usesDefaults ? token('focus.ring') : token('hairline'),
          background: 'transparent',
          color: token('text.secondary'),
          font: 'inherit',
          fontSize: 'var(--type-caption)',
          cursor: 'pointer',
        }}
      >
        {summary.label} {open ? '▴' : '▾'}
      </button>
      {open ? (
        <div id={id} data-sources="open" style={{ marginTop: 4 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {labels.map((label) => (
              <SourceChip key={label} label={label} />
            ))}
          </div>
          {children ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 'var(--type-caption)',
                color: token('text.secondary'),
              }}
            >
              {children}
            </div>
          ) : null}
          {link ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginTop: 6,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 'var(--type-caption)',
                color: token('text.secondary'),
              }}
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
    <span
      style={{
        display: 'inline-block',
        marginTop: 10,
        padding: '4px 10px',
        borderRadius: 14,
        fontSize: 'var(--type-caption)',
        color: token('text.secondary'),
        border: `1px solid ${token('hairline')}`,
      }}
    >
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

export function ModeSwitch({
  mode,
  onCycle,
}: {
  mode: string;
  onCycle: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Luminance mode: ${mode}. Tap to change.`}
      style={{
        minHeight: 44,
        padding: '0 14px',
        borderRadius: 999,
        border: `1px solid ${token('hairline')}`,
        background: token('control.fill'),
        color: token('text.secondary'),
        fontSize: 'var(--type-caption)',
        textTransform: 'capitalize',
      }}
    >
      ● {mode}
    </button>
  );
}
