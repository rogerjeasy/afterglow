import { cells, restoration } from '@afterglow/core';
import {
  DEFAULT_CONFIG,
  type Neighbourhood,
  type SimCell,
  buildNeighbourhood,
} from '@afterglow/simulator';

/**
 * The Lantern's data, from the real core.
 *
 * The simulator supplies a neighbourhood of devices and the reports they would
 * send. Everything the screen shows is then computed here by `cellTimeline`
 * (windowing, k-anonymity, restoration) and `estimateRestoration`: nothing is
 * painted by hand. Only the demo space has a neighbourhood; outside it there is
 * no crowd, and the screen says so.
 */

const STEP = 5;
const MS_PER_MINUTE = 60_000;

export interface LanternCell {
  readonly sim: SimCell;
  /**
   * One published state per step, from `fromMinute` on, computed as far as the view
   * has needed so far (see `ensureThrough`). Treat it as read-only outside this module.
   */
  line: readonly cells.CellState[];
  /** The last minute `line` covers. */
  through: number;
}

export interface LanternModel {
  readonly nbh: Neighbourhood;
  readonly fromMinute: number;
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly LanternCell[];
  readonly userCell: string;
}

export interface LanternView {
  readonly minute: number;
  readonly cells: readonly { readonly sim: SimCell; readonly state: cells.CellState }[];
  readonly user: cells.CellState;
}

const cache = new Map<number, LanternModel>();

/** The minute (since the epoch) a millisecond timestamp falls in. */
export function toMinute(ms: number): number {
  return Math.floor(ms / MS_PER_MINUTE);
}

export function toMs(minute: number): number {
  return minute * MS_PER_MINUTE;
}

/** A cell's timeline is extended in chunks this long, so scrubbing recomputes rarely. */
const CHUNK_MINUTES = 60;

/**
 * Build the night. The user's cell is computed in full, because the screen needs its
 * whole story (when it goes dark, when it comes back). Every other cell is computed
 * lazily, only as far as the view has reached: a phone showing "now" never pays for
 * the hours that have not happened yet.
 */
export function buildLanternModel(outageStartMinute: number): LanternModel {
  const hit = cache.get(outageStartMinute);
  if (hit) return hit;
  const nbh = buildNeighbourhood({ ...DEFAULT_CONFIG, outageStartMinute });
  const fromMinute = Math.floor((outageStartMinute - 15) / STEP) * STEP;
  const lanternCells: LanternCell[] = nbh.cells.map((sim) => ({ sim, line: [], through: -1 }));
  const model: LanternModel = {
    nbh,
    fromMinute,
    cols: Math.max(...nbh.cells.map((c) => c.col)) + 1,
    rows: Math.max(...nbh.cells.map((c) => c.row)) + 1,
    cells: lanternCells,
    userCell: nbh.userCell,
  };
  const user = lanternCells.find((c) => c.sim.geohash6 === nbh.userCell) as LanternCell;
  ensureThrough(model, user, nbh.endMinute);
  // The demo makes one night at a time; keep only the latest.
  cache.clear();
  cache.set(outageStartMinute, model);
  return model;
}

/** Make sure `cell.line` covers `minute`, extending in whole chunks. */
function ensureThrough(model: LanternModel, cell: LanternCell, minute: number): void {
  if (cell.through >= minute) return;
  const chunks = Math.ceil((minute - model.fromMinute + 1) / CHUNK_MINUTES);
  const target = Math.min(model.nbh.endMinute, model.fromMinute + chunks * CHUNK_MINUTES);
  cell.line = cells.cellTimeline(
    cell.sim.geohash6,
    model.nbh.reports,
    model.fromMinute,
    target,
    STEP,
  );
  cell.through = target;
}

/** The step a minute falls in, clamped to the night. Never reads past `minute`. */
function stepIndex(model: LanternModel, minute: number): number {
  const last = Math.floor((model.nbh.endMinute - model.fromMinute) / STEP);
  return Math.max(0, Math.min(last, Math.floor((minute - model.fromMinute) / STEP)));
}

/** Every cell as the crowd would publish it at `minute`. */
export function viewAt(model: LanternModel, minute: number): LanternView {
  const i = stepIndex(model, minute);
  const stepMinute = model.fromMinute + i * STEP;
  const all = model.cells.map((c) => {
    ensureThrough(model, c, stepMinute);
    return { sim: c.sim, state: c.line[i] as cells.CellState };
  });
  const user = all.find((c) => c.sim.geohash6 === model.userCell) as (typeof all)[number];
  return { minute, cells: all, user: user.state };
}

/** The first minute at which the user's cell is "coming back", or null if it never is. */
export function firstRestorationMinute(model: LanternModel): number | null {
  const user = model.cells.find((c) => c.sim.geohash6 === model.userCell) as LanternCell;
  const step = user.line.find((s) => s.state === 'comingBack');
  return step ? step.windowStart : null;
}

/** The first minute the user's cell is dark, or null. */
export function firstDarkMinute(model: LanternModel): number | null {
  const user = model.cells.find((c) => c.sim.geohash6 === model.userCell) as LanternCell;
  const step = user.line.find((s) => s.state === 'dark');
  return step ? step.windowStart : null;
}

/** The restoration estimate for the user's cell at `minute`, from the provider's promise and history. */
export function estimateAt(
  model: LanternModel,
  view: LanternView,
): restoration.RestorationEstimate {
  return restoration.estimateRestoration({
    nowMinute: view.minute,
    promisedEndMinute: model.nbh.provider.promisedEndMinute,
    history: model.nbh.history,
    crowdState: view.user.state,
  });
}

/** How many cells are in each state at this view. */
export function countStates(view: LanternView): Record<cells.CellStateValue, number> {
  const counts: Record<cells.CellStateValue, number> = {
    dark: 0,
    lit: 0,
    mixed: 0,
    comingBack: 0,
    unknown: 0,
  };
  for (const c of view.cells) counts[c.state.state] += 1;
  return counts;
}
