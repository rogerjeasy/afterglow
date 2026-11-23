import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MESSAGE_CODES, type MessageName } from './codes.js';
import { PROFILES } from './profiles.js';
import { decodeBrightness } from './receive.js';
import { type GridFrame, MAX_CELLS, trackSeries } from './track.js';
import { planTransmission } from './transmit.js';

const NAMES = Object.keys(MESSAGE_CODES) as MessageName[];

/** A recording of a lamp as a grid: one cell carries the signal, the others are scenery. */
function gridRecording(opts: {
  msg: { code: MessageName; slot: number; sequence: number };
  cells: number;
  signalCell: number;
  fps: number;
  seed: number;
  scenery: 'still' | 'flicker';
}): GridFrame[] {
  const plan = planTransmission(opts.msg, 3, PROFILES.standard);
  if (!plan) throw new Error('bad message');
  const syms: number[] = [];
  for (const r of plan.runs) for (let k = 0; k < r.ms / 200; k++) syms.push(r.lit ? 1 : 0);
  let a = opts.seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const still = Array.from({ length: opts.cells }, () => 30 + rnd() * 200);
  const out: GridFrame[] = [];
  const lead = 1000;
  for (let t = 0; t < lead + syms.length * 200 + 1000; t += 1000 / opts.fps) {
    const k = Math.floor((t - lead) / 200);
    const lit = k >= 0 && k < syms.length && syms[k] === 1;
    const cells = still.map((v, i) => {
      if (i === opts.signalCell) return lit ? 200 : 20;
      return opts.scenery === 'still' ? v : Math.max(0, v + (rnd() - 0.5) * 8);
    });
    out.push({ tMs: t, cells });
  }
  return out;
}

const msgArb = fc.record({
  code: fc.constantFrom(...NAMES),
  slot: fc.integer({ min: 0, max: 63 }),
  sequence: fc.integer({ min: 0, max: 3 }),
});

describe('Heliograph tracking properties', () => {
  it('HL-13 the blinking cell is found among still and slightly flickering cells, and the message is read', () => {
    fc.assert(
      fc.property(
        msgArb,
        fc.integer({ min: 4, max: 48 }),
        fc.nat(),
        fc.constantFrom(20, 30, 60),
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.constantFrom<'still' | 'flicker'>('still', 'flicker'),
        (msg, cells, at, fps, seed, scenery) => {
          const signalCell = at % cells;
          const frames = gridRecording({ msg, cells, signalCell, fps, seed, scenery });
          const series = trackSeries(frames);
          expect(series).not.toBeNull();
          expect(series?.map((s) => s.level)).toEqual(frames.map((f) => f.cells[signalCell]));
          expect(decodeBrightness(series ?? [])).toMatchObject({ kind: 'message', message: msg });
        },
      ),
      { numRuns: 40 },
    );
  });

  it('HL-13 the same cell is chosen however the cells are ordered', () => {
    fc.assert(
      fc.property(
        msgArb,
        fc.integer({ min: 4, max: 24 }),
        fc.nat(),
        fc.integer({ min: 1, max: 99999 }),
        (msg, cells, at, seed) => {
          const frames = gridRecording({
            msg,
            cells,
            signalCell: at % cells,
            fps: 30,
            seed,
            scenery: 'still',
          });
          const order = [...Array(cells).keys()].reverse();
          const permuted = frames.map((f) => ({
            tMs: f.tMs,
            cells: order.map((i) => f.cells[i] as number),
          }));
          const a = trackSeries(frames)?.map((s) => s.level);
          const b = trackSeries(permuted)?.map((s) => s.level);
          expect(b).toEqual(a);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('HL-13 a lamp left on, a dark room and a window never become a signal', () => {
    const still = (v: number[]): GridFrame[] =>
      Array.from({ length: 300 }, (_, i) => ({ tMs: i * 33, cells: v }));
    expect(trackSeries(still([255, 255, 255]))).toBeNull();
    expect(trackSeries(still([0, 0, 0, 0]))).toBeNull();
    expect(trackSeries(still([10, 200, 90, 40]))).toBeNull();
  });

  it('HL-13 malformed frames give no series and never throw', () => {
    const ok = (t: number, cells: number[]): GridFrame => ({ tMs: t, cells });
    const bad: unknown[] = [
      null,
      undefined,
      'x',
      [],
      [ok(0, [1])],
      [ok(0, [1, 2]), ok(1, [1])],
      [ok(0, [1]), ok(0, [200])],
      [ok(5, [1]), ok(4, [200])],
      [ok(0, [Number.NaN]), ok(1, [200])],
      [ok(0, [-1]), ok(1, [200])],
      [ok(Number.POSITIVE_INFINITY, [1]), ok(1, [200])],
      [ok(0, []), ok(1, [])],
      [ok(0, new Array(MAX_CELLS + 1).fill(1)), ok(1, new Array(MAX_CELLS + 1).fill(1))],
      [null, null],
    ];
    for (const b of bad) expect(trackSeries(b as GridFrame[])).toBeNull();
    fc.assert(
      fc.property(fc.anything(), (x) => {
        trackSeries(x as GridFrame[]);
      }),
      { numRuns: 200 },
    );
  });

  it('HL-13 equal contrast breaks ties by the lowest cell index', () => {
    const frames: GridFrame[] = Array.from({ length: 100 }, (_, i) => ({
      tMs: i * 33,
      cells: [i % 2 ? 200 : 20, i % 2 ? 200 : 20, 100],
    }));
    const series = trackSeries(frames);
    expect(series?.map((s) => s.level)).toEqual(frames.map((f) => f.cells[0]));
  });
});
