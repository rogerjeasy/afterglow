import type { LuminanceMode } from '@afterglow/design-system';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { foodIndex } from './data/foodkeeper';
import { loadDemoHousehold } from './demo/household';
import { useHousehold, useNow } from './household/useHousehold';
import { ModeSwitch } from './night-shell/components';
import { Button, TabBar, type TabId } from './night-shell/controls';
import { applyMode, token } from './night-shell/theme';
import { Cold } from './screens/Cold';
import { Hearth } from './screens/Hearth';

const MODE_CYCLE: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

function tabFromHash(): TabId {
  return window.location.hash.startsWith('#/cold') ? 'cold' : 'hearth';
}

/**
 * The app shell: header, the two built destinations, and the Lights-Out moment.
 *
 * Lights-Out runs whenever an outage begins (design 8.4): the screen fades to
 * pure black, then lands in Night mode, always. Restoration returns to Ember,
 * the lit-room default. "Demo night" loads a simulated household through the
 * same store actions a person uses, then starts an outage.
 */
export function App(): ReactNode {
  const { store, state } = useHousehold();
  const nowMs = useNow(1000);
  const outage = state.view.outageStartedAtMs !== null;

  const [tab, setTab] = useState<TabId>(tabFromHash);
  const [coldSelected, setColdSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<LuminanceMode>(outage ? 'night' : 'ember');
  const [igniting, setIgniting] = useState(false);
  const wasOutage = useRef(outage);

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  useEffect(() => {
    const onHash = (): void => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Deep link for demos and pixel-scan tooling: ?phase=outage[&elapsed=<minutes>]
  // lands on a dark Hearth with the demo household. It uses the same store
  // actions a person would; it only runs when no outage is already recorded.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('phase') !== 'outage' || store.getState().view.outageStartedAtMs !== null)
      return;
    const minutes = Number(params.get('elapsed') ?? '12');
    const elapsedMs = (Number.isFinite(minutes) && minutes >= 0 ? minutes : 12) * 60_000;
    loadDemoHousehold(store, foodIndex);
    store.startOutage(Date.now() - elapsedMs);
  }, [store]);

  // Lights-Out when an outage begins; back to Ember when power returns.
  useEffect(() => {
    const before = wasOutage.current;
    wasOutage.current = outage;
    if (outage && !before) {
      setIgniting(true);
      window.setTimeout(() => {
        setMode('night');
        window.setTimeout(() => setIgniting(false), 450);
      }, 300);
    } else if (!outage && before) {
      setMode('ember');
    }
  }, [outage]);

  const go = (id: TabId): void => {
    window.location.hash = id === 'cold' ? '#/cold' : '#/';
    setTab(id);
  };

  const cycleMode = (): void => {
    const i = MODE_CYCLE.indexOf(mode);
    setMode(MODE_CYCLE[(i + 1) % MODE_CYCLE.length] as LuminanceMode);
  };

  const startDemo = (): void => {
    loadDemoHousehold(store, foodIndex);
    store.startOutage(Date.now());
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
        {!outage ? (
          <Button size="sm" variant="primary" onClick={startDemo} style={{ borderRadius: 999 }}>
            Demo night
          </Button>
        ) : (
          <span style={{ width: 96 }} aria-hidden />
        )}
      </header>

      {tab === 'hearth' ? (
        <Hearth
          nowMs={nowMs}
          onOpenCold={(id) => {
            setColdSelected(id);
            go('cold');
          }}
        />
      ) : (
        <Cold nowMs={nowMs} selectedId={coldSelected} onSelect={setColdSelected} />
      )}

      <TabBar active={tab} onSelect={go} />

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
