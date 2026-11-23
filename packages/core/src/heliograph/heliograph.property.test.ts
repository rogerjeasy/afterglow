import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_SEQUENCE, MAX_SLOT, MESSAGE_CODES, type MessageName, nameOfCode } from './codes.js';
import type { HeliographMessage } from './codes.js';
import { type Bit, bitsToNumber, crc4, hammingEncode, numberToBits } from './fec.js';
import {
  CODED_BITS,
  FRAME_BITS,
  FRAME_MS,
  FRAME_SYMBOLS,
  PREAMBLE,
  SYMBOL_MS,
  decodeCoded,
  encodeCoded,
  encodeFrame,
} from './frame.js';
import { manchesterDecode, manchesterEncode, manchesterPair } from './manchester.js';
import { type BrightnessSample, MAX_SAMPLES, decodeBrightness } from './receive.js';
import { planTransmission } from './transmit.js';

const NAMES = Object.keys(MESSAGE_CODES) as MessageName[];
const msgArb: fc.Arbitrary<HeliographMessage> = fc.record({
  code: fc.constantFrom(...NAMES),
  slot: fc.integer({ min: 0, max: MAX_SLOT }),
  sequence: fc.integer({ min: 0, max: MAX_SEQUENCE }),
});

// ---------------------------------------------------------------- simulator
/** A small seeded generator so a failing recording shrinks to a seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Recording {
  readonly fps: number;
  /** Fractional jitter of each frame interval, for example 0.2 for +-20%. */
  readonly jitter: number;
  /** Sender clock error: 1.03 means the sender runs 3% slow. */
  readonly clockScale: number;
  readonly leadMs: number;
  readonly trailMs: number;
  readonly dark: number;
  readonly lit: number;
  readonly noise: number;
  /** Ambient brightness change over the whole recording. */
  readonly drift: number;
  /** Probability that a whole symbol interval is inverted. */
  readonly flipProb: number;
  readonly seed: number;
}

const BASE: Recording = {
  fps: 30,
  jitter: 0,
  clockScale: 1,
  leadMs: 1500,
  trailMs: 1500,
  dark: 20,
  lit: 200,
  noise: 0,
  drift: 0,
  flipProb: 0,
  seed: 1,
};

function symbolsOf(msgs: readonly HeliographMessage[], repeats: number[]): (0 | 1)[] {
  const out: (0 | 1)[] = [];
  msgs.forEach((m, i) => {
    const plan = planTransmission(m, repeats[i] ?? 1);
    if (!plan) throw new Error('invalid message in fixture');
    for (const run of plan.runs)
      for (let k = 0; k < run.ms / SYMBOL_MS; k++) out.push(run.lit ? 1 : 0);
  });
  return out;
}

function record(symbols: readonly (0 | 1)[], r: Recording): BrightnessSample[] {
  const rnd = mulberry32(r.seed);
  const flips = symbols.map(() => rnd() < r.flipProb);
  const symMs = SYMBOL_MS * r.clockScale;
  const total = r.leadMs + symbols.length * symMs + r.trailMs;
  const out: BrightnessSample[] = [];
  let t = 0;
  while (t <= total) {
    const k = Math.floor((t - r.leadMs) / symMs);
    let lit = false;
    if (k >= 0 && k < symbols.length) lit = (symbols[k] === 1) !== (flips[k] as boolean);
    const base = lit ? r.lit : r.dark;
    const level = Math.max(0, base + (rnd() * 2 - 1) * r.noise + r.drift * (t / total));
    out.push({ tMs: t, level });
    t += (1000 / r.fps) * (1 + (rnd() * 2 - 1) * r.jitter);
  }
  return out;
}

const heard = (msg: HeliographMessage, repeats: number, r: Partial<Recording> = {}) =>
  decodeBrightness(record(symbolsOf([msg], [repeats]), { ...BASE, ...r }));

const SAFE_MSG: HeliographMessage = { code: 'SAFE', slot: 3, sequence: 7 };
const isNonMessage = (r: ReturnType<typeof decodeBrightness>): boolean => r.kind !== 'message';

describe('Heliograph properties', () => {
  // ------------------------------------------------------------------ HL-01
  it('HL-01 the 11 messages have distinct codes 1..11 and everything else is reserved', () => {
    const codes = Object.values(MESSAGE_CODES);
    expect(codes).toHaveLength(11);
    expect(new Set(codes).size).toBe(11);
    expect([...codes].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const n of [0, 12, 13, 14, 15, -1, 16, 1.5, Number.NaN]) expect(nameOfCode(n)).toBeNull();
    for (const [name, n] of Object.entries(MESSAGE_CODES)) expect(nameOfCode(n)).toBe(name);
  });

  it('HL-01 a frame carrying a reserved code is refused', () => {
    for (const reserved of [0, 12, 13, 14, 15]) {
      const head = [...numberToBits(5, 4), ...numberToBits(reserved, 4), ...numberToBits(2, 4)];
      const body = [...head, ...numberToBits(crc4(head), 4)];
      const coded = [
        ...hammingEncode(body.slice(0, 8) as Bit[]),
        ...hammingEncode(body.slice(8) as Bit[]),
      ];
      expect(decodeCoded(coded)).toEqual({ ok: false, reason: 'reservedCode' });
    }
  });

  // ------------------------------------------------------------------ HL-02
  it('HL-02 every message, slot and sequence round-trips with no correction', () => {
    for (const code of NAMES) {
      for (let slot = 0; slot <= MAX_SLOT; slot++) {
        for (let sequence = 0; sequence <= MAX_SEQUENCE; sequence++) {
          const coded = encodeCoded({ code, slot, sequence }) as Bit[];
          expect(coded).toHaveLength(CODED_BITS);
          const d = decodeCoded(coded);
          expect(d).toEqual({ ok: true, message: { code, slot, sequence }, correctedWords: 0 });
        }
      }
    }
  });

  it('HL-02 the frame is the preamble followed by the coded bits, 32 bits in all', () => {
    fc.assert(
      fc.property(msgArb, (m) => {
        const f = encodeFrame(m) as Bit[];
        expect(f).toHaveLength(FRAME_BITS);
        expect(f.slice(0, 8)).toEqual([...PREAMBLE]);
        expect(f.slice(8)).toEqual(encodeCoded(m));
      }),
      { numRuns: 200 },
    );
    expect(FRAME_SYMBOLS).toBe(64);
    expect(FRAME_MS).toBe(12_800);
  });

  it('HL-02 an out-of-range message gives no frame', () => {
    const bad: unknown[] = [
      { code: 'NOPE', slot: 0, sequence: 0 },
      { code: 'SAFE', slot: 16, sequence: 0 },
      { code: 'SAFE', slot: -1, sequence: 0 },
      { code: 'SAFE', slot: 1.5, sequence: 0 },
      { code: 'SAFE', slot: 0, sequence: 16 },
      { code: 'SAFE', slot: 0, sequence: Number.NaN },
      { code: 'SAFE', slot: '1', sequence: 0 },
      { code: 'toString', slot: 0, sequence: 0 },
      null,
      undefined,
      42,
    ];
    for (const m of bad) {
      expect(encodeFrame(m as HeliographMessage)).toBeNull();
      expect(planTransmission(m as HeliographMessage)).toBeNull();
    }
  });

  // ------------------------------------------------------------------ HL-03
  it('HL-03 one flipped bit in each of the two words is corrected', () => {
    fc.assert(
      fc.property(
        msgArb,
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: 12, max: 23 }),
        fc.boolean(),
        fc.boolean(),
        (m, i, j, flipA, flipB) => {
          const coded = [...(encodeCoded(m) as Bit[])];
          if (flipA) coded[i] = ((coded[i] as number) ^ 1) as Bit;
          if (flipB) coded[j] = ((coded[j] as number) ^ 1) as Bit;
          const d = decodeCoded(coded);
          expect(d.ok).toBe(true);
          if (d.ok) {
            expect(d.message).toEqual(m);
            expect(d.correctedWords).toBe((flipA ? 1 : 0) + (flipB ? 1 : 0));
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('HL-03 any 24 bits either fail or decode to a message within one flip per word of them', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1 }), { minLength: 24, maxLength: 24 }),
        (bits) => {
          const d = decodeCoded(bits);
          if (!d.ok) return;
          const re = encodeCoded(d.message) as Bit[];
          const diffA = re.slice(0, 12).filter((b, k) => b !== bits[k]).length;
          const diffB = re.slice(12).filter((b, k) => b !== bits[12 + k]).length;
          expect(diffA).toBeLessThanOrEqual(1);
          expect(diffB).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('HL-03 the wrong length or non-bits are refused, never thrown', () => {
    for (const x of [
      [],
      [1, 0],
      new Array(25).fill(0),
      new Array(24).fill(2),
      'x',
      null,
      undefined,
      5,
    ]) {
      const d = decodeCoded(x as number[]);
      expect(d.ok).toBe(false);
    }
  });

  // ------------------------------------------------------------------ HL-04
  it('HL-04 a wrong CRC is refused even when the Hamming words are valid', () => {
    for (const wrong of [1, 2, 4, 8, 15]) {
      const head = [...numberToBits(3, 4), ...numberToBits(1, 4), ...numberToBits(5, 4)];
      const body = [...head, ...numberToBits(crc4(head) ^ wrong, 4)];
      const coded = [
        ...hammingEncode(body.slice(0, 8) as Bit[]),
        ...hammingEncode(body.slice(8) as Bit[]),
      ];
      expect(decodeCoded(coded)).toEqual({ ok: false, reason: 'crc' });
    }
  });

  it('HL-04 two flips inside one word are mostly refused; the miscorrection rate is bounded and measured', () => {
    let attempts = 0;
    let wrong = 0;
    let refused = 0;
    for (const code of NAMES) {
      for (let slot = 0; slot <= MAX_SLOT; slot += 3) {
        for (let sequence = 0; sequence <= MAX_SEQUENCE; sequence += 5) {
          const m = { code, slot, sequence };
          const coded = encodeCoded(m) as Bit[];
          for (const [lo, hi] of [
            [0, 12],
            [12, 24],
          ] as const) {
            for (let i = lo; i < hi; i++) {
              for (let j = i + 1; j < hi; j++) {
                const c = [...coded];
                c[i] = ((c[i] as number) ^ 1) as Bit;
                c[j] = ((c[j] as number) ^ 1) as Bit;
                const d = decodeCoded(c);
                attempts++;
                if (!d.ok) refused++;
                else if (
                  d.message.code !== m.code ||
                  d.message.slot !== m.slot ||
                  d.message.sequence !== m.sequence
                )
                  wrong++;
              }
            }
          }
        }
      }
    }
    // Recorded in the spec Analysis. A single frame is not trusted for this reason (HL-08).
    expect(wrong / attempts).toBeLessThan(0.08);
    expect(refused / attempts).toBeGreaterThan(0.8);
    expect(wrong).toBeGreaterThan(0); // the risk is real, which is why HL-08 exists
  });

  // ------------------------------------------------------------------ HL-05
  it('HL-05 Manchester coding round-trips', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 1 }), { maxLength: 80 }), (bits) => {
        expect(manchesterDecode(manchesterEncode(bits as Bit[]))).toEqual(bits);
      }),
      { numRuns: 200 },
    );
  });

  it('HL-05 an equal pair, a gap or an odd length is never turned into a bit', () => {
    expect(manchesterPair(1, 0)).toBe(1);
    expect(manchesterPair(0, 1)).toBe(0);
    for (const [a, b] of [
      [0, 0],
      [1, 1],
      [null, 1],
      [1, null],
      [undefined, 0],
      [2, 0],
    ] as const) {
      expect(manchesterPair(a, b)).toBeNull();
    }
    expect(manchesterDecode([1, 0, 1])).toBeNull();
    expect(manchesterDecode([1, 0, 1, 1])).toBeNull();
    expect(manchesterDecode([1, 0, null, 1])).toBeNull();
  });

  // ------------------------------------------------------------------ HL-06
  it('HL-06 the plan alternates and sums to repeats x 64 x 200 ms', () => {
    fc.assert(
      fc.property(msgArb, fc.integer({ min: 1, max: 5 }), (m, repeats) => {
        const p = planTransmission(m, repeats);
        expect(p).not.toBeNull();
        if (!p) return;
        expect(p.totalMs).toBe(repeats * FRAME_SYMBOLS * SYMBOL_MS);
        expect(p.symbols).toBe(repeats * FRAME_SYMBOLS);
        for (let i = 1; i < p.runs.length; i++) {
          expect((p.runs[i] as { lit: boolean }).lit).not.toBe(
            (p.runs[i - 1] as { lit: boolean }).lit,
          );
        }
        for (const r of p.runs) {
          expect(r.ms % SYMBOL_MS).toBe(0);
          expect(r.ms).toBeGreaterThan(0);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('HL-06 the plan, read back as symbols, is the Manchester coding of the frame', () => {
    fc.assert(
      fc.property(msgArb, (m) => {
        const p = planTransmission(m, 1);
        const syms = (p?.runs ?? []).flatMap(
          (r) => Array(r.ms / SYMBOL_MS).fill(r.lit ? 1 : 0) as (0 | 1)[],
        );
        expect(manchesterDecode(syms)).toEqual(encodeFrame(m));
      }),
      { numRuns: 200 },
    );
  });

  it('HL-06 an invalid repeat count gives no plan', () => {
    for (const n of [0, -1, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(planTransmission(SAFE_MSG, n)).toBeNull();
    }
  });

  // ------------------------------------------------------------------ HL-07
  it('HL-07 a clean recording is read', () => {
    const r = heard(SAFE_MSG, 3);
    expect(r).toMatchObject({ kind: 'message', message: SAFE_MSG });
    if (r.kind === 'message') expect(r.repeatsAgreed).toBe(3);
  });

  it('HL-07 a noisy, jittery, drifting recording is read at any frame rate from 20 to 60', () => {
    fc.assert(
      fc.property(
        msgArb,
        fc.integer({ min: 20, max: 60 }),
        fc.double({ min: 0, max: 0.2, noNaN: true }),
        fc.double({ min: 0.97, max: 1.03, noNaN: true }),
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 0, max: 4000 }),
        fc.double({ min: 0, max: 22, noNaN: true }),
        fc.double({ min: -30, max: 30, noNaN: true }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (msg, fps, jitter, clockScale, leadMs, trailMs, noise, drift, seed) => {
          const r = heard(msg, 3, { fps, jitter, clockScale, leadMs, trailMs, noise, drift, seed });
          expect(
            r.kind,
            JSON.stringify({ msg, fps, jitter, clockScale, leadMs, noise, drift }),
          ).toBe('message');
          if (r.kind === 'message') expect(r.message).toEqual(msg);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('HL-07 the lit and dark levels may sit anywhere on the scale', () => {
    for (const [dark, lit] of [
      [0, 255],
      [5, 40],
      [100, 160],
      [10, 30],
    ] as const) {
      const r = heard(SAFE_MSG, 3, { dark, lit, noise: 2 });
      expect(r, `${dark}/${lit}`).toMatchObject({ kind: 'message', message: SAFE_MSG });
    }
  });

  // ------------------------------------------------------------------ HL-08
  it('HL-08 a single perfect repeat is not enough', () => {
    const r = heard(SAFE_MSG, 1);
    expect(r.kind).toBe('repeatRequested');
  });

  it('HL-08 two agreeing repeats are enough', () => {
    const r = heard(SAFE_MSG, 2);
    expect(r).toMatchObject({ kind: 'message', message: SAFE_MSG, repeatsAgreed: 2, voted: false });
  });

  it('HL-08 two different messages each seen twice are refused', () => {
    const a: HeliographMessage = { code: 'SAFE', slot: 3, sequence: 7 };
    const b: HeliographMessage = { code: 'HELP', slot: 3, sequence: 8 };
    const r = decodeBrightness(record(symbolsOf([a, b], [2, 2]), BASE));
    expect(r.kind).toBe('repeatRequested');
  });

  it('HL-08 a later, different message does not cancel one that was confirmed', () => {
    const a: HeliographMessage = { code: 'SAFE', slot: 3, sequence: 7 };
    const b: HeliographMessage = { code: 'HELP', slot: 3, sequence: 8 };
    const r = decodeBrightness(record(symbolsOf([a, b], [2, 1]), BASE));
    expect(r).toMatchObject({ kind: 'message', message: a });
  });

  it('HL-08 two frames that are not a whole number of frame lengths apart are not repeats of each other', () => {
    const once = symbolsOf([SAFE_MSG], [1]);
    const withGap = (gap: number) => [...once, ...(Array(gap).fill(0) as (0 | 1)[]), ...once];
    // Contiguous (gap 0) and exactly one frame apart (gap 64) are repeats.
    for (const gap of [0, FRAME_SYMBOLS]) {
      expect(decodeBrightness(record(withGap(gap), BASE)), `gap ${gap}`).toMatchObject({
        kind: 'message',
        message: SAFE_MSG,
      });
    }
    // Anything else is two separate sightings, which is not confirmation.
    for (const gap of [9, 17, 31, 33, 47, 80]) {
      expect(decodeBrightness(record(withGap(gap), BASE)).kind, `gap ${gap}`).toBe(
        'repeatRequested',
      );
    }
  });

  it('HL-08 three repeats damaged in different places are recovered by voting', () => {
    // Flip single symbols (each one corrupts one Manchester pair, so one bit) at
    // different places in each repeat, so no repeat decodes alone but the vote does.
    const base = symbolsOf([SAFE_MSG], [3]);
    const damaged = [...base];
    const hit = (repeat: number, bit: number, bit2: number) => {
      for (const b of [bit, bit2]) {
        const idx = repeat * FRAME_SYMBOLS + 2 * (8 + b);
        damaged[idx] = (1 - (damaged[idx] as number)) as 0 | 1;
        damaged[idx + 1] = (1 - (damaged[idx + 1] as number)) as 0 | 1;
      }
    };
    // Two flips in the same Hamming word in each repeat (not correctable alone), at different bits.
    hit(0, 1, 2);
    hit(1, 4, 5);
    hit(2, 8, 9);
    const r = decodeBrightness(record(damaged, BASE));
    expect(r.kind === 'message' ? r.message : null).toEqual(r.kind === 'message' ? SAFE_MSG : null);
    if (r.kind === 'message') expect(r.voted || r.repeatsAgreed >= 2).toBe(true);
  });

  // ------------------------------------------------------------------ HL-09
  it('HL-09 under heavy corruption the result is the sent message or a refusal, never another message', () => {
    let messages = 0;
    let refusals = 0;
    fc.assert(
      fc.property(
        msgArb,
        fc.integer({ min: 1, max: 3 }),
        fc.double({ min: 0, max: 0.35, noNaN: true }),
        fc.double({ min: 0, max: 60, noNaN: true }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (msg, repeats, flipProb, noise, seed) => {
          const r = heard(msg, repeats, { flipProb, noise, seed });
          if (r.kind === 'message') {
            messages++;
            expect(r.message).toEqual(msg);
          } else refusals++;
        },
      ),
      { numRuns: 400 },
    );
    expect(messages).toBeGreaterThan(0);
    expect(refusals).toBeGreaterThan(0);
  });

  it('HL-09 pure noise never produces a message', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 20, max: 60 }),
        (seed, fps) => {
          const rnd = mulberry32(seed);
          const out: BrightnessSample[] = [];
          for (let t = 0; t < 60_000; t += 1000 / fps) out.push({ tMs: t, level: rnd() * 255 });
          expect(decodeBrightness(out).kind).not.toBe('message');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('HL-09 a steady light, a dark room and a slow ramp are not messages', () => {
    const steady = (level: number) =>
      Array.from({ length: 600 }, (_, i) => ({ tMs: i * 33, level })) as BrightnessSample[];
    expect(decodeBrightness(steady(0)).kind).toBe('noSignal');
    expect(decodeBrightness(steady(255)).kind).toBe('noSignal');
    const ramp = Array.from({ length: 1200 }, (_, i) => ({ tMs: i * 33, level: (i / 1200) * 255 }));
    expect(isNonMessage(decodeBrightness(ramp))).toBe(true);
  });

  // ------------------------------------------------------------------ HL-10
  it('HL-10 unusable recordings are noSignal with a reason, never a throw', () => {
    const ok = record(symbolsOf([SAFE_MSG], [3]), BASE);
    const cases: unknown[] = [
      null,
      undefined,
      'x',
      42,
      {},
      [],
      [ok[0]],
      [
        { tMs: 0, level: 1 },
        { tMs: 0, level: 2 },
      ],
      [
        { tMs: 5, level: 1 },
        { tMs: 4, level: 2 },
      ],
      [
        { tMs: Number.NaN, level: 1 },
        { tMs: 1, level: 2 },
      ],
      [
        { tMs: 0, level: Number.POSITIVE_INFINITY },
        { tMs: 1, level: 2 },
      ],
      [
        { tMs: 0, level: -5 },
        { tMs: 1, level: 2 },
      ],
      [null, null],
      Array.from({ length: MAX_SAMPLES + 1 }, (_, i) => ({ tMs: i, level: i % 2 ? 0 : 255 })),
      [
        { tMs: 0, level: 0 },
        { tMs: 1e300, level: 255 },
      ],
      [
        { tMs: 0, level: 0 },
        { tMs: 21 * 60_000, level: 255 },
      ],
      [
        { tMs: -1e300, level: 0 },
        { tMs: 1e300, level: 255 },
      ],
      ok.map((s) => ({ ...s, level: 100 })),
      ok.map((s) => ({ ...s, level: 100 + (s.level > 100 ? 5 : 0) })),
    ];
    for (const [i, c] of cases.entries()) {
      const r = decodeBrightness(c as BrightnessSample[]);
      expect(r.kind, `case #${i}`).toBe('noSignal');
      if (r.kind === 'noSignal') expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('HL-10 arbitrary input never throws', () => {
    fc.assert(
      fc.property(fc.anything(), (x) => {
        const r = decodeBrightness(x as BrightnessSample[]);
        expect(['message', 'repeatRequested', 'noSignal']).toContain(r.kind);
      }),
      { numRuns: 300 },
    );
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ tMs: fc.double({ noNaN: true }), level: fc.double({ noNaN: true }) }),
          { maxLength: 60 },
        ),
        (xs) => {
          expect(['message', 'repeatRequested', 'noSignal']).toContain(decodeBrightness(xs).kind);
        },
      ),
      { numRuns: 300 },
    );
  });

  // ------------------------------------------------------------------ HL-11
  it('HL-11 the same recording gives the same result', () => {
    fc.assert(
      fc.property(
        msgArb,
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.double({ min: 0, max: 0.2, noNaN: true }),
        (msg, seed, flipProb) => {
          const rec = record(symbolsOf([msg], [3]), { ...BASE, seed, flipProb, noise: 10 });
          expect(decodeBrightness(rec)).toEqual(decodeBrightness(rec));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('bit helpers behave', () => {
    expect(bitsToNumber([1, 0, 1, 1])).toBe(11);
    expect(numberToBits(11, 4)).toEqual([1, 0, 1, 1]);
  });
});
