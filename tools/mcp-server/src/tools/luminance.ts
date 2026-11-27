import {
  type LuminanceMode,
  contrastOnBlack,
  isRedDominant,
  ramp,
  relativeLuminance,
  textCeiling,
} from '@afterglow/design-system';

/**
 * luminance_check (MCP-01, MCP-02). Every number comes from the design-system
 * functions that guard the real tokens; this module only arranges them.
 */

/** Floating-point slack when comparing a luminance to its ceiling (same as NS-03). */
export const LUMINANCE_EPS = 1e-9;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export interface Ceiling {
  readonly mode: LuminanceMode;
  readonly token: string;
  readonly hex: string;
  readonly relativeLuminance: number;
}

export type ColourResult =
  | {
      readonly input: string;
      readonly verdict: 'pass' | 'fail';
      readonly hex: string;
      readonly relativeLuminance: number;
      readonly contrastOnBlack: number;
      readonly redOnly: boolean;
      readonly withinCeiling: boolean;
      readonly problems: readonly string[];
    }
  | {
      readonly input: string;
      readonly verdict: 'unknown';
      readonly reason: string;
    };

export interface LuminanceReport {
  readonly mode: LuminanceMode;
  readonly ceiling: Ceiling;
  readonly rule: string;
  /** True only when every colour passes; an unparseable colour makes it false. */
  readonly allPass: boolean;
  readonly results: readonly ColourResult[];
}

/** The text ceiling of a mode, from theme.night.json via the design system. */
export function ceilingFor(mode: LuminanceMode): Ceiling {
  const token = textCeiling[mode];
  const hex = ramp[token] as string;
  return { mode, token, hex, relativeLuminance: relativeLuminance(hex) };
}

/** Judge one colour against a ceiling. Never throws: a malformed colour is `unknown`. */
export function judgeColour(input: string, ceiling: Ceiling): ColourResult {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (!HEX6.test(trimmed)) {
    return {
      input,
      verdict: 'unknown',
      reason: 'Not a 6-digit CSS hex colour (#RRGGBB); not judged.',
    };
  }
  const hex = trimmed.toUpperCase();
  const l = relativeLuminance(hex);
  const redOnly = isRedDominant(hex);
  const withinCeiling = l <= ceiling.relativeLuminance + LUMINANCE_EPS;
  const problems = [
    ...(redOnly ? [] : ['not red-only: R < 3 x max(G, B)']),
    ...(withinCeiling ? [] : [`brighter than the ${ceiling.mode} ceiling ${ceiling.hex}`]),
  ];
  return {
    input,
    verdict: problems.length === 0 ? 'pass' : 'fail',
    hex,
    relativeLuminance: l,
    contrastOnBlack: contrastOnBlack(hex),
    redOnly,
    withinCeiling,
    problems,
  };
}

export function luminanceCheck(colours: readonly string[], mode: LuminanceMode): LuminanceReport {
  const ceiling = ceilingFor(mode);
  const results = colours.map((c) => judgeColour(c, ceiling));
  return {
    mode,
    ceiling,
    rule: 'pass = red-only (R >= 3 x max(G, B)) and WCAG relative luminance <= the mode text ceiling',
    allPass: results.length > 0 && results.every((r) => r.verdict === 'pass'),
    results,
  };
}
