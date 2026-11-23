import { heliograph } from '@afterglow/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { errorOf, gridOf } from './camera.js';
import { DEFAULT_WINDOW_MS, createReader } from './reader.js';
import { type SenderDeps, runTransmission } from './sender.js';

const SAFE: heliograph.HeliographMessage = { code: 'SAFE', slot: 12, sequence: 2 };

/** A fake clock and lamp: `wait` is always a little late, never early. */
function fakeWorld(lateness: (i: number) => number, cancelAfter = Number.POSITIVE_INFINITY) {
  let t = 5_000;
  let waits = 0;
  const timeline: { t: number; lit: boolean }[] = [];
  const deps: SenderDeps = {
    now: () => t,
    wait: async (ms) => {
      t += ms + lateness(waits++);
    },
    setLit: (lit) => timeline.push({ t, lit }),
    isCancelled: () => timeline.length >= cancelAfter,
  };
  return { deps, timeline, start: 5_000 };
}

describe('Heliograph sender and reader properties', () => {
  // ------------------------------------------------------------------ sender
  it('HL-14 the sender follows the plan: each switch is planned, in order, with the last one dark', async () => {
    const plan = heliograph.planTransmission(SAFE, 2) as heliograph.TransmitPlan;
    const w = fakeWorld(() => 0);
    await expect(runTransmission(plan, w.deps)).resolves.toBe('done');
    const planned = plan.runs.map((r) => r.lit);
    expect(w.timeline.slice(0, plan.runs.length).map((x) => x.lit)).toEqual(planned);
    expect(w.timeline.at(-1)?.lit).toBe(false);
    let at = w.start;
    plan.runs.forEach((run, i) => {
      expect(w.timeline[i]?.t).toBe(at);
      at += run.ms;
    });
  });

  it('HL-14 timer lateness never accumulates into drift', async () => {
    const plan = heliograph.planTransmission(SAFE, 3) as heliograph.TransmitPlan;
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 50 }),
        async (lates) => {
          const w = fakeWorld((i) => lates[i % lates.length] as number);
          await runTransmission(plan, w.deps);
          let planned = w.start;
          plan.runs.forEach((run, i) => {
            const error = (w.timeline[i] as { t: number }).t - planned;
            // The error at every switch is at most one timer's lateness, however long it has run.
            expect(error).toBeLessThanOrEqual(40);
            expect(error).toBeGreaterThanOrEqual(0);
            planned += run.ms;
          });
        },
      ),
      { numRuns: 60 },
    );
  });

  it('HL-14 a cancelled send stops, and the lamp is left dark', async () => {
    const plan = heliograph.planTransmission(SAFE, 3) as heliograph.TransmitPlan;
    const w = fakeWorld(() => 0, 5);
    await expect(runTransmission(plan, w.deps)).resolves.toBe('cancelled');
    expect(w.timeline.length).toBeLessThan(plan.runs.length);
    expect(w.timeline.at(-1)?.lit).toBe(false);
  });

  it('HL-14 a failure while sending still leaves the lamp dark', async () => {
    const plan = heliograph.planTransmission(SAFE, 1) as heliograph.TransmitPlan;
    const w = fakeWorld(() => 0);
    const deps: SenderDeps = {
      ...w.deps,
      wait: async () => {
        throw new Error('timer broke');
      },
    };
    await expect(runTransmission(plan, deps)).rejects.toThrow('timer broke');
    expect(w.timeline.at(-1)?.lit).toBe(false);
  });

  it('HL-14 what the sender shows, a receiver reads: sender timeline to camera to message', async () => {
    for (const [profile, fps] of [
      [heliograph.PROFILES.standard, 30],
      [heliograph.PROFILES.fast, 60],
    ] as const) {
      const plan = heliograph.planTransmission(SAFE, 3, profile) as heliograph.TransmitPlan;
      const w = fakeWorld((i) => (i * 7) % 25);
      await runTransmission(plan, w.deps);
      const reader = createReader();
      const lastT = (w.timeline.at(-1) as { t: number }).t;
      for (let t = w.start - 800; t <= lastT + 800; t += 1000 / fps) {
        let lit = false;
        for (const s of w.timeline) if (s.t <= t) lit = s.lit;
        const noisyDark = 22 + (Math.sin(t) + 1) * 3;
        // The lit lamp fills one cell; the rest is still scenery.
        const cells = Array.from({ length: 48 }, (_, c) =>
          c === 19 ? (lit ? 190 : noisyDark) : 60 + (c % 5) * 20,
        );
        reader.push({ tMs: t, cells });
      }
      expect(reader.read(), profile.name).toMatchObject({ kind: 'message', message: SAFE });
    }
  });

  // ------------------------------------------------------------------ reader
  it('HL-15 the reader says what it sees: waiting, no light, then a message', () => {
    const r = createReader();
    expect(r.read()).toMatchObject({ kind: 'noSignal' });
    expect(r.stats()).toEqual({ frames: 0, fps: 0 });
    for (let i = 0; i < 100; i++) r.push({ tMs: i * 33, cells: [50, 60, 70] });
    expect(r.read()).toMatchObject({
      kind: 'noSignal',
      reason: expect.stringMatching(/blinking light/),
    });
    expect(r.stats().fps).toBeCloseTo(30.3, 0);
    r.reset();
    expect(r.stats().frames).toBe(0);
  });

  it('HL-15 a frame that is not later than the last is dropped, never reordered', () => {
    const r = createReader();
    r.push({ tMs: 100, cells: [1] });
    r.push({ tMs: 100, cells: [2] });
    r.push({ tMs: 90, cells: [3] });
    r.push({ tMs: 133, cells: [4] });
    expect(r.stats().frames).toBe(2);
  });

  it('HL-15 only the recent window is kept, so memory stays bounded', () => {
    const r = createReader(5_000);
    for (let i = 0; i < 2_000; i++) r.push({ tMs: i * 33, cells: [i % 2 ? 200 : 20] });
    const { frames } = r.stats();
    expect(frames).toBeLessThanOrEqual(Math.ceil(5_000 / 33) + 2);
    expect(frames).toBeGreaterThan(100);
    const big = createReader(1e12);
    for (let i = 0; i < heliograph.MAX_SAMPLES + 500; i++) big.push({ tMs: i + 1, cells: [1] });
    expect(big.stats().frames).toBeLessThanOrEqual(heliograph.MAX_SAMPLES);
    expect(DEFAULT_WINDOW_MS).toBeGreaterThan(2 * 12_800);
  });

  it('HL-15 hostile frames never make the reader throw', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ tMs: fc.double(), cells: fc.array(fc.double(), { maxLength: 6 }) }), {
          maxLength: 30,
        }),
        (frames) => {
          const r = createReader();
          for (const f of frames) r.push(f);
          expect(['message', 'repeatRequested', 'noSignal']).toContain(r.read().kind);
        },
      ),
      { numRuns: 200 },
    );
  });

  // ------------------------------------------------------------------ camera helpers
  it('HL-16 the grid is a mean per cell of the brightest channel, and only numbers leave', () => {
    const w = 16;
    const h = 12;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // A red lamp (R only) in the top-left corner cell, everything else dark.
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = 200;
        rgba[i + 3] = 255;
      }
    }
    const g = gridOf(rgba, w, h);
    expect(g).toHaveLength(48);
    expect(g[0]).toBe(200);
    expect(g.slice(1).every((v) => v === 0)).toBe(true);
    expect(g.every((v) => typeof v === 'number')).toBe(true);
  });

  it('HL-16 every grid value is within 0..255, whatever the picture', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 24 }),
        fc.integer({ min: 6, max: 18 }),
        fc.integer({ min: 0, max: 255 }),
        (w, h, v) => {
          const rgba = new Uint8ClampedArray(w * h * 4).fill(v);
          const g = gridOf(rgba, w, h);
          expect(g).toHaveLength(48);
          for (const c of g) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(255);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('HL-16 camera errors are named for the user, and unknown ones are "unavailable"', () => {
    expect(errorOf({ name: 'NotAllowedError' })).toBe('denied');
    expect(errorOf({ name: 'SecurityError' })).toBe('denied');
    expect(errorOf({ name: 'NotFoundError' })).toBe('noCamera');
    expect(errorOf({ name: 'OverconstrainedError' })).toBe('noCamera');
    expect(errorOf({ name: 'NotReadableError' })).toBe('busy');
    for (const x of [null, undefined, 5, 'x', {}, { name: 5 }, new Error('boom')]) {
      expect(errorOf(x)).toBe('unavailable');
    }
  });
});
