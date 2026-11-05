import { foodkeeper } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { foodIndex } from './foodkeeper';

const idOf = (query: string): number => {
  const hit = foodkeeper.searchFood(foodIndex, query, 1)[0];
  if (!hit) throw new Error(`No FoodKeeper product for "${query}"`);
  return hit.product.id;
};
const classOf = (query: string): foodkeeper.Classification => {
  const hit = foodkeeper.searchFood(foodIndex, query, 1)[0];
  if (!hit) throw new Error(`No FoodKeeper product for "${query}"`);
  return hit.classification;
};

describe('FoodKeeper real-data conformance (FK-11)', () => {
  it('FK-11 classifies all 661 USDA products', () => {
    expect(foodIndex.products).toHaveLength(661);
    for (const p of foodIndex.products) {
      expect(p.classification.class).toBeDefined();
      expect(p.classification.usdaItem.length).toBeGreaterThan(0);
    }
  });

  it('FK-11 key foods land in the classes USDA names', () => {
    expect(classOf('chicken').class).toBe('discardAfterFourHours');
    expect(classOf('milk').class).toBe('discardAfterFourHours');
    expect(classOf('eggs').class).toBe('discardAfterFourHours');
    expect(classOf('butter').class).toBe('safeNoRefrigeration');
    expect(classOf('hard cheese').class).toBe('safeNoRefrigeration');
    expect(classOf('mayonnaise').class).toBe('discardIfWarmEightHours');
    expect(classOf('ketchup').class).toBe('safeHighAcid');
  });

  it('FK-11 the safe allowlist stays small and exact (changes here need a review)', () => {
    const safe = foodIndex.products.filter(
      (p) =>
        p.classification.class === 'safeNoRefrigeration' ||
        p.classification.class === 'safeHighAcid',
    );
    // Every safe product comes from an explicit rule, never from the fallback.
    expect(safe.every((p) => p.classification.listed)).toBe(true);
    // Cut produce, sprouts and bagged greens must not slip into the safe list.
    const names = safe.map((p) => p.displayName);
    expect(names.some((n) => /bagged|bean sprouts|baby carrots/i.test(n))).toBe(false);
    // Meat, poultry, fish and dairy other than butter and hard/processed cheese are never safe.
    for (const p of safe) {
      expect([10, 12, 13, 14, 15, 17, 20, 21, 22, 25]).not.toContain(p.product.categoryId);
    }
    const dairySafe = safe.filter((p) => p.product.categoryId === 7).map((p) => p.displayName);
    for (const n of dairySafe)
      expect(n).toMatch(/^(Butter|Margarine|Cheese \((hard|parmesan|processed))/);
  });

  it('FK-11 unlisted foods are reported as unlisted, not silently safe', () => {
    const unlisted = foodIndex.products.filter((p) => !p.classification.listed);
    expect(unlisted.length).toBeGreaterThan(0);
    for (const p of unlisted) expect(p.classification.class).toBe('discardAfterFourHours');
  });

  it('FK-11 the reference fridge gives chicken about four hours, with a USDA citation', () => {
    const v = foodkeeper.assessFood(foodIndex, {
      productId: idOf('chicken'),
      compartment: 'refrigerated',
      state: { startC: 3, ambientC: 22, tauMinutes: 3136 },
      minutesSincePowerLoss: 30,
    });
    expect(v.kind).toBe('ok');
    if (v.kind === 'ok') {
      expect(v.windowEndsAtMinute).toBeGreaterThan(235);
      expect(v.windowEndsAtMinute).toBeLessThanOrEqual(240);
      expect(v.citation.url).toContain('fsis.usda.gov');
      expect(v.provenance.snapshotVersion).toBe('foodkeeper-v128');
    }
  });
});
