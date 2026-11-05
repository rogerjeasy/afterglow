import type { CSSProperties, ReactNode } from 'react';
import { token } from './theme';

/**
 * Night Shell primitives. Every colour is a semantic token via token(); no raw
 * hex appears here (NS-05). Depth is surface tiers + hairline + ember edge.
 */

export function StatusLine({
  timer,
  line,
  live,
}: {
  timer: string;
  line: string;
  live?: boolean;
}): ReactNode {
  return (
    <div
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
  source,
  live,
}: {
  title: string;
  value: string;
  source?: string;
  live?: boolean;
}): ReactNode {
  return (
    <div
      style={{
        padding: '16px',
        borderRadius: 'var(--radius-tile)',
        background: token('surface.2'),
        borderTop: live ? `1px solid ${token('glow')}` : '1px solid transparent',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 'var(--type-label)',
          color: token('text.secondary'),
        }}
      >
        {title}
      </div>
      <div
        className="clock"
        style={{
          marginTop: 8,
          fontSize: 'var(--type-clock-lg)',
          color: token('text.primary'),
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
      {source ? <SourceChip label={source} /> : null}
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
        borderRadius: 999,
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
