import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { temperatureAt } from '../thermal/model.js';
import type { CompartmentState } from '../thermal/types.js';
import { SENSORY_CAVEAT, assessFood } from './assess.js';
import { InvalidFoodRulesError, buildFoodIndex, classifyProduct } from './classify.js';
import { searchFood } from './search.js';
import type { FoodKeeperProduct, FoodKeeperSnapshot, FoodVerdict, OutageRules } from './types.js';

// Synthetic fixtures keep the core self-contained. Real-data conformance (FK-11)
// lives in apps/mobile where the vendored USDA files are loaded.
const RULES: OutageRules = {
  rulesVersion: 'test-rules-v1',
  source: { title: 'Test Guidance', publisher: 'Test Publisher', url: 'https://example.test/usda' },
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
      id: 'mayo',
      class: 'discardIfWarmEightHours',
      usdaItem: 'mayonnaise',
      caveat: 'Opened jars only.',
      match: { namePatterns: ['^Mayonnaise'] },
    },
    {
      id: 'produce',
      class: 'safeNoRefrigeration',
      usdaItem: 'whole produce',
      match: { categoryIds: [18], excludeNamePatterns: ['\\bcut\\b'] },
    },
    {
      id: 'butter',
      class: 'safeNoRefrigeration',
      usdaItem: 'butter',
      alsoSafeInFreezer: true,
      match: { categoryIds: [7], namePatterns: ['^Butter$'] },
    },
    {
      id: 'jam',
      class: 'safeHighAcid',
      usdaItem: 'jams',
      match: { categoryIds: [6], namePatterns: ['^Jams'] },
    },
    {
      id: 'poultry',
      class: 'discardAfterFourHours',
      usdaItem: 'poultry',
      match: { categoryIds: [15] },
    },
    { id: 'dairy', class: 'discardAfterFourHours', usdaItem: 'dairy', match: { categoryIds: [7] } },
  ],
};

const product = (
  id: number,
  name: string,
  categoryId: number,
  subtitle: string | null = null,
  keywords = '',
): FoodKeeperProduct => ({
  id,
  name,
  subtitle,
  categoryId,
  category: `cat${categoryId}`,
  subcategory: null,
  keywords,
});

const CHICKEN = 1;
const MAYO = 2;
const APPLES = 3;
const BUTTER = 4;
const JAM = 5;
const ICE_CREAM = 6; // unlisted -> fallback
const MILK = 7;

const SNAPSHOT: FoodKeeperSnapshot = {
  snapshotVersion: 'test-snapshot-v1',
  products: [
    product(CHICKEN, 'Chicken', 15, 'whole', 'poultry, bird'),
    product(MAYO, 'Mayonnaise', 6, 'commercial'),
    product(APPLES, 'Apples', 18),
    product(BUTTER, 'Butter', 7),
    product(JAM, 'Jams, jellies, and preserves', 6),
    product(ICE_CREAM, 'Ice cream', 8, null, 'frozen dessert'),
    product(MILK, 'Milk', 7, 'plain or flavored'),
    product(8, 'Eggs', 7, 'in shell'),
    product(9, 'Berries', 18, null, 'strawberry'),
  ],
};
const INDEX = buildFoodIndex(SNAPSHOT, RULES);

// A refrigerator-ish and a freezer-ish compartment, plus arbitrary ones.
const stateArb = (): fc.Arbitrary<CompartmentState> =>
  fc.record({
    startC: fc.double({ min: -25, max: 8, noNaN: true }),
    ambientC: fc.double({ min: -10, max: 40, noNaN: true }),
    tauMinutes: fc.double({ min: 60, max: 10000, noNaN: true }),
  });
const timeArb = (): fc.Arbitrary<number> => fc.double({ min: 0, max: 20000, noNaN: true });

const FRIDGE: CompartmentState = { startC: 3, ambientC: 22, tauMinutes: 3136 };
const FREEZER: CompartmentState = { startC: -18, ambientC: 22, tauMinutes: 4815 };

// Independent oracle: first minute the model's own temperature is at or above thr,
// found by bisection on temperatureAt. It does not reuse the crossing formula.
const oracleUp = (state: CompartmentState, thr: number): number | null => {
  if (state.startC >= thr) return 0;
  if (state.ambientC <= thr) return null;
  let lo = 0;
  let hi = 1;
  while (temperatureAt(state, hi) < thr) {
    hi *= 2;
    if (hi > 1e12) return null;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (temperatureAt(state, mid) < thr) lo = mid;
    else hi = mid;
  }
  return hi;
};
const TOL = 1e-3;

const isOk = (v: FoodVerdict): boolean => v.kind === 'ok';

describe('FoodKeeper properties', () => {
  // FK-01: classification is total and deterministic.
  it('FK-01 every product gets exactly one class, identically on every run', () => {
    for (const p of SNAPSHOT.products) {
      const a = classifyProduct(p, RULES);
      const b = classifyProduct(p, RULES);
      expect(a).toEqual(b);
      expect([
        'discardAfterFourHours',
        'discardIfWarmEightHours',
        'safeNoRefrigeration',
        'safeHighAcid',
      ]).toContain(a.class);
    }
  });

  // FK-01b: rule order matters and is respected: an exclusion earlier in the list wins.
  it('FK-01b first matching rule wins', () => {
    const cutApples = product(20, 'Apples', 18, 'cut');
    expect(classifyProduct(cutApples, RULES).listed).toBe(false);
    expect(classifyProduct(product(21, 'Apples', 18), RULES).ruleId).toBe('produce');
  });

  // FK-02: nothing outside the allowlist is ever classed safe; unmatched is the conservative fallback.
  it('FK-02 unmatched products are listed:false and discardAfterFourHours', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 400 }),
        fc.string({ maxLength: 20 }),
        (categoryId, name) => {
          const c = classifyProduct(product(1000, name || 'x', categoryId), RULES);
          // Only the name-only mayo rule can match outside the known categories.
          if (c.ruleId === 'unlisted-default') {
            expect(c.listed).toBe(false);
            expect(c.class).toBe('discardAfterFourHours');
          }
        },
      ),
    );
  });

  it('FK-02b a safe class always comes from a rule that cites a USDA item', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30 }),
        fc.constantFrom(
          'Apples',
          'Butter',
          'Mayonnaise',
          'Jams',
          'Chicken',
          'Mystery',
          'cut Apples',
        ),
        (categoryId, name) => {
          const c = classifyProduct(product(1000, name, categoryId), RULES);
          if (c.class === 'safeNoRefrigeration' || c.class === 'safeHighAcid') {
            expect(c.listed).toBe(true);
            const rule = RULES.rules.find((r) => r.id === c.ruleId);
            expect(rule?.usdaItem.length ?? 0).toBeGreaterThan(0);
          }
        },
      ),
    );
  });

  it('FK-02c malformed rules fail loudly instead of silently misclassifying', () => {
    const dup = {
      ...RULES,
      rules: [...RULES.rules, RULES.rules[0] as (typeof RULES.rules)[number]],
    };
    expect(() => buildFoodIndex(SNAPSHOT, dup)).toThrow(InvalidFoodRulesError);
    const matchesAll: OutageRules = {
      ...RULES,
      rules: [{ id: 'all', class: 'safeNoRefrigeration', usdaItem: 'x', match: {} }],
    };
    expect(() => buildFoodIndex(SNAPSHOT, matchesAll)).toThrow(InvalidFoodRulesError);
    const badRegex: OutageRules = {
      ...RULES,
      rules: [
        { id: 'bad', class: 'safeNoRefrigeration', usdaItem: 'x', match: { namePatterns: ['('] } },
      ],
    };
    expect(() => buildFoodIndex(SNAPSHOT, badRegex)).toThrow(InvalidFoodRulesError);
  });

  // FK-03: refrigerated perishable clock never exceeds 240 minutes and never exceeds the modelled crossing.
  it('FK-03 refrigerated perishable is never ok at or after 240 minutes', () => {
    fc.assert(
      fc.property(stateArb(), timeArb(), (state, t) => {
        const v = assessFood(INDEX, {
          productId: CHICKEN,
          compartment: 'refrigerated',
          state,
          minutesSincePowerLoss: t,
        });
        if (t >= 240) expect(v.kind).toBe('discard');
        if (v.kind === 'ok') {
          expect(v.windowEndsAtMinute).not.toBeNull();
          expect(v.windowEndsAtMinute as number).toBeLessThanOrEqual(240);
          const cross = oracleUp(state, 4.4);
          if (cross !== null)
            expect(v.windowEndsAtMinute as number).toBeLessThanOrEqual(cross + TOL);
          expect(t).toBeLessThan(v.windowEndsAtMinute as number);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('FK-03b a fridge already above 40 F at power loss is discard immediately', () => {
    const v = assessFood(INDEX, {
      productId: CHICKEN,
      compartment: 'refrigerated',
      state: { startC: 9, ambientC: 22, tauMinutes: 3136 },
      minutesSincePowerLoss: 0,
    });
    expect(v.kind).toBe('discard');
  });

  it('FK-03c the USDA reference fridge gives about 4 hours', () => {
    const v = assessFood(INDEX, {
      productId: CHICKEN,
      compartment: 'refrigerated',
      state: FRIDGE,
      minutesSincePowerLoss: 60,
    });
    expect(v.kind).toBe('ok');
    if (v.kind === 'ok') {
      expect(v.windowEndsAtMinute as number).toBeGreaterThan(235);
      expect(v.windowEndsAtMinute as number).toBeLessThanOrEqual(240);
    }
  });

  // FK-04: warm-held rule.
  it('FK-04 warm-held condiment: discard exactly 8 h after the 10 C crossing, never unbounded when it crosses', () => {
    fc.assert(
      fc.property(stateArb(), timeArb(), (state, t) => {
        const v = assessFood(INDEX, {
          productId: MAYO,
          compartment: 'refrigerated',
          state,
          minutesSincePowerLoss: t,
        });
        const cross = oracleUp(state, 10);
        if (cross === null) {
          expect(v.kind).toBe('ok');
          if (v.kind === 'ok') expect(v.windowEndsAtMinute).toBeNull();
        } else if (t >= cross + 480 + TOL) {
          expect(v.kind).toBe('discard');
        } else if (t < cross + 480 - TOL) {
          expect(v.kind).toBe('ok');
        }
      }),
      { numRuns: 2000 },
    );
  });

  // FK-05: frozen flow.
  it('FK-05 frozen: ok while frozen, lookRequired once at 0 C, never ok past 40 F without a yes', () => {
    fc.assert(
      fc.property(stateArb(), timeArb(), (state, t) => {
        const v = assessFood(INDEX, {
          productId: ICE_CREAM,
          compartment: 'frozen',
          state,
          minutesSincePowerLoss: t,
        });
        const iceAt = oracleUp(state, 0);
        const fortyAt = oracleUp(state, 4.4);
        if (iceAt === null || t < iceAt - TOL) expect(v.kind).toBe('ok');
        else if (t > iceAt + TOL) expect(v.kind).toBe('lookRequired');
        if (fortyAt !== null && t > fortyAt + TOL) expect(v.kind).not.toBe('ok');
      }),
      { numRuns: 2000 },
    );
  });

  it('FK-05b a "present" answer gives ok; an "absent" answer past 40 F gives discard', () => {
    // Freezer starting at -18 C, 3000 minutes in: past 0 C, check against 4.4 C.
    const iceAt = oracleUp(FREEZER, 0) as number;
    const fortyAt = oracleUp(FREEZER, 4.4) as number;
    const present = assessFood(INDEX, {
      productId: ICE_CREAM,
      compartment: 'frozen',
      state: FREEZER,
      minutesSincePowerLoss: fortyAt + 10,
      iceCrystals: 'present',
    });
    expect(present.kind).toBe('ok');
    const absentLate = assessFood(INDEX, {
      productId: ICE_CREAM,
      compartment: 'frozen',
      state: FREEZER,
      minutesSincePowerLoss: fortyAt + 10,
      iceCrystals: 'absent',
    });
    expect(absentLate.kind).toBe('discard');
    const absentEarly = assessFood(INDEX, {
      productId: ICE_CREAM,
      compartment: 'frozen',
      state: FREEZER,
      minutesSincePowerLoss: (iceAt + fortyAt) / 2,
      iceCrystals: 'absent',
    });
    expect(absentEarly.kind).toBe('ok');
  });

  it('FK-05c items USDA says do not need freezing stay ok in the freezer; others do not', () => {
    const t = (oracleUp(FREEZER, 4.4) as number) + 100;
    const butter = assessFood(INDEX, {
      productId: BUTTER,
      compartment: 'frozen',
      state: FREEZER,
      minutesSincePowerLoss: t,
    });
    expect(butter.kind).toBe('ok');
    // Whole produce is safe unrefrigerated but is not on USDA's "does not need freezing" list.
    const apples = assessFood(INDEX, {
      productId: APPLES,
      compartment: 'frozen',
      state: FREEZER,
      minutesSincePowerLoss: t,
    });
    expect(apples.kind).toBe('lookRequired');
  });

  // FK-06: no resurrection without a user answer.
  it('FK-06 once a verdict leaves ok it does not return, as time increases', () => {
    const ids = [CHICKEN, MAYO, ICE_CREAM, MILK, APPLES];
    fc.assert(
      fc.property(
        stateArb(),
        fc.constantFrom('refrigerated', 'frozen') as fc.Arbitrary<'refrigerated' | 'frozen'>,
        fc.array(timeArb(), { minLength: 2, maxLength: 12 }),
        (state, compartment, times) => {
          const sorted = [...times].sort((a, b) => a - b);
          for (const productId of ids) {
            let left = false;
            for (const t of sorted) {
              const v = assessFood(INDEX, {
                productId,
                compartment,
                state,
                minutesSincePowerLoss: t,
              });
              if (!isOk(v)) left = true;
              else expect(left).toBe(false);
            }
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  // FK-07: search.
  it('FK-07 empty and whitespace queries return nothing', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[ \t\n.,;:!?-]*$/), (q) => {
        expect(searchFood(INDEX, q)).toEqual([]);
      }),
    );
  });

  it('FK-07b results exist in the index, respect the limit and are deterministic', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 12 }), fc.integer({ min: 0, max: 15 }), (q, limit) => {
        const a = searchFood(INDEX, q, limit);
        const b = searchFood(INDEX, q, limit);
        expect(a.map((x) => x.product.id)).toEqual(b.map((x) => x.product.id));
        expect(a.length).toBeLessThanOrEqual(limit);
        for (const r of a) expect(INDEX.products).toContain(r);
      }),
    );
  });

  it('FK-07c the order of the snapshot does not change the ranked result', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('chicken', 'milk', 'egg', 'berr', 'apple', 'ice', 'poultry', 'jam'),
        fc.shuffledSubarray([...SNAPSHOT.products], { minLength: SNAPSHOT.products.length }),
        (q, shuffled) => {
          const other = buildFoodIndex({ ...SNAPSHOT, products: shuffled }, RULES);
          expect(searchFood(other, q).map((x) => x.product.id)).toEqual(
            searchFood(INDEX, q).map((x) => x.product.id),
          );
        },
      ),
    );
  });

  it('FK-07d finds foods by name, plural, and keyword', () => {
    expect(searchFood(INDEX, 'chicken')[0]?.product.id).toBe(CHICKEN);
    expect(searchFood(INDEX, 'eggs')[0]?.product.id).toBe(8);
    expect(searchFood(INDEX, 'strawberry').map((x) => x.product.id)).toContain(9);
  });

  // FK-08: unknown is first-class.
  it('FK-08 unknown product, bad time, or bad state yields unknown, never a verdict', () => {
    const base = { compartment: 'refrigerated' as const, state: FRIDGE, minutesSincePowerLoss: 10 };
    expect(assessFood(INDEX, { ...base, productId: 99999 }).kind).toBe('unknown');
    for (const t of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        assessFood(INDEX, { ...base, productId: CHICKEN, minutesSincePowerLoss: t }).kind,
      ).toBe('unknown');
    }
    expect(
      assessFood(INDEX, { ...base, productId: CHICKEN, state: { ...FRIDGE, tauMinutes: 0 } }).kind,
    ).toBe('unknown');
    expect(
      assessFood(INDEX, { ...base, productId: CHICKEN, state: { ...FRIDGE, startC: Number.NaN } })
        .kind,
    ).toBe('unknown');
  });

  it('FK-08b an unlisted food is treated as a perishable and says so', () => {
    const v = assessFood(INDEX, {
      productId: ICE_CREAM,
      compartment: 'refrigerated',
      state: FRIDGE,
      minutesSincePowerLoss: 10,
    });
    expect(v.kind).toBe('ok');
    if (v.kind === 'ok') {
      expect(v.listed).toBe(false);
      expect(v.windowEndsAtMinute).toBeLessThanOrEqual(240);
      expect(v.notes.join(' ')).toContain('not named');
    }
  });

  // FK-09 / FK-10: citations, versions, sensory caveat.
  it('FK-09 every non-unknown verdict is cited and versioned; FK-10 ok verdicts carry the sensory caveat', () => {
    fc.assert(
      fc.property(
        stateArb(),
        timeArb(),
        fc.constantFrom(CHICKEN, MAYO, APPLES, BUTTER, JAM, ICE_CREAM, MILK),
        fc.constantFrom('refrigerated', 'frozen') as fc.Arbitrary<'refrigerated' | 'frozen'>,
        fc.option(fc.constantFrom('present', 'absent') as fc.Arbitrary<'present' | 'absent'>, {
          nil: undefined,
        }),
        (state, t, productId, compartment, iceCrystals) => {
          const v = assessFood(INDEX, {
            productId,
            compartment,
            state,
            minutesSincePowerLoss: t,
            iceCrystals,
          });
          if (v.kind === 'unknown') return;
          expect(v.citation.source.length).toBeGreaterThan(0);
          expect(v.citation.url.startsWith('https://')).toBe(true);
          expect(v.citation.ruleId.length).toBeGreaterThan(0);
          expect(v.citation.usdaItem.length).toBeGreaterThan(0);
          expect(v.provenance.rulesVersion).toBe('test-rules-v1');
          expect(v.provenance.snapshotVersion).toBe('test-snapshot-v1');
          expect(v.provenance.thermalModelVersion.length).toBeGreaterThan(0);
          if (v.kind === 'ok') expect(v.notes).toContain(SENSORY_CAVEAT);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('FK-10b rule caveats travel with the verdict', () => {
    const v = assessFood(INDEX, {
      productId: MAYO,
      compartment: 'refrigerated',
      state: FRIDGE,
      minutesSincePowerLoss: 10,
    });
    expect(v.kind).toBe('ok');
    if (v.kind === 'ok') expect(v.notes).toContain('Opened jars only.');
  });
});
