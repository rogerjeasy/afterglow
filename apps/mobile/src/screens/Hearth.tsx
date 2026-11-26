import { household, thermal } from '@afterglow/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { foodIndex } from '../data/foodkeeper';
import { useFormulary } from '../data/formulary';
import { type DemoPhase, runScenario } from '../demo/scenario';
import { senseText } from '../demo/senseWords';
import { ReadAloudButton, VoiceButton } from '../eyesfree/EyesFreeUI';
import { provideStatus } from '../eyesfree/eyesfree';
import { formatClockTime, formatTimer } from '../format';
import { GridSenseCard } from '../gridsense/GridSenseCard';
import { useGridSense } from '../gridsense/useGridSense';
import {
  LABEL_SOURCE,
  MODEL_SOURCE,
  applianceSources,
  applianceTileText,
  hoursOfSafetyText,
  worstMedicine,
} from '../household/present';
import { useHousehold } from '../household/useHousehold';
import { buildLanternModel, estimateAt, toMinute, viewAt } from '../lantern/model';
import { hearthLine } from '../lantern/present';
import { openLight } from '../light/LightMode';
import { SourceChip, Sources, StatusLine, Tile } from '../night-shell/components';
import { Button, Notice, Section } from '../night-shell/controls';
import { GhostGlyph, Tombstone, WardCard } from '../night-shell/costume';
import { token } from '../night-shell/theme';
import { HomeSetup } from './HomeSetup';

/**
 * The Hearth: the one line of truth plus the tiles. Every number on this screen
 * is computed by the deterministic core from the household's own data, and each
 * tile names its source (fail-closed.md rule 9). Where the app does not know
 * something, the tile is an invitation or says "Unknown" in plain words.
 */

export function Hearth({
  nowMs,
  onOpenCold,
  onOpenSeance,
  onStartDemo,
  onStartTour,
}: {
  nowMs: number;
  onOpenCold: (applianceId: string | null) => void;
  onOpenSeance: () => void;
  onStartDemo: () => void;
  /** Starts Wisp's tour; absent where a tour cannot run (inside an account). */
  onStartTour?: (() => void) | undefined;
}): ReactNode {
  const { store, state, demo } = useHousehold();
  const gs = useGridSense();
  const { view } = state;
  const [settingUpHome, setSettingUpHome] = useState(false);

  const assessments = useMemo(() => household.assessAll(view, foodIndex, nowMs), [view, nowMs]);
  const hours = useMemo(() => household.hoursOfSafety(view, nowMs), [view, nowMs]);
  const table = useFormulary();
  const loadedTable = table.kind === 'loaded' ? table.formulary : null;
  const medicines = useMemo(
    () => household.assessMedicines(view, loadedTable, nowMs),
    [view, loadedTable, nowMs],
  );
  const worst = worstMedicine(medicines);
  const roster = useMemo(() => household.assessRoster(view), [view]);
  const ghosts = roster.filter((r) => r.state === 'ghost').length;
  const helps = roster.filter((r) => r.state === 'help').length;
  const elapsed = household.elapsedMinutes(view, nowMs);
  const outage = view.outageStartedAtMs !== null;

  // Demo only: the sense votes go through the real fusion core, with a simulated
  // neighbourhood standing in for the crowd network that does not exist yet.
  const phase: DemoPhase = outage ? 'outage' : 'powered';
  const scenario = runScenario(phase);
  // In words (NS-14). Two local senses agree here, so no neighbour count is claimed.
  const sense = senseText(scenario.result, 0);
  // The neighbourhood is simulated, but its cells and estimate are computed by the real
  // core (cellTimeline, estimateRestoration), exactly as the Lantern tab shows them.
  const sim = useMemo(() => {
    if (!outage || !demo) return null;
    const model = buildLanternModel(toMinute(view.outageStartedAtMs as number));
    const at = viewAt(model, toMinute(nowMs));
    return { user: at.user, estimate: estimateAt(model, at) };
  }, [outage, demo, view.outageStartedAtMs, nowMs]);

  const timer = outage
    ? `GRID DOWN ${formatTimer(nowMs - (view.outageStartedAtMs as number))}`
    : demo
      ? scenario.verdict === 'present'
        ? 'POWER ON'
        : 'LISTENING…'
      : 'POWER ON';

  const line = outage
    ? sim
      ? hearthLine(sim.user, sim.estimate, view.outageStartedAtMs as number)
      : `You reported the power out at ${formatClockTime(
          view.outageStartedAtMs as number,
        )}. Not enough neighbour reports to compare yet: a cell needs at least 5 devices.`
    : !demo && gs.result.verdict === 'present'
      ? `No outage. ${senseText(gs.result, 0).why}`
      : !demo && gs.result.verdict === 'absent'
        ? `Grid Sense says the power is out here: ${senseText(gs.result, gs.crowdAbsent).why} Tap "Power just went out" to start the clocks.`
        : 'No outage reported. On a phone, Grid Sense listens for it. On the web you can tell the app.';

  const homeText = hoursOfSafetyText(hours);
  // What "Read it to me" and the voice command "read it to me" say.
  const spoken = `${outage ? `Grid down for ${formatTimer(nowMs - (view.outageStartedAtMs as number)).replace(/:/g, ' ')}.` : ''} ${line} Your home: ${homeText.value}. ${homeText.note}`;
  useEffect(() => {
    provideStatus(() => spoken);
    return () => provideStatus(null);
  }, [spoken]);
  const homeKnown = hours.kind !== 'unknown';

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '8px 20px 120px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      <div>
        <StatusLine timer={timer} line={line} live={outage} tourId="status" />
        <ReadAloudButton />
        {sim ? <SourceChip label="simulated neighbourhood (demo)" /> : null}
        {demo ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
              {sense.headline} <span style={{ color: token('text.secondary') }}>{sense.why}</span>
            </div>
            <Sources
              labels={[
                `Grid Sense: ${scenario.verdict}`,
                `senses that voted: ${
                  [...scenario.result.votedPositive, ...scenario.result.votedNegative].join(', ') ||
                  'none'
                }`,
                'simulated senses (demo)',
              ]}
            >
              {scenario.result.reason}
            </Sources>
          </div>
        ) : null}
      </div>

      {demo ? null : <GridSenseCard />}

      <Section title={outage ? 'What the dark is doing' : 'If the power fails'}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          {assessments.map((a) => {
            const text = applianceTileText(a);
            const firstFridge = assessments.find((x) => x.model.appliance.class === 'fridge') === a;
            // The same tombstone as on Cold: the stone darkens as its window runs out (NS-16).
            const progress =
              elapsed !== null && a.windowMinutes !== null && a.windowMinutes > 0
                ? elapsed / a.windowMinutes
                : 0;
            return (
              <Tombstone
                key={a.model.appliance.id}
                title={a.model.appliance.name}
                epitaph={text.value}
                caption={text.note}
                progress={progress}
                cracked={a.headline.kind === 'pastWindow'}
                live={outage}
                selected={false}
                onClick={() => onOpenCold(a.model.appliance.id)}
                sources={applianceSources(a, thermal.APPLIANCE_MODEL_VERSION)}
                tourId={firstFridge ? 'tile-fridge' : undefined}
              />
            );
          })}
          {assessments.length === 0 ? (
            <Tile
              title="Fridge and freezer"
              value="Add yours"
              note="Then I can say how long your food is covered."
              onClick={() => onOpenCold(null)}
            />
          ) : null}

          <Tile
            title="Hours of safety"
            value={homeText.value}
            note={homeKnown ? homeText.note : 'Tell me about your home to get a band, not a guess.'}
            sources={[...homeText.sources, ...(homeKnown ? [MODEL_SOURCE] : [])]}
            live={outage && homeKnown}
            onClick={() => setSettingUpHome(true)}
          />

          <div style={{ gridColumn: '1 / -1' }}>
            <Tile
              title="Your people"
              value={
                roster.length === 0
                  ? 'Add yours'
                  : helps > 0
                    ? `${helps} need${helps === 1 ? 's' : ''} help`
                    : `${roster.length - ghosts} of ${roster.length} heard`
              }
              note={
                roster.length === 0
                  ? 'The people you look after, and a way to hear from them without a network.'
                  : ghosts > 0
                    ? `${ghosts} ghost${ghosts === 1 ? '' : 's'}: no word yet${outage ? ' since the outage began' : ''}.`
                    : 'Everyone has been heard from.'
              }
              sources={['your list']}
              live={outage}
              onClick={onOpenSeance}
              visual={
                roster.length > 0
                  ? roster.map((r) => (
                      <GhostGlyph
                        key={r.member.id}
                        opacity={r.state === 'ghost' ? 0.35 : 1}
                        loud={r.state === 'help'}
                        size={24}
                      />
                    ))
                  : undefined
              }
              tourId="tile-people"
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            {worst ? (
              <Tile
                title="Medicines"
                value={worst.text.label.toLowerCase()}
                note={`${worst.assessment.medicine.product}: ${worst.text.headline}`}
                sources={[
                  LABEL_SOURCE,
                  ...(table.kind === 'loaded' ? [`table ${table.version}`] : []),
                  ...(medicines.length > 1 ? [`${medicines.length} medicines, worst shown`] : []),
                ]}
                live={outage}
                onClick={() => onOpenCold(null)}
              />
            ) : table.kind === 'loaded' ? (
              <Tile
                title="Medicines"
                value="Add yours"
                note="Pick from the pharmacist-approved table. A clock appears only for products in it."
                sources={[LABEL_SOURCE, `table ${table.version}`]}
                onClick={() => onOpenCold(null)}
              />
            ) : (
              <WardCard
                title="Medicines"
                refusal="No medicine clock. I will not estimate how long your medicine lasts."
              >
                <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
                  {table.kind === 'loading'
                    ? 'Checking for the pharmacist-approved table. '
                    : `${table.reason} `}
                  Storage limits come only from that table. Ask your pharmacist. This is not medical
                  advice.
                </div>
                <SourceChip label={LABEL_SOURCE} />
              </WardCard>
            )}
          </div>
        </div>
      </Section>

      {settingUpHome ? (
        <HomeSetup
          current={view.home}
          onCancel={() => setSettingUpHome(false)}
          onSave={(home) => {
            store.setHome(home);
            setSettingUpHome(false);
          }}
        />
      ) : null}

      {elapsed !== null && assessments.some((a) => a.needAttention > 0) ? (
        <Notice>
          {assessments.reduce((n, a) => n + a.needAttention, 0)} food item(s) need a decision. Open
          Cold to see which.
        </Notice>
      ) : null}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <VoiceButton />
        <Button style={{ width: '100%' }} onClick={() => openLight()}>
          Use this phone as a light
        </Button>
        {outage ? (
          <Button
            variant="primary"
            style={{ width: '100%', minHeight: 72 }}
            onClick={() => store.endOutage()}
          >
            Power is back
          </Button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {demo ? null : (
              <Button style={{ width: '100%' }} onClick={onStartDemo}>
                Demo night: a simulated neighbourhood
              </Button>
            )}
            <Button
              variant="primary"
              style={{ width: '100%', minHeight: 72 }}
              onClick={() => store.startOutage(Date.now())}
            >
              Power just went out
            </Button>
            {onStartTour ? (
              <Button variant="ghost" style={{ width: '100%' }} onClick={onStartTour}>
                Show me a night with Wisp, the guide
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
