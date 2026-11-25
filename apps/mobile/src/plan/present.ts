import type { coguard, energy } from '@afterglow/core';
import { formatClockTime } from '../format';

/**
 * Words for the Plan screen. The core decided; this only words it. Numbers keep
 * their units, hours are written "6.5 h", and nothing here says "safe".
 */
export const PLAN_SOURCE = 'Afterglow energy planner';

/** "6.5 h", "0.3 h". Rounds to one place and never shows more than the model has. */
export function hoursText(h: number): string {
  if (!Number.isFinite(h) || h < 0) return '0 h';
  return `${Math.round(h * 10) / 10} h`;
}

export function whText(wh: number): string {
  if (!Number.isFinite(wh) || wh < 0) return '0 Wh';
  return wh >= 1000 ? `${Math.round(wh / 10) / 100} kWh` : `${Math.round(wh)} Wh`;
}

export const STATUS_LABEL: Record<energy.LoadStatus, string> = {
  covered: 'COVERED',
  partial: 'PARTLY',
  unsupplied: 'NOT COVERED',
};

export const KIND_LABEL: Record<energy.StoreKind, string> = {
  phone: 'Phone',
  powerBank: 'Power bank',
  laptop: 'Laptop',
  car: 'Car battery',
  homeBattery: 'Home battery or inverter',
  ups: 'UPS',
  generator: 'Generator',
};

export const CLASS_LABEL: Record<energy.LoadClass, string> = {
  medical: 'Medical',
  communication: 'Communication',
  light: 'Light',
  food: 'Food',
  comfort: 'Comfort',
};

/** Where a load's energy comes from, in order, e.g. "Power bank, then Inverter". */
export function drawText(outcome: energy.LoadOutcome, names: ReadonlyMap<string, string>): string {
  if (outcome.draws.length === 0) return 'No store';
  return outcome.draws.map((d) => names.get(d.storeId) ?? d.storeId).join(', then ');
}

export interface WardLine {
  readonly label: string;
  readonly detail: string;
  readonly loud: boolean;
}

export function checkLine(c: coguard.CheckState): WardLine {
  switch (c.status) {
    case 'met':
      return { label: 'CONFIRMED', detail: 'You said yes.', loud: false };
    case 'refused':
      return { label: 'NOT ALLOWED', detail: c.why, loud: true };
    case 'unmet':
      return { label: 'TO DO', detail: c.why, loud: false };
  }
}

/** When the open ward's oldest answer stops being current, for "until 22:40". */
export function validUntil(
  answers: Readonly<Record<string, { readonly atMs: number }>>,
  maxAgeMs: number,
): string | null {
  const times = Object.values(answers).map((a) => a.atMs);
  if (times.length === 0) return null;
  return formatClockTime(Math.min(...times) + maxAgeMs);
}

/** A number the user typed, or null when it is empty or not a positive finite number. */
export function parsePositive(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}
