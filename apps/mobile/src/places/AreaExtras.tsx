import { type ReactNode, useEffect, useState } from 'react';
import { formatDuration } from '../format';
import { Sources } from '../night-shell/components';
import { ChoiceChip, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import {
  type Advisory,
  type HistoryAnswer,
  type SiteStatus,
  fetchAdvisories,
  fetchHistory,
  fetchSites,
} from '../public/api';
import { bearingDeg, cellCentre, compassWord, distanceM, distanceWords } from '../public/geo';

/** Advisories from Beacon for this area (consoles BE-02), newest first. */
export function AdvisoriesNotice({ cell }: { cell: string }): ReactNode {
  const [list, setList] = useState<readonly Advisory[]>([]);
  useEffect(() => {
    let live = true;
    const load = (): void => {
      void fetchAdvisories(cell).then((a) => live && a && setList(a));
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [cell]);
  if (list.length === 0) return null;
  return (
    <Section title="Advisories for your area">
      {list.map((a) => (
        <div key={a.id} role="note">
          <Notice>
            <span style={{ color: token('text.emphasis') }}>{a.title}</span> {a.body}{' '}
            <span style={{ color: token('text.secondary') }}>
              — {a.from},{' '}
              {new Date(a.atMs).toLocaleString([], {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </Notice>
        </div>
      ))}
    </Section>
  );
}

/** Your area against its eight neighbours (consoles HC-04, product description 7.19). */
export function Comparisons({ cell }: { cell: string }): ReactNode {
  const [days, setDays] = useState(7);
  const [h, setH] = useState<HistoryAnswer | null | 'none'>(null);
  useEffect(() => {
    let live = true;
    void fetchHistory(cell, 3, days).then((x) => live && setH(x ?? 'none'));
    return () => {
      live = false;
    };
  }, [cell, days]);
  const mine = h && h !== 'none' ? h.cells.find((c) => c.geohash6 === cell) : undefined;
  const others =
    h && h !== 'none' ? h.cells.filter((c) => c.geohash6 !== cell && c.knownMinutes > 0) : [];
  const avg = others.length ? others.reduce((s, c) => s + c.darkMinutes, 0) / others.length : null;
  return (
    <Section title="Compared with your neighbours">
      <div style={{ display: 'flex', gap: 6 }}>
        <ChoiceChip label="7 days" selected={days === 7} onClick={() => setDays(7)} />
        <ChoiceChip label="30 days" selected={days === 30} onClick={() => setDays(30)} />
      </div>
      {h === null ? (
        <Notice>Loading your area’s history.</Notice>
      ) : h === 'none' ? (
        <Notice>The history is unreachable right now.</Notice>
      ) : !mine || mine.knownMinutes === 0 ? (
        <Notice>
          Not enough phones reported from your area in that time to compare. Each Afterglow phone
          here adds to it.
        </Notice>
      ) : (
        <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
          Your area: {formatDuration(mine.darkMinutes)} without power in {mine.outages} outage
          {mine.outages === 1 ? '' : 's'}
          {mine.longestDarkMinutes
            ? `, the longest ${formatDuration(mine.longestDarkMinutes)}`
            : ''}
          .{' '}
          {avg === null
            ? 'Neighbouring areas have too few phones to compare.'
            : `Neighbouring areas with data averaged ${formatDuration(Math.round(avg))} (${others.length} area${others.length === 1 ? '' : 's'}).`}
        </div>
      )}
      <Sources labels={['crowd history, k ≥ 5', `last ${days} days`]}>
        Built from the published state of each area, kept 30 days. A gap in reports is never counted
        as an outage.
      </Sources>
    </Section>
  );
}

const POWER_WORD = { mains: 'mains power', backup: 'backup power', none: 'no power' } as const;

/** Businesses nearby that published whether they are open and powered (BC-03). */
export function OpenBusinesses({ cell }: { cell: string }): ReactNode {
  const [sites, setSites] = useState<readonly SiteStatus[]>([]);
  useEffect(() => {
    let live = true;
    void fetchSites(cell).then((s) => live && s && setSites(s));
    return () => {
      live = false;
    };
  }, [cell]);
  if (sites.length === 0) return null;
  const from = cellCentre(cell);
  const ranked = [...sites]
    .map((s) => ({ s, d: distanceM(from, s), b: bearingDeg(from, s) }))
    .sort((a, b) => Number(b.s.open) - Number(a.s.open) || a.d - b.d);
  return (
    <Section title="Businesses near you">
      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ranked.map(({ s, d, b }) => (
          <li
            key={s.siteId + s.name}
            style={{
              listStyle: 'none',
              padding: '12px 14px',
              borderRadius: 'var(--radius-tile)',
              background: token('surface.2'),
              border: `1px solid ${s.open && s.power !== 'none' ? token('focus.ring') : token('hairline')}`,
            }}
          >
            <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
              {s.name}
            </div>
            <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
              {s.open ? 'Open' : 'Closed'} · {POWER_WORD[s.power]} · {distanceWords(d)}{' '}
              {compassWord(b)}
              {s.note ? ` · ${s.note}` : ''} · updated{' '}
              {new Date(s.updatedAtMs).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </li>
        ))}
      </ul>
      <Sources labels={['the businesses themselves', 'Afterglow Business']}>
        What each business said about itself, at the time shown. Not checked by Afterglow.
      </Sources>
    </Section>
  );
}
