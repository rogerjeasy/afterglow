import { runTransmission } from '@afterglow/adapters';
import type { heliograph } from '@afterglow/core';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../night-shell/controls';
import { token } from '../night-shell/theme';

/**
 * The screen lamp: the whole screen becomes the signal while a message is sent.
 *
 * The lit colour is the mode's own emphasis token, so the lamp stays red and
 * under the active luminance ceiling (night-vision rules 2 and 3). The strip
 * at the top stays dark and carries a one-tap Stop (HL-17). The lamp colour is
 * set directly on the element, not through React state, so the schedule is not
 * delayed by a re-render. The lamp always ends dark.
 */
export function Lamp({
  plan,
  label,
  onDone,
}: {
  plan: heliograph.TransmitPlan;
  label: string;
  onDone: (outcome: 'done' | 'cancelled') => void;
}): ReactNode {
  const lampRef = useRef<HTMLDivElement | null>(null);
  const cancelled = useRef(false);
  const [remaining, setRemaining] = useState(plan.totalMs);

  useEffect(() => {
    cancelled.current = false;
    let alive = true;
    const t0 = performance.now();
    const tick = window.setInterval(() => {
      setRemaining(Math.max(0, plan.totalMs - (performance.now() - t0)));
    }, 250);
    void runTransmission(plan, {
      now: () => performance.now(),
      wait: (ms) => new Promise((r) => window.setTimeout(r, ms)),
      setLit: (lit) => {
        const el = lampRef.current;
        if (el) el.style.background = lit ? token('text.emphasis') : token('bg');
      },
      isCancelled: () => cancelled.current || !alive,
    }).then((outcome) => {
      if (alive) onDone(outcome);
    });
    return () => {
      alive = false;
      window.clearInterval(tick);
    };
  }, [plan, onDone]);

  return (
    <dialog
      open
      aria-label={`Sending: ${label}`}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
        margin: 0,
        padding: 0,
        border: 'none',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        background: token('bg'),
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 20px',
          minHeight: 72,
          background: token('bg'),
        }}
      >
        <span style={{ fontSize: 'var(--type-body)', color: token('text.primary'), minWidth: 0 }}>
          Sending {label} · {Math.ceil(remaining / 1000)} s left
        </span>
        <Button
          variant="primary"
          onClick={() => {
            cancelled.current = true;
          }}
        >
          Stop
        </Button>
      </div>
      <div ref={lampRef} style={{ flex: 1, background: token('bg') }} />
    </dialog>
  );
}
