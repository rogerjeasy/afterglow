import { cells, type restoration } from '@afterglow/core';

/**
 * A virtual neighbourhood (SIM-01..SIM-06). Pure and seeded: the same config
 * always gives the same grid, devices, reports, promise and history.
 *
 * It is a simulation and the UI always says so. The app feeds its reports through
 * the real `cells` and `restoration` core, so the demo exercises the product's
 * actual k-anonymity and estimation.
 */

export interface SimConfig {
  readonly seed: number;
  /** Where the user's cell is. Only its geohash-6 ever leaves this module's output. */
  readonly centre: cells.LatLng;
  readonly cols: number;
  readonly rows: number;
  /** The minute the outage begins, on the same epoch as the app's minutes. */
  readonly outageStartMinute: number;
}

export interface SimCell {
  readonly geohash6: string;
  /** Column and row on the grid; row 0 is the north edge. */
  readonly col: number;
  readonly row: number;
  /** Devices that live in the cell (a simulation detail, not published). */
  readonly devices: number;
  /** The minute the cell's power returns, or null for a cell that never goes dark. */
  readonly restoreAtMinute: number | null;
}

export interface Neighbourhood {
  readonly config: SimConfig;
  readonly cells: readonly SimCell[];
  readonly userCell: string;
  readonly reports: readonly cells.CellReport[];
  readonly provider: {
    readonly areaId: string;
    readonly source: string;
    readonly promisedEndMinute: number;
  };
  readonly history: readonly restoration.PastOutage[];
  /** The last minute the simulation has data for. */
  readonly endMinute: number;
}

/** SIM-03: a device repeats its verdict this often while it holds. */
export const RECONFIRM_MINUTES = 20;
/** How long after the outage starts the simulation runs. */
export const HORIZON_MINUTES = 360;

export const DEFAULT_CONFIG: Omit<SimConfig, 'outageStartMinute'> = {
  seed: 20_261_031,
  // Soweto, Johannesburg. Only the cell containing this point is ever used.
  centre: { lat: -26.2485, lng: 27.854 },
  cols: 5,
  rows: 6,
};

const SENSES = ['ce', 'hum', 'fl', 'mag', 'tel'] as const;

/** mulberry32: a small, well-behaved seeded generator. */
function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One draw of how late a utility runs, in minutes: usually a little, sometimes a lot. */
function drawOverrun(next: () => number, int: (lo: number, hi: number) => number): number {
  const p = next();
  if (p < 0.7) return int(5, 45);
  if (p < 0.9) return int(45, 110);
  return int(-12, 4);
}

export function buildNeighbourhood(config: SimConfig): Neighbourhood {
  const next = makeRandom(config.seed);
  const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
  const start = config.outageStartMinute;
  const end = start + HORIZON_MINUTES;

  // The grid. A geohash-6 cell is about 1.2 km wide and 0.6 km tall.
  const home = cells.decodeBounds(cells.encodeGeohash(config.centre));
  const w = home.lngMax - home.lngMin;
  const h = home.latMax - home.latMin;
  const centreCol = Math.floor(config.cols / 2);
  const centreRow = Math.floor(config.rows / 2);
  const homeCentre = cells.decodeCenter(cells.encodeGeohash(config.centre));

  interface Draft {
    geohash6: string;
    col: number;
    row: number;
    distanceKm: number;
  }
  const drafts: Draft[] = [];
  for (let row = 0; row < config.rows; row++) {
    for (let col = 0; col < config.cols; col++) {
      const lat = homeCentre.lat - (row - centreRow) * h;
      const lng = homeCentre.lng + (col - centreCol) * w;
      drafts.push({
        geohash6: cells.encodeGeohash({ lat, lng }),
        col,
        row,
        distanceKm: Math.hypot((col - centreCol) * 1.2, (row - centreRow) * 0.6),
      });
    }
  }
  const userCell = (drafts.find((d) => d.col === centreCol && d.row === centreRow) as Draft)
    .geohash6;

  // The dark zone: a blob around a point near the user's cell.
  const blobCol = centreCol + int(-1, 1);
  const blobRow = centreRow + int(-1, 1);
  const radiusKm = 2.1 + next() * 0.8;
  const inBlob = (d: Draft): boolean =>
    Math.hypot((d.col - blobCol) * 1.2, (d.row - blobRow) * 0.6) <= radiusKm;
  const byFarthest = [...drafts].sort(
    (a, b) => b.distanceKm - a.distanceKm || a.geohash6.localeCompare(b.geohash6),
  );
  // One cell is guaranteed to stay lit, so every run shows a lit cell beside the dark ones.
  const anchorLit = (byFarthest[0] as Draft).geohash6;
  const dark = new Set(
    drafts
      .filter((d) => d.geohash6 === userCell || (inBlob(d) && d.geohash6 !== anchorLit))
      .map((d) => d.geohash6),
  );

  // Two sparse cells: fewer than k devices, so they can only ever be unknown.
  const sparseCandidates = byFarthest.filter(
    (d) => d.geohash6 !== anchorLit && d.geohash6 !== userCell,
  );
  const sparse = new Set<string>();
  while (sparse.size < Math.min(2, sparseCandidates.length)) {
    sparse.add((sparseCandidates[int(0, sparseCandidates.length - 1)] as Draft).geohash6);
  }

  // The provider's promise, and the utility's history of running late.
  const promisedEndMinute = start + 143 + int(-15, 15);
  const history: restoration.PastOutage[] = [];
  for (let i = 0; i < 12; i++) {
    const promised = start - (i + 1) * 1440 + int(0, 300);
    history.push({
      promisedEndMinute: promised,
      actualEndMinute: promised + drawOverrun(next, int),
    });
  }
  // The truth is one more draw from the same distribution: never chosen to flatter the estimate.
  const feederRestore = Math.min(promisedEndMinute + drawOverrun(next, int), end - 40);

  // The cells, and when each one comes back.
  const stragglerKey = byFarthest.find(
    (d) => dark.has(d.geohash6) && d.geohash6 !== userCell,
  )?.geohash6;
  const simCells: SimCell[] = drafts.map((d) => {
    const devices = d.geohash6 === userCell ? 41 : sparse.has(d.geohash6) ? int(1, 4) : int(14, 46);
    const restoreAtMinute = dark.has(d.geohash6)
      ? Math.min(
          feederRestore +
            Math.round(d.distanceKm * 4) +
            int(0, 6) +
            (d.geohash6 === stragglerKey ? 35 : 0),
          end - 15,
        )
      : null;
    return { geohash6: d.geohash6, col: d.col, row: d.row, devices, restoreAtMinute };
  });

  // The reports. A device says "present" once before the outage, "absent" when its
  // power goes, repeats every RECONFIRM_MINUTES (SIM-03), and on restoration sends a
  // restore edge. Lit cells just repeat "present".
  const reports: cells.CellReport[] = [];
  const emit = (
    cell: SimCell,
    device: number,
    minute: number,
    verdict: cells.CellReport['verdict'],
    restoreEdge: boolean,
  ): void => {
    if (minute > end) return;
    const senses =
      restoreEdge || verdict === 'absent'
        ? ['ce', ...(next() < 0.6 ? ['hum'] : [])]
        : [SENSES[int(0, SENSES.length - 1)] as string];
    reports.push({
      deviceEpoch: `sim-${cell.geohash6}-${device}`,
      geohash6: cell.geohash6,
      minute,
      verdict,
      confidence: Math.round((0.7 + next() * 0.3) * 100) / 100,
      senses: [...new Set(senses)].sort(),
      restoreEdge,
    });
  };

  for (const cell of simCells) {
    for (let device = 0; device < cell.devices; device++) {
      const phase = int(0, RECONFIRM_MINUTES - 1);
      if (cell.restoreAtMinute === null) {
        for (let t = start - RECONFIRM_MINUTES + phase; t <= end; t += RECONFIRM_MINUTES) {
          emit(cell, device, t, 'present', false);
        }
        continue;
      }
      const lostAt = start + int(0, 2);
      const backAt = cell.restoreAtMinute + int(0, 4);
      emit(cell, device, start - RECONFIRM_MINUTES + phase, 'present', false);
      let t = lostAt;
      for (; t < backAt; t += RECONFIRM_MINUTES) emit(cell, device, t, 'absent', false);
      emit(cell, device, backAt, 'present', true);
      for (t = backAt + RECONFIRM_MINUTES; t <= end; t += RECONFIRM_MINUTES) {
        emit(cell, device, t, 'present', false);
      }
    }
  }

  return {
    config,
    cells: simCells,
    userCell,
    reports,
    provider: {
      areaId: 'soweto-sim',
      source: 'provider (simulated)',
      promisedEndMinute,
    },
    history,
    endMinute: end,
  };
}
