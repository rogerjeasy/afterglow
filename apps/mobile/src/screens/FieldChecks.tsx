import type { fieldcheck, heliograph, thermal } from '@afterglow/core';
import { type ReactNode, useState } from 'react';
import { FieldChart, ReadingsTable } from '../fieldcheck/FieldChart';
import { coldReport, homeReport, isFridgeLike, runsCsv, seanceLines } from '../fieldcheck/present';
import {
  type ColdRun,
  type FieldRun,
  type FieldStore,
  type HomeRun,
  type SeanceRun,
  newRunId,
  parseTemp,
  useFieldRuns,
} from '../fieldcheck/store';
import { formatDuration, formatTemp } from '../format';
import { download } from '../history/export';
import type { HouseholdStore } from '../household/store';
import { useHousehold } from '../household/useHousehold';
import { Button, ChoiceChip, Notice, Stepper, TextField } from '../night-shell/controls';
import { navigate } from '../router';
import { Page, PageHeader, Panel } from '../ui/page';

/**
 * Field checks (spec `field-checks`): test Afterglow's numbers against the real world.
 * A fridge unplugged on purpose and a thermometer; a night with the heating off; two
 * phones at a measured distance. A test never starts the outage clock and never sends
 * a crowd report. Results stay on this phone until the person exports them.
 */

const SEANCE_MESSAGES: readonly { code: heliograph.MessageName; label: string }[] = [
  { code: 'SAFE', label: "I'm safe" },
  { code: 'HELP', label: 'Help' },
  { code: 'COMING', label: 'Coming' },
];

export function FieldChecks({ nowMs }: { nowMs: number }): ReactNode {
  const { store: hh, state, demo } = useHousehold();
  const { store, runs } = useFieldRuns(demo);
  const view = state.view;
  const active = runs.filter((r) => r.endedAtMs === null);
  const done = runs.filter((r) => r.endedAtMs !== null);

  return (
    <Page width="narrow">
      <PageHeader
        eyebrow="Check it yourself"
        icon="check"
        title="Field checks"
        lead="Test Afterglow's numbers against a real thermometer and two real phones. A test never starts the outage clock and never sends a report. Results stay on this phone until you export them."
      />
      {demo ? (
        <Notice>
          You are in the demo. Field checks work here, but nothing is kept: exit the demo to keep
          your results.
        </Notice>
      ) : null}

      {active.map((run) => (
        <RunCard key={run.id} run={run} store={store} hh={hh} nowMs={nowMs} />
      ))}

      <StartCold store={store} nowMs={nowMs} appliances={view.appliances} />
      <StartHome store={store} nowMs={nowMs} home={view.home} />
      <StartSeance store={store} nowMs={nowMs} />

      {done.length > 0 ? (
        <Panel title="Finished checks" icon="chart">
          <div className="flex flex-col gap-4">
            {done.map((run) => (
              <RunCard key={run.id} run={run} store={store} hh={hh} nowMs={nowMs} />
            ))}
          </div>
        </Panel>
      ) : null}

      {runs.length > 0 ? (
        <Panel title="Export" icon="book">
          <p className="m-0 text-label text-secondary">
            Every reading and attempt, with the model's prediction beside each reading. Times are in
            UTC.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => download('afterglow-field-checks.csv', 'text/csv', runsCsv(runs))}
            >
              Download CSV
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                download(
                  'afterglow-field-checks.json',
                  'application/json',
                  `${JSON.stringify({ exportedAt: new Date(nowMs).toISOString(), runs }, null, 2)}\n`,
                )
              }
            >
              Download JSON
            </Button>
          </div>
        </Panel>
      ) : null}
    </Page>
  );
}

// ---------------------------------------------------------------- starting a check

function StartCold({
  store,
  nowMs,
  appliances,
}: {
  store: FieldStore;
  nowMs: number;
  appliances: readonly {
    id: string;
    name: string;
    class: thermal.ApplianceClass;
    fullness: thermal.Fullness;
    ambientC: number;
  }[];
}): ReactNode {
  const [pick, setPick] = useState<string | null>(null);
  const [startText, setStartText] = useState('');
  const [roomText, setRoomText] = useState('');
  const appliance = appliances.find((a) => a.id === pick) ?? appliances[0];
  const startC = parseTemp(startText);
  const roomC = roomText.trim() === '' ? (appliance?.ambientC ?? null) : parseTemp(roomText);

  return (
    <Panel title="A fridge or freezer against a thermometer" icon="tombstone">
      <ol className="m-0 flex flex-col gap-1.5 pl-6 text-label text-primary">
        <li>Put a fridge thermometer on the middle shelf, away from the walls, for an hour.</li>
        <li>Write down what it says, then pull the plug and keep the door shut.</li>
        <li>Add a reading every 30 to 60 minutes, opening the door as briefly as you can.</li>
        <li>Stop when it passes 4.4 °C (40 °F), or after 6 hours. Plug it back in.</li>
      </ol>
      {appliances.length === 0 ? (
        <Notice>
          Add your fridge or freezer on the Cold tab first, so the check knows its kind and how full
          it is.
          <span className="mt-3 block">
            <Button size="sm" onClick={() => navigate('/app/cold')}>
              Go to Cold
            </Button>
          </span>
        </Notice>
      ) : (
        <>
          {appliances.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {appliances.map((a) => (
                <ChoiceChip
                  key={a.id}
                  label={a.name}
                  selected={appliance?.id === a.id}
                  onClick={() => setPick(a.id)}
                />
              ))}
            </div>
          ) : null}
          <TextField
            label={`Thermometer inside ${appliance?.name ?? 'it'} now (°C)`}
            value={startText}
            onChange={setStartText}
            hint="For example 3.5"
            error={
              startText.trim() !== '' && startC === null ? 'Type a temperature, like 3.5' : null
            }
          />
          <TextField
            label="Room temperature (°C)"
            value={roomText}
            onChange={setRoomText}
            hint={`Leave empty to use ${formatTemp(appliance?.ambientC ?? 22)} from its setup.`}
            error={roomText.trim() !== '' && roomC === null ? 'Type a temperature, like 24' : null}
          />
          <Button
            variant="primary"
            disabled={!appliance || startC === null || roomC === null}
            onClick={() => {
              if (!appliance || startC === null || roomC === null) return;
              const run: ColdRun = {
                id: newRunId('cold', nowMs),
                kind: 'cold',
                startedAtMs: nowMs,
                applianceId: appliance.id,
                applianceName: appliance.name,
                applianceClass: appliance.class,
                fullness: appliance.fullness,
                ambientC: roomC,
                startC,
                readings: [],
                endedAtMs: null,
              };
              store.start(run);
              setStartText('');
            }}
          >
            I pulled the plug: start
          </Button>
        </>
      )}
    </Panel>
  );
}

function StartHome({
  store,
  nowMs,
  home,
}: {
  store: FieldStore;
  nowMs: number;
  home: {
    archetype: thermal.ArchetypeQuery | null;
    mode: 'cold' | 'heat';
    thresholdC: number;
    outdoorC: number;
  } | null;
}): ReactNode {
  const [indoorText, setIndoorText] = useState('');
  const [outdoorText, setOutdoorText] = useState('');
  const startC = parseTemp(indoorText);
  const outdoorC = outdoorText.trim() === '' ? (home?.outdoorC ?? null) : parseTemp(outdoorText);

  return (
    <Panel title="A night with the heating off" icon="hearth">
      <ol className="m-0 flex flex-col gap-1.5 pl-6 text-label text-primary">
        <li>
          Choose a night you are not worried about, and put a thermometer in the room you sleep in.
        </li>
        <li>
          Turn the heating (or the cooling) off and write down the indoor and outdoor temperature.
        </li>
        <li>
          Add a reading every hour or two, and one in the morning. Turn the heating back on any
          time.
        </li>
      </ol>
      {home === null ? (
        <Notice>
          Set up your home first ("Your home" on the Hearth), so the check knows your building and
          your line.
          <span className="mt-3 block">
            <Button size="sm" onClick={() => navigate('/app')}>
              Go to Hearth
            </Button>
          </span>
        </Notice>
      ) : (
        <>
          <TextField
            label="Indoor now (°C)"
            value={indoorText}
            onChange={setIndoorText}
            hint="For example 20.5"
            error={
              indoorText.trim() !== '' && startC === null ? 'Type a temperature, like 20.5' : null
            }
          />
          <TextField
            label="Outdoor tonight (°C)"
            value={outdoorText}
            onChange={setOutdoorText}
            hint={`Leave empty to use ${formatTemp(home.outdoorC)} from your home setup.`}
            error={
              outdoorText.trim() !== '' && outdoorC === null ? 'Type a temperature, like 4' : null
            }
          />
          <Button
            variant="primary"
            disabled={startC === null || outdoorC === null}
            onClick={() => {
              if (startC === null || outdoorC === null) return;
              const run: HomeRun = {
                id: newRunId('home', nowMs),
                kind: 'home',
                startedAtMs: nowMs,
                archetype: home.archetype,
                mode: home.mode,
                thresholdC: home.thresholdC,
                outdoorC,
                startC,
                readings: [],
                endedAtMs: null,
              };
              store.start(run);
              setIndoorText('');
            }}
          >
            The heating is off: start
          </Button>
        </>
      )}
    </Panel>
  );
}

function StartSeance({ store, nowMs }: { store: FieldStore; nowMs: number }): ReactNode {
  const [distanceM, setDistanceM] = useState(2);
  const [setting, setSetting] = useState('');
  const [profile, setProfile] = useState<'standard' | 'fast'>('standard');
  return (
    <Panel title="Séance at a distance" icon="seance">
      <ol className="m-0 flex flex-col gap-1.5 pl-6 text-label text-primary">
        <li>You need two phones. Measure the distance between them.</li>
        <li>On the sending phone, open Séance and send "I'm safe".</li>
        <li>
          On this phone, open Séance and watch. After each attempt, come back here and tap what
          happened.
        </li>
        <li>Ten attempts at each distance give a fair number. Try 1, 3 and 5 m.</li>
      </ol>
      <Stepper
        label="Distance between the phones"
        valueText={`${distanceM} m`}
        onDecrement={() => setDistanceM((d) => Math.max(1, d - 1))}
        onIncrement={() => setDistanceM((d) => Math.min(40, d + 1))}
      />
      <TextField
        label="Where (optional)"
        value={setting}
        onChange={setSetting}
        hint="For example: indoors, lights off; or through a window"
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label text-secondary">Speed</span>
        <ChoiceChip
          label="Standard"
          selected={profile === 'standard'}
          onClick={() => setProfile('standard')}
        />
        <ChoiceChip label="Fast" selected={profile === 'fast'} onClick={() => setProfile('fast')} />
      </div>
      <Button
        variant="primary"
        onClick={() => {
          const run: SeanceRun = {
            id: newRunId('seance', nowMs),
            kind: 'seance',
            startedAtMs: nowMs,
            distanceM,
            setting: setting.trim().slice(0, 80),
            profile,
            trials: [],
            endedAtMs: null,
          };
          store.start(run);
        }}
      >
        Start counting
      </Button>
    </Panel>
  );
}

// ---------------------------------------------------------------- one run

function RunCard({
  run,
  store,
  hh,
  nowMs,
}: {
  run: FieldRun;
  store: FieldStore;
  hh: HouseholdStore;
  nowMs: number;
}): ReactNode {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const open = run.endedAtMs === null;
  const title =
    run.kind === 'cold'
      ? `${run.applianceName}: unplugged ${formatDuration((nowMs - run.startedAtMs) / 60000)} ${open ? 'ago' : ''}`.trim()
      : run.kind === 'home'
        ? 'A night with the heating off'
        : `Séance at ${run.distanceM} m`;
  const started = new Date(run.startedAtMs).toLocaleString();

  return (
    <Panel
      title={open ? title : `${title} · finished`}
      icon={run.kind === 'cold' ? 'tombstone' : run.kind === 'home' ? 'hearth' : 'seance'}
      live={open}
    >
      <p className="m-0 text-caption text-secondary">Started {started}</p>
      {run.kind === 'cold' ? <ColdBody run={run} store={store} hh={hh} nowMs={nowMs} /> : null}
      {run.kind === 'home' ? <HomeBody run={run} store={store} nowMs={nowMs} /> : null}
      {run.kind === 'seance' ? <SeanceBody run={run} store={store} nowMs={nowMs} /> : null}
      <div className="flex flex-wrap gap-3">
        {open ? (
          <Button onClick={() => store.update(run.id, (r) => ({ ...r, endedAtMs: nowMs }))}>
            Finish this check
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            if (confirmDelete) store.remove(run.id);
            else setConfirmDelete(true);
          }}
        >
          {confirmDelete ? 'Tap again to delete it' : 'Delete'}
        </Button>
      </div>
    </Panel>
  );
}

function AddReading({
  run,
  store,
  nowMs,
  label,
}: {
  run: ColdRun | HomeRun;
  store: FieldStore;
  nowMs: number;
  label: string;
}): ReactNode {
  const [text, setText] = useState('');
  const c = parseTemp(text);
  if (run.endedAtMs !== null) return null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <TextField
          label={label}
          value={text}
          onChange={setText}
          error={text.trim() !== '' && c === null ? 'Type a temperature, like 4.1' : null}
        />
      </div>
      <Button
        variant="primary"
        disabled={c === null}
        onClick={() => {
          if (c === null) return;
          store.update(run.id, (r) =>
            r.kind === 'seance' ? r : { ...r, readings: [...r.readings, { atMs: nowMs, c }] },
          );
          setText('');
        }}
      >
        Add reading
      </Button>
    </div>
  );
}

function Lines({ lines }: { lines: readonly string[] }): ReactNode {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 text-label text-primary">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}

function ColdBody({
  run,
  store,
  hh,
  nowMs,
}: {
  run: ColdRun;
  store: FieldStore;
  hh: HouseholdStore;
  nowMs: number;
}): ReactNode {
  const r = coldReport(run);
  const appliance = hh.getState().view.appliances.find((a) => a.id === run.applianceId);
  const inUse = appliance?.measuredTauMinutes;
  const sameSetup =
    appliance !== undefined &&
    appliance.class === run.applianceClass &&
    appliance.fullness === run.fullness;
  const words = `${r.lines.join(' ')}`;
  return (
    <>
      <FieldChart data={r.chart} label={words} />
      <Lines lines={r.lines} />
      <ReadingsTable rows={r.comparison.kind === 'compared' ? r.comparison.rows : []} />
      <AddReading
        run={run}
        store={store}
        nowMs={nowMs}
        label={`Thermometer now (°C), ${formatDuration((nowMs - run.startedAtMs) / 60000)} in`}
      />
      {!sameSetup ? (
        <p className="m-0 text-caption text-secondary">
          {appliance
            ? 'This appliance has been set up differently since the check, so its measurement cannot be applied.'
            : 'This appliance is no longer on the Cold tab.'}
        </p>
      ) : r.safe.source !== 'default' && inUse !== r.safe.tauMinutes ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-tile)] border border-ring bg-surface-2 p-4">
          <p className="m-0 text-label text-primary">
            Your {run.applianceName.toLowerCase()} warms faster than the default I use. Its clock
            can use what you measured ({formatDuration(r.safe.tauMinutes)} instead of{' '}
            {formatDuration(r.defaultTauMinutes)}), which makes it shorter, never longer.
          </p>
          <Button
            variant="primary"
            onClick={() => hh.setMeasuredTau(run.applianceId, r.safe.tauMinutes)}
          >
            Use what I measured
          </Button>
        </div>
      ) : r.fit.kind === 'fitted' && r.safe.source === 'default' ? (
        <p className="m-0 text-caption text-secondary">
          Your {run.applianceName.toLowerCase()} holds the cold at least as well as the default, so
          its clock stays on the USDA-anchored default. A measurement can only make a clock shorter.
        </p>
      ) : null}
      {sameSetup && inUse !== undefined ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="m-0 text-caption text-secondary">
            {run.applianceName} uses a measured time constant of {formatDuration(inUse)}.
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => hh.setMeasuredTau(run.applianceId, null)}
          >
            Go back to the default
          </Button>
        </div>
      ) : null}
      {!isFridgeLike(run.applianceClass) ? (
        <p className="m-0 text-caption text-secondary">
          A freezer takes a day or two. A reading every few hours is enough.
        </p>
      ) : null}
    </>
  );
}

function HomeBody({
  run,
  store,
  nowMs,
}: { run: HomeRun; store: FieldStore; nowMs: number }): ReactNode {
  const r = homeReport(run);
  return (
    <>
      <FieldChart data={r.chart} label={r.lines.join(' ')} />
      <Lines lines={r.lines} />
      <ReadingsTable rows={r.comparison.kind === 'compared' ? r.comparison.rows : []} />
      <AddReading
        run={run}
        store={store}
        nowMs={nowMs}
        label={`Indoor now (°C), ${formatDuration((nowMs - run.startedAtMs) / 60000)} in`}
      />
    </>
  );
}

function SeanceBody({
  run,
  store,
  nowMs,
}: { run: SeanceRun; store: FieldStore; nowMs: number }): ReactNode {
  const [sent, setSent] = useState<heliograph.MessageName>('SAFE');
  const [attemptAt, setAttemptAt] = useState<number | null>(null);
  const open = run.endedAtMs === null;
  const record = (outcome: fieldcheck.TrialOutcome): void => {
    const seconds = outcome === 'read' && attemptAt !== null ? (nowMs - attemptAt) / 1000 : null;
    store.update(run.id, (r) =>
      r.kind === 'seance'
        ? { ...r, trials: [...r.trials, { sent, outcome, seconds, atMs: nowMs }] }
        : r,
    );
    setAttemptAt(null);
  };
  return (
    <>
      <Lines lines={seanceLines(run)} />
      {open ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-secondary">Sent</span>
            {SEANCE_MESSAGES.map((m) => (
              <ChoiceChip
                key={m.code}
                label={m.label}
                selected={sent === m.code}
                onClick={() => setSent(m.code)}
              />
            ))}
          </div>
          <Button
            variant={attemptAt === null ? 'primary' : 'secondary'}
            onClick={() => setAttemptAt(nowMs)}
          >
            {attemptAt === null
              ? 'The other phone is sending now'
              : `Timing: ${Math.max(0, Math.round((nowMs - attemptAt) / 1000))} s`}
          </Button>
          <p className="m-0 text-caption text-secondary">
            Tap it when the other phone presses send, so a correct read is timed. Then tap what this
            phone showed:
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="primary" onClick={() => record('read')}>
              The right message
            </Button>
            <Button onClick={() => record('wrong')}>A different message</Button>
            <Button onClick={() => record('refused')}>Asked for a repeat</Button>
            <Button onClick={() => record('missed')}>Nothing</Button>
          </div>
        </>
      ) : null}
    </>
  );
}
