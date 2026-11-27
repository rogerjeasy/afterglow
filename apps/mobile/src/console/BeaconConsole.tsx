import { cells as coreCells } from '@afterglow/core';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { formatDuration } from '../format';
import { download } from '../history/export';
import { STATE_WORD } from '../lantern/present';
import { Sources } from '../night-shell/components';
import { Button, ChoiceChip, Notice, Section, TextField } from '../night-shell/controls';
import { LanternMap, type MapCell, MapLegend } from '../night-shell/lantern';
import { token } from '../night-shell/theme';
import { rankPlaces } from '../places/PlacesSection';
import {
  type CellsAnswer,
  type HistoryAnswer,
  type PlacesAnswer,
  type SiteStatus,
  fetchCells,
  fetchHistory,
  fetchPlaces,
  fetchSites,
} from '../public/api';
import { PageHeader, Panel } from '../ui/page';
import { Stat } from './BusinessConsole';
import { consoleApi } from './api';

/**
 * Afterglow Beacon (product description 7.16, consoles BE-01..BE-03): for a
 * municipality, utility or NGO — a region of 7 × 7 cells (~8 by 4 km) with the live
 * crowd state, each area's outage history, health facilities with and without power,
 * advisories pushed to the people who follow those areas, and a CSV export. Every
 * number is the same k-anonymous data the public sees; Beacon sees no person.
 */

const SPAN = 7;
const small = { fontSize: 'var(--type-caption)', color: token('text.secondary') } as const;
const AREA = /^[0-9b-hjkmnp-z]{6}$/;

function csv(rows: readonly (readonly (string | number)[])[]): string {
  return rows
    .map((r) =>
      r
        .map((v) =>
          typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v),
        )
        .join(','),
    )
    .join('\n');
}

export function BeaconConsole(): ReactNode {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [centerText, setCenterText] = useState('');
  const [center, setCenter] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [live, setLive] = useState<CellsAnswer | null>(null);
  const [hist, setHist] = useState<HistoryAnswer | null>(null);
  const [places, setPlaces] = useState<PlacesAnswer | null>(null);
  const [sites, setSites] = useState<readonly SiteStatus[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void consoleApi.me().then((r) => {
      if (r.ok) setAllowed(r.value.beacon);
      else {
        setAllowed(false);
        setWhy(r.message);
      }
    });
  }, []);

  const load = useCallback(async (c: string, d: number) => {
    setLoading(true);
    const [l, h, p, s] = await Promise.all([
      fetchCells(c, SPAN, SPAN),
      fetchHistory(c, SPAN, d),
      fetchPlaces(c),
      fetchSites(c),
    ]);
    setLive(l);
    setHist(h);
    setPlaces(p.kind === 'ready' ? p.answer : null);
    setSites(s ?? []);
    setSelected(c);
    setLoading(false);
  }, []);
  useEffect(() => {
    if (center) void load(center, days);
  }, [center, days, load]);

  const useMine = (): void => {
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const g = coreCells.encodeGeohash({ lat: p.coords.latitude, lng: p.coords.longitude });
        setCenterText(g);
        setCenter(g);
      },
      () => setWhy('Could not get the position. Type an area code instead.'),
      { timeout: 15_000 },
    );
  };

  const counts = useMemo(() => {
    const c = { dark: 0, lit: 0, comingBack: 0, mixed: 0, unknown: 0, devices: 0 };
    for (const x of live?.cells ?? []) {
      c[x.state as keyof typeof c]++;
      c.devices += x.deviceCount;
    }
    return c;
  }, [live]);
  const ranked = useMemo(
    () =>
      [...(hist?.cells ?? [])]
        .filter((c) => c.darkMinutes > 0)
        .sort((a, b) => b.darkMinutes - a.darkMinutes)
        .slice(0, 10),
    [hist],
  );
  const daily = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of hist?.cells ?? [])
      for (const d of c.daily) m.set(d.day, (m.get(d.day) ?? 0) + d.darkMinutes);
    return [...m].sort();
  }, [hist]);
  const maxDaily = Math.max(1, ...daily.map(([, v]) => v));
  const health = useMemo(
    () =>
      places && center
        ? rankPlaces(places.places, center, live, ['hospital', 'clinic', 'pharmacy']).slice(0, 12)
        : [],
    [places, center, live],
  );

  if (allowed === null)
    return (
      <>
        <PageHeader
          title="Afterglow Beacon"
          eyebrow="For cities, utilities and relief organisations"
          icon="radio"
          lead="The whole region at once, its history, and advisories to the people who follow an area. Aggregates only."
        />
        <Notice>Checking your Beacon access…</Notice>
      </>
    );
  if (!allowed) {
    return (
      <>
        <PageHeader
          title="Afterglow Beacon"
          eyebrow="For cities, utilities and relief organisations"
          icon="radio"
          lead="The whole region at once, its history, and advisories to the people who follow an area. Aggregates only."
        />
        <Section title="Access">
          <Notice>
            {why ??
              'Beacon is for municipalities, utilities and relief organisations. Your account does not have Beacon access yet: Afterglow grants it after checking who you work for.'}
          </Notice>
          <span style={small}>
            Everything Beacon shows is also public in Afterglow, area by area. What Beacon adds is
            the region at once, history, and advisories to the people who follow an area.
          </span>
        </Section>
      </>
    );
  }

  const mapCells: MapCell[] =
    live?.cells.map((c) => ({
      id: c.geohash6,
      col: c.col,
      row: c.row,
      state: c.state,
      isUser: c.geohash6 === center,
      label: `${c.geohash6}: ${STATE_WORD[c.state]}${c.deviceCount ? `, ${c.deviceCount} devices` : ''}`,
    })) ?? [];
  const sel = live?.cells.find((c) => c.geohash6 === selected);
  const selHist = hist?.cells.find((c) => c.geohash6 === selected);

  return (
    <>
      <PageHeader
        title="Afterglow Beacon"
        eyebrow="For cities, utilities and relief organisations"
        icon="radio"
        lead="The whole region at once, its history, and advisories to the people who follow an area. Aggregates only."
      />
      {live ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Areas dark" value={String(counts.dark)} icon="boltOff" />
          <Stat label="Coming back" value={String(counts.comingBack)} icon="bolt" />
          <Stat label="Areas lit" value={String(counts.lit)} icon="lantern" />
          <Stat label="Devices reporting" value={String(counts.devices)} icon="phone" />
        </div>
      ) : null}
      <Panel title="Region" icon="map">
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Centre area code"
            value={centerText}
            onChange={(v) => setCenterText(v.trim().toLowerCase())}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!AREA.test(centerText)}
            onClick={() => setCenter(centerText)}
          >
            Show region
          </Button>
          <Button size="sm" onClick={useMine}>
            Use my position
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[1, 7, 30].map((d) => (
            <ChoiceChip
              key={d}
              label={d === 1 ? 'Last day' : `Last ${d} days`}
              selected={days === d}
              onClick={() => setDays(d)}
            />
          ))}
        </div>
        {loading ? <span style={small}>Loading the region…</span> : null}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
        {live ? (
          <Panel title="Now" icon="lantern" live={counts.dark > 0}>
            <div className="text-body text-primary">
              {counts.dark} dark, {counts.comingBack} coming back, {counts.lit} lit, {counts.mixed}{' '}
              mixed and {counts.unknown} without enough phones, of {live.cells.length} areas;{' '}
              {counts.devices} devices reporting.
            </div>
            <LanternMap
              cols={live.cols}
              rows={live.rows}
              cells={mapCells}
              selectedId={selected}
              onSelect={setSelected}
              label="The region, 7 by 7 areas of about 1 km"
            />
            <MapLegend />
            {sel ? (
              <span style={small}>
                {sel.geohash6}: {STATE_WORD[sel.state]}
                {sel.deviceCount ? `, ${sel.deviceCount} devices` : ''}
                {selHist
                  ? ` · ${formatDuration(selHist.darkMinutes)} dark in ${days} day${days === 1 ? '' : 's'}, ${selHist.outages} outage${selHist.outages === 1 ? '' : 's'}`
                  : ''}
              </span>
            ) : null}
          </Panel>
        ) : null}

        {hist ? (
          <Panel title="History" icon="chart">
            {daily.length ? (
              <div
                role="img"
                aria-label="Dark area-minutes per day across the region"
                className="flex h-24 items-end gap-1 border-b border-hairline pb-1"
              >
                {daily.map(([day, v]) => (
                  <div
                    key={day}
                    title={`${day}: ${formatDuration(v)}`}
                    style={{
                      flex: 1,
                      height: `${8 + (v / maxDaily) * 72}px`,
                      background: v ? token('control.fill.primary') : token('surface.2'),
                      borderRadius: 2,
                    }}
                  />
                ))}
              </div>
            ) : null}
            {ranked.length === 0 ? (
              <Notice>No outages recorded in this region in that time.</Notice>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-control)] border border-hairline">
                <table className="w-full min-w-[460px] border-collapse text-left text-caption">
                  <thead className="bg-surface-2 text-secondary">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">Area</th>
                      <th className="px-3 py-2.5 font-bold">Dark</th>
                      <th className="px-3 py-2.5 font-bold">Outages</th>
                      <th className="px-3 py-2.5 font-bold">Longest</th>
                    </tr>
                  </thead>
                  <tbody className="text-primary">
                    {ranked.map((c) => (
                      <tr
                        key={c.geohash6}
                        className={
                          c.geohash6 === selected
                            ? 'border-t border-hairline bg-surface-3'
                            : 'border-t border-hairline'
                        }
                      >
                        <td className="px-3 py-1">
                          <button
                            type="button"
                            onClick={() => setSelected(c.geohash6)}
                            className="clock min-h-11 cursor-pointer border-none bg-transparent p-0 text-emphasis underline"
                          >
                            {c.geohash6}
                          </button>
                        </td>
                        <td className="clock px-3 py-1">{formatDuration(c.darkMinutes)}</td>
                        <td className="clock px-3 py-1">{c.outages}</td>
                        <td className="clock px-3 py-1">{formatDuration(c.longestDarkMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Button
              size="sm"
              onClick={() =>
                download(
                  `afterglow-beacon-${center}-${days}d.csv`,
                  'text/csv',
                  csv([
                    [
                      'area',
                      'row',
                      'col',
                      'state_now',
                      'devices_now',
                      `dark_minutes_${days}d`,
                      'outages',
                      'longest_dark_minutes',
                    ],
                    ...(hist?.cells ?? []).map((c) => {
                      const l = live?.cells.find((x) => x.geohash6 === c.geohash6);
                      return [
                        c.geohash6,
                        c.row,
                        c.col,
                        l?.state ?? 'unknown',
                        l?.deviceCount ?? 0,
                        c.darkMinutes,
                        c.outages,
                        c.longestDarkMinutes,
                      ];
                    }),
                  ]),
                )
              }
            >
              Export CSV
            </Button>
          </Panel>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {center ? (
          <Panel title="Health facilities near the centre" icon="heart">
            {health.length === 0 ? (
              <Notice>
                {places
                  ? 'No hospitals, clinics or pharmacies mapped within 2 km.'
                  : 'Places are loading or unreachable; try again shortly.'}
              </Notice>
            ) : (
              <ul className="m-0 grid list-disc gap-1 pl-5 text-label text-primary">
                {health.map((h) => (
                  <li key={h.place.id}>
                    {h.place.name ?? h.place.kind}:{' '}
                    {h.cellState === 'lit'
                      ? 'area has power'
                      : h.cellState === 'dark'
                        ? 'area is dark'
                        : h.cellState === 'comingBack'
                          ? 'power coming back'
                          : 'not enough phones'}
                    {h.place.backupPower ? ' · backup power recorded' : ''}
                  </li>
                ))}
              </ul>
            )}
            {sites.length ? (
              <>
                <span className="text-body text-emphasis">Businesses reporting</span>
                <ul className="m-0 grid list-disc gap-1 pl-5 text-label text-primary">
                  {sites.map((s) => (
                    <li key={s.siteId}>
                      {s.name}: {s.open ? 'open' : 'closed'},{' '}
                      {s.power === 'mains'
                        ? 'mains power'
                        : s.power === 'backup'
                          ? 'backup power'
                          : 'no power'}
                      {s.note ? ` · ${s.note}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Panel>
        ) : null}

        {live ? <AdvisoryForm live={live} selected={selected} /> : null}
      </div>

      <Sources labels={['crowd: k ≥ 5 per area', 'OpenStreetMap', 'business self-reports']}>
        Beacon shows the same data the public sees, for many areas at once. No person, phone or
        position below an area of about 1 km is ever visible here.
      </Sources>
    </>
  );
}

function AdvisoryForm({ live, selected }: { live: CellsAnswer; selected: string }): ReactNode {
  const [target, setTarget] = useState<'selected' | 'dark' | 'all'>('selected');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [from, setFrom] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cellsFor = (): string[] =>
    target === 'selected'
      ? [selected].filter(Boolean)
      : target === 'dark'
        ? live.cells
            .filter((c) => c.state === 'dark' || c.state === 'comingBack')
            .map((c) => c.geohash6)
        : live.cells.map((c) => c.geohash6);
  const n = cellsFor().length;
  const send = async (): Promise<void> => {
    const r = await consoleApi.advisory({
      cells: cellsFor(),
      title: title.trim(),
      body: body.trim(),
      from: from.trim() || 'Local authority',
    });
    setConfirming(false);
    if (r.ok) {
      setMsg(
        `Published to ${r.value.cells} area${r.value.cells === 1 ? '' : 's'} and sent to everyone following them.`,
      );
      setTitle('');
      setBody('');
    } else setMsg(r.message);
  };
  return (
    <Panel title="Send an advisory" icon="bell">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <ChoiceChip
          label="The selected area"
          selected={target === 'selected'}
          onClick={() => setTarget('selected')}
        />
        <ChoiceChip
          label="Dark areas in view"
          selected={target === 'dark'}
          onClick={() => setTarget('dark')}
        />
        <ChoiceChip
          label="Every area in view"
          selected={target === 'all'}
          onClick={() => setTarget('all')}
        />
      </div>
      <TextField
        label="From"
        value={from}
        onChange={setFrom}
        hint="Your organisation, as people will see it"
      />
      <TextField label="Title (up to 80 characters)" value={title} onChange={setTitle} />
      <TextField
        label="Message (up to 240 characters)"
        value={body}
        onChange={setBody}
        hint="For example: warming centre open at the town hall until 22:00."
      />
      {confirming ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="primary" onClick={() => void send()}>
            Send to {n} area{n === 1 ? '' : 's'} now
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          disabled={
            n === 0 || !title.trim() || !body.trim() || title.length > 80 || body.length > 240
          }
          onClick={() => setConfirming(true)}
        >
          Review and send
        </Button>
      )}
      {msg ? <Notice>{msg}</Notice> : null}
      <span style={small}>
        Shown in Afterglow in those areas for 3 days and pushed to people who follow them. Every
        advisory is recorded with the account that sent it.
      </span>
    </Panel>
  );
}
