import { type ReactNode, useMemo, useState } from 'react';
import { formatClockTime } from '../format';
import { useGridSense } from '../gridsense/useGridSense';
import { useHousehold } from '../household/useHousehold';
import {
  buildLanternModel,
  countStates,
  estimateAt,
  firstRestorationMinute,
  toMinute,
  toMs,
  viewAt,
} from '../lantern/model';
import {
  STATE_WORD,
  estimateText,
  explainCell,
  lateStats,
  lateText,
  playbackText,
  provenanceWords,
} from '../lantern/present';
import { SourceChip, StatusLine, Tile } from '../night-shell/components';
import { Button, Notice, Section } from '../night-shell/controls';
import { EstimateBand, LanternMap, type MapCell, MapLegend } from '../night-shell/lantern';
import { Page, PageHeader } from '../ui/page';
import { LiveLantern, ShareArea } from './LiveLantern';

/**
 * The Lantern: the crowd-built map of where mains exists (design 7.3, 11.4).
 *
 * Every cell, count and estimate here is computed by the core (`cellTimeline`,
 * `estimateRestoration`) from reports; nothing is painted by hand. A neighbourhood
 * exists only in the demo space and is labelled as simulated. Everywhere else the
 * app has no crowd, and says so instead of drawing a map it cannot back (fail-closed
 * rules 4 and 10).
 */

export function Lantern({
  nowMs,
  onStartDemo,
}: {
  nowMs: number;
  onStartDemo: () => void;
}): ReactNode {
  const { store, state, demo } = useHousehold();
  const gs = useGridSense();
  const startMs = state.view.outageStartedAtMs;

  return (
    <Page>
      <PageHeader
        title="Lantern"
        compact
        eyebrow="Your area, live"
        icon="lantern"
        lead="Where the mains still runs, from phones that sense it. A cell is shown only when at least 5 devices back it."
      />
      {!demo ? (
        gs.cell ? (
          <LiveLantern cell={gs.cell} />
        ) : (
          <>
            <NoCrowd onStartDemo={onStartDemo} />
            <ShareArea />
          </>
        )
      ) : startMs === null ? (
        <Section title="Lantern">
          <Tile
            title="Your cell"
            value="Power on"
            note="In the demo the lights are on. Start a night and watch the neighbourhood go dark, then come back."
            sources={['simulated neighbourhood (demo)']}
          />
          <Button
            variant="primary"
            className="min-h-[72px] sm:self-start sm:px-10"
            onClick={() => store.startOutage(Date.now())}
          >
            Power just went out
          </Button>
        </Section>
      ) : (
        <Crowd startMs={startMs} nowMs={nowMs} />
      )}
    </Page>
  );
}

/** Outside the demo there is no crowd network: say so, and what would change that. */
function NoCrowd({ onStartDemo }: { onStartDemo: () => void }): ReactNode {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <Section title="Right now">
        <StatusLine
          timer="UNKNOWN"
          line="No neighbours are reporting from your area yet. I will not draw a map I cannot back."
        />
        <Tile
          title="Why unknown"
          value="Fewer than 5"
          note="A cell is shown only when at least 5 devices report from it, so nobody can be singled out. Below that the answer is unknown, never a guess."
          sources={['no crowd data', 'privacy rule: k ≥ 5']}
        />
      </Section>
      <Section title="What would change that">
        <Notice>
          At least 5 devices running Afterglow in your cell, each telling the map when its power
          changes. Share your area below to join the live crowd map.
        </Notice>
        <Notice>
          A schedule provider for your area. None is connected yet, so no promised times are shown.
        </Notice>
        <Button variant="primary" className="min-h-[72px]" onClick={onStartDemo}>
          See it with a simulated neighbourhood
        </Button>
      </Section>
    </div>
  );
}

function Crowd({ startMs, nowMs }: { startMs: number; nowMs: number }): ReactNode {
  const model = useMemo(() => buildLanternModel(toMinute(startMs)), [startMs]);
  const nowMinute = toMinute(nowMs);
  const [override, setOverride] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const viewMinute = Math.max(
    model.fromMinute,
    Math.min(model.nbh.endMinute, override ?? nowMinute),
  );
  const view = viewAt(model, viewMinute);
  const estimate = estimateAt(model, view);
  const said = estimateText(estimate, model.nbh.provider.source);
  const late = lateStats(model.nbh.history);
  const counts = countStates(view);
  const restoration = firstRestorationMinute(model);

  const selectedId = selected ?? model.userCell;
  const sel = view.cells.find((c) => c.sim.geohash6 === selectedId) ?? view.cells[0];
  const isUserSelected = selectedId === model.userCell;

  const mapCells: MapCell[] = view.cells.map((c) => {
    const you = c.sim.geohash6 === model.userCell;
    return {
      id: c.sim.geohash6,
      col: c.sim.col,
      row: c.sim.row,
      state: c.state.state,
      isUser: you,
      label: `${you ? 'Your cell' : `Cell, column ${c.sim.col + 1} row ${c.sim.row + 1}`}: ${STATE_WORD[c.state.state].toLowerCase()}, ${c.state.deviceCount} device${c.state.deviceCount === 1 ? '' : 's'}`,
    };
  });

  const summary = (
    [
      ['dark', counts.dark],
      ['lit', counts.lit],
      ['mixed', counts.mixed],
      ['comingBack', counts.comingBack],
      ['unknown', counts.unknown],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${STATE_WORD[s].toLowerCase()}`)
    .join(' · ');

  const user = view.user;
  return (
    <>
      <div>
        <StatusLine
          timer={STATE_WORD[user.state].toUpperCase()}
          line={explainCell(user)}
          live={user.state === 'dark' || user.state === 'comingBack'}
        />
        <div className="flex flex-wrap gap-1.5">
          <SourceChip label="simulated neighbourhood (demo)" />
          <SourceChip label={provenanceWords(user)} />
          <SourceChip label={`as of ${formatClockTime(toMs(view.minute))}`} />
        </div>
        {/* Announce changes to screen readers without moving focus. */}
        <div className="sr-only" aria-live="polite">
          Your cell is {STATE_WORD[user.state].toLowerCase()} at{' '}
          {formatClockTime(toMs(view.minute))}.
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <Section title="The neighbourhood" tourId="lantern-map">
          <LanternMap
            cols={model.cols}
            rows={model.rows}
            cells={mapCells}
            selectedId={selectedId}
            onSelect={setSelected}
            label="Map of nearby cells. Each button is one cell of about 1 kilometre."
          />
          <div className="text-caption text-secondary">{summary}</div>
          <MapLegend />
          {sel ? (
            <Tile
              title={isUserSelected ? 'Your cell' : 'A neighbouring cell'}
              value={STATE_WORD[sel.state.state]}
              note={explainCell(sel.state)}
              sources={[
                provenanceWords(sel.state),
                `${sel.state.deviceCount} device${sel.state.deviceCount === 1 ? '' : 's'}`,
                'at least 5 needed',
              ]}
              live={sel.state.state === 'comingBack'}
            />
          ) : null}
        </Section>

        <div className="flex min-w-0 flex-col gap-8">
          <Section title="When will power return?" tourId="lantern-estimate">
            <Tile
              title="Your cell"
              value={said.headline}
              note={said.detail}
              sources={said.sources}
              live={estimate.kind === 'underway'}
            />
            {estimate.kind === 'estimate' ? (
              <EstimateBand
                nowMinute={view.minute}
                promisedMinute={estimate.promisedEndMinute}
                lowMinute={estimate.lowMinute}
                atMinute={estimate.atMinute}
                highMinute={estimate.highMinute}
              />
            ) : null}
            <Notice>{lateText(late)}</Notice>
          </Section>

          <Section title="Playback (simulated)">
            <label htmlFor="lantern-playback" className="block">
              <span className="text-label text-secondary">Move through the night</span>
              <input
                id="lantern-playback"
                className="scrubber"
                type="range"
                min={model.fromMinute}
                max={model.nbh.endMinute}
                step={5}
                value={view.minute}
                aria-valuetext={playbackText(view.minute, nowMinute)}
                onChange={(e) => setOverride(Number(e.target.value))}
              />
            </label>
            <div className="clock text-label text-primary">
              {playbackText(view.minute, nowMinute)}
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button size="sm" onClick={() => setOverride(null)}>
                Now
              </Button>
              {restoration !== null ? (
                <Button size="sm" onClick={() => setOverride(restoration)}>
                  Skip to power returning
                </Button>
              ) : null}
            </div>
            <Notice>
              This runs the simulation ahead of the clock so you can see a night end. In real use
              the map shows only what has been reported so far.
            </Notice>
          </Section>
        </div>
      </div>

      <Notice>
        Privacy: a cell is about 1 km across and is shown only when at least 5 devices report from
        it. A street, a building or a household is never shown.
      </Notice>
    </>
  );
}
