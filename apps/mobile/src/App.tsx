import type { LuminanceMode } from '@afterglow/design-system';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { alertText } from './alerts/present';
import { useAlerts } from './alerts/useAlerts';
import { BeaconConsole } from './console/BeaconConsole';
import { BusinessConsole } from './console/BusinessConsole';
import { foodIndex } from './data/foodkeeper';
import { setCommandHandler } from './eyesfree/EyesFreeUI';
import { announce, currentStatus } from './eyesfree/eyesfree';
import { gridSense, personReportFor } from './gridsense/engine';
import { Wisp, WispFinish } from './guide/Wisp';
import { readFacts } from './guide/facts';
import { renderLine } from './guide/render';
import { TOUR } from './guide/script';
import {
  type Power,
  TOUR_OFF,
  TOUR_OUTAGE_OFFSET_MINUTES,
  type TourAction,
  type TourState,
  opacity,
  planPower,
  step as tourStep,
} from './guide/tour';
import { browserStorage } from './household/store';
import { useHousehold, useNow } from './household/useHousehold';
import { LightMode, openLight, useLightOpen } from './light/LightMode';
import type { TabId } from './night-shell/controls';
import { decideMode } from './night-shell/modePolicy';
import { applyMode, token } from './night-shell/theme';
import { notifyInBackground, renewArea } from './notify/notify';
import { readFlag, shouldOnboard, writeFlag } from './onboarding/logic';
import { navigate, useLocation } from './router';
import { Alerts } from './screens/Alerts';
import { Cold } from './screens/Cold';
import { FieldChecks } from './screens/FieldChecks';
import { Hearth } from './screens/Hearth';
import { Lantern } from './screens/Lantern';
import { Onboarding } from './screens/Onboarding';
import { Plan } from './screens/Plan';
import { Seance } from './screens/Seance';
import { You } from './screens/You';
import { AppShell, TAB_PATH, tabFromPath } from './shell/AppShell';
import { getSpaceController, useIdleLock, useSpace } from './spaces/useSpace';
import { Page } from './ui/page';

const MODE_CYCLE: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

/**
 * The app shell: header, the built destinations, and the Lights-Out moment.
 *
 * Lights-Out runs whenever an outage begins (design 8.4): the screen fades to
 * pure black, then lands in Night mode, always. Restoration returns to Ember.
 *
 * The active space (guest, demo or a signed-in account) decides which store
 * every screen reads. Demo is a labelled, in-memory sandbox.
 */
export function App(): ReactNode {
  useIdleLock();
  const { controller, space } = useSpace();
  const { store, state } = useHousehold();
  const nowMs = useNow(1000);
  const outage = state.view.outageStartedAtMs !== null;
  const alertList = useAlerts(nowMs);

  const light = useLightOpen();

  // Eyes-free (7.2): the haptic grammar and speech for the outage starting and ending,
  // and for each new alert, once. The first render only records what is already there.
  const seenOutage = useRef<boolean | null>(null);
  useEffect(() => {
    if (seenOutage.current === null) {
      seenOutage.current = outage;
      return;
    }
    if (outage === seenOutage.current) return;
    seenOutage.current = outage;
    if (outage) announce('outage', 'The power is out. The clocks have started.');
    else announce('restoration', 'The power is back.');
  }, [outage]);
  const seenAlerts = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = new Set(alertList.map((a) => a.key));
    if (seenAlerts.current === null) {
      seenAlerts.current = keys;
      return;
    }
    for (const a of alertList) {
      if (seenAlerts.current.has(a.key) || a.kind === 'outage') continue;
      const t = alertText(a);
      announce(a.kind === 'help' ? 'help' : null, t.title);
      void notifyInBackground(t.title, t.body ?? '', a.key);
    }
    seenAlerts.current = keys;
  }, [alertList]);
  const { path } = useLocation();
  const tab: TabId = tabFromPath(path);
  const [coldSelected, setColdSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<LuminanceMode>(outage ? 'night' : 'ember');
  const [igniting, setIgniting] = useState(false);
  // First run: welcome a first visit to the real space (never the demo or an account).
  // `#/welcome` replays it for guests on demand.
  const [onboarding, setOnboarding] = useState<boolean>(
    () =>
      window.location.pathname.endsWith('/app/welcome') ||
      shouldOnboard({
        flag: readFlag(browserStorage()),
        spaceKind: space.kind,
        hasHouseholdData:
          state.view.appliances.length > 0 ||
          state.view.roster.length > 0 ||
          state.view.home !== null ||
          state.view.outageStartedAtMs !== null,
        search: window.location.search,
      }),
  );
  const showOnboarding = onboarding && space.kind === 'guest';
  const wasOutage = useRef(outage);

  // ------------------------------------------------------------------ the guide
  // Wisp's one-night tour runs only in the demo space (guide spec GD-03). The pure
  // machine in guide/tour.ts decides; this shell only carries it out.
  const [tour, setTour] = useState<TourState>(TOUR_OFF);
  // Whether an outage has ended during this tour: "power is back", not just "on".
  const [tourEnded, setTourEnded] = useState(false);
  const tourAct = (a: TourAction): void => setTour((t) => tourStep(t, a, TOUR.length));
  const tourIndex = tour.kind === 'on' ? tour.index : null;
  const startTour = (): void => {
    const c = getSpaceController();
    if (c.getState().kind === 'account') return; // a tour never runs inside an account
    if (c.getState().kind === 'guest') c.enterDemo();
    setOnboarding(false);
    setTourEnded(false);
    setTour(tourStep(TOUR_OFF, 'start', TOUR.length));
  };
  const tourFacts = useMemo(
    () =>
      tour.kind === 'on'
        ? readFacts({ view: state.view, nowMs, demo: space.kind === 'demo', foodIndex })
        : {},
    [tour.kind, state.view, nowMs, space.kind],
  );

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  // `/app/welcome` replays the welcome for guests on demand.
  useEffect(() => {
    if (path === '/app/welcome') setOnboarding(true);
  }, [path]);

  // Each step opens its own tab, once, when the step begins. Tapping another tab
  // during the tour is allowed; the next step brings the visitor back.
  useEffect(() => {
    if (tourIndex === null) return;
    const s = TOUR[tourIndex];
    if (s) navigate(TAB_PATH[s.tab], { keepScroll: true });
  }, [tourIndex]);

  // Bring the demo to the power the step describes (GD-05). Outside the demo,
  // planPower returns null and nothing is touched (GD-03).
  useEffect(() => {
    if (tourIndex === null) return;
    const s = TOUR[tourIndex];
    if (!s) return;
    const power: Power = outage ? 'out' : tourEnded ? 'back' : 'on';
    const action = planPower(space.kind, s.power, power);
    if (action === null) return;
    const evening = Date.now() - TOUR_OUTAGE_OFFSET_MINUTES * 60_000;
    if (action === 'startOutage') {
      store.startOutage(evening);
    } else {
      if (action === 'cycle') store.startOutage(evening);
      store.endOutage();
      setTourEnded(true);
    }
  }, [tourIndex, outage, tourEnded, space.kind, store]);

  // Grid Sense (crowd-reports CR-01): start the browser's senses once, and let the fused
  // verdict start and end the household's outage clocks when the person allows it. Never
  // in the demo, which has its own simulated night.
  useEffect(() => {
    gridSense.start();
    void renewArea();
    gridSense.setHooks({
      onVerdict(verdict, restoreEdge) {
        const c = getSpaceController();
        const sp = c.getState();
        if (sp.kind === 'demo' || !gridSense.getState().auto) return;
        const st = sp.store;
        const going = st.getState().view.outageStartedAtMs !== null;
        if (verdict === 'absent' && !going) st.startOutage(Date.now());
        else if (verdict === 'present' && restoreEdge && going) st.endOutage();
      },
    });
    return () => gridSense.setHooks(null);
  }, []);

  // Deep link for the tour: ?tour=1 (README, demo video). GD-11.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on load
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tour') === '1') startTour();
  }, []);

  // Deep link for demos and pixel-scan tooling: ?phase=outage[&elapsed=<minutes>]
  // opens the DEMO space (never the real one) in the middle of an outage.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('phase') !== 'outage') return;
    const c = getSpaceController();
    if (c.getState().kind !== 'guest') return;
    const minutes = Number(params.get('elapsed') ?? '12');
    const elapsedMs = (Number.isFinite(minutes) && minutes >= 0 ? minutes : 12) * 60_000;
    c.enterDemo();
    c.getState().store.startOutage(Date.now() - elapsedMs);
  }, []);

  // The pure policy decides; the effect only carries it out (night-shell/modePolicy).
  const spaceKey = `${space.kind}:${space.account?.id ?? ''}`;
  const lastSpace = useRef(spaceKey);
  useEffect(() => {
    // The person's own "power out" or "power back" joins the crowd map (CR-17).
    const said = personReportFor({
      wasOutage: wasOutage.current,
      outage,
      spaceChanged: lastSpace.current !== spaceKey,
      demo: spaceKey.startsWith('demo:'),
      sensed: gridSense.getState().result.verdict,
    });
    if (said) gridSense.reportPerson(said);
    const decision = decideMode({
      outage,
      wasOutage: wasOutage.current,
      spaceChanged: lastSpace.current !== spaceKey,
    });
    wasOutage.current = outage;
    lastSpace.current = spaceKey;
    if (decision === 'night') setMode('night');
    else if (decision === 'ember') setMode('ember');
    else if (decision === 'lightsOut') {
      setIgniting(true);
      window.setTimeout(() => {
        setMode('night');
        window.setTimeout(() => setIgniting(false), 450);
      }, 300);
    }
  }, [outage, spaceKey]);

  const go = (id: TabId): void => {
    navigate(TAB_PATH[id]);
  };

  // Voice commands: what each does, and what to say back.
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    setCommandHandler((c) => {
      const st = getSpaceController().getState().store;
      const isOut = st.getState().view.outageStartedAtMs !== null;
      switch (c) {
        case 'powerOut':
          if (isOut) return 'The outage clocks are already running.';
          st.startOutage(Date.now());
          return 'Started. The clocks are running.';
        case 'powerBack':
          if (!isOut) return 'No outage is running.';
          st.endOutage();
          return 'Marked the power as back.';
        case 'status':
          goRef.current('hearth');
          return currentStatus() ?? (isOut ? 'The power is out.' : 'No outage reported.');
        case 'lightOn':
          openLight(true);
          return 'Light on. Say "light off" or tap Close to stop.';
        case 'lightOff':
          openLight(false);
          return 'Light off.';
        case 'alerts':
          goRef.current('alerts');
          return 'Alerts.';
        case 'lantern':
          goRef.current('lantern');
          return 'Lantern.';
        case 'seance':
          goRef.current('seance');
          return 'Séance.';
        case 'cold':
          goRef.current('cold');
          return 'Cold.';
        case 'plan':
          goRef.current('plan');
          return 'Plan.';
        case 'listen':
          void gridSense.listen();
          return 'Listening to the room for the mains hum.';
      }
    });
    return () => setCommandHandler(null);
  }, []);

  const cycleMode = (): void => {
    const i = MODE_CYCLE.indexOf(mode);
    setMode(MODE_CYCLE[(i + 1) % MODE_CYCLE.length] as LuminanceMode);
  };

  const startDemo = (): void => {
    controller.enterDemo();
    controller.getState().store.startOutage(Date.now());
  };

  return (
    <AppShell
      tab={tab}
      onGo={go}
      mode={mode}
      onCycleMode={cycleMode}
      alertCount={alertList.length}
      critical={alertList.some((a) => a.priority === 'critical')}
      space={space}
      onExitDemo={() => controller.exitDemo()}
      onLock={() => void controller.lock()}
      outageStartedAtMs={state.view.outageStartedAtMs}
      nowMs={nowMs}
      bare={showOnboarding}
    >
      {light ? <LightMode onClose={() => openLight(false)} /> : null}
      {showOnboarding ? (
        <Onboarding
          onFinish={(how) => {
            writeFlag(browserStorage(), how);
            setOnboarding(false);
            if (path === '/app/welcome') navigate('/app', { replace: true });
            else go('hearth');
          }}
          onStartDemo={startDemo}
          onStartTour={startTour}
        />
      ) : tab === 'hearth' ? (
        <Hearth
          nowMs={nowMs}
          onOpenCold={(id) => {
            setColdSelected(id);
            go('cold');
          }}
          onOpenSeance={() => go('seance')}
          onStartDemo={startDemo}
          onStartTour={space.kind === 'account' || tour.kind === 'on' ? undefined : startTour}
        />
      ) : tab === 'lantern' ? (
        <Lantern nowMs={nowMs} onStartDemo={startDemo} />
      ) : tab === 'seance' ? (
        <Seance nowMs={nowMs} />
      ) : tab === 'plan' ? (
        <Plan nowMs={nowMs} />
      ) : tab === 'cold' ? (
        <Cold nowMs={nowMs} selectedId={coldSelected} onSelect={setColdSelected} />
      ) : tab === 'alerts' ? (
        <Alerts list={alertList} outage={outage} />
      ) : tab === 'field' ? (
        <FieldChecks nowMs={nowMs} />
      ) : tab === 'business' || tab === 'beacon' ? (
        // The consoles are wider pages for a desk as much as a phone (7.14, 7.16).
        <Page>{tab === 'business' ? <BusinessConsole /> : <BeaconConsole />}</Page>
      ) : (
        <You onStartTour={space.kind === 'account' ? undefined : startTour} />
      )}

      {tour.kind === 'on' && TOUR[tour.index] ? (
        <Wisp
          line={renderLine(TOUR[tour.index] as (typeof TOUR)[number], tourFacts).text}
          target={(TOUR[tour.index] as (typeof TOUR)[number]).target}
          index={tour.index}
          length={TOUR.length}
          opacity={opacity(tour.index, TOUR.length)}
          nextLabel={(TOUR[tour.index] as (typeof TOUR)[number]).nextLabel}
          onNext={() => tourAct('next')}
          onBack={() => tourAct('back')}
          onSkip={() => tourAct('skip')}
        />
      ) : tour.kind === 'done' ? (
        <WispFinish
          onSetUp={() => {
            controller.exitDemo();
            setTour(TOUR_OFF);
            setOnboarding(true);
          }}
          onExplore={() => setTour(TOUR_OFF)}
          onReplay={() => {
            setTourEnded(false);
            tourAct('restart');
          }}
        />
      ) : null}

      {/* Lights-Out scrim: fades to pure black during the transition. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: token('bg'),
          pointerEvents: 'none',
          opacity: igniting ? 1 : 0,
          transition: 'opacity 300ms ease-out',
          zIndex: 20,
        }}
      />
    </AppShell>
  );
}
