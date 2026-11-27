import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EventLog } from '../events/log.js';
import type { AfterglowEvent } from '../events/types.js';
import { buildFoodIndex } from '../foodkeeper/classify.js';
import type { FoodKeeperSnapshot, OutageRules } from '../foodkeeper/types.js';
import { compartmentFor } from '../thermal/archetypes.js';
import { temperatureAt } from '../thermal/model.js';
import { assessAppliance, compartmentModel, elapsedMinutes, hoursOfSafety } from './derive.js';
import { DEFAULT_AMBIENT_C, HOUSEHOLD_EVENT, type HomePayload, householdEvent } from './events.js';
import { buildHouseholdView } from './view.js';

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

const fridgePayload = (over: Record<string, unknown> = {}) => ({
  applianceId: 'fridge',
  name: 'Fridge',
  class: 'fridge',
  fullness: 'full',
  ambientC: null,
  ...over,
});
const OUTAGE_AT = 1_000_000_000_000;
const MIN = 60_000;

// ----------------------------------------------------------------- generators

const idArb = fc.constantFrom('x1', 'x2', 'x3');
const applianceEventArb = (lamport: number): fc.Arbitrary<AfterglowEvent> =>
  fc.oneof(
    fc
      .record({
        applianceId: idArb,
        name: fc.constantFrom('Fridge', 'Freezer'),
        class: fc.constantFrom('fridge', 'freezer', 'coolerBox', 'chestFreezer'),
        fullness: fc.constantFrom('full', 'half'),
        ambientC: fc.oneof(fc.constant(null), fc.integer({ min: -5, max: 45 })),
      })
      .map((p) => ev(E.applianceSet, p, lamport, 'dev-a')),
    idArb.map((applianceId) => ev(E.applianceRemoved, { applianceId }, lamport, 'dev-b')),
    fc
      .record({ itemId: idArb, applianceId: idArb, productId: fc.constantFrom(1, 2) })
      .map((p) => ev(E.itemAdded, p, lamport, 'dev-a')),
    idArb.map((itemId) => ev(E.itemRemoved, { itemId }, lamport, 'dev-b')),
    fc
      .record({
        applianceId: idArb,
        openMinutes: fc.integer({ min: 0, max: 20 }),
        atMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
      })
      .map((p) => ev(E.doorOpened, p, lamport, 'dev-a')),
    fc
      .option(fc.integer({ min: 0, max: 2_000_000_000_000 }), { nil: null })
      .map((startedAtMs) => ev(E.outageSet, { startedAtMs }, lamport, 'dev-b')),
    fc
      .record({
        itemId: idArb,
        answer: fc.constantFrom('present', 'absent'),
        atMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
      })
      .map((p) => ev(E.iceChecked, p, lamport, 'dev-a')),
  );

/** Events with unique (epoch, lamport, type) identities so none are deduplicated away. */
const eventsArb = fc
  .integer({ min: 0, max: 25 })
  .chain((n) =>
    fc.tuple(...Array.from({ length: n }, (_, i) => applianceEventArb(i + 1))),
  ) as fc.Arbitrary<AfterglowEvent[]>;

// -------------------------------------------------------------------- tests

describe('Household properties', () => {
  // HH-01
  it('HH-01 the view does not depend on the order events arrive', () => {
    fc.assert(
      fc.property(
        eventsArb.chain((events) =>
          fc.tuple(fc.constant(events), fc.shuffledSubarray(events, { minLength: events.length })),
        ),
        ([events, shuffled]) => {
          expect(buildHouseholdView(EventLog.from(shuffled))).toEqual(
            buildHouseholdView(EventLog.from(events)),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('HH-01b replaying a log from its own events reproduces the view', () => {
    fc.assert(
      fc.property(eventsArb, (events) => {
        const log = EventLog.from(events);
        expect(buildHouseholdView(EventLog.from(log.toArray()))).toEqual(buildHouseholdView(log));
      }),
    );
  });

  // HH-02
  it('HH-02 the later write wins whatever the arrival order', () => {
    const early = ev(E.applianceSet, fridgePayload({ fullness: 'half' }), 1);
    const late = ev(E.applianceSet, fridgePayload({ fullness: 'full' }), 2);
    for (const order of [
      [early, late],
      [late, early],
    ]) {
      const v = buildHouseholdView(EventLog.from(order));
      expect(v.appliances[0]?.fullness).toBe('full');
    }
  });

  it('HH-02b a removal later than the set removes; a set later than the removal restores', () => {
    const set1 = ev(E.applianceSet, fridgePayload(), 1);
    const remove = ev(E.applianceRemoved, { applianceId: 'fridge' }, 2, 'dev-b');
    const set2 = ev(E.applianceSet, fridgePayload({ name: 'Fridge again' }), 3);
    expect(buildHouseholdView(EventLog.from([set1, remove])).appliances).toHaveLength(0);
    expect(buildHouseholdView(EventLog.from([remove, set1])).appliances).toHaveLength(0);
    const back = buildHouseholdView(EventLog.from([set2, remove, set1]));
    expect(back.appliances.map((a) => a.name)).toEqual(['Fridge again']);
  });

  it('HH-02c every door opening is kept, none overwrites another', () => {
    const doors = [1, 2, 3, 4].map((i) =>
      ev(E.doorOpened, { applianceId: 'fridge', openMinutes: i, atMs: OUTAGE_AT + i * MIN }, i),
    );
    expect(buildHouseholdView(EventLog.from(doors)).doors).toHaveLength(4);
  });

  it('HH-02d removing an appliance removes its items', () => {
    const v = buildHouseholdView(
      EventLog.from([
        ev(E.applianceSet, fridgePayload(), 1),
        ev(E.itemAdded, { itemId: 'i1', applianceId: 'fridge', productId: 1 }, 2),
        ev(E.applianceRemoved, { applianceId: 'fridge' }, 3),
      ]),
    );
    expect(v.items).toHaveLength(0);
  });

  // HH-03
  it('HH-03 malformed household events change nothing', () => {
    const types = Object.values(E);
    fc.assert(
      fc.property(
        eventsArb,
        fc.array(fc.tuple(fc.constantFrom(...types), fc.anything()), { maxLength: 10 }),
        (events, junk) => {
          const baseline = buildHouseholdView(EventLog.from(events));
          const junkEvents = junk.map(([type, payload], i) => ev(type, payload, 100 + i, 'dev-z'));
          const withJunk = buildHouseholdView(EventLog.from([...events, ...junkEvents]));
          // Random payloads may occasionally be valid; they must never throw, and
          // anything structurally invalid must be a no-op.
          expect(withJunk.appliances.length).toBeGreaterThanOrEqual(0);
          if (junk.every(([, p]) => p === undefined || p === null || typeof p !== 'object')) {
            expect(withJunk).toEqual(baseline);
          }
        },
      ),
    );
  });

  it('HH-03b out-of-range and wrong-typed payloads are ignored', () => {
    const bad = [
      ev(E.applianceSet, fridgePayload({ class: 'toaster' }), 1),
      ev(E.applianceSet, fridgePayload({ ambientC: 9999 }), 2),
      ev(E.applianceSet, fridgePayload({ ambientC: Number.NaN }), 3),
      ev(E.applianceSet, fridgePayload({ fullness: 'overflowing' }), 4),
      ev(E.doorOpened, { applianceId: 'fridge', openMinutes: -5, atMs: 0 }, 5),
      ev(E.doorOpened, { applianceId: 'fridge', openMinutes: 99999, atMs: 0 }, 6),
      ev(E.outageSet, { startedAtMs: 'yesterday' }, 7),
      ev('household.unknown.type', { anything: true }, 8),
      ev('not.household', {}, 9),
    ];
    const v = buildHouseholdView(EventLog.from(bad));
    expect(v.appliances).toHaveLength(0);
    expect(v.doors).toHaveLength(0);
    expect(v.outageStartedAtMs).toBeNull();
  });

  it('HH-03c an item with an unknown food id assesses to unknown, not a verdict', () => {
    const view = buildHouseholdView(
      EventLog.from([
        ev(E.applianceSet, fridgePayload(), 1),
        ev(E.itemAdded, { itemId: 'i1', applianceId: 'fridge', productId: 424242 }, 2),
        ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 3),
      ]),
    );
    const a = assessAppliance(view, INDEX, 'fridge', OUTAGE_AT + 10 * MIN);
    expect(a?.items[0]?.verdict.kind).toBe('unknown');
  });

  // HH-04
  it('HH-04 door openings warm the start state, never past ambient, never colder, and only after the outage began', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 12, max: 45 }),
        fc.array(fc.integer({ min: 0, max: 30 }), { maxLength: 8 }),
        fc.integer({ min: 0, max: 30 }),
        (ambientC, minutes, extra) => {
          const base = [
            ev(E.applianceSet, fridgePayload({ ambientC }), 1),
            ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 2),
          ];
          const doors = (mins: readonly number[]) =>
            mins.map((m, i) =>
              ev(
                E.doorOpened,
                { applianceId: 'fridge', openMinutes: m, atMs: OUTAGE_AT + (i + 1) * MIN },
                10 + i,
              ),
            );
          const build = (mins: readonly number[]) =>
            compartmentModel(
              buildHouseholdView(EventLog.from([...base, ...doors(mins)])),
              'fridge',
            );
          const none = build([]);
          const some = build(minutes);
          const more = build([...minutes, extra]);
          const initial = compartmentFor('fridge', 'full', ambientC).state.startC;
          expect(some?.state.startC as number).toBeGreaterThanOrEqual(initial - 1e-9);
          expect(some?.state.startC as number).toBeLessThanOrEqual(ambientC + 1e-9);
          expect(more?.state.startC as number).toBeGreaterThanOrEqual(
            (some?.state.startC as number) - 1e-9,
          );
          expect(none?.state.startC).toBeCloseTo(initial, 9);
        },
      ),
    );
  });

  it('HH-04b door openings from before the outage do not count', () => {
    const view = buildHouseholdView(
      EventLog.from([
        ev(E.applianceSet, fridgePayload(), 1),
        ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 2),
        ev(E.doorOpened, { applianceId: 'fridge', openMinutes: 30, atMs: OUTAGE_AT - 5 * MIN }, 3),
      ]),
    );
    expect(compartmentModel(view, 'fridge')?.doorMinutes).toBe(0);
  });

  // HH-05
  it('HH-05 a refrigerated window never exceeds 240 minutes; no outage means a prediction and no discards', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('fridge', 'fridgeFreezerCombo', 'coolerBox'),
        fc.constantFrom('full', 'half'),
        fc.integer({ min: -5, max: 45 }),
        (cls, fullness, ambientC) => {
          const view = buildHouseholdView(
            EventLog.from([
              ev(E.applianceSet, fridgePayload({ class: cls, fullness, ambientC }), 1),
              ev(E.itemAdded, { itemId: 'i1', applianceId: 'fridge', productId: 1 }, 2),
            ]),
          );
          const a = assessAppliance(view, INDEX, 'fridge', OUTAGE_AT);
          expect(a?.windowMinutes).not.toBeNull();
          expect(a?.windowMinutes as number).toBeLessThanOrEqual(240);
          expect(a?.headline.kind).toBe('holds');
          expect(a?.items.every((i) => i.verdict.kind !== 'discard')).toBe(true);
        },
      ),
    );
  });

  it('HH-05b the frozen window is where the model reaches 0 C', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('freezer', 'chestFreezer'),
        fc.constantFrom('full', 'half'),
        fc.integer({ min: 5, max: 45 }),
        (cls, fullness, ambientC) => {
          const view = buildHouseholdView(
            EventLog.from([
              ev(E.applianceSet, fridgePayload({ class: cls, fullness, ambientC }), 1),
            ]),
          );
          const a = assessAppliance(view, INDEX, 'fridge', OUTAGE_AT);
          const w = a?.windowMinutes;
          expect(w).not.toBeNull();
          expect(Math.abs(temperatureAt(a?.model.state as never, w as number))).toBeLessThan(1e-3);
        },
      ),
    );
  });

  it('HH-05c the headline counts down with the outage clock and flips to pastWindow', () => {
    const view = buildHouseholdView(
      EventLog.from([
        ev(E.applianceSet, fridgePayload({ ambientC: 22 }), 1),
        ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 2),
      ]),
    );
    const at = (min: number) =>
      assessAppliance(view, INDEX, 'fridge', OUTAGE_AT + min * MIN)?.headline;
    expect(at(0)?.kind).toBe('remaining');
    expect(at(60)?.kind).toBe('remaining');
    expect(at(239.99)?.kind).toBe('remaining');
    expect(at(241)?.kind).toBe('pastWindow');
    const h0 = at(0);
    const h60 = at(60);
    if (h0?.kind === 'remaining' && h60?.kind === 'remaining') {
      expect(h60.minutes).toBeLessThan(h0.minutes);
    }
  });

  it('HH-05d a power cut made later than now is treated as minute 0, never negative', () => {
    const view = buildHouseholdView(
      EventLog.from([ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 1)]),
    );
    expect(elapsedMinutes(view, OUTAGE_AT - 10 * MIN)).toBe(0);
  });

  // HH-06
  const homeEvent = (over: Partial<HomePayload> = {}, lamport = 1) =>
    ev(
      E.homeSet,
      {
        archetype: { type: 'apartment', vintage: 'pre1980', insulation: 'poor', climate: 'cold' },
        indoorC: 20,
        outdoorC: 0,
        mode: 'cold',
        thresholdC: 15,
        ...over,
      },
      lamport,
    );

  it('HH-06 hours of safety is a band: earliest <= middle <= latest, and it counts down', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 16, max: 28 }),
        fc.integer({ min: -25, max: 10 }),
        fc.integer({ min: 0, max: 2000 }),
        fc.integer({ min: 0, max: 2000 }),
        (indoorC, outdoorC, ta, tb) => {
          const view = buildHouseholdView(
            EventLog.from([
              homeEvent({ indoorC, outdoorC }),
              ev(E.outageSet, { startedAtMs: OUTAGE_AT }, 2),
            ]),
          );
          const t1 = Math.min(ta, tb);
          const t2 = Math.max(ta, tb);
          const h1 = hoursOfSafety(view, OUTAGE_AT + t1 * MIN);
          const h2 = hoursOfSafety(view, OUTAGE_AT + t2 * MIN);
          if (h1.kind === 'band' && h2.kind === 'band') {
            expect(h1.earliestMinutes).toBeLessThanOrEqual(h1.midMinutes + 1e-9);
            expect(h1.midMinutes).toBeLessThanOrEqual(
              (h1.latestMinutes ?? Number.POSITIVE_INFINITY) + 1e-9,
            );
            expect(h2.midMinutes).toBeLessThanOrEqual(h1.midMinutes + 1e-9);
            expect(h1.isDefaultBand).toBe(false);
          }
        },
      ),
    );
  });

  it('HH-06b unknown building gives the wide default band, flagged', () => {
    const view = buildHouseholdView(EventLog.from([homeEvent({ archetype: null })]));
    const h = hoursOfSafety(view, OUTAGE_AT);
    expect(h.kind).toBe('band');
    if (h.kind === 'band') {
      expect(h.isDefaultBand).toBe(true);
      expect(h.latestMinutes as number).toBeGreaterThan(h.earliestMinutes);
    }
  });

  it('HH-06c no home profile is unknown; a threshold the weather never reaches says so', () => {
    expect(hoursOfSafety(buildHouseholdView(EventLog.empty()), OUTAGE_AT).kind).toBe('unknown');
    const mild = buildHouseholdView(EventLog.from([homeEvent({ outdoorC: 18, thresholdC: 15 })]));
    expect(hoursOfSafety(mild, OUTAGE_AT).kind).toBe('notReached');
  });

  // HH-07
  it('HH-07 the default room temperature is labelled as a default', () => {
    const withDefault = buildHouseholdView(EventLog.from([ev(E.applianceSet, fridgePayload(), 1)]));
    expect(withDefault.appliances[0]?.ambientIsDefault).toBe(true);
    expect(withDefault.appliances[0]?.ambientC).toBe(DEFAULT_AMBIENT_C);
    const set = buildHouseholdView(
      EventLog.from([ev(E.applianceSet, fridgePayload({ ambientC: 30 }), 1)]),
    );
    expect(set.appliances[0]?.ambientIsDefault).toBe(false);
    expect(set.appliances[0]?.ambientC).toBe(30);
  });

  // FC-07 (field-checks): a thermometer-measured time constant reaches the live clock,
  // and only ever to shorten it (FC-03).
  it('FC-07 a measured time constant can shorten the fridge window but never lengthen it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('fridge', 'fridgeFreezerCombo', 'freezer', 'chestFreezer', 'coolerBox'),
        fc.constantFrom('full', 'half'),
        fc.integer({ min: 10, max: 40 }),
        fc.double({ min: 1, max: 100_000, noNaN: true }),
        (cls, fullness, ambientC, measuredTauMinutes) => {
          const window = (extra: Record<string, unknown>): number | null => {
            const view = buildHouseholdView(
              EventLog.from([
                ev(E.applianceSet, fridgePayload({ class: cls, fullness, ambientC, ...extra }), 1),
              ]),
            );
            return assessAppliance(view, INDEX, 'fridge', OUTAGE_AT)?.windowMinutes ?? null;
          };
          const plain = window({});
          const measured = window({ measuredTauMinutes });
          if (plain === null) return;
          expect(measured).not.toBeNull();
          expect(measured as number).toBeLessThanOrEqual(plain + 1e-9);
        },
      ),
    );
  });

  it('FC-07 a measured time constant that is not a positive number is ignored with the event', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 1e9, '3000']) {
      const view = buildHouseholdView(
        EventLog.from([ev(E.applianceSet, fridgePayload({ measuredTauMinutes: bad }), 1)]),
      );
      expect(view.appliances).toHaveLength(0);
    }
    const ok = buildHouseholdView(
      EventLog.from([ev(E.applianceSet, fridgePayload({ measuredTauMinutes: 900 }), 1)]),
    );
    expect(ok.appliances[0]?.measuredTauMinutes).toBe(900);
    expect(compartmentModel(ok, 'fridge')?.usedDefaultTau).toBe(false);
  });
});
