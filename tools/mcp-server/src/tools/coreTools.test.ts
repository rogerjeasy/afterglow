import { foodkeeper, heliograph, household, thermal } from '@afterglow/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { foodIndex, foodVerdict } from './food.js';
import { MESSAGE_NAMES, heliographEncode } from './heliograph.js';

describe('food_verdict', () => {
  it('MCP-07 the verdict is the core verdict for the top-ranked match, with its USDA citation', () => {
    const answer = foodVerdict({
      food: 'Milk (plain or flavored)',
      appliance: 'refrigerator',
      minutesWithoutPower: 300,
      roomTemperatureC: 22,
      fullness: 'full',
    });
    const index = foodIndex();
    const top = foodkeeper.searchFood(index, 'Milk (plain or flavored)', 5)[0];
    if (!top) throw new Error('milk is in the snapshot');
    const expected = foodkeeper.assessFood(index, {
      productId: top.product.id,
      compartment: 'refrigerated',
      state: thermal.compartmentFor('fridge', 'full', 22).state,
      minutesSincePowerLoss: 300,
    });
    expect(answer.matchedFood).toBe(top.displayName);
    expect(answer.verdict).toEqual(expected);
    expect(answer.verdict.kind).toBe('discard');
    if (answer.verdict.kind !== 'unknown') {
      expect(answer.verdict.citation.url).toMatch(/^https:\/\/www\.fsis\.usda\.gov\//);
      expect(answer.verdict.citation.usdaItem.length).toBeGreaterThan(0);
    }
  });

  it('MCP-07 within the window the fridge verdict is ok, and the defaults are stated', () => {
    const answer = foodVerdict({
      food: 'Milk (plain or flavored)',
      appliance: 'refrigerator',
      minutesWithoutPower: 60,
    });
    expect(answer.verdict.kind).toBe('ok');
    expect(answer.assumptions.join(' ')).toContain(`${household.DEFAULT_AMBIENT_C} C`);
    expect(answer.assumptions.join(' ')).toContain('half');
  });

  it('MCP-07 a food that is not in the list gets exactly the core unknown verdict', () => {
    const answer = foodVerdict({
      food: 'zzqx unicorn steak',
      appliance: 'freezer',
      minutesWithoutPower: 30,
    });
    expect(answer.matchedFood).toBeNull();
    expect(answer.verdict).toEqual(
      foodkeeper.assessFood(foodIndex(), {
        productId: -1,
        compartment: 'frozen',
        state: thermal.compartmentFor('freezer', 'half', household.DEFAULT_AMBIENT_C).state,
        minutesSincePowerLoss: 30,
      }),
    );
    expect(answer.verdict).toMatchObject({
      kind: 'unknown',
      reason: 'This food is not in the USDA FoodKeeper list.',
    });
  });

  it('MCP-07 a food USDA does not name is treated as perishable, flagged listed: false', () => {
    const index = foodIndex();
    const unlisted = index.products.find((p) => !p.classification.listed);
    if (!unlisted) throw new Error('the snapshot has unlisted foods');
    const answer = foodVerdict({
      food: unlisted.displayName,
      appliance: 'refrigerator',
      minutesWithoutPower: 10,
    });
    if (answer.verdict.kind === 'unknown') throw new Error('expected a verdict');
    expect(answer.verdict.listed).toBe(false);
    expect(answer.verdict.notes.join(' ')).toContain('treated like a perishable');
  });

  it('MCP-07 a negative time is unknown, never a confident answer', () => {
    const answer = foodVerdict({
      food: 'milk',
      appliance: 'refrigerator',
      minutesWithoutPower: -5,
    });
    expect(answer.verdict.kind).toBe('unknown');
  });
});

describe('heliograph_encode', () => {
  it('MCP-08 property: the frame is the core frame and decodes back to the same message', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...MESSAGE_NAMES),
        fc.integer({ min: 0, max: heliograph.MAX_SLOT }),
        fc.integer({ min: 0, max: heliograph.MAX_SEQUENCE }),
        (message, slot, sequence) => {
          const a = heliographEncode({ message, slot, sequence });
          if ('refused' in a) throw new Error(a.reason);
          expect(a.frameBits).toBe(
            (heliograph.encodeFrame({ code: message, slot, sequence }) ?? []).join(''),
          );
          const decoded = heliograph.decodeCoded([...a.codedBits].map(Number));
          expect(decoded).toEqual({
            ok: true,
            message: { code: message, slot, sequence },
            correctedWords: 0,
          });
        },
      ),
    );
  });

  it('MCP-08 both profiles are planned: 38.4 s standard and 19.2 s fast for three repeats', () => {
    const a = heliographEncode({ message: 'HELP', slot: 5 });
    if ('refused' in a) throw new Error(a.reason);
    expect(a.frameBits).toHaveLength(heliograph.FRAME_BITS);
    expect(a.plans.map((p) => [p.profile, p.totalMs, p.repeats])).toEqual([
      ['standard', 38400, 3],
      ['fast', 19200, 3],
    ]);
  });

  it('MCP-08 an invalid message, slot, sequence or repeat count is refused', () => {
    expect('refused' in heliographEncode({ message: 'toString', slot: 1 })).toBe(true);
    expect('refused' in heliographEncode({ message: 'HELP', slot: 64 })).toBe(true);
    expect('refused' in heliographEncode({ message: 'HELP', slot: 1, sequence: 4 })).toBe(true);
    expect('refused' in heliographEncode({ message: 'HELP', slot: 1, repeats: 6 })).toBe(true);
  });
});
