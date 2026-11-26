import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, ChoiceChip, Notice } from '../night-shell/controls';
import { token } from '../night-shell/theme';

/**
 * Lantern mode (product description 7.2): the phone as a light.
 * - Red: full-screen red, the most light per watt that keeps night vision.
 * - White for 30 seconds: only after a confirmation, then back to red, with the
 *   dark-adaptation clock (eyes take about 20 minutes to fully readjust).
 * - SOS: · · · — — — · · · in Morse, repeated; slower than 3 flashes a second.
 * - Beacon: steady full red, so someone can find you or a Heliograph receiver can lock on.
 * The screen is kept awake while the light is on, and a dark strip at the top always
 * carries Close.
 */

type Kind = 'red' | 'white' | 'sos' | 'beacon';

const WHITE_MS = 30_000;
const READAPT_MS = 20 * 60_000;
const UNIT_MS = 300;
/** On (true) and off (false) durations in Morse units for S O S plus the word gap. */
const SOS: readonly [boolean, number][] = [
  [true, 1],
  [false, 1],
  [true, 1],
  [false, 1],
  [true, 1],
  [false, 3],
  [true, 3],
  [false, 1],
  [true, 3],
  [false, 1],
  [true, 3],
  [false, 3],
  [true, 1],
  [false, 1],
  [true, 1],
  [false, 1],
  [true, 1],
  [false, 7],
];
const LEVELS = [0.35, 0.65, 1] as const;
const LEVEL_WORD = ['Dim', 'Medium', 'Bright'] as const;
/** The one place the app paints white: the escape hatch, after a confirmation. */
const WHITE = 'rgb(255, 255, 255)';

let whiteEndedAt: number | null = null;

function useWakeLock(): void {
  useEffect(() => {
    type WakeLock = { release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<WakeLock> };
    };
    let lock: WakeLock | null = null;
    let live = true;
    const take = (): void => {
      void nav.wakeLock
        ?.request('screen')
        .then((l) => {
          if (live) lock = l;
          else void l.release();
        })
        .catch(() => {});
    };
    take();
    // The lock is dropped when the page is hidden; take it again on return.
    const onVis = (): void => {
      if (document.visibilityState === 'visible') take();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);
}

function minutesLeft(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  return m <= 1 ? 'about a minute' : `about ${m} minutes`;
}

export function LightMode({ onClose }: { onClose: () => void }): ReactNode {
  useWakeLock();
  const [kind, setKind] = useState<Kind>('red');
  const [level, setLevel] = useState(1);
  const [confirm, setConfirm] = useState<'white' | 'sos' | null>(null);
  const [whiteLeft, setWhiteLeft] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const lightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // White: 30 seconds, then back to red, and the readaptation clock starts.
  useEffect(() => {
    if (kind !== 'white') return;
    const ends = Date.now() + WHITE_MS;
    setWhiteLeft(WHITE_MS);
    const id = window.setInterval(() => {
      const left = ends - Date.now();
      if (left <= 0) {
        whiteEndedAt = Date.now();
        setKind('red');
      } else setWhiteLeft(left);
    }, 250);
    return () => {
      window.clearInterval(id);
      whiteEndedAt = Date.now();
    };
  }, [kind]);

  // SOS: drive the light directly, not through React, so the timing holds.
  useEffect(() => {
    if (kind !== 'sos') return;
    let i = 0;
    let timer = 0;
    const step = (): void => {
      const [on, units] = SOS[i % SOS.length] as [boolean, number];
      const el = lightRef.current;
      if (el) el.style.opacity = on ? '1' : '0';
      i++;
      timer = window.setTimeout(step, units * UNIT_MS);
    };
    step();
    return () => {
      window.clearTimeout(timer);
      if (lightRef.current) lightRef.current.style.opacity = '1';
    };
  }, [kind]);

  const background = kind === 'white' ? WHITE : token('text.emphasis');
  const opacity = kind === 'red' ? LEVELS[level] : 1;
  const readapt = whiteEndedAt !== null ? READAPT_MS - (now - whiteEndedAt) : 0;
  const label =
    kind === 'white'
      ? `White light, ${Math.ceil(whiteLeft / 1000)} seconds left`
      : kind === 'sos'
        ? 'SOS: flashing in Morse'
        : kind === 'beacon'
          ? 'Beacon: steady light'
          : `Red light, ${LEVEL_WORD[level]}`;

  return (
    <dialog
      open
      aria-label="Light"
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
        background: token('bg'),
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 16px',
          background: token('bg'),
        }}
      >
        <span
          aria-live="polite"
          style={{ fontSize: 'var(--type-body)', color: token('text.secondary') }}
        >
          {label}
        </span>
        <Button size="sm" variant="primary" onClick={onClose}>
          Close
        </Button>
      </div>
      <div
        ref={lightRef}
        aria-hidden="true"
        style={{
          flex: 1,
          background,
          opacity,
          transition: kind === 'sos' ? 'none' : 'opacity 200ms',
        }}
      />
      <div
        style={{
          padding: '12px 16px 20px',
          background: token('bg'),
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {confirm === 'white' ? (
          <>
            <Notice>
              White light for 30 seconds. It ends your night vision: afterwards your eyes need about
              20 minutes to see well in the dark again. Then it turns red by itself.
            </Notice>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirm(null);
                  setKind('white');
                }}
              >
                White for 30 seconds
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Keep red
              </Button>
            </div>
          </>
        ) : confirm === 'sos' ? (
          <>
            <Notice>
              The whole screen will flash. Do not use it near anyone who is sensitive to flashing
              light. SOS is for real emergencies: point the screen where help may see it.
            </Notice>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirm(null);
                  setKind('sos');
                }}
              >
                Start SOS
              </Button>
              <Button variant="ghost" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LEVEL_WORD.map((w, i) => (
                <ChoiceChip
                  key={w}
                  label={w}
                  selected={kind === 'red' && level === i}
                  onClick={() => {
                    setKind('red');
                    setLevel(i);
                  }}
                />
              ))}
              <ChoiceChip
                label="Beacon"
                selected={kind === 'beacon'}
                onClick={() => setKind('beacon')}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => setConfirm('sos')} disabled={kind === 'sos'}>
                SOS
              </Button>
              <Button size="sm" onClick={() => setConfirm('white')} disabled={kind === 'white'}>
                White light
              </Button>
            </div>
            {readapt > 0 ? (
              <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
                After the white light, your eyes need {minutesLeft(readapt)} more to fully adjust to
                the dark.
              </span>
            ) : null}
          </>
        )}
      </div>
    </dialog>
  );
}

// Open from anywhere (the Hearth, the Lantern, a voice command) without prop chains.
let open = false;
const listeners = new Set<() => void>();
export function openLight(v = true): void {
  open = v;
  for (const l of listeners) l();
}
export function useLightOpen(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => open,
  );
}
