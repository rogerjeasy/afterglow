import { useSyncExternalStore } from 'react';
import { CATALOGUES, ENGLISH, type Key, LANGS, type Lang } from './catalogue';

/**
 * The language in use: the person's choice, else the phone's language when we have
 * a catalogue for it, else English. The page's `lang` follows, so screen readers and
 * the read-aloud voice speak the right language.
 */
const KEY = 'afterglow.lang.v1';
const isLang = (x: unknown): x is Lang => typeof x === 'string' && x in LANGS;

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {
    // no storage
  }
  const phone = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 2);
  return isLang(phone) ? phone : 'en';
}

let lang: Lang = typeof window === 'undefined' ? 'en' : initial();
const listeners = new Set<() => void>();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // private mode
  }
  document.documentElement.lang = l;
  for (const f of listeners) f();
}

export function getLang(): Lang {
  return lang;
}

/** The text for a key in the current language, falling back to English. */
export function t(key: Key): string {
  return CATALOGUES[lang][key] ?? ENGLISH[key];
}

/** Re-render when the language changes; returns `t` for convenience. */
export function useT(): typeof t {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lang,
  );
  return t;
}
