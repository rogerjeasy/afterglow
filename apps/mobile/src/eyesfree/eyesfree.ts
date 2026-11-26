import { useSyncExternalStore } from 'react';

/**
 * Eyes-free mode (product description 7.2): the app speaks, buzzes and listens, so it
 * works in the dark, in a pocket, or for someone who cannot read the screen.
 * - Speech: the home line and new alerts are read aloud (the browser's own voices).
 * - Haptic grammar (design 13): one long = outage, two short = restoration, three
 *   short = a HELP was received. The same everywhere, so it can be learned.
 * - Voice commands: the most common actions, by voice (see voice.ts).
 * Each part is off until the person turns it on.
 */

export interface EyesFreePrefs {
  readonly speech: boolean;
  readonly haptics: boolean;
  readonly voice: boolean;
}

const KEY = 'afterglow.eyesfree.v1';
const OFF: EyesFreePrefs = { speech: false, haptics: false, voice: false };

function load(): EyesFreePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<EyesFreePrefs> | null;
    if (!raw || typeof raw !== 'object') return OFF;
    return {
      speech: raw.speech === true,
      haptics: raw.haptics === true,
      voice: raw.voice === true,
    };
  } catch {
    return OFF;
  }
}

let prefs: EyesFreePrefs = typeof localStorage === 'undefined' ? OFF : load();
const listeners = new Set<() => void>();

export function getEyesFree(): EyesFreePrefs {
  return prefs;
}

export function setEyesFree(patch: Partial<EyesFreePrefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // private mode: this session only
  }
  for (const l of listeners) l();
}

export function useEyesFree(): EyesFreePrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const canBuzz = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Say it calmly, replacing anything still being said when `interrupt` is set. */
export function speak(text: string, opts: { interrupt?: boolean; force?: boolean } = {}): void {
  if (!canSpeak() || (!prefs.speech && !opts.force)) return;
  const synth = window.speechSynthesis;
  if (opts.interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  u.lang = document.documentElement.lang || navigator.language || 'en';
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export type Haptic = 'outage' | 'restoration' | 'help';

/** The haptic grammar, in milliseconds of on, off, on… */
export const HAPTIC: Readonly<Record<Haptic, readonly number[]>> = {
  outage: [700],
  restoration: [150, 120, 150],
  help: [120, 100, 120, 100, 120],
};

export function buzz(kind: Haptic, opts: { force?: boolean } = {}): void {
  if (!canBuzz() || (!prefs.haptics && !opts.force)) return;
  navigator.vibrate([...HAPTIC[kind]]);
}

/** Buzz first, then speak: at night the buzz alone is often enough (7.13 "haptic first"). */
export function announce(kind: Haptic | null, text: string): void {
  if (kind) buzz(kind);
  speak(text);
}

// The Hearth registers what "read it to me" says, so a voice command can ask for it.
let statusText: (() => string) | null = null;
export function provideStatus(fn: (() => string) | null): void {
  statusText = fn;
}
export function currentStatus(): string | null {
  return statusText ? statusText() : null;
}
