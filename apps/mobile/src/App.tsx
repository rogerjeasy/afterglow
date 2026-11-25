import type { LuminanceMode } from '@afterglow/design-system';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { browserStorage } from './household/store';
import { useHousehold, useNow } from './household/useHousehold';
import { ModeSwitch } from './night-shell/components';
import { Button, Notice, TabBar, type TabId, YouButton } from './night-shell/controls';
import { decideMode } from './night-shell/modePolicy';
import { applyMode, token } from './night-shell/theme';
import { readFlag, shouldOnboard, writeFlag } from './onboarding/logic';
import { Cold } from './screens/Cold';
import { Hearth } from './screens/Hearth';
import { Lantern } from './screens/Lantern';
import { Onboarding } from './screens/Onboarding';
import { Plan } from './screens/Plan';
import { Seance } from './screens/Seance';
import { You } from './screens/You';
import { getSpaceController, useIdleLock, useSpace } from './spaces/useSpace';

const MODE_CYCLE: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

function tabFromHash(): TabId {
  const h = window.location.hash;
  if (h.startsWith('#/lantern')) return 'lantern';
  if (h.startsWith('#/cold')) return 'cold';
  if (h.startsWith('#/seance')) return 'seance';
  if (h.startsWith('#/plan')) return 'plan';
  if (h.startsWith('#/you')) return 'you';
  return 'hearth';
}
const HASH: Record<TabId, string> = {
  hearth: '#/',
  lantern: '#/lantern',
  seance: '#/seance',
  cold: '#/cold',
  plan: '#/plan',
  you: '#/you',
};

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

  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [coldSelected, setColdSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<LuminanceMode>(outage ? 'night' : 'ember');
  const [igniting, setIgniting] = useState(false);
  // First run: welcome a first visit to the real space (never the demo or an account).
  // `#/welcome` replays it for guests on demand.
  const [onboarding, setOnboarding] = useState<boolean>(
    () =>
      window.location.hash.startsWith('#/welcome') ||
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

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  useEffect(() => {
    const onHash = (): void => {
      if (window.location.hash.startsWith('#/welcome')) setOnboarding(true);
      setTab(tabFromHash());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
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
    window.location.hash = HASH[id];
    setTab(id);
  };

  const cycleMode = (): void => {
    const i = MODE_CYCLE.indexOf(mode);
    setMode(MODE_CYCLE[(i + 1) % MODE_CYCLE.length] as LuminanceMode);
  };

  const startDemo = (): void => {
    controller.enterDemo();
    controller.getState().store.startOutage(Date.now());
  };

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: token('bg') }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          maxWidth: 520,
          margin: '0 auto',
        }}
      >
        <ModeSwitch mode={mode} onCycle={cycleMode} />
        <span style={{ fontSize: 'var(--type-title)', color: token('text.emphasis') }}>
          Afterglow
        </span>
        {showOnboarding ? (
          <span style={{ width: 44 }} aria-hidden />
        ) : (
          <YouButton active={tab === 'you'} onClick={() => go('you')} />
        )}
      </header>

      {space.kind === 'demo' ? (
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 20px 8px' }}>
          <Notice>
            Demo: simulated household and neighbourhood. Nothing is saved or sent, and it cannot
            touch real data.
            <div style={{ marginTop: 10 }}>
              <Button size="sm" variant="primary" onClick={() => controller.exitDemo()}>
                Exit demo
              </Button>
            </div>
          </Notice>
        </div>
      ) : space.kind === 'account' ? (
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '0 20px 8px' }}>
          <Notice>
            Signed in as {space.account?.name ?? 'your account'}. Your household is saved encrypted
            on this device.
            <div style={{ marginTop: 10 }}>
              <Button size="sm" variant="primary" onClick={() => void controller.lock()}>
                Lock
              </Button>
            </div>
          </Notice>
        </div>
      ) : null}

      {showOnboarding ? (
        <Onboarding
          onFinish={(how) => {
            writeFlag(browserStorage(), how);
            setOnboarding(false);
            go('hearth');
          }}
          onStartDemo={startDemo}
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
        />
      ) : tab === 'lantern' ? (
        <Lantern nowMs={nowMs} onStartDemo={startDemo} />
      ) : tab === 'seance' ? (
        <Seance nowMs={nowMs} />
      ) : tab === 'plan' ? (
        <Plan nowMs={nowMs} />
      ) : tab === 'cold' ? (
        <Cold nowMs={nowMs} selectedId={coldSelected} onSelect={setColdSelected} />
      ) : (
        <You />
      )}

      {showOnboarding ? null : <TabBar active={tab} onSelect={go} />}

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
    </div>
  );
}
