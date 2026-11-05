import {
  type LuminanceMode,
  type SemanticToken,
  resolveToken,
  semanticTokenNames,
} from '@afterglow/design-system';

/**
 * Night Shell theme bridge.
 *
 * Resolves the design-system semantic tokens for a mode into CSS custom
 * properties (`--text-primary`, `--surface-2`, ...). Components reference only
 * these variables, so no raw hex ever appears in the app (night-vision.md rule
 * 4 / NS-05). The single source of colour remains theme.night.json in the
 * design-system package.
 */

/** Convert a semantic token name to its CSS variable name: `text.primary` -> `--text-primary`. */
export function cssVarName(token: SemanticToken): string {
  return `--${token.replace(/\./g, '-')}`;
}

/** Build the full custom-property map for a mode. */
export function themeVars(mode: LuminanceMode): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const token of semanticTokenNames()) {
    vars[cssVarName(token)] = resolveToken(mode, token);
  }
  return vars;
}

/** Apply a mode's tokens to a DOM element (defaults to the document root). */
export function applyMode(mode: LuminanceMode, el: HTMLElement = document.documentElement): void {
  const vars = themeVars(mode);
  for (const [name, value] of Object.entries(vars)) {
    el.style.setProperty(name, value);
  }
  el.dataset.mode = mode;
}

/** Shorthand for referencing a token as a CSS value in inline styles. */
export function token(t: SemanticToken): string {
  return `var(${cssVarName(t)})`;
}
