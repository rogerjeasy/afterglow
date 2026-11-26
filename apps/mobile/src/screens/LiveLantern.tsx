import { type ReactNode, useState } from 'react';
import { gridSense } from '../gridsense/engine';
import { useGridSense } from '../gridsense/useGridSense';
import { STATE_WORD } from '../lantern/present';
import { SourceChip, Sources, StatusLine, Tile } from '../night-shell/components';
import { Button, Notice, Section } from '../night-shell/controls';
import { LanternMap, type MapCell, MapLegend } from '../night-shell/lantern';
import { unfollowArea } from '../notify/notify';
import { PlacesSection } from '../places/PlacesSection';
import { SignalSection } from '../places/SignalSection';
import { useCells, usePlaces } from '../public/hooks';

/**
 * The live Lantern (crowd-reports CR-04, CR-07): the real crowd map around the
 * person's own cell, from signed reports aggregated by the server with the core's
 * k-anonymity. Below 5 devices a cell is unknown, never a guess. Followed by the
 * real places and towers around them.
 */

const STATE_LINE: Record<string, string> = {
  dark: 'DARK',
  lit: 'LIT',
  mixed: 'MIXED',
  comingBack: 'COMING BACK',
  unknown: 'UNKNOWN',
};

function cellNote(state: string, count: number): string {
  switch (state) {
    case 'dark':
      return `${count} devices in your area report no mains power in the last 30 minutes.`;
    case 'lit':
      return `${count} devices in your area report mains power in the last 30 minutes.`;
    case 'comingBack':
      return `${count} devices here are charging again. Power is returning.`;
    case 'mixed':
      return `${count} devices disagree: some have power and some do not.`;
    default:
      return 'Fewer than 5 devices have reported from your area in the last 30 minutes, so I show nothing. Each Afterglow phone here that can sense its power adds one.';
  }
}

export function LiveLantern({ cell }: { cell: string }): ReactNode {
  const cellsState = useCells(cell, 5, 5);
  const places = usePlaces(cell);
  const answer =
    cellsState.kind === 'ready'
      ? cellsState.value
      : cellsState.kind === 'unavailable'
        ? cellsState.last
        : null;
  const [selected, setSelected] = useState(cell);
  const mine = answer?.cells.find((c) => c.geohash6 === cell);
  const sel = answer?.cells.find((c) => c.geohash6 === selected) ?? mine;

  const mapCells: MapCell[] =
    answer?.cells.map((c) => ({
      id: c.geohash6,
      col: c.col,
      row: c.row,
      state: c.state,
      isUser: c.geohash6 === cell,
      label: `${c.geohash6 === cell ? 'Your area' : 'Neighbouring area'}: ${STATE_WORD[c.state]}${c.deviceCount > 0 ? `, ${c.deviceCount} devices` : ''}`,
    })) ?? [];

  return (
    <>
      <Section title="Lantern">
        <StatusLine
          timer={mine ? (STATE_LINE[mine.state] ?? 'UNKNOWN') : 'CHECKING…'}
          line={
            mine ? cellNote(mine.state, mine.deviceCount) : 'Asking the crowd map about your area.'
          }
          live={mine?.state === 'dark'}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <SourceChip label="crowd (live)" />
          {cellsState.kind === 'ready' ? (
            <SourceChip
              label={`as of ${new Date(cellsState.atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            />
          ) : cellsState.kind === 'unavailable' ? (
            <SourceChip
              label={
                cellsState.lastAtMs
                  ? `offline · last map ${new Date(cellsState.lastAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'offline · no map yet'
              }
            />
          ) : null}
        </div>
      </Section>

      {answer ? (
        <Section title="Your area and around it">
          <LanternMap
            cols={answer.cols}
            rows={answer.rows}
            cells={mapCells}
            selectedId={sel?.geohash6 ?? cell}
            onSelect={setSelected}
            label="The crowd map around your area, about 6 by 3 kilometres"
          />
          <MapLegend />
          {sel ? (
            <Tile
              title={sel.geohash6 === cell ? 'Your area' : 'Neighbouring area'}
              value={STATE_WORD[sel.state]}
              note={cellNote(sel.state, sel.deviceCount)}
              sources={[
                'crowd',
                sel.deviceCount > 0 ? `${sel.deviceCount} devices` : 'fewer than 5 devices',
                'privacy rule: k ≥ 5',
              ]}
            />
          ) : null}
        </Section>
      ) : cellsState.kind === 'unavailable' ? (
        <Notice>
          The crowd map is unreachable right now and there is no earlier map on this phone.
        </Notice>
      ) : null}

      <Section title="When will power return?">
        <Notice>
          No schedule provider is connected for your area yet, so I show no promised time and no
          estimate. When neighbours' phones start charging again, this map says "coming back" before
          any schedule does.
        </Notice>
      </Section>

      <PlacesSection cell={cell} places={places} cellsAnswer={answer} />
      <SignalSection cell={cell} places={places} />

      <Section title="Your area">
        <Sources labels={['a ~1 km cell (geohash-6)', 'never your position']}>
          Only the cell is kept and sent. The map, places and forecast are asked for by cell.
        </Sources>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            gridSense.forgetArea();
            void unfollowArea();
          }}
        >
          Forget my area
        </Button>
      </Section>
    </>
  );
}

/** The share button for the no-crowd state. */
export function ShareArea(): ReactNode {
  const gs = useGridSense();
  return (
    <Section title="See your real area">
      <Notice>
        Share your area to see the live crowd map, places with power, warm places and cell towers
        near you. Your position is turned into a ~1 km cell on this phone; only the cell is ever
        sent.
      </Notice>
      <Button variant="primary" disabled={gs.locating} onClick={() => void gridSense.shareArea()}>
        {gs.locating ? 'Finding your area…' : 'Share my area'}
      </Button>
      {gs.locationError ? <Notice>{gs.locationError}</Notice> : null}
    </Section>
  );
}
