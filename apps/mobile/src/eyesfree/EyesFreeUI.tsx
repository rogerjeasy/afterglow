import { type ReactNode, useState } from 'react';
import { Sources } from '../night-shell/components';
import { Button, ChoiceChip, Fold, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import {
  buzz,
  canBuzz,
  canSpeak,
  currentStatus,
  setEyesFree,
  speak,
  useEyesFree,
} from './eyesfree';
import { COMMAND_HELP, type VoiceCommand, canListen, listenOnce } from './voice';

let handler: ((c: VoiceCommand) => string) | null = null;
/** The shell registers what each command does; it returns what to say back. */
export function setCommandHandler(h: ((c: VoiceCommand) => string) | null): void {
  handler = h;
}

/** Push to talk: one phrase, then the action and a spoken confirmation. */
export function VoiceButton(): ReactNode {
  const prefs = useEyesFree();
  const [state, setState] = useState<'idle' | 'listening'>('idle');
  const [said, setSaid] = useState<string | null>(null);
  if (!prefs.voice || !canListen()) return null;
  const go = async (): Promise<void> => {
    setState('listening');
    setSaid(null);
    const heard = await listenOnce().result;
    setState('idle');
    let reply: string;
    if (heard.kind === 'heard' && heard.command && handler) reply = handler(heard.command);
    else if (heard.kind === 'heard')
      reply = `I heard "${heard.text}", which is not a command I know.`;
    else if (heard.kind === 'denied') reply = 'Microphone access is off for Afterglow.';
    else if (heard.kind === 'unsupported') reply = 'This browser cannot take voice commands.';
    else if (heard.kind === 'failed') reply = 'Voice commands need a connection in this browser.';
    else reply = 'I did not hear anything.';
    setSaid(reply);
    speak(reply, { interrupt: true, force: true });
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button style={{ width: '100%' }} disabled={state === 'listening'} onClick={() => void go()}>
        {state === 'listening' ? 'Listening… say a command' : 'Speak a command'}
      </Button>
      {said ? (
        <span
          aria-live="polite"
          style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}
        >
          {said}
        </span>
      ) : null}
    </div>
  );
}

/** "Read it to me" for the Hearth. */
export function ReadAloudButton(): ReactNode {
  // Shown once the person has turned on reading aloud: eyes-free controls appear for
  // the people who asked for them, and keep everyone else's screen short.
  const prefs = useEyesFree();
  if (!canSpeak() || !prefs.speech) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        const s = currentStatus();
        if (s) speak(s, { interrupt: true, force: true });
      }}
    >
      Read it to me
    </Button>
  );
}

export function EyesFreeSettings(): ReactNode {
  const p = useEyesFree();
  return (
    <Section title="Eyes-free">
      <Notice>
        For the dark, a pocket, or anyone who cannot read the screen. Each part is off until you
        turn it on, and works without a connection except voice commands in some browsers.
      </Notice>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <ChoiceChip
          label={canSpeak() ? 'Read aloud' : 'Read aloud (not in this browser)'}
          selected={p.speech}
          onClick={() => {
            if (!canSpeak()) return;
            setEyesFree({ speech: !p.speech });
            if (!p.speech)
              speak('I will read the home line and new alerts aloud.', { force: true });
          }}
        />
        <ChoiceChip
          label={canBuzz() ? 'Vibrate' : 'Vibrate (not on this device)'}
          selected={p.haptics}
          onClick={() => {
            if (!canBuzz()) return;
            setEyesFree({ haptics: !p.haptics });
            if (!p.haptics) buzz('restoration', { force: true });
          }}
        />
        <ChoiceChip
          label={canListen() ? 'Voice commands' : 'Voice commands (not in this browser)'}
          selected={p.voice}
          onClick={() => {
            if (canListen()) setEyesFree({ voice: !p.voice });
          }}
        />
      </div>
      <Fold label="What the vibrations mean">
        <ul style={{ margin: 0, paddingLeft: 18, color: token('text.primary') }}>
          <li>One long: the power went out.</li>
          <li>Two short: the power is back.</li>
          <li>Three short: someone sent HELP.</li>
        </ul>
        {canBuzz() ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <Button size="sm" onClick={() => buzz('outage', { force: true })}>
              Feel "out"
            </Button>
            <Button size="sm" onClick={() => buzz('restoration', { force: true })}>
              Feel "back"
            </Button>
            <Button size="sm" onClick={() => buzz('help', { force: true })}>
              Feel "help"
            </Button>
          </div>
        ) : null}
      </Fold>
      <Fold label="What you can say">
        <ul style={{ margin: 0, paddingLeft: 18, color: token('text.primary') }}>
          {COMMAND_HELP.map((c) => (
            <li key={c.say}>
              “{c.say}”: {c.does}
            </li>
          ))}
        </ul>
      </Fold>
      <Sources labels={['speech: this phone', 'voice commands: the browser’s recogniser']}>
        Reading aloud uses the voices on this phone and sends nothing. Voice commands use the
        browser's speech recogniser: in Chrome that is Google's service, which hears the phrase;
        Safari can do it on the phone. Only one phrase is heard per press.
      </Sources>
    </Section>
  );
}
