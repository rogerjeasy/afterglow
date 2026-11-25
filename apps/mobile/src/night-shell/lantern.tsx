import type { cells } from '@afterglow/core';
import type { CSSProperties, ReactNode } from 'react';
import { token } from './theme';

/**
 * The lantern map components. Each cell is a button in a grid; its state is told
 * by fill, border and a glyph, never by hue (night-vision rule 2), and again in
 * words by the legend and the detail card. Semantic tokens only.
 */

type State = cells.CellStateValue;

/** The look of a cell in a state: shared by the map and the legend swatches. */
function cellLook(state: State): CSSProperties {
  switch (state) {
    case 'lit':
      return {
        background: token('control.fill.primary'),
        border: `1px solid ${token('nontext.muted')}`,
      };
    case 'comingBack':
      return {
        background: token('control.fill.primary'),
        border: `1px solid ${token('text.emphasis')}`,
      };
    case 'mixed':
      return {
        background: `repeating-linear-gradient(135deg, ${token('control.fill.primary')} 0 5px, ${token('bg')} 5px 10px)`,
        border: `1px solid ${token('nontext.muted')}`,
      };
    case 'dark':
      return { background: token('bg'), border: `1px solid ${token('hairline')}` };
    case 'unknown':
      return { background: 'transparent', border: `1px dashed ${token('nontext.muted')}` };
  }
}

function Mark({
  size,
  className,
  children,
}: {
  size: number;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A small mark of the state's shape. Dark has none: it is black. */
export function CellGlyph({ state, size = 20 }: { state: State; size?: number }): ReactNode {
  switch (state) {
    case 'lit':
      return (
        <Mark size={size}>
          <circle cx="12" cy="12" r="5" fill="currentColor" />
          <circle cx="12" cy="12" r="9" />
        </Mark>
      );
    case 'comingBack':
      return (
        <Mark size={size} className="breathe">
          <circle cx="12" cy="12" r="4" />
          <circle cx="12" cy="12" r="9" />
        </Mark>
      );
    case 'mixed':
      return (
        <Mark size={size}>
          <path d="M12 7a5 5 0 0 1 0 10z" fill="currentColor" />
          <circle cx="12" cy="12" r="5" />
        </Mark>
      );
    case 'unknown':
      return (
        <Mark size={size}>
          <circle cx="12" cy="12" r="7" strokeDasharray="2 3.5" />
        </Mark>
      );
    case 'dark':
      return null;
  }
}

export interface MapCell {
  readonly id: string;
  readonly col: number;
  readonly row: number;
  readonly state: State;
  /** Text for assistive tech: where the cell is, what state, how many devices. */
  readonly label: string;
  readonly isUser: boolean;
}

export function LanternMap({
  cols,
  rows,
  cells: mapCells,
  selectedId,
  onSelect,
  label,
}: {
  cols: number;
  rows: number;
  cells: readonly MapCell[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
}): ReactNode {
  return (
    <fieldset
      style={{
        margin: 0,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: 6,
        padding: 8,
        borderRadius: 'var(--radius-tile)',
        background: token('surface.1'),
        border: `1px solid ${token('hairline')}`,
      }}
    >
      <legend className="sr-only">{label}</legend>
      {mapCells.map((c) => {
        const selected = c.id === selectedId;
        return (
          <button
            key={c.id}
            type="button"
            className="press lantern-cell"
            onClick={() => onSelect(c.id)}
            aria-pressed={selected}
            aria-label={c.label}
            style={{
              gridColumn: c.col + 1,
              gridRow: c.row + 1,
              position: 'relative',
              width: '100%',
              aspectRatio: '2 / 1',
              minHeight: 44,
              minWidth: 0,
              padding: 0,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: token('icon.primary'),
              outline: selected ? `2px solid ${token('focus.ring')}` : undefined,
              outlineOffset: 2,
              ...cellLook(c.state),
            }}
          >
            <CellGlyph state={c.state} />
            {c.isUser ? (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: 5,
                  top: 5,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: token('text.emphasis'),
                }}
              />
            ) : null}
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * The restoration estimate as a band on a timeline from now: a tick for the
 * provider's promise, a hatched span for the likely range, a bright tick for the
 * estimate. Positions are static layout; nothing animates. The words are in the
 * card around it; this is the glance (design 11.7, "uncertainty band as a hatched region").
 */
export function EstimateBand({
  nowMinute,
  promisedMinute,
  lowMinute,
  atMinute,
  highMinute,
}: {
  nowMinute: number;
  promisedMinute: number;
  lowMinute: number;
  atMinute: number;
  highMinute: number;
}): ReactNode {
  const end = Math.max(promisedMinute, highMinute) + 30;
  const span = Math.max(1, end - nowMinute);
  const pct = (m: number): number => Math.max(0, Math.min(100, ((m - nowMinute) / span) * 100));
  return (
    <div aria-hidden="true" style={{ marginTop: 14 }}>
      <div
        style={{
          position: 'relative',
          height: 20,
          borderRadius: 6,
          background: token('surface.3'),
          border: `1px solid ${token('hairline')}`,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pct(lowMinute)}%`,
            width: `${Math.max(1, pct(highMinute) - pct(lowMinute))}%`,
            background: `repeating-linear-gradient(135deg, ${token('control.fill.primary')} 0 5px, ${token('surface.3')} 5px 10px)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${pct(promisedMinute)}%`,
            width: 2,
            background: token('text.secondary'),
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `calc(${pct(atMinute)}% - 2px)`,
            width: 4,
            background: token('text.emphasis'),
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '4px 14px',
          marginTop: 8,
          fontSize: 'var(--type-caption)',
          color: token('text.secondary'),
        }}
      >
        <span>Thin bar: provider’s promise</span>
        <span>Thick bar: estimate</span>
        <span>Hatched: likely range</span>
      </div>
    </div>
  );
}

const LEGEND: readonly { state: State; word: string }[] = [
  { state: 'lit', word: 'Lit' },
  { state: 'dark', word: 'Dark' },
  { state: 'mixed', word: 'Mixed' },
  { state: 'comingBack', word: 'Coming back' },
  { state: 'unknown', word: 'Unknown: too few reports' },
];

/** The key to the map, in shapes and words. The dot is you. */
export function MapLegend(): ReactNode {
  return (
    <ul
      aria-label="Map key"
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px 16px',
        fontSize: 'var(--type-caption)',
        color: token('text.secondary'),
      }}
    >
      {LEGEND.map((l) => (
        <li key={l.state} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 32,
              height: 20,
              borderRadius: 5,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: token('icon.primary'),
              ...cellLook(l.state),
            }}
          >
            <CellGlyph state={l.state} size={14} />
          </span>
          {l.word}
        </li>
      ))}
      <li style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: token('text.emphasis'),
            margin: '0 12px',
          }}
        />
        Your cell
      </li>
    </ul>
  );
}
