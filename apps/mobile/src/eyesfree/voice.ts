/**
 * Voice commands (product description 7.2): the ten most common actions, by voice.
 * Push to talk: one phrase per press, never an always-on microphone. Matching is by
 * keywords in plain words, so "the power's gone", "power out" and "lights went out"
 * all start the outage clocks. Anything not understood is said back, not guessed.
 */

export type VoiceCommand =
  | 'powerOut'
  | 'powerBack'
  | 'status'
  | 'lightOn'
  | 'lightOff'
  | 'alerts'
  | 'lantern'
  | 'seance'
  | 'cold'
  | 'plan'
  | 'listen';

/** The commands as the person can say them, for the help list. */
export const COMMAND_HELP: readonly { readonly say: string; readonly does: string }[] = [
  { say: 'Power out', does: 'starts the outage clocks' },
  { say: 'Power is back', does: 'ends the outage' },
  { say: 'Read it to me', does: 'says how things stand at home' },
  { say: 'Light on / light off', does: 'turns the screen into a red light' },
  { say: 'Alerts', does: 'opens and reads the alerts' },
  { say: 'Lantern', does: 'opens the map of your area' },
  { say: 'Séance', does: 'opens your people' },
  { say: 'Cold', does: 'opens the fridge and freezer' },
  { say: 'Plan', does: 'opens the plan' },
  { say: 'Listen to the room', does: 'checks the mains hum' },
];

export function parseCommand(raw: string): VoiceCommand | null {
  const t = ` ${raw
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-zà-ÿ ]/g, ' ')} `;
  // Whole words and phrases only: "download" is not "down".
  const has = (...words: string[]): boolean => words.some((w) => t.includes(` ${w} `));
  // Order matters: "power is back" must not match "power out".
  if (has('back', 'returned', 'restored', 'came on', 'is on')) return 'powerBack';
  if (has('out', 'gone', 'went off', 'cut', 'blackout', 'outage', 'down')) return 'powerOut';
  if (has('light', 'lights', 'torch', 'lamp', 'flashlight')) {
    return has('off', 'stop', 'close') ? 'lightOff' : 'lightOn';
  }
  if (has('read', 'status', 'how', 'tell me', 'whats')) return 'status';
  if (has('alert', 'alerts', 'warning', 'warnings')) return 'alerts';
  if (has('map', 'lantern', 'area', 'neighbours', 'neighbors')) return 'lantern';
  if (has('seance', 'séance', 'people', 'family', 'roster')) return 'seance';
  if (has('cold', 'fridge', 'freezer', 'food')) return 'cold';
  if (has('plan', 'candles', 'shift')) return 'plan';
  if (has('listen', 'hum', 'sense')) return 'listen';
  return null;
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = (): boolean =>
  typeof window !== 'undefined' && recognitionClass() !== null;

export type Heard =
  | { readonly kind: 'heard'; readonly text: string; readonly command: VoiceCommand | null }
  | { readonly kind: 'nothing' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'failed'; readonly reason: string };

/** Listen for one phrase. */
export function listenOnce(): { result: Promise<Heard>; cancel: () => void } {
  const Rec = recognitionClass();
  if (!Rec) return { result: Promise.resolve({ kind: 'unsupported' }), cancel: () => {} };
  const rec = new Rec();
  rec.lang = document.documentElement.lang || navigator.language || 'en-GB';
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  const result = new Promise<Heard>((resolve) => {
    let done = false;
    const finish = (h: Heard): void => {
      if (!done) {
        done = true;
        resolve(h);
      }
    };
    rec.onresult = (e) => {
      const alts = e.results[0];
      if (!alts) return finish({ kind: 'nothing' });
      // Take the first alternative that is a command, else the most likely words.
      for (let i = 0; i < alts.length; i++) {
        const text = alts[i]?.transcript ?? '';
        const command = parseCommand(text);
        if (command) return finish({ kind: 'heard', text, command });
      }
      finish({ kind: 'heard', text: alts[0]?.transcript ?? '', command: null });
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        finish({ kind: 'denied' });
      else if (e.error === 'no-speech' || e.error === 'aborted') finish({ kind: 'nothing' });
      else finish({ kind: 'failed', reason: e.error });
    };
    rec.onend = () => finish({ kind: 'nothing' });
  });
  rec.start();
  return { result, cancel: () => rec.abort() };
}
