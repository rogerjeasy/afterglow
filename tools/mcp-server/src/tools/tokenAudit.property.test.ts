import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type LuminanceMode, MODES } from '@afterglow/design-system';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { luminanceCheck } from './luminance.js';
import { auditTheme } from './tokenAudit.js';

const THEME_PATH = fileURLToPath(
  new URL('../../../../packages/design-system/theme.night.json', import.meta.url),
);
// Read the file on disk, as the tool does, not the module the design system imported.
const loadTheme = (): Record<string, unknown> & {
  ramp: Record<string, string>;
  semantic: Record<string, Record<string, string>>;
} => JSON.parse(readFileSync(THEME_PATH, 'utf8'));

describe('token_audit', () => {
  it('MCP-03 the real theme.night.json has no violations in any mode', () => {
    const result = auditTheme(loadTheme());
    if ('refused' in result) throw new Error(result.reason);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.modes).toEqual(['night', 'dusk', 'ember']);
    expect(result.tokensChecked).toBeGreaterThan(0);
  });

  it('MCP-03 a text token pointed one step too bright is reported', () => {
    const theme = loadTheme();
    (theme.semantic.night as Record<string, string>)['text.primary'] = 'red.800';
    const result = auditTheme(theme);
    if ('refused' in result) throw new Error(result.reason);
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      expect.objectContaining({
        mode: 'night',
        token: 'text.primary',
        tier: 'text',
        problem: 'exceeds ceiling',
      }),
    ]);
  });

  it('MCP-03 a green ramp step, a grey background, an unresolved value and a missing ceiling are each reported', () => {
    const theme = loadTheme();
    theme.ramp['red.050'] = '#00FF00';
    (theme.semantic.dusk as Record<string, string>).bg = '#111111';
    (theme.semantic.ember as Record<string, string>)['surface.1'] = 'blue.500';
    theme.textCeiling = { night: 'red.700', dusk: 'red.800' };
    const result = auditTheme(theme);
    if ('refused' in result) throw new Error(result.reason);
    const problems = result.violations.map((v) => `${v.mode}/${v.token}:${v.problem}`);
    expect(problems).toContain('night/hairline:not red-only');
    expect(problems).toContain('dusk/bg:not red-only');
    expect(problems).toContain('dusk/bg:background not black');
    expect(problems).toContain('ember/surface.1:unresolved value');
    expect(problems).toContain('ember/(textCeiling):mode has no ceiling');
  });

  it('MCP-03 a file that is not a theme is refused, not passed', () => {
    for (const bad of [
      null,
      42,
      [],
      {},
      { ramp: {} },
      { ramp: 1, textCeiling: {}, semantic: {} },
    ]) {
      expect('refused' in auditTheme(bad)).toBe(true);
    }
  });

  it('MCP-03 property: one token set to any colour is flagged exactly when luminance_check fails it', () => {
    const base = loadTheme();
    const tokens = Object.keys(base.semantic.night as Record<string, string>).filter(
      (t) => t !== 'bg',
    );
    const hexArb = fc
      .tuple(fc.nat(255), fc.nat(255), fc.nat(255))
      .map(([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`);
    fc.assert(
      fc.property(
        fc.constantFrom<LuminanceMode>(...MODES),
        fc.constantFrom(...tokens),
        hexArb,
        (mode, token, hex) => {
          const theme = loadTheme();
          (theme.semantic[mode] as Record<string, string>)[token] = hex;
          const result = auditTheme(theme);
          if ('refused' in result) throw new Error(result.reason);
          const flagged = result.violations.some((v) => v.mode === mode && v.token === token);
          expect(flagged).toBe(!luminanceCheck([hex], mode).allPass);
          // Nothing else in the theme is blamed.
          expect(result.violations.every((v) => v.mode === mode && v.token === token)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
