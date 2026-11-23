import { createReader } from '@afterglow/adapters';
import { heliograph } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../household/store';
import { SEQ_KEY, SLOT_KEY, getMySlot, nextSequence, setMySlot } from './prefs';
import { simulateRecording } from './simulate';

describe('simulated reception (demo)', () => {
  it('the real reader reads every message in both profiles, and the recording is deterministic', () => {
    for (const code of Object.keys(heliograph.MESSAGE_CODES) as heliograph.MessageName[]) {
      for (const profile of [heliograph.PROFILES.standard, heliograph.PROFILES.fast]) {
        const msg = { code, slot: 12, sequence: 1 };
        const frames = simulateRecording(msg, profile);
        expect(simulateRecording(msg, profile)).toEqual(frames);
        const reader = createReader();
        for (const f of frames) reader.push(f);
        expect(reader.read(), `${code} ${profile.name}`).toMatchObject({
          kind: 'message',
          message: msg,
          profile: profile.name,
        });
      }
    }
  });

  it('an invalid message simulates nothing', () => {
    expect(simulateRecording({ code: 'SAFE', slot: 99, sequence: 0 })).toEqual([]);
  });
});

describe('sender preferences', () => {
  it('the slot defaults to 1 and a bad stored value is ignored', () => {
    expect(getMySlot(memoryStorage())).toBe(1);
    for (const v of ['abc', '-1', '64', '1.5', '']) {
      expect(getMySlot(memoryStorage({ [SLOT_KEY]: v }))).toBe(1);
    }
    const s = memoryStorage();
    setMySlot(37, s);
    expect(getMySlot(s)).toBe(37);
  });

  it('the message counter walks 0,1,2,3 and wraps, and recovers from a bad value', () => {
    const s = memoryStorage();
    expect([1, 2, 3, 4, 5].map(() => nextSequence(s))).toEqual([0, 1, 2, 3, 0]);
    expect(nextSequence(memoryStorage({ [SEQ_KEY]: '9' }))).toBe(0);
  });
});
