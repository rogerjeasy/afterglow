import { decodeBounds, decodeCenter, encodeGeohash, isGeohash6 } from '../cells/geohash.js';
import type { CellReport } from '../cells/types.js';

/**
 * The crowd report as it crosses the network (product description 7.3,
 * privacy-aggregation.md rule 4): a geohash-6 cell, a minute, a verdict, the senses
 * that voted and a restore flag. Nothing else is accepted: no coordinates, no
 * raw media, no account. Shared by the app (to build it) and the server (to check it).
 */

export interface CrowdReportInput {
  readonly geohash6: unknown;
  readonly minute: unknown;
  readonly verdict: unknown;
  readonly confidence: unknown;
  readonly senses: unknown;
  readonly restoreEdge: unknown;
}

const SENSES = new Set(['chargingEdge', 'hum', 'flicker', 'magnetometer', 'telemetry', 'reported']);
/** How far a report's minute may be from the server's clock (clock skew plus the 0-120 s jitter). */
const MAX_SKEW_MINUTES = 10;

/** A report checked field by field, with this device's epoch attached by the caller. */
export function validateCrowdReport(
  x: unknown,
  deviceEpoch: string,
  nowMinute: number,
): CellReport | string {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return 'not an object';
  const o = x as Record<string, unknown>;
  const allowed = ['geohash6', 'minute', 'verdict', 'confidence', 'senses', 'restoreEdge'];
  if (Object.keys(o).some((k) => !allowed.includes(k))) return 'unexpected field';
  if (typeof o.geohash6 !== 'string' || !isGeohash6(o.geohash6)) return 'bad cell';
  const m = o.minute;
  if (typeof m !== 'number' || !Number.isInteger(m)) return 'bad minute';
  if (Math.abs(m - nowMinute) > MAX_SKEW_MINUTES) return 'minute out of range';
  if (o.verdict !== 'present' && o.verdict !== 'absent' && o.verdict !== 'unknown')
    return 'bad verdict';
  const c = o.confidence;
  if (typeof c !== 'number' || !(c >= 0 && c <= 1)) return 'bad confidence';
  const s = o.senses;
  if (!Array.isArray(s) || s.length > 6 || s.some((v) => typeof v !== 'string' || !SENSES.has(v))) {
    return 'bad senses';
  }
  if (typeof o.restoreEdge !== 'boolean') return 'bad restore flag';
  return {
    deviceEpoch,
    geohash6: o.geohash6,
    minute: m,
    verdict: o.verdict,
    confidence: c,
    senses: [...new Set(s as string[])].sort(),
    restoreEdge: o.restoreEdge,
  };
}

/**
 * The geohash-6 cells in a grid around one cell, row by row from the north-west, the
 * centre cell included. Built by stepping the centre point by one cell size, so it
 * works across geohash boundaries.
 */
export function cellsAround(center: string, cols: number, rows: number): string[][] {
  if (!isGeohash6(center)) return [];
  const b = decodeBounds(center);
  const c = decodeCenter(center);
  const dLat = b.latMax - b.latMin;
  const dLng = b.lngMax - b.lngMin;
  const out: string[][] = [];
  const top = Math.floor(rows / 2);
  const left = Math.floor(cols / 2);
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let k = 0; k < cols; k++) {
      // Clamp to the centres of the polar rows, never inside them: a fixed limit such as
      // 89.9 lies inside the last row and would move a polar cell off itself.
      const edge = 90 - dLat / 2;
      const lat = Math.max(-edge, Math.min(edge, c.lat + (top - r) * dLat));
      let lng = c.lng + (k - left) * dLng;
      if (lng > 180) lng -= 360;
      if (lng < -180) lng += 360;
      row.push(encodeGeohash({ lat, lng }));
    }
    out.push(row);
  }
  return out;
}
