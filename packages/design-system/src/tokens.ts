import theme from '../theme.night.json' with { type: 'json' };

export type LuminanceMode = 'night' | 'dusk' | 'ember';

/** A key into the base colour ramp, e.g. "red.700". */
export type RampKey = keyof typeof theme.ramp;

/** The semantic token names components are allowed to consume. */
export type SemanticToken = keyof (typeof theme.semantic)['night'];

export const MODES: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

export const ramp: Readonly<Record<string, string>> = theme.ramp;
export const amberRamp: Readonly<Record<string, string>> = theme.amberRamp;
export const textCeiling: Readonly<Record<LuminanceMode, RampKey>> = theme.textCeiling as Record<
  LuminanceMode,
  RampKey
>;

/** Text-carrying semantic tokens, which are bounded by the mode's text ceiling. */
export const TEXT_TOKENS: readonly SemanticToken[] = [
  'text.secondary',
  'text.primary',
  'text.emphasis',
  'icon.primary',
  'control.label.primary',
  'alert.help',
];

/** Resolve a semantic token to its hex value for a given mode. */
export function resolveToken(mode: LuminanceMode, token: SemanticToken): string {
  const rampKey = theme.semantic[mode][token] as RampKey;
  return theme.ramp[rampKey];
}

/** All semantic token names. */
export function semanticTokenNames(): SemanticToken[] {
  return Object.keys(theme.semantic.night) as SemanticToken[];
}

export { theme };
