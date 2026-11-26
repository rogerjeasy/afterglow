import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CellState, CellStateValue } from '../cells/types.js';
import { EventLog } from '../events/log.js';
import type { AfterglowEvent } from '../events/types.js';
import { buildFoodIndex } from '../foodkeeper/classify.js';
import type { FoodKeeperSnapshot, OutageRules } from '../foodkeeper/types.js';
import { assessAll, hoursOfSafety } from '../household/derive.js';
import { HOUSEHOLD_EVENT, householdEvent } from '../household/events.js';
import { buildHouseholdView } from '../household/view.js';
import { evaluateAlerts } from './evaluate.js';
import { mergeAlerts } from './merge.js';
import { type Alert, FOOD_SOON_MINUTES, HOME_SOON_MINUTES, PRIORITY_RANK } from './types.js';

const RULES: OutageRules = {
  rulesVersion: 'test-rules-v1',
  source: { title: 'Test', publisher: 'Test', url: 'https://example.test' },
  thresholds: {
    refrigeratedDangerC: 4.4,
    refrigeratorHoldMinutes: 240,
    warmHeldDangerC: 10,
    warmHeldMinutes: 480,
    frozenIceDangerC: 0,
  },
  fallback: { class: 'discardAfterFourHours', ruleId: 'unlisted-default', usdaItem: 'unlisted' },
  rules: [
    {
      id: 'poultry',
      class: 'discardAfterFourHours',
      usdaItem: 'poultry',
      match: { categoryIds: [15] },
    },
  ],
};
const SNAPSHOT: FoodKeeperSnapshot = {
  snapshotVersion: 'test-snapshot-v1',
  products: [
    {
      id: 1,
      name: 'Chicken',
      subtitle: null,
      categoryId: 15,
      category: 'Poultry',
      subcategory: null,
      keywords: '',
    },
    {
      id: 2,
      name: 'Ice cream',
      subtitle: null,
      categoryId: 8,
      category: 'Frozen',
      subcategory: null,
      keywords: '',
    },
  ],
};
const INDEX = buildFoodIndex(SNAPSHOT, RULES);

const E = HOUSEHOLD_EVENT;
const ev = (type: string, payload: unknown, lamport: number, epoch = 'dev-a'): AfterglowEvent =>
  householdEvent(type as (typeof E)[keyof typeof E], payload, epoch, lamport);
const viewOf = (events: AfterglowEvent[]) =>
  buildHouseholdView(events.reduce((l, e) => l.append(e), EventLog.empty()));

const T0 = 1_000_000_000_000;
const MIN = 60_000;

// ------------------------------------------------------------- generators

const idArb = fc.constantFrom('x1', 'x2', 'x3');
const eventArb = (lamport: number): fc.Arbitrary<AfterglowEvent> =>
  fc.oneof(
    fc
      .record({
        applianceId: idArb,
        name: fc.constantFrom('Fridge', 'Freezer'),
        class: fc.constantFrom('fridge', 'freezer', 'coolerBox', 'chestFreezer'),
        fullness: fc.constantFrom('full', 'half'),
        ambientC: fc.oneof(fc.constant(null), fc.integer({ min: -5, max: 45 })),
      })
      .map((p) => ev(E.applianceSet, p, lamport)),
    fc
      .record({ itemId: idArb, applianceId: idArb, productId: fc.constantFrom(1, 2) })
      .map((p) => ev(E.itemAdded, p, lamport)),
    fc
      .option(fc.integer({ min: T0 - 48 * 60 * MIN, max: T0 }), { nil: null })
      .map((startedAtMs) => ev(E.outageSet, { startedAtMs }, lamport, 'dev-b')),
    fc
      .record({
        archetype: fc.record({
          type: fc.constantFrom('apartment', 'detached'),
          vintage: fc.constantFrom('pre1980', 'post2000'),
          insulation: fc.constantFrom('poor', 'good'),
          climate: fc.constantFrom('cold', 'hot'),
        }),
        indoorC: fc.integer({ min: 10, max: 30 }),
        outdoorC: fc.integer({ min: -20, max: 45 }),
        mode: fc.constantFrom('cold', 'heat'),
        thresholdC: fc.integer({ min: 5, max: 35 }),
      })
      .map((p) => ev(E.homeSet, p, lamport)),
    fc
      .record({
        personId: idArb,
        name: fc.constantFrom('Mom', 'Paulo', 'Mr Naidoo'),
        slot: fc.integer({ min: 0, max: 63 }),
      })
      .map((p) => ev(E.rosterSet, p, lamport)),
    fc
      .record({
        personId: idArb,
        code: fc.constantFrom('SAFE', 'HELP'),
        atMs: fc.integer({ min: T0 - 48 * 60 * MIN, max: T0 }),
        channel: fc.constantFrom('light', 'sound', 'sms', 'ble', 'manual'),
      })
      .map((p) => ev(E.heard, p, lamport)),
  );
const eventsArb = fc
  .integer({ min: 0, max: 20 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => eventArb(i + 1)))) as fc.Arbitrary<
  AfterglowEvent[]
>;
const cellArb: fc.Arbitrary<CellState | null> = fc.option(
  fc.record({
    geohash6: fc.constant('u0m5kq'),
    windowStart: fc.nat(),
    state: fc.constantFrom<CellStateValue>('dark', 'lit', 'mixed', 'comingBack', 'unknown'),
    deviceCount: fc.integer({ min: 0, max: 200 }),
    provenance: fc.constant(['crowd' as const]),
  }),
  { nil: null },
);
const nowArb = fc.integer({ min: T0, max: T0 + 24 * 60 * MIN });

const alertArb: fc.Arbitrary<Alert> = fc.record({
  key: fc.constantFrom('a', 'b', 'c', 'd'),
  kind: fc.constantFrom(
    'outage',
    'foodSoon',
    'foodPast',
    'homeSoon',
    'homeReached',
    'help',
    'comingBack',
  ),
  priority: fc.constantFrom('critical', 'high', 'normal'),
  subject: fc.constantFrom('Fridge', 'Mom'),
  sinceMs: fc.integer({ min: 0, max: 1000 }),
  minutes: fc.option(fc.nat({ max: 600 }), { nil: null }),
  sources: fc.array(fc.constantFrom('s1', 's2', 's3'), { minLength: 1, maxLength: 3 }),
});

const run = (events: AfterglowEvent[], nowMs: number, cell: CellState | null = null) =>
  evaluateAlerts({
    view: viewOf(events),
    foodIndex: INDEX,
    nowMs,
    outageSource: 'you reported it',
    cell,
  });

// ------------------------------------------------------------------ tests

describe('Alerts properties', () => {
  it('AL-01 every alert cites at least one source', () => {
    fc.assert(
      fc.property(eventsArb, nowArb, cellArb, (events, now, cell) => {
        for (const a of run(events, now, cell)) {
          expect(a.sources.length).toBeGreaterThan(0);
          for (const s of a.sources) expect(s.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 400 },
    );
    // An empty outage source still yields a named one.
    const v = viewOf([ev(E.outageSet, { startedAtMs: T0 }, 1)]);
    const [outage] = evaluateAlerts({ view: v, foodIndex: INDEX, nowMs: T0, outageSource: '  ' });
    expect(outage?.sources).toEqual(['reported outage']);
  });

  it('AL-02 merging is idempotent, order-independent and leaves one alert per key', () => {
    fc.assert(
      fc.property(
        fc.array(alertArb, { maxLength: 12 }),
        fc.array(alertArb, { maxLength: 12 }),
        (a, b) => {
          const ab = mergeAlerts(a, b);
          expect(mergeAlerts(ab)).toEqual(ab);
          expect(mergeAlerts(b, a)).toEqual(ab);
          expect(mergeAlerts([...a, ...b].reverse())).toEqual(ab);
          expect(new Set(ab.map((x) => x.key)).size).toBe(ab.length);
          for (const m of ab) {
            const group = [...a, ...b].filter((x) => x.key === m.key);
            expect(m.sinceMs).toBe(Math.min(...group.map((x) => x.sinceMs)));
            expect(new Set(m.sources)).toEqual(new Set(group.flatMap((x) => x.sources)));
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('AL-02 the same HELP heard by two channels is one alert', () => {
    const base = [
      ev(E.rosterSet, { personId: 'p1', name: 'Mom', slot: 3 }, 1),
      ev(E.outageSet, { startedAtMs: T0 }, 2),
    ];
    const byLight = run(
      [...base, ev(E.heard, { personId: 'p1', code: 'HELP', atMs: T0 + MIN, channel: 'light' }, 3)],
      T0 + 5 * MIN,
    );
    const bySms = run(
      [
        ...base,
        ev(E.heard, { personId: 'p1', code: 'HELP', atMs: T0 + 2 * MIN, channel: 'sms' }, 3),
      ],
      T0 + 5 * MIN,
    );
    const merged = mergeAlerts(byLight, bySms).filter((a) => a.kind === 'help');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sinceMs).toBe(T0 + MIN);
    expect(merged[0]?.sources).toEqual(['heard by light', 'heard by sms']);
  });

  it('AL-03 with the power on, the only alerts are HELP', () => {
    fc.assert(
      fc.property(eventsArb, nowArb, cellArb, (events, now, cell) => {
        const view = viewOf(events);
        if (view.outageStartedAtMs !== null) return;
        for (const a of run(events, now, cell)) expect(a.kind).toBe('help');
      }),
      { numRuns: 400 },
    );
  });

  it('AL-04 food alerts carry the core’s own minutes and never come from an unknown clock', () => {
    fc.assert(
      fc.property(eventsArb, nowArb, (events, now) => {
        const view = viewOf(events);
        const byId = new Map(assessAll(view, INDEX, now).map((a) => [a.model.appliance.id, a]));
        for (const a of run(events, now)) {
          if (a.kind !== 'foodSoon' && a.kind !== 'foodPast') continue;
          const id = a.key.split(':')[1] as string;
          const h = byId.get(id)?.headline;
          expect(h).toBeDefined();
          if (a.kind === 'foodSoon') {
            expect(h?.kind).toBe('remaining');
            expect(a.minutes).toBe(h?.kind === 'remaining' ? h.minutes : Number.NaN);
            expect((a.minutes as number) > 0 && (a.minutes as number) <= FOOD_SOON_MINUTES).toBe(
              true,
            );
          } else {
            expect(h?.kind).toBe('pastWindow');
            expect(a.priority).toBe('critical');
          }
        }
      }),
      { numRuns: 400 },
    );
    // Concretely: a full fridge in a warm room, 3 h 40 m into the outage, is inside its last 30 minutes.
    const fridge = [
      ev(
        E.applianceSet,
        { applianceId: 'f', name: 'Fridge', class: 'fridge', fullness: 'full', ambientC: 22 },
        1,
      ),
      ev(E.itemAdded, { itemId: 'i', applianceId: 'f', productId: 1 }, 2),
      ev(E.outageSet, { startedAtMs: T0 }, 3),
    ];
    const soon = run(fridge, T0 + 220 * MIN).find((a) => a.kind === 'foodSoon');
    const h = assessAll(viewOf(fridge), INDEX, T0 + 220 * MIN)[0]?.headline;
    if (h?.kind === 'remaining' && h.minutes <= FOOD_SOON_MINUTES)
      expect(soon?.minutes).toBe(h.minutes);
    expect(run(fridge, T0 + 300 * MIN).some((a) => a.kind === 'foodPast')).toBe(true);
  });

  it('AL-05 home alerts carry the band’s earliest edge and never come from an unknown or unreached band', () => {
    fc.assert(
      fc.property(eventsArb, nowArb, (events, now) => {
        const hours = hoursOfSafety(viewOf(events), now);
        const home = run(events, now).filter(
          (a) => a.kind === 'homeSoon' || a.kind === 'homeReached',
        );
        if (hours.kind !== 'band') {
          expect(home).toEqual([]);
          return;
        }
        for (const a of home) {
          expect(a.minutes).toBe(hours.earliestMinutes);
          if (a.kind === 'homeReached') expect(hours.earliestMinutes).toBe(0);
          else
            expect(hours.earliestMinutes > 0 && hours.earliestMinutes <= HOME_SOON_MINUTES).toBe(
              true,
            );
        }
      }),
      { numRuns: 400 },
    );
  });

  it('AL-06 coming back only from a comingBack cell', () => {
    fc.assert(
      fc.property(eventsArb, nowArb, cellArb, (events, now, cell) => {
        const back = run(events, now, cell).filter((a) => a.kind === 'comingBack');
        const expected = viewOf(events).outageStartedAtMs !== null && cell?.state === 'comingBack';
        expect(back.length).toBe(expected ? 1 : 0);
        if (back[0] && cell) expect(back[0].sources).toContain(`${cell.deviceCount} devices`);
      }),
      { numRuns: 400 },
    );
  });

  it('AL-07 alerts are ordered by priority, then time, then key', () => {
    fc.assert(
      fc.property(eventsArb, nowArb, cellArb, (events, now, cell) => {
        const list = run(events, now, cell);
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1] as Alert;
          const b = list[i] as Alert;
          const order =
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            a.sinceMs - b.sinceMs ||
            (a.key < b.key ? -1 : 1);
          expect(order).toBeLessThan(0);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('AL-08 evaluation is deterministic and total over generated households', () => {
    fc.assert(
      fc.property(eventsArb, nowArb, cellArb, (events, now, cell) => {
        const once = run(events, now, cell);
        expect(run(events, now, cell)).toEqual(once);
        // The event log is order-independent (EV-03), so the alerts must be too.
        expect(run([...events].reverse(), now, cell)).toEqual(once);
      }),
      { numRuns: 300 },
    );
  });

  it('AL-08 the generators reach every alert kind, so the properties above are not vacuous', () => {
    const seen = new Set<string>();
    for (const [events, now, cell] of fc.sample(fc.tuple(eventsArb, nowArb, cellArb), 4000)) {
      for (const a of run(events, now, cell)) seen.add(a.kind);
    }
    expect([...seen].sort()).toEqual(
      ['comingBack', 'foodPast', 'foodSoon', 'help', 'homeReached', 'homeSoon', 'outage'].sort(),
    );
  });
});
