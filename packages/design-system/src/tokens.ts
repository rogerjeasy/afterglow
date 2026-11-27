import theme from '../theme.night.json' with { type: 'json' };

export type LuminanceMode = 'night' | 'dusk' | 'ember';

/** A key into the base colour ramp, e.g. "red.700". */
export type RampKey = keyof typeof theme.ramp;

/** The semantic token names components are allowed to consume. */
export type SemanticToken = keyof (typeof theme.semantic)['night'];

export const MODES: readonly LuminanceMode[] = ['night', 'dusk', 'ember'];

/**
 * The colour family the tokens resolve to. Red is the default and best for night
 * vision; amber is the variant for protanopia (red colour blindness), at the same
 * luminance ceilings (design 3.4). The hue is independent of the luminance mode.
 */
export type Hue = 'red' | 'amber';

export const HUES: readonly Hue[] = ['red', 'amber'];

/** A key into the amber ramp, e.g. "amber.700". */
export type AmberKey = keyof typeof theme.amberRamp;

export const ramp: Readonly<Record<string, string>> = theme.ramp;
export const amberRamp: Readonly<Record<string, string>> = theme.amberRamp;
/** Which amber step stands in for each red step (theme.night.json `amberFor`). */
export const amberFor: Readonly<Record<RampKey, AmberKey>> = theme.amberFor as Record<
  RampKey,
  AmberKey
>;
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

/** Resolve a semantic token to its hex value for a given mode and hue (red by default). */
export function resolveToken(mode: LuminanceMode, token: SemanticToken, hue: Hue = 'red'): string {
  const rampKey = theme.semantic[mode][token] as RampKey;
  return hue === 'amber' ? theme.amberRamp[amberFor[rampKey]] : theme.ramp[rampKey];
}

/** The hex value of a mode's text ceiling: the brightest any pixel may be, in either hue. */
export function ceilingHex(mode: LuminanceMode): string {
  return theme.ramp[textCeiling[mode]];
}

/** All semantic token names. */
export function semanticTokenNames(): SemanticToken[] {
  return Object.keys(theme.semantic.night) as SemanticToken[];
}

export { theme };
