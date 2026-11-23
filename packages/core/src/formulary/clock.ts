import { InvalidThermalInputError, temperatureAt } from '../thermal/model.js';
import type { CompartmentState } from '../thermal/types.js';
import { isValidatedEntry } from './admit.js';
import { MINUTES_PER_DAY, REFRIGERATED_MAX_C } from './entry.js';
import type {
  ClockInput,
  ClockProvenance,
  ClockResult,
  TemperatureSample,
  ValidatedEntry,
} from './types.js';

/** FM-09: a series longer than this is refused rather than silently truncated. */
export const MAX_SAMPLES = 100_000;

/** FM-10: shown next to every number. */
export const DISCLAIMER =
  'Derived from the label. Confirm with your pharmacist. Not medical advice.';
/** FM-07 */
export const BEYOND_LABEL_MESSAGE = 'Excursion beyond label: consult your pharmacist.';
/**
 * FM-14: an in-use label may count days since first opening whatever the
 * temperature. This clock counts only time outside the refrigerated range
 * (label-only-medicine rule 3), so it says so rather than imply it is the
 * whole label count. Open question for a pharmacist: see the spec Analysis.
 */
export const IN_USE_CAVEAT =
  'This counts only time outside the fridge. If your label also counts days since you first opened it, that count is separate. Check your label.';
/** FM-12 */
export const FREEZING_LINE =
  'The temperature reached 0 °C or below. Many labels forbid freezing. Check your label.';

const MIN_TEMP_C = -100;
const MAX_TEMP_C = 150;

/**
 * Whole units, written the way the Night Shell writes durations ("3 h 10 m").
 * Rounds down, so a remaining time is never shown longer than it is.
 */
export function formatMinutes(minutes: number): string {
  // Math.max(0, NaN) is NaN, so a non-finite input is handled explicitly.
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  const d = Math.floor(m / MINUTES_PER_DAY);
  const h = Math.floor((m % MINUTES_PER_DAY) / 60);
  const mm = m % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${mm} m`;
  return `${mm} m`;
}

function unknown(reason: string, whatWouldResolveIt: string): ClockResult {
  return { kind: 'unknown', reason, whatWouldResolveIt };
}

function provenanceOf(e: ValidatedEntry): ClockProvenance {
  return {
    product: e.product,
    condition: e.condition,
    labelVersion: e.labelVersion,
    approver: e.approver,
    approvedAt: e.approvedAt,
    source: e.source,
    entryNotes: e.notes,
    disclaimer: DISCLAIMER,
  };
}

function validateWindow(input: ClockInput): string | null {
  if (typeof input !== 'object' || input === null) return 'No temperature window was given.';
  const { startMinute, nowMinute, samples } = input;
  if (!Number.isFinite(startMinute) || startMinute < 0) return 'The start time is not valid.';
  if (!Number.isFinite(nowMinute) || nowMinute < startMinute) {
    return 'The current time is not valid or is before the start.';
  }
  if (!Array.isArray(samples) || samples.length === 0) return 'There are no temperature readings.';
  if (samples.length > MAX_SAMPLES) return 'There are too many temperature readings.';
  let prev = Number.NEGATIVE_INFINITY;
  for (const s of samples as readonly TemperatureSample[]) {
    if (typeof s !== 'object' || s === null) return 'A temperature reading is not valid.';
    if (!Number.isFinite(s.minute) || s.minute < 0) return 'A reading time is not valid.';
    if (!Number.isFinite(s.tempC) || s.tempC < MIN_TEMP_C || s.tempC > MAX_TEMP_C) {
      return 'A temperature reading is not valid.';
    }
    if (s.minute <= prev) return 'Reading times must be strictly increasing.';
    prev = s.minute;
  }
  const first = samples[0] as TemperatureSample;
  if (first.minute > startMinute) return 'There is no temperature reading at or before the start.';
  return null;
}

/**
 * The excursion clock (FM-04..FM-10, FM-12).
 *
 * Consumes the label budget (`maxDays`) only while the temperature is above the
 * refrigerated range and at or below the label's `maxTempC`. Above `maxTempC`
 * the clock stops and says so. It never reports remaining time beyond the
 * budget, never says a medicine is fine, and works only for entries that
 * `buildFormulary` admitted (FM-03).
 *
 * Each interval between two readings is judged by its warmer reading, and an
 * excursion beyond the label is dated to the start of the interval that holds
 * it. The last reading is held until `nowMinute`. All of these err toward
 * consuming more.
 */
export function excursionClock(entry: ValidatedEntry, input: ClockInput): ClockResult {
  if (!isValidatedEntry(entry)) {
    return unknown(
      'This entry did not come from the pharmacist-approved table.',
      'Look the medicine up in the approved table.',
    );
  }
  try {
    const problem = validateWindow(input);
    if (problem !== null) {
      return unknown(
        problem,
        'Provide the time the medicine left refrigeration and its temperatures.',
      );
    }
    return compute(entry, input);
  } catch {
    return unknown(
      'The temperature history could not be read.',
      'Provide valid temperature readings.',
    );
  }
}

function compute(entry: ValidatedEntry, input: ClockInput): ClockResult {
  const { startMinute, nowMinute } = input;
  const samples = input.samples;
  const budget = entry.maxDays * MINUTES_PER_DAY;

  let consumed = 0;
  let exhaustedAt: number | null = null;
  let beyondSince: number | null = null;
  let freezing = false;

  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i] as TemperatureSample;
    const next = i + 1 < samples.length ? (samples[i + 1] as TemperatureSample) : null;
    const lo = Math.max(cur.minute, startMinute);
    const hi = Math.min(next ? next.minute : Number.POSITIVE_INFINITY, nowMinute);
    if (!(hi > lo)) continue;

    const a = cur.tempC;
    const b = next ? next.tempC : a;
    if (Math.min(a, b) <= 0) freezing = true;
    if (beyondSince !== null) continue;

    const warm = Math.max(a, b);
    if (warm > entry.maxTempC) {
      beyondSince = lo;
    } else if (warm > REFRIGERATED_MAX_C && exhaustedAt === null) {
      const before = consumed;
      consumed = Math.min(budget, consumed + (hi - lo));
      if (consumed >= budget) exhaustedAt = lo + (budget - before);
    }
  }

  const common = {
    provenance: provenanceOf(entry),
    budgetMinutes: budget,
    consumedMinutes: consumed,
    reachedFreezing: freezing,
  };
  const freezeLine = freezing ? [FREEZING_LINE] : [];
  const inUseLine = entry.condition === 'inUse' ? [IN_USE_CAVEAT] : [];

  if (beyondSince !== null) {
    return {
      ...common,
      kind: 'beyondLabel',
      sinceMinute: beyondSince,
      message: BEYOND_LABEL_MESSAGE,
      lines: [
        `The temperature went above the ${entry.maxTempC} °C the label allows. The clock has stopped.`,
        ...freezeLine,
        ...inUseLine,
      ],
    };
  }
  if (exhaustedAt !== null) {
    return {
      ...common,
      kind: 'exhausted',
      remainingMinutes: 0,
      exhaustedAtMinute: exhaustedAt,
      message: "The label's room-temperature allowance is used up. Consult your pharmacist.",
      lines: [`The allowance was ${formatMinutes(budget)}.`, ...freezeLine, ...inUseLine],
    };
  }
  const remaining = budget - consumed;
  if (consumed > 0) {
    return {
      ...common,
      kind: 'consuming',
      remainingMinutes: remaining,
      message: `Label allowance left: ${formatMinutes(remaining)}.`,
      lines: [
        `Used ${formatMinutes(Math.ceil(consumed))} of ${formatMinutes(budget)} outside the refrigerated range.`,
        ...freezeLine,
        ...inUseLine,
      ],
    };
  }
  return {
    ...common,
    kind: 'noExcursion',
    remainingMinutes: remaining,
    message: 'No excursion: the temperature has stayed in the refrigerated range.',
    lines: [...freezeLine, ...inUseLine],
  };
}

export type SeriesResult =
  | { readonly kind: 'ok'; readonly samples: readonly TemperatureSample[] }
  | { readonly kind: 'invalid'; readonly reason: string };

/**
 * Sample the modelled RC curve at a fixed step, always including `toMinute`
 * (FM-08). The curve is monotone, so judging an interval by its warmer end is
 * exact for the model and a coarser step can only overstate consumption.
 */
export function modelledSeries(
  state: CompartmentState,
  fromMinute: number,
  toMinute: number,
  stepMinutes: number,
): SeriesResult {
  if (!Number.isFinite(fromMinute) || fromMinute < 0) {
    return { kind: 'invalid', reason: 'The start time is not valid.' };
  }
  if (!Number.isFinite(toMinute) || toMinute < fromMinute) {
    return { kind: 'invalid', reason: 'The end time is not valid.' };
  }
  if (!Number.isFinite(stepMinutes) || stepMinutes <= 0) {
    return { kind: 'invalid', reason: 'The step must be a positive number.' };
  }
  const intervals = Math.ceil((toMinute - fromMinute) / stepMinutes);
  if (!Number.isFinite(intervals) || intervals + 1 > MAX_SAMPLES) {
    return { kind: 'invalid', reason: 'The step is too small for this window.' };
  }
  try {
    const samples: TemperatureSample[] = [];
    let last = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < intervals; i++) {
      const minute = fromMinute + i * stepMinutes;
      // Floating-point rounding can put a grid point on or past the end, or make
      // two points equal. Keep the series strictly increasing and inside the window.
      if (!(minute > last) || !(minute < toMinute)) continue;
      samples.push({ minute, tempC: temperatureAt(state, minute) });
      last = minute;
    }
    if (samples.length === 0 || toMinute > last) {
      samples.push({ minute: toMinute, tempC: temperatureAt(state, toMinute) });
    }
    return { kind: 'ok', samples };
  } catch (e) {
    if (e instanceof InvalidThermalInputError) {
      return { kind: 'invalid', reason: 'The appliance model has an invalid value.' };
    }
    throw e;
  }
}
