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
import { useT } from '../i18n/i18n';
import { buildLanternModel, estimateAt, toMinute, viewAt } from '../lantern/model';
import { hearthLine } from '../lantern/present';
import { openLight } from '../light/LightMode';
import { SourceChip, Sources, StatusLine, Tile } from '../night-shell/components';
import { Button, Notice, Section } from '../night-shell/controls';
import { GhostGlyph, Tombstone, WardCard } from '../night-shell/costume';
import { Icon } from '../ui/icons';
import { Page, PageHeader, Panel } from '../ui/page';
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
  const tr = useT();
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
    ? `${tr('hearth.gridDown')} ${formatTimer(nowMs - (view.outageStartedAtMs as number))}`
    : demo
      ? scenario.verdict === 'present'
        ? tr('hearth.powerOn')
        : tr('hearth.listening')
      : tr('hearth.powerOn');

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
        : demo
          ? 'No outage in the demo household. Its senses are simulated; in your own browser you tell the app when the power goes.'
          : 'No outage reported. On a phone, Grid Sense listens for it. On the web you can tell the app.';

  const homeText = hoursOfSafetyText(hours);
  // What "Read it to me" and the voice command "read it to me" say.
  const spoken = `${outage ? `Grid down for ${formatTimer(nowMs - (view.outageStartedAtMs as number)).replace(/:/g, ' ')}.` : ''} ${line} Your home: ${homeText.value}. ${homeText.note}`;
  useEffect(() => {
    provideStatus(() => spoken);
    return () => provideStatus(null);
  }, [spoken]);
  const homeKnown = hours.kind !== 'unknown';

  // Readiness: what is set up before the dark, each item a door to where it is done.
  const ready = [
    {
      label: 'Fridge or freezer',
      done: view.appliances.length > 0,
      hint: 'A clock for your food',
      icon: 'tombstone' as const,
      go: () => onOpenCold(null),
    },
    {
      label: 'Your home',
      done: view.home !== null,
      hint: 'Hours of safety tonight',
      icon: 'hearth' as const,
      go: () => setSettingUpHome(true),
    },
    {
      label: 'Your people',
      done: roster.length > 0,
      hint: 'Who to hear from',
      icon: 'people' as const,
      go: onOpenSeance,
    },
    {
      label: 'Medicines',
      done: medicines.length > 0,
      hint: 'Only from the approved table',
      icon: 'pill' as const,
      go: () => onOpenCold(null),
    },
  ];
  const readyCount = ready.filter((r) => r.done).length;

  return (
    <Page>
      {/* On a phone the tab bar already names the screen; the heading stays for screen readers. */}
      <div className="sr-only sm:not-sr-only">
        <PageHeader
          eyebrow="Tonight at a glance"
          icon="hearth"
          title={tr('tab.hearth')}
          lead={
            outage
              ? 'The clocks are running. Everything below is computed from your own household.'
              : 'Power is on. This is what Afterglow will watch for you when it fails.'
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-8">
          <StatusLine timer={timer} line={line} live={outage} tourId="status" />
          <ReadAloudButton />
          {demo ? (
            <div className="sm:rounded-[24px] sm:border sm:border-hairline sm:bg-surface-1 sm:p-5">
              <div className="text-body text-primary">
                In this demo, {sense.headline.charAt(0).toLowerCase() + sense.headline.slice(1)}{' '}
                <span className="text-secondary">{sense.why}</span>
              </div>
              <SourceChip
                label={
                  sim ? 'simulated senses and neighbourhood (demo)' : 'simulated senses (demo)'
                }
              />
              <Sources
                labels={[
                  `Grid Sense: ${scenario.verdict}`,
                  `senses that voted: ${
                    [...scenario.result.votedPositive, ...scenario.result.votedNegative].join(
                      ', ',
                    ) || 'none'
                  }`,
                  'simulated senses (demo)',
                ]}
              >
                {scenario.result.reason}
              </Sources>
            </div>
          ) : null}
        </div>

        <aside aria-label="Actions" className="flex min-w-0 flex-col gap-3 xl:col-span-4">
          <div className="flex flex-col gap-3 xl:rounded-[24px] xl:border xl:border-hairline xl:bg-surface-1 xl:p-5">
            <h2 className="m-0 hidden text-label font-bold text-secondary xl:block">
              {outage ? 'While it is dark' : 'When it happens'}
            </h2>
            {outage ? (
              <Button
                variant="primary"
                className="w-full"
                style={{ minHeight: 72 }}
                onClick={() => store.endOutage()}
              >
                <Icon name="bolt" />
                {tr('hearth.powerBack')}
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                style={{ minHeight: 72 }}
                onClick={() => store.startOutage(Date.now())}
              >
                <Icon name="boltOff" />
                {tr('hearth.powerOut')}
              </Button>
            )}
            <Button className="w-full" onClick={() => openLight()}>
              <Icon name="flashlight" />
              {tr('hearth.light')}
            </Button>
            <VoiceButton />
            {!outage && !demo ? (
              <Button className="w-full" onClick={onStartDemo}>
                <Icon name="sparkle" />
                Demo night: a simulated neighbourhood
              </Button>
            ) : null}
            {!outage && onStartTour ? (
              <Button variant="ghost" className="w-full" onClick={onStartTour}>
                <Icon name="play" />
                Show me a night with Wisp, the guide
              </Button>
            ) : null}
          </div>
        </aside>
      </div>

      <Section title={outage ? 'What the dark is doing' : 'If the power fails'}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
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

          <div
            className={
              (assessments.length === 0 ? 1 : assessments.length) % 2 === 0
                ? 'col-span-2 min-w-0 lg:col-span-1'
                : 'min-w-0'
            }
          >
            <Tile
              title="Hours of safety"
              value={homeText.value}
              note={
                homeKnown ? homeText.note : 'Tell me about your home to get a band, not a guess.'
              }
              sources={[...homeText.sources, ...(homeKnown ? [MODEL_SOURCE] : [])]}
              live={outage && homeKnown}
              onClick={() => setSettingUpHome(true)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
          <div className="min-w-0">
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
          <div className="min-w-0">
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
                <div className="text-caption text-secondary">
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

      <div className="grid gap-6 xl:grid-cols-12">
        {demo ? null : (
          <div className={outage ? 'min-w-0 xl:col-span-12' : 'min-w-0 xl:col-span-8'}>
            <GridSenseCard />
          </div>
        )}
        {/* Readiness is a lit-room question: during an outage the screen answers the night. */}
        {outage ? null : (
          <Panel
            title="Ready for the dark"
            icon="check"
            className={demo ? 'xl:col-span-12' : 'xl:col-span-4'}
            right={
              <span className="clock text-label text-secondary">
                {readyCount} of {ready.length}
              </span>
            }
          >
            <div
              aria-hidden="true"
              className="h-2 overflow-hidden rounded-full border border-hairline bg-surface-2"
            >
              <div
                className="h-full origin-left rounded-full bg-emphasis transition-transform duration-700 ease-out"
                style={{ transform: `scaleX(${readyCount / ready.length})` }}
              />
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {ready.map((r) => (
                <li key={r.label}>
                  <button
                    type="button"
                    onClick={r.go}
                    className="press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-hairline bg-surface-2 px-3.5 text-left transition-transform duration-200 hover:-translate-y-px"
                  >
                    <span
                      className={
                        r.done
                          ? 'flex size-9 flex-none items-center justify-center rounded-full border border-ring bg-control-primary text-control-label'
                          : 'flex size-9 flex-none items-center justify-center rounded-full border border-dashed border-muted text-secondary'
                      }
                    >
                      <Icon name={r.done ? 'check' : r.icon} size={18} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-label font-bold text-primary">{r.label}</span>
                      <span className="text-caption text-secondary">
                        {r.done ? 'Done' : `Not yet · ${r.hint}`}
                      </span>
                    </span>
                    <Icon name="arrowRight" size={20} className="block flex-none text-secondary" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </Page>
  );
}
