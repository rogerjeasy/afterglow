import { foodkeeper as fk, type foodkeeper, type formulary, type household } from '@afterglow/core';
import { formatDuration, formatTemp } from '../format';

/**
 * Presentation of core results as plain words. The core decides; this only
 * words it. Every sentence states what is known and what is not (design 14).
 */

export const USDA_SOURCE = 'USDA FSIS outage guidance';
export const USDA_SHORT = 'USDA FSIS';
export const MODEL_SOURCE = 'thermal model';

export interface TileText {
  readonly value: string;
  readonly note: string;
}

/** The one number and line for an appliance tile (HH-05). */
export function applianceTileText(a: household.ApplianceAssessment): TileText {
  const frozen = a.model.kind === 'frozen';
  const h = a.headline;
  switch (h.kind) {
    case 'holds':
      return {
        value: formatDuration(h.minutes),
        note: frozen
          ? 'if the power fails, until it starts to thaw'
          : 'if the power fails, food stays within the USDA limit',
      };
    case 'remaining':
      return {
        value: formatDuration(h.minutes),
        note: frozen ? 'until it starts to thaw' : 'until perishables must go',
      };
    case 'pastWindow':
      return {
        value: `+${formatDuration(h.sinceMinutes)}`,
        note: frozen
          ? 'thawing. Look for ice crystals in each food.'
          : `past the safe window. Discard perishables.${
              a.model.doorMinutes > 0
                ? ` Counted ${formatDuration(a.model.doorMinutes)} of door time, which warms it fast.`
                : ''
            }`,
      };
    case 'staysFrozen':
      return {
        value: 'Frozen',
        note: 'the model expects it to stay frozen at this room temperature',
      };
    case 'unknown':
      return { value: 'Unknown', note: h.reason };
  }
}

/**
 * Source chips for an appliance number: the rule and model version, plus one
 * chip naming any default in use, so a default is never silent (fail-closed 6).
 */
export function applianceSources(a: household.ApplianceAssessment, modelVersion: string): string[] {
  const out = [`${USDA_SHORT} · ${modelVersion}`];
  const defaults: string[] = [];
  if (a.model.appliance.ambientIsDefault) {
    defaults.push(`room ${formatTemp(a.model.appliance.ambientC)}`);
  }
  if (a.model.usedDefaultTau) defaults.push('time constant');
  if (defaults.length > 0) out.push(`defaults: ${defaults.join(', ')}`);
  // FC-07: a measured value is named too, so it is never silent either.
  if (!a.model.usedDefaultTau) out.push('time constant: measured with your thermometer');
  return out;
}

export interface VerdictText {
  readonly label: 'OK' | 'LOOK' | 'DISCARD' | 'UNKNOWN';
  readonly headline: string;
  readonly details: readonly string[];
}

/**
 * The "never taste food to test it" caveat is attached to every verdict by the
 * core (FK-10). The screen shows it once per list, in a notice, instead of on
 * every card; the verdict itself still carries it.
 */
function withoutSensory(notes: readonly string[]): readonly string[] {
  return notes.filter((n) => n !== fk.SENSORY_CAVEAT);
}

export const SENSORY_NOTICE = fk.SENSORY_CAVEAT;

/** Words for a food verdict. "Safe" is never used beyond its source. */
export function verdictText(v: foodkeeper.FoodVerdict, elapsedMinutes: number): VerdictText {
  switch (v.kind) {
    case 'ok': {
      const headline =
        v.windowEndsAtMinute === null
          ? 'No time limit from USDA for this food'
          : `Covered for ${formatDuration(Math.max(0, v.windowEndsAtMinute - elapsedMinutes))} more`;
      return { label: 'OK', headline, details: withoutSensory(v.notes) };
    }
    case 'lookRequired':
      return { label: 'LOOK', headline: v.question, details: withoutSensory(v.notes) };
    case 'discard':
      return { label: 'DISCARD', headline: v.reason, details: v.notes };
    case 'unknown':
      return { label: 'UNKNOWN', headline: v.reason, details: [v.whatWouldResolveIt] };
  }
}

/** Words for hours of safety (HH-06). */
export function hoursOfSafetyText(h: household.HoursOfSafety): {
  value: string;
  note: string;
  sources: string[];
} {
  switch (h.kind) {
    case 'unknown':
      return { value: 'Unknown', note: h.reason, sources: [] };
    case 'notReached':
      return {
        value: 'Not reached',
        note: `${h.reason} (threshold ${formatTemp(h.thresholdC)})`,
        sources: ['building model'],
      };
    case 'band': {
      const range =
        h.latestMinutes === null
          ? `${formatDuration(h.earliestMinutes)} or more`
          : `${formatDuration(h.earliestMinutes)} to ${formatDuration(h.latestMinutes)}`;
      return {
        value: formatDuration(h.midMinutes),
        note: `likely ${range} until ${formatTemp(h.thresholdC)}${
          h.isDefaultBand ? '. Wide band: your building type is not set.' : ''
        }`,
        sources: [h.modelVersion, ...(h.isDefaultBand ? ['default band'] : [])],
      };
    }
  }
}

// ---------------------------------------------------------------- medicines
export const LABEL_SOURCE = 'pharmacist-approved label table';

export type MedicineLabel =
  | 'NOT IN TABLE'
  | 'NO CLOCK YET'
  | 'IN FRIDGE RANGE'
  | 'CLOCK RUNNING'
  | 'ALLOWANCE USED UP'
  | 'BEYOND LABEL'
  | 'UNKNOWN';

export interface MedicineText {
  readonly label: MedicineLabel;
  readonly headline: string;
  readonly details: readonly string[];
  /** 0 is calm; higher needs more attention. Used to pick the worst one for the Hearth. */
  readonly severity: number;
  /** Present only when a validated entry stands behind the words. */
  readonly provenance: formulary.ClockProvenance | null;
}

/** The label provenance that every medicine number must show (label-only-medicine rule 6). */
export function provenanceChips(p: formulary.ClockProvenance): string[] {
  return [
    LABEL_SOURCE,
    `label ${p.labelVersion}`,
    `approved by ${p.approver}, ${p.approvedAt.slice(0, 10)}`,
  ];
}

function entryProvenance(entry: formulary.ValidatedEntry): formulary.ClockProvenance {
  return {
    product: entry.product,
    condition: entry.condition,
    labelVersion: entry.labelVersion,
    approver: entry.approver,
    approvedAt: entry.approvedAt,
    source: entry.source,
    entryNotes: entry.notes,
    disclaimer: DISCLAIMER_TEXT,
  };
}
// Kept in step with the core's wording by a test.
export const DISCLAIMER_TEXT =
  'Derived from the label. Confirm with your pharmacist. Not medical advice.';

/**
 * Words for a medicine assessment. The core decided; this only words it. It
 * never says "safe", and it never shows a number the core did not produce.
 */
export function medicineText(a: household.MedicineAssessment): MedicineText {
  switch (a.kind) {
    case 'notInTable':
      return {
        label: 'NOT IN TABLE',
        headline: 'No clock. I will not estimate how long this medicine lasts.',
        details: [
          'Storage limits come only from the pharmacist-approved label table, and this product is not in it. Ask your pharmacist.',
          'Photographing a label for review is not available in this build yet.',
        ],
        severity: 3,
        provenance: null,
      };
    case 'noOutage':
      return {
        label: 'NO CLOCK YET',
        headline: 'The power is on. The clock starts if it fails.',
        details: [
          `${a.medicine.product} is in the ${a.applianceName.toLowerCase()}.`,
          'Label limits are shown below so you can read them before you need them.',
        ],
        severity: 0,
        provenance: entryProvenance(a.entry),
      };
    case 'clock': {
      const c = a.clock;
      if (c.kind === 'unknown') {
        return {
          label: 'UNKNOWN',
          headline: c.reason,
          details: [c.whatWouldResolveIt],
          severity: 3,
          provenance: entryProvenance(a.entry),
        };
      }
      const label: MedicineLabel =
        c.kind === 'noExcursion'
          ? 'IN FRIDGE RANGE'
          : c.kind === 'consuming'
            ? 'CLOCK RUNNING'
            : c.kind === 'exhausted'
              ? 'ALLOWANCE USED UP'
              : 'BEYOND LABEL';
      const severity =
        c.kind === 'noExcursion' ? 0 : c.kind === 'consuming' ? 1 : c.kind === 'exhausted' ? 3 : 4;
      return {
        label,
        headline: c.message,
        details: c.lines,
        severity,
        provenance: c.provenance,
      };
    }
  }
}

/** The worst assessment, for the one line on the Hearth. Ties keep the first. */
export function worstMedicine(
  list: readonly household.MedicineAssessment[],
): { readonly assessment: household.MedicineAssessment; readonly text: MedicineText } | null {
  let best: { assessment: household.MedicineAssessment; text: MedicineText } | null = null;
  for (const assessment of list) {
    const text = medicineText(assessment);
    if (best === null || text.severity > best.text.severity) best = { assessment, text };
  }
  return best;
}
