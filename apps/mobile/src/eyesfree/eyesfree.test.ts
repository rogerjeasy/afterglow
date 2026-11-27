import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_HELP, type VoiceCommand, parseCommand } from './voice';

/**
 * Eyes-free mode (.kiro/specs/device-features DF-06..DF-09): everything off until turned
 * on, the haptic grammar, speech, and voice commands matched by whole words, never guessed.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** A fresh copy of the module, with whatever the browser offers stubbed in first. */
async function fresh(globals: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(globals)) vi.stubGlobal(k, v);
  vi.resetModules();
  return import('./eyesfree');
}
const storage = (raw: string | null) => {
  const data = new Map<string, string>(raw === null ? [] : [['afterglow.eyesfree.v1', raw]]);
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
    data,
  };
};

describe('Eyes-free preferences (DF-06)', () => {
  it('DF-06 speech, vibration and voice are off until the person turns each on, whatever was stored', async () => {
    expect((await fresh()).getEyesFree()).toEqual({ speech: false, haptics: false, voice: false });
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.jsonValue().map((v) => JSON.stringify(v)),
          fc
            .record(
              { speech: fc.jsonValue(), haptics: fc.jsonValue(), voice: fc.jsonValue() },
              { requiredKeys: [] },
            )
            .map((v) => JSON.stringify(v)),
          fc.string(),
          fc.constant(null),
        ),
        async (raw) => {
          const m = await fresh({ localStorage: storage(raw) });
          const p = m.getEyesFree();
          let parsed: Record<string, unknown> = {};
          try {
            const x = JSON.parse(raw ?? 'null');
            if (x && typeof x === 'object') parsed = x;
          } catch {
            // not JSON: everything off
          }
          expect(p).toEqual({
            speech: parsed.speech === true,
            haptics: parsed.haptics === true,
            voice: parsed.voice === true,
          });
        },
      ),
      { numRuns: 40 },
    );
  });

  it('DF-06 turning one on keeps the others as they were, and is remembered', async () => {
    const s = storage(null);
    const m = await fresh({ localStorage: s });
    m.setEyesFree({ haptics: true });
    expect(m.getEyesFree()).toEqual({ speech: false, haptics: true, voice: false });
    expect(JSON.parse(s.data.get('afterglow.eyesfree.v1') ?? '{}')).toEqual({
      speech: false,
      haptics: true,
      voice: false,
    });
  });

  it('DF-06 without the browser APIs it says it cannot, and nothing is spoken or buzzed', async () => {
    const m = await fresh();
    expect(m.canSpeak()).toBe(false);
    expect(m.canBuzz()).toBe(false);
    m.setEyesFree({ speech: true, haptics: true });
    expect(() => m.announce('outage', 'The power is out.')).not.toThrow();
  });
});

describe('Haptic grammar (DF-07)', () => {
  const pulses = (p: readonly number[]) => p.filter((_, i) => i % 2 === 0);

  it('DF-07 one long for an outage, two short for power back, three short for HELP', async () => {
    const { HAPTIC } = await fresh();
    expect(pulses(HAPTIC.outage)).toHaveLength(1);
    expect(pulses(HAPTIC.restoration)).toHaveLength(2);
    expect(pulses(HAPTIC.help)).toHaveLength(3);
    const longest = Math.max(...pulses(HAPTIC.restoration), ...pulses(HAPTIC.help));
    expect(pulses(HAPTIC.outage)[0]).toBeGreaterThanOrEqual(3 * longest);
    // The service worker's push notifications use the same grammar.
    const sw = readFileSync(new URL('../../sw/sw.template.js', import.meta.url), 'utf8');
    expect(sw).toContain(
      `data.kind === 'restoration' ? ${JSON.stringify(HAPTIC.restoration).replace(/,/g, ', ')}`,
    );
    expect(sw).toContain(`data.kind === 'outage' ? ${JSON.stringify(HAPTIC.outage)}`);
  });

  it('DF-07 it buzzes only while vibration is on, except when the person asks to feel a pattern', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('outage', 'restoration', 'help' as const),
        fc.boolean(),
        fc.boolean(),
        async (kind, on, force) => {
          const vibrate = vi.fn(() => true);
          const m = await fresh({ navigator: { vibrate } });
          m.setEyesFree({ haptics: on });
          m.buzz(kind as 'outage', { force });
          if (on || force) expect(vibrate).toHaveBeenCalledWith([...m.HAPTIC[kind as 'outage']]);
          else expect(vibrate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 24 },
    );
  });
});

describe('Reading aloud (DF-08)', () => {
  it('DF-08 it speaks once, only while reading aloud is on (or on request), and can interrupt itself', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        async (text, on, force, interrupt) => {
          const said: string[] = [];
          let cancelled = 0;
          const synth = {
            speak: (u: { text: string }) => said.push(u.text),
            cancel: () => cancelled++,
          };
          class Utterance {
            rate = 1;
            lang = '';
            constructor(readonly text: string) {}
          }
          const m = await fresh({
            window: { speechSynthesis: synth },
            SpeechSynthesisUtterance: Utterance,
            document: { documentElement: { lang: 'en' } },
            navigator: { language: 'en-GB' },
          });
          m.setEyesFree({ speech: on });
          m.speak(text, { force, interrupt });
          expect(said).toEqual(on || force ? [text] : []);
          expect(cancelled).toBe((on || force) && interrupt ? 1 : 0);
        },
      ),
      { numRuns: 30 },
    );
  });
});

describe('Voice commands (DF-09)', () => {
  const EXPECT: Record<string, VoiceCommand> = {
    'Power out': 'powerOut',
    'Power is back': 'powerBack',
    'Read it to me': 'status',
    'Light on': 'lightOn',
    'light off': 'lightOff',
    Alerts: 'alerts',
    Lantern: 'lantern',
    Séance: 'seance',
    Cold: 'cold',
    Plan: 'plan',
    'Listen to the room': 'listen',
  };
  const KEYWORDS = new Set(
    'back returned restored out gone cut blackout outage down light lights torch lamp flashlight read status how whats alert alerts warning warnings map lantern area neighbours neighbors seance séance people family roster cold fridge freezer food plan candles shift listen hum sense'.split(
      ' ',
    ),
  );

  it('DF-09 each of the ten commands in the help list is understood as itself', () => {
    const said = COMMAND_HELP.flatMap((c) => c.say.split(' / '));
    expect(said.length).toBe(11);
    for (const s of said) expect(parseCommand(s)).toBe(EXPECT[s]);
    expect(parseCommand("the power's gone")).toBe('powerOut');
    expect(parseCommand('lights went out')).toBe('powerOut');
    expect(parseCommand('the power came on')).toBe('powerBack');
  });

  it('DF-09 matching ignores case and punctuation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(EXPECT)),
        fc.constantFrom('', '.', '!', '?', ',', '...'),
        fc.boolean(),
        (phrase, punct, upper) => {
          const said = `${upper ? phrase.toUpperCase() : phrase.toLowerCase()}${punct}`;
          expect(parseCommand(said)).toBe(EXPECT[phrase]);
        },
      ),
    );
  });

  it('DF-09 only whole words count: a word that merely contains a keyword is not understood', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{1,12}$/), (word) => {
        if (KEYWORDS.has(word)) expect(parseCommand(word)).not.toBeNull();
        else expect(parseCommand(word)).toBeNull();
      }),
      { numRuns: 500 },
    );
    for (const w of [
      'download',
      'outside',
      'cutlery',
      'plane',
      'colder',
      'mapping',
      'reading',
      'shower',
    ]) {
      expect(parseCommand(w)).toBeNull();
    }
  });

  it('DF-09 anything not understood is null, never a guess', () => {
    fc.assert(
      fc.property(fc.array(fc.stringMatching(/^[a-z]{1,10}$/), { maxLength: 6 }), (words) => {
        const command = parseCommand(words.join(' '));
        if (
          !words.some((w) => KEYWORDS.has(w)) &&
          !/came on|is on|went off|tell me/.test(words.join(' '))
        ) {
          expect(command).toBeNull();
        }
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(fc.fullUnicodeString(), (s) => {
        expect(() => parseCommand(s)).not.toThrow();
      }),
    );
  });
});
