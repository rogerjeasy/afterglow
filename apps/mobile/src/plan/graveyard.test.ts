import { type events, household } from '@afterglow/core';
import { events as coreEvents } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { axisTicks, direction, nightRows, nightText, yScale } from './graveyard';

const E = household.HOUSEHOLD_EVENT;
const START = 1_700_000_000_000;

function nightOf(
  home: household.HomePayload,
  horizon?: number,
): Extract<household.GraveyardShift, { kind: 'night' }> {
  const log: events.AfterglowEvent[] = [household.householdEvent(E.homeSet, home, 'd', 1)];
  if (horizon !== undefined)
    log.push(household.householdEvent(E.horizonSet, { hours: horizon }, 'd', 2));
  const r = household.graveyardShift(
    household.buildHouseholdView(coreEvents.EventLog.from(log)),
    START,
  );
  if (r.kind !== 'night') throw new Error('expected a night');
  return r;
}

const COLD: household.HomePayload = {
  archetype: { type: 'apartment', vintage: 'pre1980', insulation: 'poor', climate: 'cold' },
  indoorC: 20,
  outdoorC: 2,
  mode: 'cold',
  thresholdC: 15,
};

describe('Graveyard Shift text', () => {
  it('GS-01 a crossing inside the night names the temperature, the time and the band', () => {
    const n = nightOf({ ...COLD, thresholdC: 10 }, 48);
    const t = nightText(n, START);
    expect(t.headline).toMatch(/^10 °C at /);
    expect(t.detail).toContain('falls to 10 °C');
    expect(t.detail).toMatch(/between .* and /);
    expect(t.sources).toContain('thermal-building-v1');
    expect(t.sources).toContain('archetype band');
  });

  it('GS-02 a crossing past the end of the axis says so and shows no time inside the night', () => {
    const n = nightOf({ ...COLD, archetype: null, indoorC: 10, outdoorC: 0, thresholdC: 1 }, 12);
    const t = nightText(n, START);
    expect(t.headline).toBe('1 °C not within this night');
    expect(t.detail).toContain('after this axis ends');
    expect(t.detail).toContain('wide band');
  });

  it('GS-03 no crossing is a plain "no headstone", with the reason', () => {
    const n = nightOf({ archetype: null, indoorC: 20, outdoorC: 18, mode: 'cold', thresholdC: 15 });
    const t = nightText(n, START);
    expect(t.headline).toBe('No headstone tonight');
    expect(t.detail).toContain('does not take your home down');
  });

  it('GS-04 heat rises to the line, and the direction is read from the curve, not the label', () => {
    const hot = nightOf({
      archetype: null,
      indoorC: 28,
      outdoorC: 40,
      mode: 'heat',
      thresholdC: 32,
    });
    expect(direction(hot)).toBe('rises');
    expect(nightText(hot, START).detail).toContain('rises to 32 °C');
    expect(direction(nightOf(COLD))).toBe('falls');
  });

  it('GS-05 the axis says when its length is a default and where to change it', () => {
    expect(nightText(nightOf(COLD), START).axis).toContain('a default. Change it under Candles');
    expect(nightText(nightOf(COLD, 8), START).axis).toContain('the length you chose');
  });

  it('GS-06 the table has a row an hour, starting now, and a range that is ordered', () => {
    const rows = nightRows(nightOf(COLD, 6), START);
    expect(rows).toHaveLength(7);
    expect(rows[0]?.time).toBe('Now');
    for (const r of rows) expect(r.range).toMatch(/ to /);
  });

  it('GS-07 the axis has exactly three labels, from now to the end of the night', () => {
    for (const h of [1, 6, 12, 24, 48]) {
      const ticks = axisTicks(nightOf(COLD, h), START);
      expect(ticks.map((t) => t.fraction)).toEqual([0, 0.5, 1]);
      expect(ticks[0]?.label).toBe('Now');
      expect(ticks[1]?.label).not.toBe(ticks[2]?.label);
    }
  });

  it('GS-08 the vertical scale holds every curve and the threshold with room to spare', () => {
    const n = nightOf(COLD, 24);
    const y = yScale(n);
    const all = [n.thresholdC, n.outdoorC, ...n.points.flatMap((p) => [p.midC, p.fastC, p.slowC])];
    for (const c of all) {
      expect(y.toFraction(c)).toBeGreaterThan(0);
      expect(y.toFraction(c)).toBeLessThan(1);
    }
  });
});
