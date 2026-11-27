import { isGeohash6 } from './geohash.js';
import {
  type AggregateContext,
  type CellReport,
  type CellState,
  type CellStateValue,
  K_ANONYMITY,
  type Provenance,
  RESTORE_WINDOW_MINUTES,
} from './types.js';

/** Thrown when a report violates the cell contract (CE-02). */
export class InvalidReportError extends Error {
  constructor(reason: string) {
    super(`Invalid report: ${reason}`);
    this.name = 'InvalidReportError';
  }
}

function validateReport(r: CellReport): void {
  if (!isGeohash6(r.geohash6)) {
    throw new InvalidReportError(`geohash6 must be 6 valid base-32 chars, got "${r.geohash6}"`);
  }
  if (typeof r.deviceEpoch !== 'string' || r.deviceEpoch.length === 0) {
    throw new InvalidReportError('deviceEpoch must be a non-empty string');
  }
  if (!Number.isInteger(r.minute)) {
    throw new InvalidReportError('minute must be an integer');
  }
}

/** Dedup identity for a report (CE-03): same device, minute, verdict, restoreEdge. */
function reportKey(r: CellReport): string {
  return `${r.deviceEpoch}\u0000${r.minute}\u0000${r.verdict}\u0000${r.restoreEdge ? 1 : 0}`;
}

function sortProvenance(ps: Iterable<Provenance>): readonly Provenance[] {
  const order: Provenance[] = ['crowd', 'provider', 'satellite', 'telemetry'];
  return [...new Set(ps)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * Aggregate a set of reports for one cell and window into a published CellState.
 *
 * Pure, commutative, and idempotent (CE-03): the result depends only on the SET
 * of distinct reports and the context. Enforces k-anonymity (CE-01): below k
 * distinct devices the state is `unknown`, never a guess. Detects restoration
 * only for a cell that was dark (CE-05).
 *
 * All reports are assumed to belong to the same cell; a report whose geohash
 * differs from the first is rejected (defensive).
 */
export function aggregateCell(
  reports: readonly CellReport[],
  context: AggregateContext,
): CellState {
  const k = context.k ?? K_ANONYMITY;

  // Validate and dedup.
  const seen = new Set<string>();
  const distinctReports: CellReport[] = [];
  let geohash6 = '';
  for (const r of reports) {
    validateReport(r);
    if (geohash6 === '') geohash6 = r.geohash6;
    else if (r.geohash6 !== geohash6) {
      throw new InvalidReportError(`mixed cells in one aggregation: ${geohash6} vs ${r.geohash6}`);
    }
    const key = reportKey(r);
    if (!seen.has(key)) {
      seen.add(key);
      distinctReports.push(r);
    }
  }

  const base = (state: CellStateValue, deviceCount: number): CellState => ({
    geohash6,
    windowStart: context.windowStart,
    state,
    deviceCount,
    provenance: sortProvenance([
      ...(deviceCount > 0 ? (['crowd'] as Provenance[]) : []),
      ...(context.extraProvenance ?? []),
    ]),
  });

  if (geohash6 === '') {
    // No reports: unknown, zero devices, only extra provenance if any.
    return {
      geohash6: '',
      windowStart: context.windowStart,
      state: 'unknown',
      deviceCount: 0,
      provenance: sortProvenance(context.extraProvenance ?? []),
    };
  }

  // Distinct devices that cast a DEFINITE verdict (present/absent) count toward k (CE-04).
  const definiteDevices = new Set<string>();
  const presentDevices = new Set<string>();
  const absentDevices = new Set<string>();
  const restoreDevices = new Set<string>();

  for (const r of distinctReports) {
    if (r.verdict === 'present') {
      definiteDevices.add(r.deviceEpoch);
      presentDevices.add(r.deviceEpoch);
    } else if (r.verdict === 'absent') {
      definiteDevices.add(r.deviceEpoch);
      absentDevices.add(r.deviceEpoch);
    }
    if (r.restoreEdge) {
      restoreDevices.add(r.deviceEpoch);
    }
  }

  const deviceCount = definiteDevices.size;

  // k-anonymity gate (CE-01): below k, publish unknown with the true count.
  if (deviceCount < k) {
    return base('unknown', deviceCount);
  }

  // Restoration (CE-05): only if the cell was dark, or partly dark (mixed), and >= k
  // distinct restore edges occurred within the restore window. Restores trickle in, so a
  // dark cell is often `mixed` for a minute before k edges arrive; gating on `dark` alone
  // skipped `comingBack` whenever that happened (pbt-catches 2026-11-27, SIM-04). A lit
  // cell still never comes back.
  if (context.priorState === 'dark' || context.priorState === 'mixed') {
    const restoreInWindow = countRestoreInWindow(distinctReports);
    if (restoreInWindow >= k) {
      return base('comingBack', deviceCount);
    }
  }

  // Dark / lit / mixed (CE-04).
  const anyPresent = presentDevices.size > 0;
  const anyAbsent = absentDevices.size > 0;
  if (anyPresent && anyAbsent) return base('mixed', deviceCount);
  if (anyAbsent) return base('dark', deviceCount);
  return base('lit', deviceCount);
}

/**
 * Count distinct devices whose restore edges fall within any RESTORE_WINDOW
 * span (CE-05). A device is counted once if it has a restore edge inside a
 * window that contains >= k such devices; we take the simple, order-independent
 * approach of counting distinct restore-edge devices whose minutes lie within
 * RESTORE_WINDOW_MINUTES of the latest restore edge.
 */
function countRestoreInWindow(reports: readonly CellReport[]): number {
  const restores = reports.filter((r) => r.restoreEdge);
  if (restores.length === 0) return 0;
  const latest = Math.max(...restores.map((r) => r.minute));
  const windowStart = latest - RESTORE_WINDOW_MINUTES;
  const devices = new Set<string>();
  for (const r of restores) {
    if (r.minute >= windowStart && r.minute <= latest) {
      devices.add(r.deviceEpoch);
    }
  }
  return devices.size;
}
