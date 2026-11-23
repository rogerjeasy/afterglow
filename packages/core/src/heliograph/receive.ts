import type { HeliographMessage } from './codes.js';
import type { Bit } from './fec.js';
import { CODED_BITS, FRAME_SYMBOLS, PREAMBLE, decodeCoded, sameMessage } from './frame.js';
import { manchesterPair } from './manchester.js';
import { PROFILE_LIST, type Profile, frameMsOf, maxFrameIntervalMs } from './profiles.js';

/** One camera frame: when it was taken and how bright the tracked source was (any non-negative scale). */
export interface BrightnessSample {
  readonly tMs: number;
  readonly level: number;
}

export type HeliographResult =
  | {
      readonly kind: 'message';
      readonly message: HeliographMessage;
      /** How many repeats carried this message (2 or more, or 3 for a vote). */
      readonly repeatsAgreed: number;
      /** True when the message was recovered by a bitwise vote across three repeats. */
      readonly voted: boolean;
      /** Which physical rate carried it. */
      readonly profile: Profile['name'];
      readonly correctedWords: number;
    }
  /** A frame was seen but not enough was read. Ask the sender to repeat. Never a guess. */
  | { readonly kind: 'repeatRequested'; readonly reason: string }
  | { readonly kind: 'noSignal'; readonly reason: string };

/** HL-10: more than this many samples is refused instead of truncated. */
export const MAX_SAMPLES = 20_000;
/** HL-10: a recording longer than this, or with times this large, is refused. */
export const MAX_SPAN_MS = 20 * 60_000;
const MAX_ABS_TIME_MS = 1e12;
/** The lit and dark levels must differ by at least this much (on a 0..255 scale). */
export const MIN_CONTRAST = 12;
/** Sender clock error tolerated, as a fraction of the nominal symbol time. */
const PERIOD_TOLERANCE = 0.2;
const WINDOW_SYMBOLS = FRAME_SYMBOLS + 16;
const WINDOW_STEP_SYMBOLS = 8;
const MIN_EDGES_IN_WINDOW = 6;
const MAX_EDGES_IN_WINDOW = 2 * WINDOW_SYMBOLS;
/** Two repeats are the same frame when closer than 2 symbols, and consecutive within 8% of a frame. */
const SAME_FRAME_SYMBOLS = 2;
const SPACING_TOLERANCE = 0.08;

const noSignal = (reason: string): HeliographResult => ({ kind: 'noSignal', reason });

function validate(samples: unknown): string | null {
  if (!Array.isArray(samples)) return 'There are no brightness readings.';
  if (samples.length < 2) return 'There are too few brightness readings.';
  if (samples.length > MAX_SAMPLES) return 'There are too many brightness readings.';
  let prev = Number.NEGATIVE_INFINITY;
  for (const s of samples as BrightnessSample[]) {
    if (typeof s !== 'object' || s === null) return 'A brightness reading is not valid.';
    if (!Number.isFinite(s.tMs) || !Number.isFinite(s.level) || s.level < 0) {
      return 'A brightness reading is not valid.';
    }
    if (Math.abs(s.tMs) > MAX_ABS_TIME_MS) return 'A reading time is out of range.';
    if (s.tMs <= prev) return 'Reading times must be strictly increasing.';
    prev = s.tMs;
  }
  const span =
    (samples[samples.length - 1] as BrightnessSample).tMs - (samples[0] as BrightnessSample).tMs;
  if (span > MAX_SPAN_MS) return 'The recording is too long.';
  return null;
}

interface Binary {
  readonly t: readonly number[];
  readonly v: readonly Bit[];
  /** Times at which the signal switched, halfway between the two readings. */
  readonly edges: readonly number[];
}

/**
 * Percentile threshold with hysteresis (HL-07): robust to a quiet stretch
 * before and after, a threshold that is not centred, and slow ambient drift in
 * the tolerance of the hysteresis band. Null when lit and dark are too close.
 */
function binarise(samples: readonly BrightnessSample[]): Binary | null {
  const sorted = samples.map((s) => s.level).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.1)] as number;
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] as number;
  if (hi - lo < MIN_CONTRAST) return null;
  const mid = (lo + hi) / 2;
  const band = 0.15 * (hi - lo);
  const t: number[] = [];
  const v: Bit[] = [];
  const edges: number[] = [];
  let state: Bit = (samples[0] as BrightnessSample).level > mid ? 1 : 0;
  for (const [i, s] of samples.entries()) {
    const next: Bit = s.level > mid + band ? 1 : s.level < mid - band ? 0 : state;
    if (i > 0 && next !== state) {
      edges.push(((samples[i - 1] as BrightnessSample).tMs + s.tMs) / 2);
    }
    state = next;
    t.push(s.tMs);
    v.push(state);
  }
  return { t, v, edges };
}

interface Timing {
  readonly periodMs: number;
  /** Absolute time of a symbol boundary. */
  readonly originMs: number;
}

/**
 * Find the symbol clock for the edges in [from, to): edges sit on symbol
 * boundaries, so a coarse search over period and phase finds the clock and a
 * least-squares fit over the edges that agree sharpens it (HL-07). A window
 * with too few or too many edges has no clock to follow: a Manchester signal
 * at this rate cannot make more than about one edge per symbol, so a busier
 * window is noise and is refused cheaply (fail closed).
 */
function estimateTiming(
  edges: readonly number[],
  from: number,
  to: number,
  symbolMs: number,
): Timing | null {
  const inside = edges.filter((e) => e >= from && e < to);
  if (inside.length < MIN_EDGES_IN_WINDOW || inside.length > MAX_EDGES_IN_WINDOW) return null;
  const centre = (from + to) / 2;

  let best: Timing | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const periodSteps = Math.round((2 * PERIOD_TOLERANCE) / 0.01);
  for (let i = 0; i <= periodSteps; i++) {
    const period = symbolMs * (1 - PERIOD_TOLERANCE + i * 0.01);
    for (let ph = 0; ph < 12; ph++) {
      const origin = centre + (ph / 12) * period;
      let score = 0;
      for (const e of inside) {
        const x = (e - origin) / period;
        score += Math.abs(x - Math.round(x)) <= 0.25 ? 1 : -1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { periodMs: period, originMs: origin };
      }
    }
  }
  if (best === null) return null;

  let { periodMs, originMs } = best;
  // The coarse phase is only accurate to a fraction of a symbol. Centre it on the
  // edges (circular mean of their position within a symbol) before fitting, so the
  // fit's outlier test measures real jitter and not the search grid.
  let sinSum = 0;
  let cosSum = 0;
  for (const e of inside) {
    const a = 2 * Math.PI * ((e - originMs) / periodMs);
    sinSum += Math.sin(a);
    cosSum += Math.cos(a);
  }
  originMs += (Math.atan2(sinSum, cosSum) / (2 * Math.PI)) * periodMs;
  let inliers = 0;
  for (let round = 0; round < 3; round++) {
    // Fit e = origin + n * period over the edges that sit near a boundary.
    let count = 0;
    let sn = 0;
    let se = 0;
    let snn = 0;
    let sne = 0;
    for (const e of inside) {
      const n = Math.round((e - originMs) / periodMs);
      if (Math.abs(e - (originMs + n * periodMs)) > 0.2 * periodMs) continue;
      count++;
      sn += n;
      se += e;
      snn += n * n;
      sne += n * e;
    }
    inliers = count;
    const den = count * snn - sn * sn;
    if (count < MIN_EDGES_IN_WINDOW || den === 0) return null;
    periodMs = (count * sne - sn * se) / den;
    originMs = (se - periodMs * sn) / count;
  }
  const inRange =
    periodMs >= symbolMs * (1 - PERIOD_TOLERANCE) && periodMs <= symbolMs * (1 + PERIOD_TOLERANCE);
  // Most edges must fit, otherwise there is no clock to follow.
  return inRange && inliers >= 0.6 * inside.length ? { periodMs, originMs } : null;
}

/** The symbol at the centre of each interval, by majority of the readings in its middle half. */
function sampleSymbols(
  bin: Binary,
  timing: Timing,
  from: number,
  to: number,
): { symbols: (Bit | null)[]; firstMs: number } {
  const { periodMs, originMs } = timing;
  // A symbol belongs to the window when the middle half that is sampled does.
  const k0 = Math.ceil((from - 0.25 * periodMs - originMs) / periodMs);
  const out: (Bit | null)[] = [];
  let lo = 0;
  for (let k = k0; ; k++) {
    const start = originMs + k * periodMs;
    if (start + 0.75 * periodMs > to) break;
    const a = start + 0.25 * periodMs;
    const b = start + 0.75 * periodMs;
    while (lo < bin.t.length && (bin.t[lo] as number) < a) lo++;
    let ones = 0;
    let n = 0;
    for (let j = lo; j < bin.t.length && (bin.t[j] as number) <= b; j++) {
      ones += bin.v[j] as number;
      n++;
    }
    out.push(n === 0 ? null : ones * 2 > n ? 1 : 0);
  }
  return { symbols: out, firstMs: originMs + k0 * periodMs };
}

interface Candidate {
  readonly startMs: number;
  readonly coded: readonly Bit[];
}

function findCandidates(
  symbols: readonly (Bit | null)[],
  firstMs: number,
  periodMs: number,
  out: Candidate[],
): number {
  let damaged = 0;
  for (const parity of [0, 1]) {
    const bits: (Bit | null)[] = [];
    for (let i = parity; i + 1 < symbols.length; i += 2) {
      bits.push(manchesterPair(symbols[i], symbols[i + 1]));
    }
    for (let i = 0; i + PREAMBLE.length + CODED_BITS <= bits.length; i++) {
      if (!PREAMBLE.every((p, j) => bits[i + j] === p)) continue;
      const coded = bits.slice(i + PREAMBLE.length, i + PREAMBLE.length + CODED_BITS);
      if (coded.some((b) => b === null)) {
        damaged++;
        continue;
      }
      out.push({ startMs: firstMs + (parity + 2 * i) * periodMs, coded: coded as Bit[] });
    }
  }
  return damaged;
}

/** Same frame seen in overlapping windows: keep one, preferring one that decodes. */
function dedupe(c: readonly Candidate[], symbolMs: number): Candidate[] {
  const sorted = [...c].sort((a, b) => a.startMs - b.startMs);
  const out: Candidate[] = [];
  for (const cand of sorted) {
    const last = out[out.length - 1];
    if (last && cand.startMs - last.startMs < SAME_FRAME_SYMBOLS * symbolMs) {
      if (!decodeCoded(last.coded).ok && decodeCoded(cand.coded).ok) out[out.length - 1] = cand;
    } else out.push(cand);
  }
  return out;
}

/** True when `b` starts a whole number of frames (1 or more) after `a`. */
function isRepeatOf(a: number, b: number, frameMs: number): boolean {
  const d = b - a;
  const k = Math.round(d / frameMs);
  return k >= 1 && Math.abs(d - k * frameMs) <= SPACING_TOLERANCE * frameMs;
}

function majority(words: readonly (readonly Bit[])[]): Bit[] {
  const n = words.length;
  return Array.from({ length: CODED_BITS }, (_, i) => {
    const ones = words.reduce((s, w) => s + (w[i] as number), 0);
    return (ones * 2 > n ? 1 : 0) as Bit;
  });
}

/** HL-08: turn the frames that were read into a message or an honest refusal. */
function accept(
  candidates: readonly Candidate[],
  damaged: number,
  profile: Profile,
): HeliographResult {
  const frameMs = frameMsOf(profile);
  const found = dedupe(candidates, profile.symbolMs);
  const decoded = found.map((c) => ({ c, d: decodeCoded(c.coded) }));
  const valid = decoded.flatMap((x) =>
    x.d.ok ? [{ start: x.c.startMs, message: x.d.message, corrected: x.d.correctedWords }] : [],
  );

  // Support for a message: the largest set of valid frames that are all repeats of one another.
  const groups: { message: HeliographMessage; starts: number[]; corrected: number }[] = [];
  for (const v of valid) {
    const g = groups.find(
      (x) =>
        sameMessage(x.message, v.message) &&
        x.starts.every((s) => isRepeatOf(Math.min(s, v.start), Math.max(s, v.start), frameMs)),
    );
    if (g) {
      g.starts.push(v.start);
      g.corrected += v.corrected;
    } else groups.push({ message: v.message, starts: [v.start], corrected: v.corrected });
  }
  const supported = groups.filter((g) => g.starts.length >= 2);
  if (supported.length > 1) {
    return {
      kind: 'repeatRequested',
      reason: 'Two different messages were each seen twice. Ask them to send again.',
    };
  }
  const top = supported[0];
  if (top) {
    return {
      kind: 'message',
      message: top.message,
      repeatsAgreed: top.starts.length,
      voted: false,
      profile: profile.name,
      correctedWords: top.corrected,
    };
  }

  // Rescue: three consecutive repeats, each damaged differently, voted bit by bit.
  for (let i = 0; i + 2 < found.length; i++) {
    const [a, b, c] = [found[i], found[i + 1], found[i + 2]] as [Candidate, Candidate, Candidate];
    if (isRepeatOf(a.startMs, b.startMs, frameMs) && isRepeatOf(b.startMs, c.startMs, frameMs)) {
      const voted = decodeCoded(majority([a.coded, b.coded, c.coded]));
      if (voted.ok) {
        return {
          kind: 'message',
          message: voted.message,
          repeatsAgreed: 3,
          voted: true,
          profile: profile.name,
          correctedWords: voted.correctedWords,
        };
      }
    }
  }

  if (valid.length === 1) {
    return {
      kind: 'repeatRequested',
      reason: 'Only one clear repeat was read. Ask them to repeat so I can confirm it.',
    };
  }
  if (found.length > 0 || damaged > 0) {
    return {
      kind: 'repeatRequested',
      reason: 'A signal was seen but could not be read. Ask them to repeat.',
    };
  }
  return noSignal('No Heliograph frame was found.');
}

/** Median gap between camera readings, in ms. */
function medianIntervalMs(samples: readonly BrightnessSample[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    gaps.push((samples[i] as BrightnessSample).tMs - (samples[i - 1] as BrightnessSample).tMs);
  }
  gaps.sort((x, y) => x - y);
  return gaps[Math.floor(gaps.length / 2)] as number;
}

function decodeProfile(
  samples: readonly BrightnessSample[],
  bin: Binary,
  profile: Profile,
): HeliographResult {
  const { symbolMs } = profile;
  const first = (samples[0] as BrightnessSample).tMs;
  const last = (samples[samples.length - 1] as BrightnessSample).tMs;
  const windowMs = WINDOW_SYMBOLS * symbolMs;
  const stepMs = WINDOW_STEP_SYMBOLS * symbolMs;
  const candidates: Candidate[] = [];
  let damaged = 0;
  const windows = Math.floor((last - first) / stepMs) + 1;
  for (let w = 0; w < windows; w++) {
    const ws = first + w * stepMs;
    const we = Math.min(ws + windowMs, last);
    const timing = estimateTiming(bin.edges, ws, we, symbolMs);
    if (timing !== null) {
      const { symbols, firstMs } = sampleSymbols(bin, timing, ws, we);
      damaged += findCandidates(symbols, firstMs, timing.periodMs, candidates);
    }
    if (ws + windowMs >= last) break;
  }
  return accept(candidates, damaged, profile);
}

/**
 * Read a Heliograph message from a brightness series (HL-07..HL-12).
 *
 * Each profile the camera speed allows is tried (the fast profile only at 40
 * fps or more). A message is returned only when two repeats agree (or three
 * vote) in one profile and no other profile disagrees; otherwise
 * `repeatRequested` or `noSignal`. It never returns a best guess and never throws.
 */
export function decodeBrightness(samples: readonly BrightnessSample[]): HeliographResult {
  try {
    const problem = validate(samples);
    if (problem !== null) return noSignal(problem);
    const bin = binarise(samples);
    if (bin === null) return noSignal('The light does not change enough to read.');

    const interval = medianIntervalMs(samples);
    const results = PROFILE_LIST.filter((p) => interval <= maxFrameIntervalMs(p)).map((p) =>
      decodeProfile(samples, bin, p),
    );
    const messages = results.filter(
      (r): r is Extract<HeliographResult, { kind: 'message' }> => r.kind === 'message',
    );
    const [firstMessage] = messages;
    if (firstMessage) {
      if (messages.every((m) => sameMessage(m.message, firstMessage.message))) return firstMessage;
      return {
        kind: 'repeatRequested',
        reason: 'Two readings of the signal disagree. Ask them to send again.',
      };
    }
    return (
      results.find((r) => r.kind === 'repeatRequested') ??
      results[0] ??
      noSignal('Nothing to read.')
    );
  } catch {
    return noSignal('The recording could not be read.');
  }
}
