import { coguard, energy } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import {
  CLASS_LABEL,
  KIND_LABEL,
  STATUS_LABEL,
  checkLine,
  drawText,
  hoursText,
  parsePositive,
  validUntil,
  whText,
} from './present';

const plan = (): energy.Plan => {
  const r = energy.planEnergy({
    stores: [
      { id: 'a', name: 'Power bank', kind: 'powerBank', capacityWh: 40, chargePct: 100, ac: false },
      {
        id: 'b',
        name: 'Inverter',
        kind: 'homeBattery',
        capacityWh: 1000,
        chargePct: 100,
        ac: true,
      },
    ],
    loads: [{ id: 'l', name: 'Router', watts: 4, class: 'communication', needs: 'usb' }],
    horizonHours: 8,
  });
  if (r.kind !== 'plan') throw new Error('no plan');
  return r.plan;
};

describe('plan wording', () => {
  it('hours and energy keep their units and never overstate', () => {
    expect(hoursText(6.54)).toBe('6.5 h');
    expect(hoursText(0)).toBe('0 h');
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY])
      expect(hoursText(bad)).toBe('0 h');
    expect(whText(450)).toBe('450 Wh');
    expect(whText(2400)).toBe('2.4 kWh');
    expect(whText(Number.NaN)).toBe('0 Wh');
  });

  it('every status, kind and class has a label, and there is one per core value', () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual(['covered', 'partial', 'unsupplied']);
    expect(Object.keys(KIND_LABEL).sort()).toEqual(
      Object.keys(energy.DEFAULT_USABLE_FRACTION).sort(),
    );
    expect(Object.keys(CLASS_LABEL)).toHaveLength(5);
  });

  it('where a load draws from is told in order, with a swap shown', () => {
    const p = plan();
    const names = new Map(p.stores.map((s) => [s.store.id, s.store.name]));
    expect(drawText(p.loads[0] as energy.LoadOutcome, names)).toBe('Power bank');
    expect(drawText({ ...(p.loads[0] as energy.LoadOutcome), draws: [] }, names)).toBe('No store');
    const two = {
      ...(p.loads[0] as energy.LoadOutcome),
      draws: [
        { storeId: 'a', wh: 1 },
        { storeId: 'b', wh: 1 },
      ],
    };
    expect(drawText(two, names)).toBe('Power bank, then Inverter');
  });

  it('the ward lines say what is confirmed, what to do, and what is not allowed', () => {
    const now = 1_800_000_000_000;
    const r = coguard.assessWard(
      { outdoors: { answer: 'yes', atMs: now }, distance: { answer: 'no', atMs: now } },
      now + 1000,
    );
    const lines = r.checks.map(checkLine);
    expect(lines[0]).toMatchObject({ label: 'CONFIRMED', loud: false });
    expect(lines[1]).toMatchObject({ label: 'NOT ALLOWED', loud: true });
    expect(lines[1]?.detail).toMatch(/Do not run the generator like this/);
    expect(lines[2]).toMatchObject({ label: 'TO DO', loud: false });
    for (const l of lines) expect(`${l.label} ${l.detail}`).not.toMatch(/safe/i);
  });

  it('the time an open ward stays current is the oldest answer plus six hours', () => {
    expect(validUntil({}, coguard.MAX_AGE_MS)).toBeNull();
    const t = 1_800_000_000_000;
    const a = validUntil({ x: { atMs: t }, y: { atMs: t + 3_600_000 } }, coguard.MAX_AGE_MS);
    const b = validUntil({ x: { atMs: t } }, coguard.MAX_AGE_MS);
    expect(a).toBe(b);
  });

  it('typed numbers must be plain positive numbers', () => {
    expect(parsePositive('60')).toBe(60);
    expect(parsePositive(' 12.5 ')).toBe(12.5);
    expect(parsePositive('12,5')).toBe(12.5);
    for (const bad of [
      '',
      ' ',
      '0',
      '-3',
      'abc',
      '1e3',
      '1.2.3',
      '5 W',
      'NaN',
      'Infinity',
      '0.0',
    ]) {
      expect(parsePositive(bad), bad).toBeNull();
    }
  });
});
