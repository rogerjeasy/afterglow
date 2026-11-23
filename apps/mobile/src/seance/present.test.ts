import { heliograph, type household } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_NOTE,
  MESSAGE_FROM,
  MESSAGE_LABEL,
  cameraErrorText,
  durationText,
  receiveText,
  rowText,
} from './present';

const NAMES = Object.keys(heliograph.MESSAGE_CODES) as heliograph.MessageName[];
const member = (heard: household.RosterMember['heard']): household.RosterMember => ({
  id: 'p1',
  name: 'Mrs Dlamini',
  slot: 12,
  heard,
});
const entry = (
  state: household.RosterState,
  heard: household.RosterMember['heard'],
  safe = false,
): household.RosterEntry => ({ member: member(heard), state, safe });
const message = (code: heliograph.MessageName): heliograph.HeliographResult => ({
  kind: 'message',
  message: { code, slot: 12, sequence: 1 },
  repeatsAgreed: 2,
  voted: false,
  profile: 'standard',
  correctedWords: 0,
});

describe('seance wording', () => {
  it('every message has a button label and a sentence for what it means', () => {
    for (const n of NAMES) {
      expect(MESSAGE_LABEL[n].length).toBeGreaterThan(0);
      expect(MESSAGE_FROM[n].length).toBeGreaterThan(0);
    }
    expect(Object.keys(MESSAGE_LABEL).sort()).toEqual([...NAMES].sort());
    expect(Object.keys(MESSAGE_FROM).sort()).toEqual([...NAMES].sort());
  });

  it('a ghost is translucent, never called safe, and says why when the word is old', () => {
    const none = rowText(entry('ghost', null), true);
    expect(none).toMatchObject({ solid: false, loud: false });
    expect(none.line).not.toMatch(/safe/i);
    const old = rowText(entry('ghost', { code: 'SAFE', atMs: 1000, channel: 'light' }), true);
    expect(old.solid).toBe(false);
    expect(old.line).toMatch(/No word since the outage began/);
    expect(old.line).not.toMatch(/^Safe/);
  });

  it('safe is said only for a current SAFE; help is loud', () => {
    const safe = rowText(entry('heard', { code: 'SAFE', atMs: 5, channel: 'light' }, true), true);
    expect(safe).toMatchObject({ solid: true, loud: false });
    expect(safe.line).toMatch(/^Safe · .* · by light/);
    const water = rowText(entry('heard', { code: 'NEED_WATER', atMs: 5, channel: 'sms' }), true);
    expect(water.line).toMatch(/^Need water/);
    expect(water.line).not.toMatch(/safe/i);
    const help = rowText(entry('help', { code: 'HELP', atMs: 5, channel: 'ble' }), true);
    expect(help).toMatchObject({ solid: true, loud: true });
    expect(help.line).toMatch(/^Needs help/);
  });

  it('a manual check-in says you marked it', () => {
    const t = rowText(entry('heard', { code: 'SAFE', atMs: 5, channel: 'manual' }, true), false);
    expect(t.line).toMatch(/you marked it/);
  });

  it('a message from a known person names them; an unknown or shared number never names anyone', () => {
    const known = receiveText(message('SAFE'), {
      kind: 'known',
      member: member(null),
      code: 'SAFE',
    });
    expect(known).toMatchObject({ kind: 'message', headline: 'Mrs Dlamini is safe' });
    const unknown = receiveText(message('SAFE'), { kind: 'unknownSlot', slot: 12 });
    expect(unknown.kind).toBe('unknownSlot');
    expect(unknown.headline).not.toMatch(/Dlamini/);
    const shared = receiveText(message('SAFE'), { kind: 'ambiguousSlot', slot: 12, count: 2 });
    expect(shared.kind).toBe('ambiguousSlot');
    expect(shared.detail).toMatch(/will not say which one/);
    const none = receiveText(message('HELP'), null);
    expect(none.kind).toBe('unknownSlot');
    expect(none.help).toBe(true);
  });

  it('a refusal says to ask them to repeat and never shows a message', () => {
    const r = receiveText(
      { kind: 'repeatRequested', reason: 'Only one clear repeat was read.' },
      null,
    );
    expect(r).toMatchObject({ kind: 'repeat', help: false });
    expect(r.headline).toMatch(/ask them to repeat/);
    const w = receiveText({ kind: 'noSignal', reason: 'No blinking light is in view yet.' }, null);
    expect(w.kind).toBe('waiting');
  });

  it('every camera error has its own plain sentence', () => {
    const errs = ['denied', 'noCamera', 'busy', 'insecure', 'unavailable'] as const;
    const texts = errs.map(cameraErrorText);
    expect(new Set(texts).size).toBe(errs.length);
    for (const t of texts) expect(t.length).toBeGreaterThan(20);
  });

  it('the emergency note never claims to be a service, and durations come from the plan', () => {
    expect(EMERGENCY_NOTE).toMatch(/not an emergency service/);
    const std = heliograph.planTransmission({ code: 'SAFE', slot: 1, sequence: 0 }, 3);
    const fast = heliograph.planTransmission(
      { code: 'SAFE', slot: 1, sequence: 0 },
      3,
      heliograph.PROFILES.fast,
    );
    expect(durationText(std?.totalMs ?? 0)).toBe('about 38 s');
    expect(durationText(fast?.totalMs ?? 0)).toBe('about 19 s');
  });
});
