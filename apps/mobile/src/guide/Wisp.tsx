import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { Button } from '../night-shell/controls';
import { GhostGlyph } from '../night-shell/costume';
import { token } from '../night-shell/theme';

/**
 * Wisp: the guide's ghost and its speech bubble (guide spec, design §5).
 *
 * Wisp only presents: the shell hands it a finished line. It draws from semantic
 * tokens alone (GD-09), bobs with `transform` only and stops under reduced motion,
 * announces each line politely (GD-10), and skips on Escape.
 */

const TARGET_CLASS = 'tour-target';
/** Space kept clear above a target: the header and a little air. */
const TOP_CLEARANCE = 84;

/** The ghost. Its opacity is the tour's progress (GD-07): faint at first, solid at the end. */
export function WispGhost({ opacity, size = 56 }: { opacity: number; size?: number }): ReactNode {
  // No ambient bob: night-vision rule 7 keeps the only loop for the Hearth candle (NS-17).
  return <GhostGlyph opacity={opacity} size={size} />;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Outline the step's target and bring it into the clear space above the bubble.
 * The target may not exist on the first frame after a tab switch, so look for a few frames.
 */
function useTarget(target: string | null): void {
  useEffect(() => {
    if (!target) return;
    let frame = 0;
    let tries = 0;
    let el: Element | null = null;
    const find = (): void => {
      el = document.querySelector(`[data-tour="${target}"]`);
      if (!el && tries++ < 30) {
        frame = requestAnimationFrame(find);
        return;
      }
      if (!el) return;
      el.classList.add(TARGET_CLASS);
      const top = window.scrollY + el.getBoundingClientRect().top - TOP_CLEARANCE;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
    };
    frame = requestAnimationFrame(find);
    return () => {
      cancelAnimationFrame(frame);
      (el as Element | null)?.classList.remove(TARGET_CLASS);
    };
  }, [target]);
}

/** Keep the page's bottom clear of the bubble while it is open, so nothing is trapped under it. */
function useReserveSpace(ref: React.RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add('tour-open');
    const el = ref.current;
    const set = (): void => {
      if (el)
        root.style.setProperty(
          '--tour-bubble-h',
          `${Math.ceil(el.getBoundingClientRect().height)}px`,
        );
    };
    set();
    const ro = typeof ResizeObserver !== 'undefined' && el ? new ResizeObserver(set) : null;
    if (ro && el) ro.observe(el);
    return () => {
      ro?.disconnect();
      root.classList.remove('tour-open');
      root.style.removeProperty('--tour-bubble-h');
    };
  }, [ref]);
}

function Bubble({
  opacity,
  label,
  children,
  actions,
  onEscape,
  focusKey,
}: {
  opacity: number;
  label: string;
  children: ReactNode;
  actions: ReactNode;
  onEscape: () => void;
  focusKey: string;
}): ReactNode {
  const ref = useRef<HTMLElement | null>(null);
  useReserveSpace(ref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEscape]);

  // Keyboard users land on the forward button of each new step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: focusKey is the step; re-run on each one
  useEffect(() => {
    // The forward button is always first in the actions row.
    const btn = ref.current?.querySelector<HTMLButtonElement>('[data-wisp="actions"] button');
    btn?.focus({ preventScroll: true });
  }, [focusKey]);

  return (
    <aside
      ref={ref}
      aria-label={label}
      data-wisp="bubble"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)',
        maxWidth: 496,
        margin: '0 auto',
        zIndex: 15,
        padding: '18px 16px 16px',
        paddingTop: 30,
        borderRadius: 'var(--radius-tile)',
        background: token('surface.3'),
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: token('hairline'),
      }}
    >
      <div style={{ position: 'absolute', top: -38, left: 14 }}>
        <WispGhost opacity={opacity} />
      </div>
      <div
        aria-live="polite"
        style={{
          fontSize: 'var(--type-body)',
          lineHeight: 1.35,
          color: token('text.primary'),
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </div>
      <div data-wisp="actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {actions}
      </div>
    </aside>
  );
}

export function Wisp({
  line,
  target,
  index,
  length,
  opacity,
  nextLabel,
  onNext,
  onBack,
  onSkip,
}: {
  line: string;
  target: string;
  index: number;
  length: number;
  opacity: number;
  nextLabel: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}): ReactNode {
  useTarget(target);
  return (
    <Bubble
      opacity={opacity}
      label={`Wisp, the guide: step ${index + 1} of ${length}`}
      onEscape={onSkip}
      focusKey={String(index)}
      actions={
        <>
          <Button variant="primary" size="sm" onClick={onNext} style={{ flex: '1 1 auto' }}>
            {nextLabel}
          </Button>
          {index > 0 ? (
            <Button size="sm" onClick={onBack}>
              Back
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onSkip}>
            Skip tour
          </Button>
        </>
      }
    >
      {line}
    </Bubble>
  );
}

/** The card after the last step: what to do now that the night is over. */
export function WispFinish({
  onSetUp,
  onExplore,
  onReplay,
}: {
  onSetUp: () => void;
  onExplore: () => void;
  onReplay: () => void;
}): ReactNode {
  return (
    <Bubble
      opacity={1}
      label="Wisp, the guide: the tour is over"
      onEscape={onExplore}
      focusKey="finish"
      actions={
        <>
          <Button variant="primary" size="sm" onClick={onSetUp} style={{ flex: '1 1 auto' }}>
            Set up my own home
          </Button>
          <Button size="sm" onClick={onExplore}>
            Keep exploring
          </Button>
          <Button variant="ghost" size="sm" onClick={onReplay}>
            Replay
          </Button>
        </>
      }
    >
      That was one night. Tell Afterglow about your real fridge, home and people, and the next
      blackout gets the same answers, about you.
    </Bubble>
  );
}
