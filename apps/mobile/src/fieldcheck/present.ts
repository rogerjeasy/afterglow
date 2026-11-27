import { fieldcheck, thermal } from '@afterglow/core';
import { formatDuration, formatTemp } from '../format';
import type { ColdRun, FieldRun, HomeRun, SeanceRun, TimedReading } from './store';

/**
 * Field checks in numbers and words (spec `field-checks`, FC-09). Every number here
 * comes from the core (`fieldcheck`, `thermal`); this file only arranges and says it.
 */

const MIN = 60_000;

export const toMinutes = (startedAtMs: number, rs: readonly TimedReading[]): fieldcheck.Reading[] =>
  rs.map((r) => ({ minute: (r.atMs - startedAtMs) / MIN, c: r.c }));

/** Everything a chart needs: a likely curve, an optional band, the readings and a line. */
export interface ChartData {
  readonly spanMinutes: number;
  readonly likely: readonly { readonly t: number; readonly c: number }[];
  readonly band: readonly { readonly t: number; readonly lo: number; readonly hi: number }[] | null;
  readonly readings: readonly fieldcheck.Reading[];
  readonly lineC: number;
  readonly lineLabel: string;
  readonly ambientC: number;
  readonly ambientLabel: string;
}

const STEPS = 48;

function spanFor(
  readings: readonly fieldcheck.Reading[],
  crossing: number | null,
  floor: number,
): number {
  const last = readings.reduce((m, r) => Math.max(m, r.minute), 0);
  const want = Math.max(floor, last * 1.15, crossing !== null ? crossing * 1.1 : 0);
  // Never draw more than three days: a model that takes longer says so in words.
  return Math.min(want, 72 * 60);
}

function curve(state: thermal.CompartmentState, span: number) {
  return Array.from({ length: STEPS + 1 }, (_, i) => {
    const t = (span * i) / STEPS;
    return { t, c: thermal.temperatureAt(state, t) };
  });
}

export const isFridgeLike = (cls: thermal.ApplianceClass): boolean =>
  cls !== 'freezer' && cls !== 'chestFreezer';

// ---------------------------------------------------------------- cold

export interface ColdReport {
  readonly chart: ChartData;
  readonly comparison: fieldcheck.Comparison;
  readonly fit: fieldcheck.TauFit;
  readonly defaultTauMinutes: number;
  readonly dangerC: number;
  readonly seenCrossing: number | null;
  readonly modelCrossing: number | null;
  readonly safe: { readonly tauMinutes: number; readonly source: fieldcheck.TauSource };
  readonly lines: readonly string[];
}

export function coldReport(run: ColdRun): ColdReport {
  const d = thermal.compartmentFor(run.applianceClass, run.fullness, run.ambientC);
  const state: thermal.CompartmentState = {
    startC: run.startC,
    ambientC: run.ambientC,
    tauMinutes: d.state.tauMinutes,
  };
  const readings = toMinutes(run.startedAtMs, run.readings);
  const comparison = fieldcheck.compareReadings(state, readings);
  const fit = fieldcheck.fitTau(run.startC, run.ambientC, readings);
  const seenCrossing = fieldcheck.measuredCrossing(run.startC, run.ambientC, d.dangerC, readings);
  const modelCrossing = fieldcheck.modelledCrossing(state, d.dangerC);
  const safe = fieldcheck.safeTau(state, d.dangerC, readings);
  const span = spanFor(
    readings,
    modelCrossing,
    isFridgeLike(run.applianceClass) ? 6 * 60 : 24 * 60,
  );

  const dangerLabel = isFridgeLike(run.applianceClass)
    ? `${formatTemp(d.dangerC)} (40 °F), the USDA line`
    : `${formatTemp(d.dangerC)}, where ice melts`;
  const lines: string[] = [];
  if (comparison.kind === 'compared') {
    lines.push(
      `${comparison.n} reading${comparison.n === 1 ? '' : 's'}. The model was off by ${formatTemp(
        comparison.meanAbsErrorC,
      )} on average, at most ${formatTemp(comparison.maxAbsErrorC)}.`,
    );
    if (Math.abs(comparison.biasC) >= 0.1) {
      lines.push(
        `Inside, it was ${formatTemp(Math.abs(comparison.biasC))} ${
          comparison.biasC > 0 ? 'warmer' : 'colder'
        } than the model said, on average.`,
      );
    }
  } else {
    lines.push(comparison.reason);
  }
  lines.push(
    seenCrossing !== null
      ? `The thermometer reached ${dangerLabel} after ${formatDuration(seenCrossing)}. ${
          modelCrossing !== null
            ? `The model said ${formatDuration(modelCrossing)}.`
            : 'The model said it never would.'
        }`
      : modelCrossing !== null
        ? `Not at ${dangerLabel} yet. The model says it gets there after ${formatDuration(modelCrossing)}.`
        : `Not at ${dangerLabel}, and the model says it will not get there in this room.`,
  );
  if (fit.kind === 'fitted') {
    const ratio = fit.tauMinutes / d.state.tauMinutes;
    lines.push(
      `Measured time constant: ${formatDuration(fit.tauMinutes)}, from ${fit.used} readings over ${formatDuration(
        fit.spanMinutes,
      )}. The default for this ${run.fullness === 'full' ? 'full' : 'half-full'} appliance is ${formatDuration(
        d.state.tauMinutes,
      )}, so yours ${
        ratio < 0.95
          ? `warms about ${Math.round((1 / ratio - 1) * 100)}% faster`
          : ratio > 1.05
            ? `holds the cold about ${Math.round((ratio - 1) * 100)}% longer`
            : 'matches it'
      }.`,
    );
  } else {
    lines.push(`No time constant yet: ${fit.reason}`);
  }
  return {
    chart: {
      spanMinutes: span,
      likely: curve(state, span),
      band: null,
      readings,
      lineC: d.dangerC,
      lineLabel: dangerLabel,
      ambientC: run.ambientC,
      ambientLabel: `room, ${formatTemp(run.ambientC)}`,
    },
    comparison,
    fit,
    defaultTauMinutes: d.state.tauMinutes,
    dangerC: d.dangerC,
    seenCrossing,
    modelCrossing,
    safe,
    lines,
  };
}

// ---------------------------------------------------------------- home

export interface HomeReport {
  readonly chart: ChartData;
  readonly comparison: fieldcheck.Comparison;
  readonly inside: { readonly inside: number; readonly n: number };
  readonly band: thermal.BuildingBand;
  readonly seenCrossing: number | null;
  readonly modelCrossing: number | null;
  readonly lines: readonly string[];
}

export function homeReport(run: HomeRun): HomeReport {
  const band = thermal.buildingBand(run.archetype);
  const at = (hours: number): thermal.CompartmentState => ({
    startC: run.startC,
    ambientC: run.outdoorC,
    tauMinutes: hours * 60,
  });
  const readings = toMinutes(run.startedAtMs, run.readings);
  const comparison = fieldcheck.compareReadings(at(band.midHours), readings);
  const inside = fieldcheck.insideBand(
    run.startC,
    run.outdoorC,
    band.minHours * 60,
    band.maxHours * 60,
    readings,
  );
  const seenCrossing = fieldcheck.measuredCrossing(
    run.startC,
    run.outdoorC,
    run.thresholdC,
    readings,
  );
  const modelCrossing = fieldcheck.modelledCrossing(at(band.midHours), run.thresholdC);
  const span = spanFor(readings, modelCrossing, 10 * 60);
  const likely = curve(at(band.midHours), span);
  const fast = curve(at(band.minHours), span);
  const slow = curve(at(band.maxHours), span);

  const lines: string[] = [];
  if (comparison.kind === 'compared') {
    lines.push(
      `${inside.inside} of ${inside.n} reading${inside.n === 1 ? '' : 's'} fell inside the range the Graveyard Shift draws${
        band.isDefault ? ' (the wide range for a building I know nothing about)' : ''
      }.`,
      `Against the likely curve the model was off by ${formatTemp(
        comparison.meanAbsErrorC,
      )} on average, at most ${formatTemp(comparison.maxAbsErrorC)}${
        Math.abs(comparison.biasC) >= 0.1
          ? `; your home ran ${formatTemp(Math.abs(comparison.biasC))} ${
              comparison.biasC > 0 ? 'warmer' : 'colder'
            } on average`
          : ''
      }.`,
    );
  } else {
    lines.push(comparison.reason);
  }
  const lineName = `${run.mode === 'cold' ? 'below' : 'above'} ${formatTemp(run.thresholdC)}`;
  lines.push(
    seenCrossing !== null
      ? `The thermometer went ${lineName} after ${formatDuration(seenCrossing)}. ${
          modelCrossing !== null
            ? `The headstone was at ${formatDuration(modelCrossing)}.`
            : 'The model said it never would.'
        }`
      : modelCrossing !== null
        ? `Not ${lineName} yet. The headstone is at ${formatDuration(modelCrossing)}.`
        : `Not ${lineName}, and the model says it will not get there tonight.`,
  );
  return {
    chart: {
      spanMinutes: span,
      likely,
      band: likely.map((p, i) => {
        const a = (fast[i] as { c: number }).c;
        const b = (slow[i] as { c: number }).c;
        return { t: p.t, lo: Math.min(a, b), hi: Math.max(a, b) };
      }),
      readings,
      lineC: run.thresholdC,
      lineLabel: `your line, ${formatTemp(run.thresholdC)}`,
      ambientC: run.outdoorC,
      ambientLabel: `outdoors, ${formatTemp(run.outdoorC)}`,
    },
    comparison,
    inside,
    band,
    seenCrossing,
    modelCrossing,
    lines,
  };
}

// ---------------------------------------------------------------- séance

export function seanceLines(run: SeanceRun): readonly string[] {
  const t = fieldcheck.tallyTrials(run.trials);
  if (t.attempts === 0) return ['No attempts yet.'];
  const pct = Math.round((t.successRate ?? 0) * 100);
  const lines = [
    `${t.read} of ${t.attempts} attempts read correctly at ${run.distanceM} m (${pct}%), ${run.setting || 'no setting noted'}, ${run.profile} speed.`,
    `${t.refused} refused (asked for a repeat), ${t.missed} with nothing read.`,
    t.wrong === 0
      ? 'No attempt showed a different message.'
      : `${t.wrong} attempt${t.wrong === 1 ? '' : 's'} showed a different message. That breaks HL-09: record it in docs/kiro/pbt-catches.md.`,
  ];
  if (t.medianSeconds !== null) {
    lines.push(`Typical time from send to read: ${Math.round(t.medianSeconds)} s.`);
  }
  return lines;
}

// ---------------------------------------------------------------- export

const iso = (ms: number): string => new Date(ms).toISOString();

/** FC-10: one CSV of every reading and trial, for a spreadsheet or the repo. */
export function runsCsv(runs: readonly FieldRun[]): string {
  const rows: string[] = ['run_id,kind,started_at,at,minutes,measured_c,predicted_c,detail'];
  for (const run of runs) {
    if (run.kind === 'seance') {
      for (const t of run.trials) {
        rows.push(
          [
            run.id,
            run.kind,
            iso(run.startedAtMs),
            iso(t.atMs),
            ((t.atMs - run.startedAtMs) / MIN).toFixed(1),
            '',
            '',
            `${run.distanceM} m; ${run.profile}; sent ${t.sent}; ${t.outcome}${
              t.seconds !== null ? `; ${t.seconds.toFixed(1)} s` : ''
            }; ${run.setting.replace(/[,\n\r]/g, ' ')}`,
          ].join(','),
        );
      }
      continue;
    }
    const report = run.kind === 'cold' ? coldReport(run) : homeReport(run);
    const predicted = new Map(
      report.comparison.kind === 'compared'
        ? report.comparison.rows.map((r) => [r.minute, r.predictedC] as const)
        : [],
    );
    const detail =
      run.kind === 'cold'
        ? `${run.applianceClass} ${run.fullness}; room ${run.ambientC} C; start ${run.startC} C`
        : `outdoor ${run.outdoorC} C; start ${run.startC} C; line ${run.thresholdC} C`;
    for (const r of run.readings) {
      const minute = (r.atMs - run.startedAtMs) / MIN;
      const p = predicted.get(minute);
      rows.push(
        [
          run.id,
          run.kind,
          iso(run.startedAtMs),
          iso(r.atMs),
          minute.toFixed(1),
          r.c.toFixed(1),
          p === undefined ? '' : p.toFixed(2),
          detail,
        ].join(','),
      );
    }
  }
  return `${rows.join('\n')}\n`;
}
