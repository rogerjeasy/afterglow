import { cells } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import {
  buildLanternModel,
  countStates,
  estimateAt,
  firstDarkMinute,
  firstRestorationMinute,
  toMs,
  viewAt,
} from './model';
import {
  estimateText,
  explainCell,
  hearthLine,
  lateStats,
  lateText,
  playbackText,
} from './present';

const START = 29_000_000;

describe('Lantern model (through the real cells and restoration core)', () => {
  const model = buildLanternModel(START);

  it('LN-01 the first view computes only what it shows: the user cell in full, the rest as far as now', () => {
    // Measured, not timed: a wall-clock bound is flaky under parallel CI load. Computing the
    // whole night up front cost about 450 ms on a fast laptop, which a 2019 phone cannot spare.
    const fresh = buildLanternModel(START + 1);
    const nowMinute = START + 1 + 45;
    viewAt(fresh, nowMinute);
    const user = fresh.cells.find((c) => c.sim.geohash6 === fresh.userCell);
    expect(user?.through).toBe(fresh.nbh.endMinute);
    for (const c of fresh.cells) {
      if (c.sim.geohash6 === fresh.userCell) continue;
      expect(c.through).toBeGreaterThanOrEqual(nowMinute);
      expect(c.through).toBeLessThan(fresh.nbh.endMinute - 120);
    }
    // Scrubbing to the end extends them, and the answer is the same as computing it up front.
    const end = viewAt(fresh, fresh.nbh.endMinute);
    for (const c of fresh.cells) expect(c.through).toBe(fresh.nbh.endMinute);
    expect(end.cells).toHaveLength(30);
  });

  it('LN-02 the user cell walks lit, dark, coming back, lit at the right times', () => {
    const dark = firstDarkMinute(model) as number;
    const back = firstRestorationMinute(model) as number;
    expect(dark).toBeGreaterThanOrEqual(START);
    expect(dark).toBeLessThanOrEqual(START + 10);
    expect(back).toBeGreaterThan(dark);
    expect(viewAt(model, START - 10).user.state).toBe('lit');
    expect(viewAt(model, START + 30).user.state).toBe('dark');
    expect(viewAt(model, back).user.state).toBe('comingBack');
    expect(viewAt(model, model.nbh.endMinute).user.state).toBe('lit');
  });

  it('LN-03 no cell is published below k, ever, at any minute', () => {
    for (let m = model.fromMinute; m <= model.nbh.endMinute; m += 5) {
      for (const c of viewAt(model, m).cells) {
        if (c.state.state !== 'unknown') {
          expect(c.state.deviceCount).toBeGreaterThanOrEqual(cells.K_ANONYMITY);
        }
      }
    }
  });

  it('LN-04 scrubbing never reads the future: a view uses only minutes up to it', () => {
    // Re-derive the user's cell at a minute from only the reports up to that minute.
    for (const offset of [-5, 0, 7, 30, 95, 150, 240]) {
      const minute = START + offset;
      const past = model.nbh.reports.filter((r) => r.minute <= minute);
      const from = cells.cellTimeline(
        model.userCell,
        past,
        model.fromMinute,
        Math.floor(minute / 5) * 5,
        5,
      );
      const viewed = viewAt(model, minute).user;
      expect(viewed).toEqual(from[from.length - 1]);
    }
  });

  it('LN-05 a minute outside the night is clamped, not an error', () => {
    expect(viewAt(model, START - 100_000).user).toEqual(viewAt(model, model.fromMinute).user);
    expect(viewAt(model, START + 100_000).user).toEqual(viewAt(model, model.nbh.endMinute).user);
  });

  it('LN-06 every view has at least one sparse unknown cell and counts add up', () => {
    const v = viewAt(model, START + 60);
    const counts = countStates(v);
    expect(counts.unknown).toBeGreaterThanOrEqual(1);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(v.cells.length);
    expect(counts.dark).toBeGreaterThanOrEqual(1);
    expect(counts.lit).toBeGreaterThanOrEqual(1);
  });

  it('LN-07 the estimate is a band while dark, underway while coming back, and none once lit', () => {
    const dark = estimateAt(model, viewAt(model, START + 30));
    expect(dark.kind).toBe('estimate');
    const back = firstRestorationMinute(model) as number;
    expect(estimateAt(model, viewAt(model, back))).toEqual({ kind: 'underway' });
    expect(estimateAt(model, viewAt(model, model.nbh.endMinute)).kind).toBe('unknown');
  });
});

describe('Lantern text', () => {
  const state = (s: cells.CellState['state'], deviceCount: number): cells.CellState => ({
    geohash6: 'u4pruy',
    windowStart: 0,
    state: s,
    deviceCount,
    provenance: ['crowd'],
  });

  it('LN-08 unknown says why and what would resolve it, never a guess', () => {
    expect(explainCell(state('unknown', 0))).toContain('No device has reported');
    expect(explainCell(state('unknown', 3))).toContain('Only 3 devices');
    expect(explainCell(state('unknown', 3))).toContain('at least 5');
    expect(explainCell(state('unknown', 1))).toContain('Only 1 device ');
  });

  it('LN-09 every state has words', () => {
    for (const s of ['lit', 'dark', 'mixed', 'comingBack', 'unknown'] as const) {
      expect(explainCell(state(s, 41)).length).toBeGreaterThan(20);
    }
  });

  it('LN-10 an estimate shows its source, its band and how many outages it is drawn from', () => {
    const t = estimateText(
      {
        kind: 'estimate',
        atMinute: START + 150,
        lowMinute: START + 140,
        highMinute: START + 190,
        promisedEndMinute: START + 130,
        basedOn: 12,
      },
      'provider (simulated)',
    );
    expect(t.headline).toMatch(/^Estimate /);
    expect(t.detail).toContain('12 past outages');
    expect(t.sources).toContain('provider (simulated)');
  });

  it('LN-11 no promise or thin history says so and shows no time', () => {
    const u = estimateText(
      { kind: 'unknown', reason: 'the provider has promised no end time' },
      'p',
    );
    expect(u.headline).toBe('No estimate');
    expect(u.detail).toContain('I will not guess');
    const p = estimateText({ kind: 'promiseOnly', promisedEndMinute: START + 100 }, 'p');
    expect(p.detail).toContain('no estimate');
  });

  it('LN-12 lateness is counted from the history, never flattering', () => {
    const stats = lateStats([
      { promisedEndMinute: 10, actualEndMinute: 40 },
      { promisedEndMinute: 10, actualEndMinute: 10 },
      { promisedEndMinute: 10, actualEndMinute: 5 },
      { promisedEndMinute: Number.NaN, actualEndMinute: 50 },
    ]);
    expect(stats).toEqual({ late: 1, total: 3, medianLateMinutes: 30 });
    expect(lateText(stats)).toContain('1 of 3');
    expect(lateText(lateStats([]))).toContain('No past outages');
    expect(lateText({ late: 0, total: 4, medianLateMinutes: null })).toContain('on time');
  });

  it('LN-14 the Hearth line says only what the core can back, in every state', () => {
    const model = buildLanternModel(START);
    const startMs = toMs(START);
    const lineAt = (offset: number): string => {
      const v = viewAt(model, START + offset);
      return hearthLine(v.user, estimateAt(model, v), startMs);
    };
    // Dark: the crowd, the provider and the estimate, each present.
    const dark = lineAt(40);
    expect(dark).toMatch(/devices in your cell lost power/);
    expect(dark).toContain('provider says');
    expect(dark).toContain('estimate');
    expect(dark).toContain('likely');
    // Coming back: the crowd's evidence replaces any estimate.
    const back = firstRestorationMinute(model) as number;
    expect(lineAt(back - START)).toContain('charging again');
    expect(lineAt(back - START)).not.toContain('estimate');
    // Lit again: never claims the user's own power is back.
    expect(lineAt(model.nbh.endMinute - START)).toContain('tell me');
    // Too few reports: says how many, and what is needed.
    const few = hearthLine(
      { geohash6: 'u4pruy', windowStart: 0, state: 'unknown', deviceCount: 3, provenance: [] },
      { kind: 'unknown', reason: 'x' },
      startMs,
    );
    expect(few).toContain('Only 3 devices have reported');
    expect(few).toContain('At least 5');
    expect(
      hearthLine(
        { geohash6: 'u4pruy', windowStart: 0, state: 'unknown', deviceCount: 0, provenance: [] },
        { kind: 'unknown', reason: 'x' },
        startMs,
      ),
    ).toContain('No device has reported');
  });

  it('LN-13 playback says when the view is ahead of now', () => {
    expect(playbackText(START, START)).toMatch(/^Now/);
    expect(playbackText(START + 90, START)).toContain('ahead (simulated)');
    expect(playbackText(START - 20, START)).toContain('ago');
  });
});
