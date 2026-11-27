import { crossingTime, temperatureAt } from '../thermal/model.js';
import type { CompartmentState } from '../thermal/types.js';

/**
 * Field checks against a real thermometer (spec `field-checks`, FC-01..FC-05).
 *
 * The thermal model is a lumped RC curve. A person who unplugs a fridge, or turns the
 * heating off for a night, and writes down what a thermometer says can check that curve
 * and teach it their own appliance. These functions compare and fit; they never decide
 * anything on their own, and a fitted value can only make a clock shorter (FC-03).
 * Pure: no I/O, no clock, no randomness.
 */

/** One thermometer reading, in minutes since the test began. */
export interface Reading {
  readonly minute: number;
  readonly c: number;
}

/** Readings outside this range are typing mistakes, not temperatures a kitchen sees. */
export const READING_MIN_C = -60;
export const READING_MAX_C = 80;

/** A fit needs this many readings after the start, spread over at least this long (FC-02). */
export const FIT_MIN_READINGS = 3;
export const FIT_MIN_SPAN_MINUTES = 60;
/** ...and the temperature must have moved at least this far, or there is nothing to fit. */
export const FIT_MIN_CHANGE_C = 0.5;

/** FC-05: a reading is usable when its time and temperature are real numbers in range. */
export function isUsableReading(r: Reading): boolean {
  return (
    Number.isFinite(r.minute) &&
    r.minute >= 0 &&
    Number.isFinite(r.c) &&
    r.c >= READING_MIN_C &&
    r.c <= READING_MAX_C
  );
}

/** Usable readings in time order. Unusable ones are dropped, never trusted or thrown on. */
export function usableReadings(readings: readonly Reading[]): readonly Reading[] {
  return readings.filter(isUsableReading).sort((a, b) => a.minute - b.minute);
}

export interface ComparedReading {
  readonly minute: number;
  readonly measuredC: number;
  readonly predictedC: number;
  /** Measured minus predicted: positive means warmer than the model said. */
  readonly residualC: number;
}

export type Comparison =
  | { readonly kind: 'none'; readonly reason: string }
  | {
      readonly kind: 'compared';
      readonly rows: readonly ComparedReading[];
      readonly n: number;
      readonly meanAbsErrorC: number;
      readonly maxAbsErrorC: number;
      /** Mean of measured minus predicted (FC-01). */
      readonly biasC: number;
    };

/** FC-01: put each reading next to what the model said for that minute. */
export function compareReadings(state: CompartmentState, readings: readonly Reading[]): Comparison {
  const usable = usableReadings(readings);
  if (usable.length === 0) return { kind: 'none', reason: 'No usable readings yet.' };
  const rows = usable.map((r): ComparedReading => {
    const predictedC = temperatureAt(state, r.minute);
    return { minute: r.minute, measuredC: r.c, predictedC, residualC: r.c - predictedC };
  });
  const abs = rows.map((x) => Math.abs(x.residualC));
  return {
    kind: 'compared',
    rows,
    n: rows.length,
    meanAbsErrorC: abs.reduce((s, x) => s + x, 0) / abs.length,
    maxAbsErrorC: Math.max(...abs),
    biasC: rows.reduce((s, x) => s + x.residualC, 0) / rows.length,
  };
}

/** How many readings fall inside the band drawn by the fastest and slowest time constants. */
export function insideBand(
  startC: number,
  ambientC: number,
  tauFastMinutes: number,
  tauSlowMinutes: number,
  readings: readonly Reading[],
): { readonly inside: number; readonly n: number } {
  const usable = usableReadings(readings);
  let inside = 0;
  for (const r of usable) {
    const a = temperatureAt({ startC, ambientC, tauMinutes: tauFastMinutes }, r.minute);
    const b = temperatureAt({ startC, ambientC, tauMinutes: tauSlowMinutes }, r.minute);
    // A thermometer reads to a tenth of a degree; allow that much at the edges.
    if (r.c >= Math.min(a, b) - 0.1 && r.c <= Math.max(a, b) + 0.1) inside += 1;
  }
  return { inside, n: usable.length };
}

export type TauFit =
  | { readonly kind: 'unknown'; readonly reason: string }
  | {
      readonly kind: 'fitted';
      readonly tauMinutes: number;
      /** Readings that went into the fit. */
      readonly used: number;
      readonly spanMinutes: number;
    };

/**
 * FC-02: the time constant that best explains the readings, by least squares on the
 * linearised curve, y = -ln((ambient - T) / (ambient - start)) = t / tau, through the
 * origin. `unknown` when there is too little to go on, said in words.
 */
export function fitTau(startC: number, ambientC: number, readings: readonly Reading[]): TauFit {
  if (!Number.isFinite(startC) || !Number.isFinite(ambientC)) {
    return { kind: 'unknown', reason: 'The starting or surrounding temperature is missing.' };
  }
  if (Math.abs(ambientC - startC) < 1) {
    return {
      kind: 'unknown',
      reason: 'The start and the surroundings are less than 1 °C apart, so nothing can be learned.',
    };
  }
  const usable = usableReadings(readings).filter((r) => r.minute > 0);
  // Only readings strictly on the way from the start to the surroundings carry a time constant.
  const points: { t: number; y: number }[] = [];
  for (const r of usable) {
    const ratio = (ambientC - r.c) / (ambientC - startC);
    if (ratio > 0 && ratio < 1) points.push({ t: r.minute, y: -Math.log(ratio) });
  }
  const moved = usable.some((r) => Math.abs(r.c - startC) >= FIT_MIN_CHANGE_C);
  if (!moved) {
    return {
      kind: 'unknown',
      reason: `The temperature has not moved ${FIT_MIN_CHANGE_C} °C from the start yet.`,
    };
  }
  if (points.length < FIT_MIN_READINGS) {
    return {
      kind: 'unknown',
      reason: `I need at least ${FIT_MIN_READINGS} readings between the start and the room temperature.`,
    };
  }
  const span = (points.at(-1) as { t: number }).t - (points[0] as { t: number }).t;
  if (span < FIT_MIN_SPAN_MINUTES) {
    return {
      kind: 'unknown',
      reason: `The readings need to cover at least ${FIT_MIN_SPAN_MINUTES} minutes.`,
    };
  }
  let tt = 0;
  let ty = 0;
  for (const p of points) {
    tt += p.t * p.t;
    ty += p.t * p.y;
  }
  const tau = tt / ty;
  if (!(tau > 0) || !Number.isFinite(tau)) {
    return { kind: 'unknown', reason: 'The readings do not follow a cooling or warming curve.' };
  }
  return { kind: 'fitted', tauMinutes: tau, used: points.length, spanMinutes: span };
}

/**
 * FC-04: the first minute the readings reach `thresholdC` in the direction of travel,
 * interpolated between the reading before and the reading at or past it (the start
 * counts as a reading at minute 0). Null when no reading has reached it.
 */
export function measuredCrossing(
  startC: number,
  ambientC: number,
  thresholdC: number,
  readings: readonly Reading[],
): number | null {
  if (![startC, ambientC, thresholdC].every(Number.isFinite) || startC === ambientC) return null;
  const warming = ambientC > startC;
  const reached = (c: number): boolean => (warming ? c >= thresholdC : c <= thresholdC);
  if (reached(startC)) return 0;
  let prev: Reading = { minute: 0, c: startC };
  for (const r of usableReadings(readings)) {
    if (reached(r.c)) {
      const dc = r.c - prev.c;
      if (dc === 0 || r.minute === prev.minute) return r.minute;
      const f = (thresholdC - prev.c) / dc;
      return prev.minute + Math.min(1, Math.max(0, f)) * (r.minute - prev.minute);
    }
    prev = r;
  }
  return null;
}

export type TauSource = 'default' | 'fitted' | 'crossing';

/**
 * FC-03: the time constant the clocks may use after a thermometer check. Readings can
 * only make a clock shorter, never longer: the result is the smallest of the default,
 * the fitted value, and the value that puts the modelled crossing exactly where the
 * thermometer saw it. A slower measured appliance still gets the default.
 */
export function safeTau(
  state: CompartmentState,
  thresholdC: number,
  readings: readonly Reading[],
): { readonly tauMinutes: number; readonly source: TauSource } {
  let best: { tauMinutes: number; source: TauSource } = {
    tauMinutes: state.tauMinutes,
    source: 'default',
  };
  const fit = fitTau(state.startC, state.ambientC, readings);
  if (fit.kind === 'fitted' && fit.tauMinutes < best.tauMinutes) {
    best = { tauMinutes: fit.tauMinutes, source: 'fitted' };
  }
  const seen = measuredCrossing(state.startC, state.ambientC, thresholdC, readings);
  if (seen !== null && seen > 0) {
    const ratio = (state.ambientC - thresholdC) / (state.ambientC - state.startC);
    if (ratio > 0 && ratio < 1) {
      const tau = seen / -Math.log(ratio);
      if (tau > 0 && Number.isFinite(tau) && tau < best.tauMinutes) {
        best = { tauMinutes: tau, source: 'crossing' };
      }
    }
  }
  return best;
}

/** The model's crossing of `thresholdC` in minutes, or null when it never gets there. */
export function modelledCrossing(state: CompartmentState, thresholdC: number): number | null {
  const c = crossingTime(state, thresholdC);
  return c.kind === 'at' ? c.minute : null;
}
