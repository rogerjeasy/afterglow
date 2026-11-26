import type { ReactNode } from 'react';
import { token } from './theme';

/**
 * The costume components. Each one encodes a measurement (product principle 6):
 * the tombstone is a cold compartment, its epitaph the time left; the ward is a
 * refused unsafe action.
 */

/**
 * A cold compartment. The stone darkens from surface.3 toward the background as
 * its window runs out (an opacity overlay: opacity is allowed to animate, colour
 * is not invented). Past the window it is "cracked" and the epitaph says why.
 */
export function Tombstone({
  title,
  epitaph,
  caption,
  progress,
  cracked,
  live,
  selected,
  onClick,
}: {
  title: string;
  epitaph: string;
  caption: string;
  /** 0 = fresh, 1 = window used up. */
  progress: number;
  cracked: boolean;
  live: boolean;
  selected: boolean;
  onClick: () => void;
}): ReactNode {
  const dark = Math.min(1, Math.max(0, progress));
  return (
    <button
      type="button"
      className="press"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${title}. ${epitaph}. ${caption}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
        minWidth: 0,
        minHeight: 148,
        padding: '18px 16px 16px',
        // The one asymmetric shape in the system: a 24 px arch over a square base.
        borderRadius: '24px 24px 0 0',
        // Longhands only, so the live top edge and the selection ring never fight on rerender.
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: selected ? token('focus.ring') : token('hairline'),
        borderTopColor: live ? token('glow') : selected ? token('focus.ring') : token('hairline'),
        background: token('surface.3'),
        color: token('text.primary'),
        fontSize: 'var(--type-body)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: token('bg'),
          opacity: dark,
          pointerEvents: 'none',
        }}
      />
      <span style={{ position: 'relative', display: 'block' }}>
        <span
          style={{
            display: 'block',
            fontSize: 'var(--type-label)',
            color: token('text.secondary'),
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </span>
        <span
          className="clock"
          style={{
            display: 'block',
            marginTop: 10,
            fontSize: 'var(--type-clock-lg)',
            lineHeight: 1.1,
            color: token('text.emphasis'),
            overflowWrap: 'anywhere',
          }}
        >
          {epitaph}
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 8,
            fontSize: 'var(--type-caption)',
            color: token('text.secondary'),
            overflowWrap: 'anywhere',
          }}
        >
          {caption}
        </span>
      </span>
      {cracked ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 48 48"
          width="40"
          height="40"
          fill="none"
          stroke={token('text.secondary')}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: 'absolute', right: 10, top: 10 }}
        >
          <path d="M24 4l-4 12 8 6-6 8 4 14" />
        </svg>
      ) : null}
    </button>
  );
}

/**
 * The ward: a refused unsafe action. A bar closes across the card and the
 * explanation stays until the condition is met (design 7.3, 8.3).
 */
export function WardCard({
  title,
  refusal,
  children,
}: {
  title: string;
  refusal: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '16px',
        borderRadius: 'var(--radius-tile)',
        background: token('surface.2'),
        border: `1px solid ${token('hairline')}`,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>{title}</div>
      <div
        style={{
          marginTop: 8,
          fontSize: 'var(--type-body)',
          color: token('text.primary'),
          overflowWrap: 'anywhere',
        }}
      >
        {refusal}
      </div>
      {/* The closed bar: a full-width rule that stays across the card. */}
      <div
        className="ward-bar"
        aria-hidden="true"
        style={{
          height: 6,
          marginTop: 14,
          borderRadius: 3,
          background: token('focus.ring'),
        }}
      />
      {children ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

/**
 * A candle: one store of energy. The wax is the charge it starts with; the
 * bright line is what is left after the plan. The flame is out when nothing is
 * left. It encodes two numbers and nothing else (costume is function), and it
 * does not animate: the only ambient animation is the Hearth flame.
 */
export function Candle({
  startPct,
  afterPct,
  label,
}: {
  startPct: number;
  afterPct: number;
  label: string;
}): ReactNode {
  const clamp = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0);
  const start = clamp(startPct);
  const after = clamp(afterPct);
  return (
    <div
      role="img"
      aria-label={`${label}: ${Math.round(start)} percent now, ${Math.round(after)} percent after the plan`}
      style={{
        flex: 'none',
        width: 28,
        height: 72,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        border: `2px solid ${token('hairline')}`,
        borderRadius: '4px 4px 2px 2px',
        overflow: 'hidden',
        background: token('surface.1'),
      }}
    >
      <div style={{ height: `${start}%`, background: token('control.fill.primary') }} />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: `${after}%`,
          height: 2,
          background: token('text.emphasis'),
          opacity: after > 0 ? 1 : 0,
        }}
      />
    </div>
  );
}
