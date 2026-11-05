import { type ReactNode, useEffect, useState } from 'react';
import type { LuminanceMode } from '@afterglow/design-system';
import { ModeSwitch } from './night-shell/components';
import { applyMode, token } from './night-shell/theme';
import { Hearth } from './screens/Hearth';
import { type DemoPhase, runScenario } from './demo/scenario';

const MODE_CYCLE: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

/**
 * The demo flow: start powered (Ember, as onboarding would), tap "Demo night"
 * to run the Lights-Out moment — a fade to black, then the Hearth ignites in
 * Night mode showing the outage verdict from the real fusion core.
 */
export function App(): ReactNode {
  // Deep link: ?phase=outage lands directly on the dark Hearth (used by the
  // demo and by pixel-scan tooling). Lights-Out still animates on tap.
  const initialOutage =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('phase') === 'outage';

  const [phase, setPhase] = useState<DemoPhase>(initialOutage ? 'outage' : 'powered');
  const [mode, setMode] = useState<LuminanceMode>(initialOutage ? 'night' : 'ember');
  const [igniting, setIgniting] = useState(false);

  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  const scenario = runScenario(phase);

  function triggerLightsOut(): void {
    // Lights-Out always lands in Night (night-vision.md rule 5 / design 3.3).
    setIgniting(true);
    window.setTimeout(() => {
      setPhase('outage');
      setMode('night');
      window.setTimeout(() => setIgniting(false), 450);
    }, 300);
  }

  function cycleMode(): void {
    const i = MODE_CYCLE.indexOf(mode);
    setMode(MODE_CYCLE[(i + 1) % MODE_CYCLE.length] as LuminanceMode);
  }

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
        <span
          style={{
            fontSize: 'var(--type-title)',
            color: token('text.emphasis'),
          }}
        >
          Afterglow
        </span>
        {phase === 'powered' ? (
          <button
            type="button"
            onClick={triggerLightsOut}
            style={{
              minHeight: 44,
              padding: '0 14px',
              borderRadius: 999,
              border: `1px solid ${token('focus.ring')}`,
              background: token('control.fill.primary'),
              color: token('control.label.primary'),
              fontSize: 'var(--type-caption)',
            }}
          >
            Demo night
          </button>
        ) : (
          <span style={{ width: 96 }} aria-hidden />
        )}
      </header>

      <Hearth scenario={scenario} />

      {/* Lights-Out scrim: fades to pure black during the transition. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          background: '#000000',
          pointerEvents: 'none',
          opacity: igniting ? 1 : 0,
          transition: 'opacity 300ms ease-out',
        }}
      />
    </div>
  );
}
