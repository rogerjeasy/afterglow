/** The stated voltage of a lithium cell, used to turn a mAh label into watt-hours. A default, labelled. */
export const DEFAULT_CELL_VOLTS = 3.7;
/** A generator's fuel use per kilowatt-hour has no safe default; the caller must supply it. */

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Watt-hours from a milliamp-hour label at a stated voltage, or null for nonsense (EN-09). */
export function whFromMah(mAh: number, volts: number = DEFAULT_CELL_VOLTS): number | null {
  if (!positive(mAh) || !positive(volts)) return null;
  return (mAh * volts) / 1000;
}

/** Watt-hours from fuel at a stated litres-per-kWh, or null for nonsense (EN-09). */
export function whFromFuel(fuelLitres: number, litresPerKwh: number): number | null {
  if (!positive(fuelLitres) || !positive(litresPerKwh)) return null;
  return (fuelLitres / litresPerKwh) * 1000;
}
