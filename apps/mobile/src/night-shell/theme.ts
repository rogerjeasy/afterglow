import {
  HUES,
  type Hue,
  type LuminanceMode,
  type SemanticToken,
  resolveToken,
  semanticTokenNames,
} from '@afterglow/design-system';
import { useSyncExternalStore } from 'react';

/**
 * Night Shell theme bridge.
 *
 * Resolves the design-system semantic tokens for a mode into CSS custom
 * properties (`--text-primary`, `--surface-2`, ...). Components reference only
 * these variables, so no raw hex ever appears in the app (night-vision.md rule
 * 4 / NS-05). The single source of colour remains theme.night.json in the
 * design-system package.
 *
 * The hue (red, or amber for red colour blindness; NS-18..NS-22) is a separate,
 * remembered choice. It changes which ramp the same tokens resolve to, never the
 * luminance mode, and `<html data-hue>` says which is showing.
 */

const HUE_KEY = 'afterglow.hue.v1'; // gitleaks:allow (a localStorage key name, not a secret)
const isHue = (x: unknown): x is Hue => typeof x === 'string' && (HUES as string[]).includes(x);

function savedHue(): Hue {
  try {
    const v = localStorage.getItem(HUE_KEY);
    return isHue(v) ? v : 'red';
  } catch {
    return 'red';
  }
}

let hue: Hue = typeof window === 'undefined' ? 'red' : savedHue();
const hueListeners = new Set<() => void>();

/** The hue in use: red unless the person chose amber. */
export function getHue(): Hue {
  return hue;
}

/** Choose the hue, remember it, and repaint the current mode in it at once. */
export function setHue(h: Hue): void {
  hue = h;
  try {
    localStorage.setItem(HUE_KEY, h);
  } catch {
    // private mode: this session only
  }
  if (typeof document !== 'undefined') {
    const el = document.documentElement;
    const mode = el.dataset.mode as LuminanceMode | undefined;
    applyMode(mode ?? 'ember', el);
  }
  for (const l of hueListeners) l();
}

/** Re-render when the hue changes. */
export function useHue(): Hue {
  return useSyncExternalStore(
    (l) => {
      hueListeners.add(l);
      return () => hueListeners.delete(l);
    },
    () => hue,
  );
}

/** Convert a semantic token name to its CSS variable name: `text.primary` -> `--text-primary`. */
export function cssVarName(token: SemanticToken): string {
  return `--${token.replace(/\./g, '-')}`;
}

/** Build the full custom-property map for a mode, in the chosen hue. */
export function themeVars(mode: LuminanceMode, h: Hue = hue): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const token of semanticTokenNames()) {
    vars[cssVarName(token)] = resolveToken(mode, token, h);
  }
  return vars;
}

/** Apply a mode's tokens, in the chosen hue, to a DOM element (defaults to the document root). */
export function applyMode(mode: LuminanceMode, el: HTMLElement = document.documentElement): void {
  const vars = themeVars(mode);
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
  }
  el.dataset.mode = mode;
  el.dataset.hue = hue;
}

/** Shorthand for referencing a token as a CSS value in inline styles. */
export function token(t: SemanticToken): string {
  return `var(${cssVarName(t)})`;
}
