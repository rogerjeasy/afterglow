import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOGUES, ENGLISH, type Key, LANGS, type Lang } from './catalogue';

/**
 * Localisation (.kiro/specs/consoles LO-01): per-language catalogues with English as
 * the fallback, the phone's language by default, the person's choice when made, and
 * the page's `lang` following it.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

const KEYS = Object.keys(ENGLISH) as Key[];
const LANG_LIST = Object.keys(LANGS) as Lang[];

async function fresh(phone: string, saved: string | null) {
  const data = new Map<string, string>(saved === null ? [] : [['afterglow.lang.v1', saved]]);
  const html = { lang: '' };
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { language: phone });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  vi.stubGlobal('document', { documentElement: html });
  vi.resetModules();
  const m = await import('./i18n');
  return { m, html, data };
}

describe('Localisation (LO-01)', () => {
  it('LO-01 every key reads in every language, falling back to the English text, never blank or a key name', async () => {
    for (const lang of LANG_LIST) {
      const { m } = await fresh('en-GB', lang);
      expect(m.getLang()).toBe(lang);
      for (const k of KEYS) {
        const text = m.t(k);
        expect(text.trim().length).toBeGreaterThan(0);
        expect(text).not.toBe(k);
        expect(text).toBe(CATALOGUES[lang][k] ?? ENGLISH[k]);
      }
    }
    // No catalogue carries a key English does not have.
    for (const lang of LANG_LIST) {
      for (const k of Object.keys(CATALOGUES[lang])) expect(KEYS).toContain(k);
    }
  });

  it('LO-01 the phone’s language is used when there is a catalogue, the person’s choice wins, and the page lang follows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constantFrom('fr-FR', 'es', 'pt-BR', 'en-US', 'de-DE', 'zu-ZA', 'ar'),
          fc.string({ maxLength: 8 }),
        ),
        fc.oneof(fc.constant(null), fc.constantFrom(...LANG_LIST), fc.string({ maxLength: 4 })),
        async (phone, saved) => {
          const { m, html, data } = await fresh(phone, saved);
          const fromPhone = phone.slice(0, 2);
          const known = (x: string | null): x is Lang =>
            x !== null && (LANG_LIST as string[]).includes(x);
          const expected = known(saved) ? saved : known(fromPhone) ? fromPhone : 'en';
          expect(m.getLang()).toBe(expected);
          expect(html.lang).toBe(expected);
          m.setLang('fr');
          expect(m.getLang()).toBe('fr');
          expect(html.lang).toBe('fr');
          expect(data.get('afterglow.lang.v1')).toBe('fr');
        },
      ),
      { numRuns: 40 },
    );
  });
});
