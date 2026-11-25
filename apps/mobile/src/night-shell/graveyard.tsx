import type { household } from '@afterglow/core';
import type { ReactNode } from 'react';
import { formatTemp } from '../format';
import { axisTicks, nightRows, nightText, yScale } from '../plan/graveyard';
import { token } from './theme';

/**
 * The Graveyard Shift (design 7.3, 11.7): the night as an axis from now, the indoor
 * temperature as a curve inside a hatched band, the threshold as a dashed line, and the
 * crossing as a headstone. Each mark encodes a number from `graveyardShift`, and every
 * mark is also said in words and in an hourly table below it. Positions are laid out
 * with CSS (no SVG text, which would shrink under 16 px), and nothing animates.
 */

type Night = Extract<household.GraveyardShift, { kind: 'night' }>;

const HEIGHT = 190;

export function GraveyardChart({ night, nowMs }: { night: Night; nowMs: number }): ReactNode {
  const text = nightText(night, nowMs);
  const y = yScale(night);
  const span = night.spanMinutes;
  const xPct = (minutes: number): number => Math.max(0, Math.min(100, (minutes / span) * 100));
  const yPct = (c: number): number => (1 - y.toFraction(c)) * 100;

  // The band between the fastest and the slowest curve, as one polygon.
  const forward = night.points.map((p) => `${xPct(p.tMinutes)}% ${yPct(p.fastC)}%`);
  const back = [...night.points].reverse().map((p) => `${xPct(p.tMinutes)}% ${yPct(p.slowC)}%`);
  const band = `polygon(${[...forward, ...back].join(', ')})`;
  const likely = night.points.map((p) => `${xPct(p.tMinutes)},${yPct(p.midC)}`).join(' ');

  const crossing = night.crossing;
  const inside = crossing !== null && crossing.midMinutes <= span;
  const lineY = yPct(night.thresholdC);
  const rows = nightRows(night, nowMs);
  const ticks = axisTicks(night, nowMs);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        role="img"
        aria-label={`${text.headline}. ${text.detail}`}
        style={{
          position: 'relative',
          height: HEIGHT,
          borderRadius: 'var(--radius-tile)',
          background: token('surface.1'),
          border: `1px solid ${token('hairline')}`,
          overflow: 'hidden',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: `repeating-linear-gradient(135deg, ${token('control.fill.primary')} 0 5px, transparent 5px 10px)`,
            clipPath: band,
          }}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <polyline
            points={likely}
            fill="none"
            stroke={token('text.emphasis')}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Outdoors: the line the curve is heading for. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${yPct(night.outdoorC)}%`,
            borderTop: `2px dotted ${token('nontext.muted')}`,
          }}
        />
        {/* Your line: the threshold. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${lineY}%`,
            borderTop: `2px dashed ${token('text.secondary')}`,
          }}
        />
        {crossing !== null ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${xPct(crossing.earliestMinutes)}%`,
              width: `${Math.max(
                0.5,
                xPct(crossing.latestMinutes ?? span) - xPct(crossing.earliestMinutes),
              )}%`,
              top: `calc(${lineY}% - 3px)`,
              height: 6,
              borderRadius: 3,
              background: token('text.secondary'),
            }}
          />
        ) : null}
        {inside && crossing ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `calc(${xPct(crossing.midMinutes)}% - 15px)`,
              bottom: `calc(${100 - lineY}% + 3px)`,
              width: 30,
              height: 38,
              borderRadius: '15px 15px 0 0',
              background: token('surface.3'),
              border: `2px solid ${token('text.emphasis')}`,
              borderBottom: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: token('text.emphasis'),
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <title>Headstone</title>
              <path d="M12 5v14M7 10h10" />
            </svg>
          </div>
        ) : null}
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
        {ticks.map((t) => (
          <span key={t.fraction}>{t.label}</span>
        ))}
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
        <li>Thick line: likely</li>
        <li>Hatched: range</li>
        <li>Dashed: your line, {formatTemp(night.thresholdC)}</li>
        <li>Dotted: outdoors, {formatTemp(night.outdoorC)}</li>
        {inside ? <li>Headstone: crossing</li> : null}
      </ul>

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
          Show the night as a table
        </summary>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--type-caption)',
            color: token('text.primary'),
          }}
        >
          <caption className="sr-only">Indoor temperature each hour, likely and range</caption>
          <thead>
            <tr style={{ color: token('text.secondary'), textAlign: 'left' }}>
              <th scope="col">Time</th>
              <th scope="col">Likely</th>
              <th scope="col">Range</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.time + r.likely} style={{ borderTop: `1px solid ${token('hairline')}` }}>
                <th
                  scope="row"
                  style={{ textAlign: 'left', fontWeight: 600, padding: '6px 4px 6px 0' }}
                >
                  {r.time}
                </th>
                <td style={{ padding: '6px 4px' }}>{r.likely}</td>
                <td style={{ padding: '6px 0 6px 4px', overflowWrap: 'anywhere' }}>{r.range}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
