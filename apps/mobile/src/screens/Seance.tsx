import { type CameraError, createReader, openCamera } from '@afterglow/adapters';
import { heliograph, household } from '@afterglow/core';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHousehold } from '../household/useHousehold';
import { SourceChip } from '../night-shell/components';
import {
  Button,
  ChoiceChip,
  EditToggle,
  Fold,
  Notice,
  Section,
  Stepper,
  TextField,
} from '../night-shell/controls';
import { GhostGlyph } from '../night-shell/costume';
import { token } from '../night-shell/theme';
import { Lamp } from '../seance/Lamp';
import { type ToneListening, listenErrorText, listenTones, sendTones } from '../seance/acoustic';
import { getMySlot, nextSequence, setMySlot } from '../seance/prefs';
import {
  EMERGENCY_NOTE,
  FAST_CONFIRM,
  FLASH_WARNING,
  MESSAGE_LABEL,
  cameraErrorText,
  durationText,
  receiveText,
  rowText,
} from '../seance/present';
import { simulateRecording } from '../seance/simulate';

/** The six codes on the big buttons (design 11.5). The others are available under More. */
const MAIN_CODES: readonly heliograph.MessageName[] = [
  'SAFE',
  'HELP',
  'NEED_MEDS',
  'NEED_WATER',
  'CHARGE_HERE',
  'COMING',
];
const MORE_CODES: readonly heliograph.MessageName[] = [
  'NEED_HEAT',
  'NEED_COOL',
  'WATER_HERE',
  'OPEN_HERE',
  'ACK',
];
const WATCH_LIMIT_MS = 90_000;

/**
 * The Séance: the roster and ghost board, sending a code with the screen as a
 * lamp, and watching for a message with the camera. Every state is designed:
 * empty list, ghost, heard, help, sending, watching, no signal, repeat
 * requested, unknown or shared number, and each camera failure.
 */
export function Seance({ nowMs }: { nowMs: number }): ReactNode {
  const { store, state, demo } = useHousehold();
  const { view } = state;
  const outage = view.outageStartedAtMs !== null;
  const board = useMemo(() => household.assessRoster(view), [view]);
  const free = household.freeSlot(view);

  const [editingList, setEditingList] = useState(false);

  // ---- add a person
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<number>(() => free ?? 0);
  const taken = view.roster.find((m) => m.slot === slot);
  const addPerson = (): void => {
    if (name.trim() === '' || taken) return;
    store.addPerson(name, slot);
    setName('');
    const next = household.freeSlot(store.getState().view);
    if (next !== null) setSlot(next);
  };

  // ---- send
  const [mySlot, setMySlotState] = useState<number>(() => getMySlot());
  const [pending, setPending] = useState<heliograph.MessageName | null>(null);
  const [fast, setFast] = useState(false);
  const [fastOk, setFastOk] = useState(false);
  const [more, setMore] = useState(false);
  const [lamp, setLamp] = useState<{ plan: heliograph.TransmitPlan; label: string } | null>(null);
  // The acoustic channel (7.9): the same frames as tones, room to room and through walls.
  const [channel, setChannel] = useState<'light' | 'sound'>('light');
  const [tones, setTones] = useState<heliograph.TonePair['name']>('audible');
  const [playing, setPlaying] = useState<{ stop: () => void } | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);

  const profile = fast ? heliograph.PROFILES.fast : heliograph.PROFILES.standard;
  const previewPlan = pending
    ? heliograph.planTransmission({ code: pending, slot: mySlot, sequence: 0 }, 3, profile)
    : null;
  // Fast light flashes need the person's confirmation; fast tones do not flash.
  const canStart = previewPlan !== null && (!fast || fastOk || channel === 'sound') && !playing;

  const startSending = (): void => {
    if (!pending || !canStart) return;
    const plan = heliograph.planTransmission(
      { code: pending, slot: mySlot, sequence: nextSequence() },
      3,
      profile,
    );
    if (!plan) return;
    setSentNote(null);
    if (channel === 'sound') {
      const sending = sendTones(plan, heliograph.TONE_PAIRS[tones]);
      setPlaying(sending);
      void sending.done.then((outcome) => {
        setPlaying(null);
        lampDone(outcome);
      });
      return;
    }
    setLamp({ plan, label: MESSAGE_LABEL[pending] });
  };
  const lampDone = useCallback((outcome: 'done' | 'cancelled') => {
    setLamp(null);
    setPending(null);
    setSentNote(
      outcome === 'done'
        ? 'Sent three times. If they could not read it, send again.'
        : 'Stopped. Nothing was confirmed as received.',
    );
  }, []);

  // ---- receive
  const [watching, setWatching] = useState(false);
  const [camError, setCamError] = useState<CameraError | null>(null);
  const [result, setResult] = useState<heliograph.HeliographResult | null>(null);
  const [attribution, setAttribution] = useState<household.Attribution | null>(null);
  const [fps, setFps] = useState(0);
  const sessionRef = useRef<{ stop: () => void } | null>(null);
  const timerRef = useRef<number | null>(null);
  const readerRef = useRef(createReader());
  const heardBy = useRef<'light' | 'sound'>('light');
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [toneLevel, setToneLevel] = useState(0);
  const listenRef = useRef<ToneListening | null>(null);
  const listenTimer = useRef<number | null>(null);
  const stopListening = useCallback(() => {
    if (listenTimer.current !== null) window.clearInterval(listenTimer.current);
    listenTimer.current = null;
    listenRef.current?.stop();
    listenRef.current = null;
    setListening(false);
  }, []);
  useEffect(() => stopListening, [stopListening]);

  const stopWatching = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setWatching(false);
  }, []);
  useEffect(() => stopWatching, [stopWatching]);

  /** A message arrived: say who it is from, and record it only when that is unambiguous. */
  const accept = useCallback(
    (r: heliograph.HeliographResult) => {
      setResult(r);
      if (r.kind !== 'message') {
        setAttribution(null);
        return;
      }
      const a = household.attributeMessage(store.getState().view, r.message);
      setAttribution(a);
      if (a.kind === 'known') store.recordHeard(a.member.id, a.code, heardBy.current);
    },
    [store],
  );

  const startListening = async (): Promise<void> => {
    stopWatching();
    setMicError(null);
    setResult(null);
    setAttribution(null);
    const opened = await listenTones(heliograph.TONE_PAIRS[tones]);
    if (opened.kind === 'error') {
      setMicError(listenErrorText(opened.error));
      return;
    }
    heardBy.current = 'sound';
    listenRef.current = opened.session;
    setListening(true);
    const began = performance.now();
    listenTimer.current = window.setInterval(() => {
      const session = listenRef.current;
      if (!session) return;
      setToneLevel(session.level());
      const r = session.read();
      if (r.kind === 'message') {
        accept(r);
        stopListening();
      } else {
        setResult(r);
        if (performance.now() - began > WATCH_LIMIT_MS) {
          stopListening();
          setResult({
            kind: 'repeatRequested',
            reason:
              'I listened for 90 seconds and heard nothing I could read. Ask them to send again.',
          });
        }
      }
    }, 1000);
  };

  const startWatching = async (): Promise<void> => {
    stopListening();
    heardBy.current = 'light';
    setCamError(null);
    setResult(null);
    setAttribution(null);
    readerRef.current.reset();
    const opened = await openCamera((f) => readerRef.current.push(f));
    if (opened.kind === 'error') {
      setCamError(opened.error);
      return;
    }
    sessionRef.current = opened.session;
    setWatching(true);
    const began = performance.now();
    timerRef.current = window.setInterval(() => {
      const r = readerRef.current.read();
      setFps(readerRef.current.stats().fps);
      if (r.kind === 'message') {
        accept(r);
        stopWatching();
      } else {
        setResult(r);
        if (performance.now() - began > WATCH_LIMIT_MS) {
          stopWatching();
          setResult({
            kind: 'repeatRequested',
            reason:
              'I watched for 90 seconds and saw nothing I could read. Ask them to send again.',
          });
        }
      }
    }, 1000);
  };

  /** Demo only: the whole receive path with a simulated camera. */
  const simulate = (fastProfile: boolean): void => {
    const target = board.find((b) => b.state === 'ghost') ?? board[0];
    if (!target) return;
    const prof = fastProfile ? heliograph.PROFILES.fast : heliograph.PROFILES.standard;
    const reader = createReader();
    for (const f of simulateRecording(
      { code: 'SAFE', slot: target.member.slot, sequence: 1 },
      prof,
    )) {
      reader.push(f);
    }
    setFps(reader.stats().fps);
    accept(reader.read());
  };

  const text = result ? receiveText(result, attribution) : null;
  const unknownSlot = attribution?.kind === 'unknownSlot' ? attribution.slot : null;

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '8px 20px 120px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 'var(--type-title)', color: token('text.emphasis') }}>
          Séance
        </h1>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--type-body)',
            color: token('text.secondary'),
          }}
        >
          People you look after. Anyone I have not heard from is a faint ghost, and stays one until
          they tell you.
        </p>
      </header>

      {lamp ? <Lamp plan={lamp.plan} label={lamp.label} onDone={lampDone} /> : null}

      <Section
        title="Your people"
        right={
          board.length > 0 ? (
            <EditToggle editing={editingList} onToggle={() => setEditingList((e) => !e)} />
          ) : undefined
        }
      >
        {board.length === 0 ? (
          <Notice>
            No one on your list yet. Add the people you want to hear from, each with their own
            number below.
          </Notice>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {board.some((b) => b.state === 'help') ? <Notice>{EMERGENCY_NOTE}</Notice> : null}
            {board.map((b) => {
              const t = rowText(b, outage);
              return (
                <div
                  key={b.member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-tile)',
                    background: token('surface.2'),
                    border: `${t.loud ? 2 : 1}px solid ${t.loud ? token('focus.ring') : token('hairline')}`,
                    flexWrap: 'nowrap',
                  }}
                >
                  <GhostGlyph opacity={t.solid ? 1 : 0.35} loud={t.loud} />
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 'var(--type-body)',
                        color: token('text.primary'),
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {b.member.name}
                      <span style={{ color: token('text.secondary') }}> · No. {b.member.slot}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--type-caption)',
                        color: t.loud ? token('text.emphasis') : token('text.secondary'),
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {t.line}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
                    {!b.safe ? (
                      <Button
                        size="sm"
                        onClick={() => store.recordHeard(b.member.id, 'SAFE', 'manual')}
                        ariaLabel={`They told me ${b.member.name} is safe`}
                      >
                        Mark safe
                      </Button>
                    ) : null}
                    {editingList ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => store.removePerson(b.member.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Fold label="Add someone" defaultOpen={board.length === 0}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TextField
            label="Name"
            value={name}
            onChange={setName}
            hint="Only a name and a number are kept."
          />
          <Stepper
            label="Their number on your list"
            valueText={`No. ${slot}`}
            hint={
              taken
                ? `Number ${slot} is already ${taken.name}. Pick another so a message can be told apart.`
                : 'When they send you a message, this number says who it is from. Agree it with them.'
            }
            decrementDisabled={slot <= 0}
            incrementDisabled={slot >= 63}
            onDecrement={() => setSlot(Math.max(0, slot - 1))}
            onIncrement={() => setSlot(Math.min(63, slot + 1))}
          />
          <Button
            variant="primary"
            disabled={name.trim() === '' || taken !== undefined || free === null}
            onClick={addPerson}
          >
            Add to my list
          </Button>
          {free === null ? (
            <Notice>All 64 numbers are used. Remove someone to add another.</Notice>
          ) : null}
        </div>
      </Fold>

      <Section title="Send a code">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Stepper
            label="Your number on their list"
            valueText={`No. ${mySlot}`}
            hint="The person watching adds you under this number. Until QR pairing exists, agree it with them first."
            decrementDisabled={mySlot <= 0}
            incrementDisabled={mySlot >= 63}
            onDecrement={() => {
              setMySlotState(mySlot - 1);
              setMySlot(mySlot - 1);
            }}
            onIncrement={() => {
              setMySlotState(mySlot + 1);
              setMySlot(mySlot + 1);
            }}
          />
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}
          >
            {MAIN_CODES.map((code) => (
              <Button
                key={code}
                variant={pending === code ? 'primary' : 'secondary'}
                style={{ minHeight: 96, whiteSpace: 'normal' }}
                onClick={() => setPending(code)}
              >
                {MESSAGE_LABEL[code]}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>
            {more ? 'Fewer messages' : 'More messages'}
          </Button>
          {more ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {MORE_CODES.map((code) => (
                <ChoiceChip
                  key={code}
                  label={MESSAGE_LABEL[code]}
                  selected={pending === code}
                  onClick={() => setPending(code)}
                />
              ))}
            </div>
          ) : null}

          {pending ? (
            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-tile)',
                background: token('surface.2'),
                border: `1px solid ${token('hairline')}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {pending === 'HELP' ? <Notice>{EMERGENCY_NOTE}</Notice> : null}
              <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
                Ready to send “{MESSAGE_LABEL[pending]}” as No. {mySlot}.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ChoiceChip
                  label="By light"
                  selected={channel === 'light'}
                  onClick={() => setChannel('light')}
                />
                <ChoiceChip
                  label="By sound"
                  selected={channel === 'sound'}
                  onClick={() => setChannel('sound')}
                />
              </div>
              {channel === 'light' ? (
                <Notice>{FLASH_WARNING}</Notice>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <ChoiceChip
                      label="Audible tones"
                      selected={tones === 'audible'}
                      onClick={() => setTones('audible')}
                    />
                    <ChoiceChip
                      label="Near-silent"
                      selected={tones === 'quiet'}
                      onClick={() => setTones('quiet')}
                    />
                  </div>
                  <Notice>
                    {tones === 'audible'
                      ? 'Two tones, loud enough to carry through a door or a thin wall. Turn the volume up.'
                      : 'High tones most adults barely hear. Shorter range; best in a quiet room, phone to phone.'}{' '}
                    They must listen with the same setting.
                  </Notice>
                </>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <ChoiceChip
                  label="Standard"
                  selected={!fast}
                  onClick={() => {
                    setFast(false);
                    setFastOk(false);
                  }}
                />
                <ChoiceChip label="Fast" selected={fast} onClick={() => setFast(true)} />
                <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
                  {previewPlan ? durationText(previewPlan.totalMs) : ''}
                </span>
              </div>
              {fast && channel === 'light' ? (
                <>
                  <Notice>
                    {FAST_CONFIRM} Their camera must run at 40 frames a second or more.
                  </Notice>
                  <ChoiceChip
                    label="Nobody nearby is sensitive to flashing light"
                    selected={fastOk}
                    onClick={() => setFastOk(!fastOk)}
                  />
                </>
              ) : null}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {playing ? (
                  <Button variant="primary" onClick={() => playing.stop()}>
                    Stop the tones
                  </Button>
                ) : (
                  <Button variant="primary" disabled={!canStart} onClick={startSending}>
                    Start sending
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setPending(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          {sentNote ? <Notice>{sentNote}</Notice> : null}
          <Notice>
            By light, hold the lit screen toward their window. By sound, hold the speaker toward
            their door or wall. Both carry the same code, error correction and repeats.
          </Notice>
        </div>
      </Section>

      <Section title="Watch for a message">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Notice>
            Point the back camera at their lit window. I keep only brightness numbers, never the
            picture, and nothing leaves your phone.
          </Notice>
          {camError ? <Notice>{cameraErrorText(camError)}</Notice> : null}
          {micError ? <Notice>{micError}</Notice> : null}
          {listening ? (
            <>
              <Button variant="primary" onClick={stopListening}>
                Stop listening
              </Button>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <SourceChip
                  label={`microphone · ${tones === 'audible' ? 'audible tones' : 'near-silent tones'}`}
                />
                <SourceChip label={`tone ${Math.round(toneLevel * 100)}%`} />
              </div>
            </>
          ) : watching ? null : (
            <Button onClick={() => void startListening()}>Listen for tones instead</Button>
          )}
          {watching ? (
            <Button variant="primary" onClick={stopWatching}>
              Stop watching
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void startWatching()}>
              Start watching
            </Button>
          )}
          {watching ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <SourceChip label={`camera ${Math.round(fps)} frames/s`} />
              <SourceChip label={fps >= 40 ? 'fast and standard' : 'standard speed only'} />
            </div>
          ) : null}

          {text ? (
            <output
              style={{
                display: 'block',
                padding: 16,
                borderRadius: 'var(--radius-tile)',
                background: token('surface.2'),
                border: `${text.help ? 2 : 1}px solid ${text.help ? token('focus.ring') : token('hairline')}`,
              }}
            >
              <div
                style={{
                  fontSize: 'var(--type-body)',
                  color: token('text.emphasis'),
                  overflowWrap: 'anywhere',
                }}
              >
                {text.headline}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 'var(--type-caption)',
                  color: token('text.secondary'),
                  overflowWrap: 'anywhere',
                }}
              >
                {text.detail}
              </div>
              {text.help ? <div style={{ marginTop: 10 }}>{EMERGENCY_NOTE}</div> : null}
              {unknownSlot !== null ? (
                <div style={{ marginTop: 10 }}>
                  <Button
                    size="sm"
                    onClick={() => {
                      setSlot(unknownSlot);
                      document.getElementById('seance-add')?.scrollIntoView();
                    }}
                  >
                    Add number {unknownSlot} to my list
                  </Button>
                </div>
              ) : null}
            </output>
          ) : null}

          {demo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Notice>
                Demo: no second phone needed. This feeds a simulated recording through the real
                reader and decoder.
              </Notice>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="sm" onClick={() => simulate(false)}>
                  Simulate a message (standard)
                </Button>
                <Button size="sm" onClick={() => simulate(true)} tourId="seance-simulate">
                  Simulate a message (fast)
                </Button>
              </div>
              <SourceChip label="simulated camera (demo)" />
            </div>
          ) : null}
        </div>
      </Section>
      <span id="seance-add" />
      <span hidden>{nowMs}</span>
    </main>
  );
}
