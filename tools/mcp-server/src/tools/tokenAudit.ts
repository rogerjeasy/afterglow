import {
  type LuminanceMode,
  TEXT_TOKENS,
  isRedDominant,
  relativeLuminance,
} from '@afterglow/design-system';
import { z } from 'zod';
import { LUMINANCE_EPS } from './luminance.js';

/**
 * token_audit (MCP-03). Audits any theme file shaped like theme.night.json:
 * a `ramp` of named hex colours, a `textCeiling` ramp key per mode, and a
 * `semantic` table per mode whose values are ramp keys (or raw hex). Every
 * token in a mode must be red-only and no brighter than that mode's ceiling;
 * the background must be pure black. Anything it cannot resolve is a
 * violation, never a silent pass.
 */

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export const themeSchema = z.object({
  ramp: z.record(z.string(), z.string()),
  textCeiling: z.record(z.string(), z.string()),
  semantic: z.record(z.string(), z.record(z.string(), z.string())),
});

export type Problem =
  | 'exceeds ceiling'
  | 'not red-only'
  | 'unresolved value'
  | 'background not black'
  | 'mode has no ceiling';

export interface Violation {
  readonly mode: string;
  readonly token: string;
  readonly value: string;
  readonly hex: string | null;
  readonly tier: 'text' | 'non-text' | 'mode';
  readonly problem: Problem;
  readonly relativeLuminance: number | null;
  readonly ceilingLuminance: number | null;
}

export type AuditResult =
  | {
      readonly ok: boolean;
      readonly modes: readonly string[];
      readonly tokensChecked: number;
      readonly ceilings: Readonly<Record<string, { token: string; hex: string } | null>>;
      readonly violations: readonly Violation[];
    }
  | { readonly refused: true; readonly reason: string };

const BACKGROUND_TOKENS: ReadonlySet<string> = new Set(['bg', 'background']);
const TEXT: ReadonlySet<string> = new Set<string>(TEXT_TOKENS);

function resolve(ramp: Record<string, string>, value: string): string | null {
  const fromRamp = Object.prototype.hasOwnProperty.call(ramp, value) ? ramp[value] : undefined;
  const hex = fromRamp ?? value;
  return HEX6.test(hex) ? hex.toUpperCase() : null;
}

function tierOf(token: string): Violation['tier'] {
  return TEXT.has(token) || token.startsWith('text.') ? 'text' : 'non-text';
}

/** Audit a parsed theme object. Pure; never throws. */
export function auditTheme(theme: unknown, onlyModes?: readonly LuminanceMode[]): AuditResult {
  const parsed = themeSchema.safeParse(theme);
  if (!parsed.success) {
    return {
      refused: true,
      reason: `Not a theme file: expected { ramp, textCeiling, semantic }. ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`,
    };
  }
  const { ramp, textCeiling, semantic } = parsed.data;
  const modes = Object.keys(semantic).filter(
    (m) => onlyModes === undefined || (onlyModes as readonly string[]).includes(m),
  );
  if (modes.length === 0) {
    return { refused: true, reason: 'The theme has none of the requested modes.' };
  }

  const violations: Violation[] = [];
  const ceilings: Record<string, { token: string; hex: string } | null> = {};
  let tokensChecked = 0;

  for (const mode of modes) {
    const ceilingKey = textCeiling[mode];
    const ceilingHex = ceilingKey === undefined ? null : resolve(ramp, ceilingKey);
    ceilings[mode] = ceilingHex === null ? null : { token: ceilingKey as string, hex: ceilingHex };
    const ceilingL = ceilingHex === null ? null : relativeLuminance(ceilingHex);
    if (ceilingL === null) {
      violations.push({
        mode,
        token: '(textCeiling)',
        value: ceilingKey ?? '(missing)',
        hex: null,
        tier: 'mode',
        problem: 'mode has no ceiling',
        relativeLuminance: null,
        ceilingLuminance: null,
      });
    }
    for (const [token, value] of Object.entries(semantic[mode] ?? {})) {
      tokensChecked += 1;
      const hex = resolve(ramp, value);
      const tier = tierOf(token);
      const base = { mode, token, value, hex, tier, ceilingLuminance: ceilingL };
      if (hex === null) {
        violations.push({ ...base, problem: 'unresolved value', relativeLuminance: null });
        continue;
      }
      const l = relativeLuminance(hex);
      if (!isRedDominant(hex)) {
        violations.push({ ...base, problem: 'not red-only', relativeLuminance: l });
      }
      if (ceilingL !== null && l > ceilingL + LUMINANCE_EPS) {
        violations.push({ ...base, problem: 'exceeds ceiling', relativeLuminance: l });
      }
      if (BACKGROUND_TOKENS.has(token) && hex !== '#000000') {
        violations.push({ ...base, problem: 'background not black', relativeLuminance: l });
      }
    }
  }
  return { ok: violations.length === 0, modes, tokensChecked, ceilings, violations };
}
