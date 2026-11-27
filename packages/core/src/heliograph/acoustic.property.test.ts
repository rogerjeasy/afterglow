import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SILENCE_RMS, TONE_PAIRS, type TonePair, toneLevel } from './acoustic.js';
import { MESSAGE_CODES, type MessageName } from './codes.js';
import { PROFILES } from './profiles.js';
import { type BrightnessSample, decodeBrightness } from './receive.js';
import { type TransmitPlan, planTransmission } from './transmit.js';

/**
 * The acoustic Heliograph (.kiro/specs/device-features DF-11, DF-12): the light's
 * transmit plan played as two tones, heard back in ~20 ms blocks as the mark tone's
 * share of energy, and decoded by the same decoder as the camera.
 */

const RATE = 48_000;
const BLOCK = 1024;
const PAIRS: readonly TonePair[] = [TONE_PAIRS.audible, TONE_PAIRS.quiet];
const codeArb = fc.constantFrom(...(Object.keys(MESSAGE_CODES) as MessageName[]));

const sine = (n: number, hz: number, amp: number, from = 0) => {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * (from + i)) / RATE);
  return out;
};

/** What a microphone hears: the plan's tones from `startMs`, silence around them, plus noise. */
function hear(plan: TransmitPlan, pair: TonePair, amp: number, noise: number, seed: number) {
  const edges: { at: number; lit: boolean }[] = [];
  let t = 0;
  for (const r of plan.runs) {
    edges.push({ at: t, lit: r.lit });
    t += r.ms;
  }
  const startMs = 500;
  const total = startMs + plan.totalMs + 500;
  const samples: BrightnessSample[] = [];
  let x = seed || 1;
  let run = 0;
  for (let tMs = 0; tMs < total; tMs += 20) {
    const block = new Float32Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      const s = tMs + (i * 1000) / RATE - startMs;
      x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
      let v = noise * ((x / 0x7fffffff) * 2 - 1);
      if (s >= 0 && s < plan.totalMs) {
        while (run + 1 < edges.length && (edges[run + 1] as { at: number }).at <= s) run++;
        while (run > 0 && (edges[run] as { at: number }).at > s) run--;
        const hz = (edges[run] as { lit: boolean }).lit ? pair.markHz : pair.spaceHz;
        v += amp * Math.sin((2 * Math.PI * hz * (tMs * RATE + i * 1000)) / (RATE * 1000));
      }
      block[i] = v;
    }
    samples.push({ tMs: tMs + 10, level: toneLevel(block, RATE, pair) });
  }
  return samples;
}

describe('Acoustic Heliograph (DF-11, DF-12)', () => {
  it('DF-12 the mark tone reads lit, the space tone dark, and silence dark', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PAIRS),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.nat(10_000),
        (pair, amp, from) => {
          expect(toneLevel(sine(BLOCK, pair.markHz, amp, from), RATE, pair)).toBeGreaterThanOrEqual(
            200,
          );
          expect(toneLevel(sine(BLOCK, pair.spaceHz, amp, from), RATE, pair)).toBeLessThanOrEqual(
            55,
          );
          expect(toneLevel(sine(BLOCK, pair.markHz, SILENCE_RMS / 2, from), RATE, pair)).toBe(0);
          expect(toneLevel(new Float32Array(BLOCK), RATE, pair)).toBe(0);
          expect(toneLevel(new Float32Array(0), RATE, pair)).toBe(0);
        },
      ),
    );
  });

  it('DF-12 a level is always 0..255, and 0 when the tones are above what the microphone can hear', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PAIRS),
        fc.array(fc.double({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 512 }),
        fc.constantFrom(8000, 16_000, 22_050, 44_100, 48_000),
        (pair, xs, rate) => {
          const level = toneLevel(Float32Array.from(xs), rate, pair);
          expect(Number.isInteger(level)).toBe(true);
          expect(level).toBeGreaterThanOrEqual(0);
          expect(level).toBeLessThanOrEqual(255);
          if (pair.markHz >= rate / 2) expect(level).toBe(0);
        },
      ),
    );
  });

  it('DF-11 DF-12 a code played as tones is heard back as the same code, with the repeat vote', () => {
    fc.assert(
      fc.property(
        codeArb,
        fc.integer({ min: 0, max: 63 }),
        fc.integer({ min: 0, max: 3 }),
        fc.constantFrom(...PAIRS),
        fc.constantFrom(PROFILES.standard, PROFILES.fast),
        fc.double({ min: 0.05, max: 0.8, noNaN: true }),
        fc.integer({ min: 1, max: 1 << 30 }),
        (code, slot, sequence, pair, profile, amp, seed) => {
          const msg = { code, slot, sequence };
          const plan = planTransmission(msg, 3, profile);
          expect(plan).not.toBeNull();
          const heard = decodeBrightness(hear(plan as TransmitPlan, pair, amp, amp / 10, seed));
          expect(heard.kind).toBe('message');
          if (heard.kind === 'message') {
            expect(heard.message).toEqual(msg);
            expect(heard.profile).toBe(profile.name);
            expect(heard.repeatsAgreed).toBeGreaterThanOrEqual(2);
          }
        },
      ),
      { numRuns: 8 },
    );
  });

  it('DF-12 silence, or one tone held, is never decoded as a message', () => {
    const steady = (lit: boolean): TransmitPlan => ({
      runs: [{ lit, ms: 20_000 }],
      totalMs: 20_000,
      repeats: 1,
      symbols: 100,
      profile: 'standard',
    });
    for (const pair of PAIRS) {
      for (const lit of [true, false]) {
        expect(decodeBrightness(hear(steady(lit), pair, 0.3, 0.01, 7)).kind).not.toBe('message');
      }
      expect(decodeBrightness(hear(steady(true), pair, 0, 0, 7)).kind).not.toBe('message');
    }
  });
});
