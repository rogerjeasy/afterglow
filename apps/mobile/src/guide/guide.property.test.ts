import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { foodIndex } from '../data/foodkeeper';
import { loadDemoHousehold } from '../demo/household';
import { createHouseholdStore, memoryStorage } from '../household/store';
import { readFacts } from './facts';
import { MAX_FACT_LENGTH, type TourFacts, renderLine, slotsOf } from './render';
import { type FactKey, TOUR } from './script';
import {
  type Power,
  type PowerNeed,
  TOUR_OFF,
  type TourAction,
  type TourState,
  afterAction,
  opacity,
  planPower,
  reconcile,
  satisfies,
  step,
} from './tour';

const FACT_KEYS: readonly FactKey[] = [
  'devices',
  'fridge',
  'ghosts',
  'k',
  'promise',
  'estimate',
  'threshold',
  'crossing',
  'foodVerdict',
];
const DIGIT = /\d/;

/** Facts with any subset missing; values may contain digits, as real ones do. */
const factsArb: fc.Arbitrary<TourFacts> = fc.record(
  Object.fromEntries(
    FACT_KEYS.map((k) => [
      k,
      fc.option(fc.string({ minLength: 1, maxLength: MAX_FACT_LENGTH }), { nil: undefined }),
    ]),
  ) as Record<FactKey, fc.Arbitrary<string | undefined>>,
  { requiredKeys: [] },
) as fc.Arbitrary<TourFacts>;

const stepArb = fc.constantFrom(...TOUR);

describe('Guide (Wisp and the One Night tour)', () => {
  it('GD-01 every digit in a rendered line comes from a filled slot', () => {
    // The words of every line and fallback carry no digit of their own.
    for (const s of TOUR) {
      expect(s.line.replace(/\{\w+\}/g, '')).not.toMatch(DIGIT);
      expect(s.fallback).not.toMatch(DIGIT);
      expect(slotsOf(s.fallback)).toEqual([]);
      for (const slot of slotsOf(s.line)) expect(FACT_KEYS).toContain(slot);
    }
    fc.assert(
      fc.property(stepArb, factsArb, (s, facts) => {
        const r = renderLine(s, facts);
        const slots = slotsOf(s.line);
        const complete = slots.every((k) => (facts[k as FactKey] ?? '').trim() !== '');
        if (!complete) {
          expect(r).toEqual({ text: s.fallback, filled: false });
          return;
        }
        // Filled: exactly the template's words with each slot's fact between them, untouched.
        // Built by splitting, not String.replace: a fact like "$&" or "{k}" must stay literal.
        const words = s.line.split(/\{\w+\}/);
        const expected = words
          .map((w, i) => (i < slots.length ? w + (facts[slots[i] as FactKey] as string) : w))
          .join('');
        expect(r).toEqual({ text: expected, filled: true });
      }),
      { numRuns: 2000 },
    );
  });

  it('GD-02 nothing outside the shell imports the guide', () => {
    const src = fileURLToPath(new URL('..', import.meta.url));
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(src);
    const offenders = files
      .map((p) => relative(src, p))
      .filter((rel) => !rel.startsWith('guide/') && rel !== 'App.tsx')
      .filter((rel) =>
        /from '(\.\.?\/)+(\.\.\/)*guide\//.test(readFileSync(join(src, rel), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });

  it('GD-03 the tour acts only on the demo space', () => {
    const needs: PowerNeed[] = ['on', 'out', 'back'];
    fc.assert(
      fc.property(
        fc.constantFrom<'guest' | 'account'>('guest', 'account'),
        fc.constantFrom(...needs),
        fc.constantFrom<Power>('on', 'out', 'back'),
        (space, need, power) => {
          expect(planPower(space, need, power)).toBeNull();
        },
      ),
    );
  });

  it('GD-04 any sequence of actions lands in a valid state', () => {
    const actions: TourAction[] = ['start', 'next', 'back', 'skip', 'restart', 'close'];
    const n = TOUR.length;
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...actions), { maxLength: 60 }), (seq) => {
        let s: TourState = TOUR_OFF;
        for (const a of seq) {
          const prev = s;
          s = step(s, a, n);
          if (s.kind === 'on') expect(s.index >= 0 && s.index < n).toBe(true);
          if (prev.kind === 'on' && a === 'back')
            expect(s).toEqual({ kind: 'on', index: Math.max(0, prev.index - 1) });
          if (prev.kind === 'on' && a === 'next' && prev.index === n - 1)
            expect(s.kind).toBe('done');
          if (prev.kind === 'on' && a === 'skip') expect(s.kind).toBe('done');
          if (prev.kind === 'done' && (a === 'next' || a === 'back' || a === 'skip'))
            expect(s.kind).toBe('done');
          if (a === 'restart' || a === 'start') expect(s).toEqual({ kind: 'on', index: 0 });
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('GD-05 applying the reconcile action meets the need, and a second reconcile does nothing', () => {
    for (const need of ['on', 'out', 'back'] as const) {
      for (const power of ['on', 'out', 'back'] as const) {
        const action = reconcile(need, power);
        const after = action === null ? power : afterAction(action);
        expect(satisfies(need, after)).toBe(true);
        expect(reconcile(need, after)).toBeNull();
        expect(planPower('demo', need, power)).toBe(action);
      }
    }
  });

  it('GD-06 the script visits every tab, starts with power on and ends with power back', () => {
    expect(new Set(TOUR.map((s) => s.tab))).toEqual(
      new Set(['hearth', 'lantern', 'seance', 'cold', 'plan']),
    );
    expect(TOUR[0]?.power).toBe('on');
    expect(TOUR[1]?.power).toBe('out');
    expect(TOUR.at(-1)?.power).toBe('back');
    expect(TOUR.at(-1)?.tab).toBe('hearth');
    expect(new Set(TOUR.map((s) => s.id)).size).toBe(TOUR.length);
    for (const s of TOUR) expect(s.target).toMatch(/^[a-z-]+$/);
  });

  it('GD-07 opacity is 0.35 at the start, 1.0 at the end, and never falls going forward', () => {
    const n = TOUR.length;
    expect(opacity(0, n)).toBeCloseTo(0.35);
    expect(opacity(n - 1, n)).toBe(1);
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 40 }), fc.nat(), (len, raw) => {
        const i = raw % (len - 1);
        expect(opacity(i + 1, len)).toBeGreaterThanOrEqual(opacity(i, len));
        expect(opacity(i, len)).toBeGreaterThanOrEqual(0.35);
        expect(opacity(i, len)).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('GD-08 every rendered line is at most 200 characters', () => {
    fc.assert(
      fc.property(stepArb, factsArb, (s, facts) => {
        expect(renderLine(s, facts).text.length).toBeLessThanOrEqual(200);
      }),
      { numRuns: 2000 },
    );
  });

  it('GD-01 the demo night fills every slot from the core, each within the fact limit', () => {
    const t0 = new Date('2026-11-26T19:00:00').getTime();
    let id = 0;
    const store = createHouseholdStore({
      storage: memoryStorage(),
      now: () => t0,
      randomId: () => `t${id++}`,
    });
    loadDemoHousehold(store, foodIndex);
    store.startOutage(t0 - 45 * 60_000);
    const during = readFacts({ view: store.getState().view, nowMs: t0, demo: true, foodIndex });
    for (const k of [
      'devices',
      'fridge',
      'ghosts',
      'k',
      'promise',
      'estimate',
      'threshold',
      'crossing',
    ] as const) {
      expect(during[k], k).toBeTruthy();
      expect((during[k] as string).length, k).toBeLessThanOrEqual(MAX_FACT_LENGTH);
    }
    expect(during.foodVerdict).toBeUndefined(); // only said once the power is back
    store.endOutage();
    const after = readFacts({ view: store.getState().view, nowMs: t0, demo: true, foodIndex });
    expect(after.foodVerdict).toBe('no food needs a decision');
    expect(after.devices).toBeUndefined(); // no crowd facts without an outage
  });

  it('GD-01 outside the demo there are no crowd facts', () => {
    const t0 = new Date('2026-11-26T19:00:00').getTime();
    const store = createHouseholdStore({
      storage: memoryStorage(),
      now: () => t0,
      randomId: () => 'x',
    });
    loadDemoHousehold(store, foodIndex);
    store.startOutage(t0 - 45 * 60_000);
    const f = readFacts({ view: store.getState().view, nowMs: t0, demo: false, foodIndex });
    expect(f.devices).toBeUndefined();
    expect(f.promise).toBeUndefined();
    expect(f.estimate).toBeUndefined();
  });
});
