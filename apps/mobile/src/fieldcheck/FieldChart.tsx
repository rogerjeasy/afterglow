import type { ReactNode } from 'react';
import { formatDuration, formatTemp } from '../format';
import { token } from '../night-shell/theme';
import type { ChartData } from './present';

/**
 * A field check drawn like the Graveyard Shift (field-checks FC-09): the model's likely
 * curve (and, for a home, its range), the thermometer's readings as dots, and the line
 * that matters, dashed. Labels are HTML, never SVG text, so none shrinks under 16 px;
 * every mark is also in the words above and in the table below. Nothing animates.
 */

const HEIGHT = 200;

export function FieldChart({ data, label }: { data: ChartData; label: string }): ReactNode {
  const values = [
    ...data.likely.map((p) => p.c),
    ...(data.band ?? []).flatMap((b) => [b.lo, b.hi]),
    ...data.readings.map((r) => r.c),
    data.lineC,
  ];
  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = Math.max(0.5, (hi0 - lo0) * 0.12);
  const lo = lo0 - pad;
  const hi = hi0 + pad;
  const x = (t: number): number => Math.max(0, Math.min(100, (t / data.spanMinutes) * 100));
  const y = (c: number): number => (1 - (c - lo) / (hi - lo)) * 100;

  const likely = data.likely.map((p) => `${x(p.t)},${y(p.c)}`).join(' ');
  const band = data.band
    ? `polygon(${[
        ...data.band.map((b) => `${x(b.t)}% ${y(b.hi)}%`),
        ...[...data.band].reverse().map((b) => `${x(b.t)}% ${y(b.lo)}%`),
      ].join(', ')})`
    : null;
  const inView = data.readings.filter((r) => r.minute <= data.spanMinutes);
  const ambientShown = data.ambientC >= lo && data.ambientC <= hi;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        role="img"
        aria-label={label}
        style={{
          position: 'relative',
          height: HEIGHT,
          borderRadius: 'var(--radius-tile)',
          background: token('surface.1'),
          border: `1px solid ${token('hairline')}`,
          overflow: 'hidden',
        }}
      >
        {band ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: `repeating-linear-gradient(135deg, ${token('control.fill.primary')} 0 5px, transparent 5px 10px)`,
              clipPath: band,
            }}
          />
        ) : null}
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <polyline
            points={likely}
            fill="none"
            stroke={token('text.secondary')}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {ambientShown ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: `${y(data.ambientC)}%`,
              borderTop: `2px dotted ${token('nontext.muted')}`,
            }}
          />
        ) : null}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${y(data.lineC)}%`,
            borderTop: `2px dashed ${token('text.secondary')}`,
          }}
        />
        {inView.map((r) => (
          <div
            key={`${r.minute}-${r.c}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `calc(${x(r.minute)}% - 6px)`,
              top: `calc(${y(r.c)}% - 6px)`,
              width: 12,
              height: 12,
              borderRadius: 6,
              background: token('text.emphasis'),
              border: `2px solid ${token('bg')}`,
            }}
          />
        ))}
      </div>

      <div
        aria-hidden="true"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 'var(--type-caption)',
          color: token('text.secondary'),
        }}
      >
        <span>start</span>
        <span>{formatDuration(data.spanMinutes / 2)}</span>
        <span>{formatDuration(data.spanMinutes)}</span>
      </div>

      <ul
        aria-label="Chart key"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 16px',
          fontSize: 'var(--type-caption)',
          color: token('text.secondary'),
        }}
      >
        <li>Dots: your thermometer</li>
        <li>Line: the model</li>
        {data.band ? <li>Hatched: the model's range</li> : null}
        <li>Dashed: {data.lineLabel}</li>
        {ambientShown ? <li>Dotted: {data.ambientLabel}</li> : null}
      </ul>
    </div>
  );
}

/** The readings beside the model, as a table: the chart's numbers, readable without it. */
export function ReadingsTable({
  rows,
}: {
  rows: readonly { minute: number; measuredC: number; predictedC: number }[];
}): ReactNode {
  if (rows.length === 0) return null;
  const cell = { padding: '6px 8px', textAlign: 'left' as const };
  return (
    <details>
      <summary
        style={{
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          fontSize: 'var(--type-label)',
          color: token('text.primary'),
        }}
      >
        Show the readings as a table
      </summary>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--type-caption)',
          color: token('text.primary'),
        }}
      >
        <thead>
          <tr style={{ color: token('text.secondary') }}>
            <th style={cell}>After</th>
            <th style={cell}>Thermometer</th>
            <th style={cell}>Model</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.minute} style={{ borderTop: `1px solid ${token('hairline')}` }}>
              <td style={cell}>{r.minute < 1 ? 'start' : formatDuration(r.minute)}</td>
              <td style={cell}>{formatTemp(r.measuredC)}</td>
              <td style={cell}>{formatTemp(r.predictedC)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
