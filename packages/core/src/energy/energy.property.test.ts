import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_USABLE_FRACTION, ENERGY_MODEL_VERSION, planEnergy } from './plan.js';
import type { EnergyLoad, EnergyStore, LoadClass, Plan, StoreKind } from './types.js';
import { whFromFuel, whFromMah } from './units.js';

// All names and numbers are arbitrary fixtures.
const CLASSES: LoadClass[] = ['medical', 'communication', 'light', 'food', 'comfort'];
const KINDS: StoreKind[] = [
  'phone',
  'powerBank',
  'laptop',
  'car',
  'homeBattery',
  'ups',
  'generator',
];

const storeArb = (id: string): fc.Arbitrary<EnergyStore> =>
  fc.record({
    id: fc.constant(id),
    name: fc.constant(`store ${id}`),
    kind: fc.constantFrom(...KINDS),
    capacityWh: fc.double({ min: 5, max: 5000, noNaN: true, noDefaultInfinity: true }),
    chargePct: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    ac: fc.boolean(),
  });
const loadArb = (id: string, stores: readonly string[]): fc.Arbitrary<EnergyLoad> =>
  fc.record({
    id: fc.constant(id),
    name: fc.constant(`load ${id}`),
    watts: fc.double({ min: 1, max: 600, noNaN: true, noDefaultInfinity: true }),
    class: fc.constantFrom(...CLASSES),
    needs: fc.constantFrom<'usb' | 'ac'>('usb', 'ac'),
    drawsFrom: fc.option(fc.constantFrom(...stores), { nil: undefined, freq: 5 }),
  });

const IDS_S = ['s1', 's2', 's3', 's4', 's5'];
const IDS_L = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6'];
const scenarioArb = fc
  .tuple(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 6 }))
  .chain(([ns, nl]) =>
    fc.record({
      stores: fc.tuple(...IDS_S.slice(0, ns).map(storeArb)),
      loads: fc.tuple(...IDS_L.slice(0, nl).map((id) => loadArb(id, IDS_S.slice(0, ns)))),
      horizonHours: fc.double({ min: 0.25, max: 48, noNaN: true, noDefaultInfinity: true }),
    }),
  );

const planOf = (
  stores: readonly EnergyStore[],
  loads: readonly EnergyLoad[],
  horizonHours: number,
): Plan => {
  const r = planEnergy({ stores, loads, horizonHours });
  if (r.kind !== 'plan') throw new Error(r.reason);
  return r.plan;
};

const rank = (c: LoadClass): number => CLASSES.indexOf(c);
const close = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

const phone: EnergyStore = {
  id: 'ph',
  name: 'Phone',
  kind: 'phone',
  capacityWh: 15,
  chargePct: 80,
  ac: false,
};
const bank: EnergyStore = {
  id: 'pb',
  name: 'Bank',
  kind: 'powerBank',
  capacityWh: 60,
  chargePct: 100,
  ac: false,
};
const inverter: EnergyStore = {
  id: 'inv',
  name: 'Inverter',
  kind: 'homeBattery',
  capacityWh: 2000,
  chargePct: 50,
  ac: true,
};
const router: EnergyLoad = {
  id: 'rt',
  name: 'Router',
  watts: 10,
  class: 'communication',
  needs: 'usb',
};
const cpap: EnergyLoad = { id: 'cp', name: 'CPAP', watts: 40, class: 'medical', needs: 'ac' };

describe('Energy planner properties', () => {
  // ------------------------------------------------------------------ EN-01
  it('EN-01 the plan is the same for any order of stores and loads', () => {
    fc.assert(
      fc.property(scenarioArb, fc.nat(), (sc, rot) => {
        const stores = [...sc.stores];
        const loads = [...sc.loads];
        const a = planEnergy({ stores, loads, horizonHours: sc.horizonHours });
        const r = rot % 7;
        const b = planEnergy({
          stores: [
            ...stores.slice(r % stores.length),
            ...stores.slice(0, r % stores.length),
          ].reverse(),
          loads: [...loads.slice(r % loads.length), ...loads.slice(0, r % loads.length)].reverse(),
          horizonHours: sc.horizonHours,
        });
        expect(b).toEqual(a);
      }),
      { numRuns: 300 },
    );
  });

  // ------------------------------------------------------------------ EN-02
  it('EN-02 no store gives more than it has, and the books balance', () => {
    fc.assert(
      fc.property(scenarioArb, (sc) => {
        const p = planOf(sc.stores, sc.loads, sc.horizonHours);
        for (const s of p.stores) {
          expect(s.usedWh).toBeGreaterThanOrEqual(-1e-9);
          expect(s.remainingWh).toBeGreaterThanOrEqual(-1e-9);
          expect(close(s.usedWh + s.remainingWh, s.usableWh)).toBe(true);
          const drawn = p.loads.flatMap((l) => l.draws).filter((d) => d.storeId === s.store.id);
          expect(
            close(
              drawn.reduce((n, d) => n + d.wh, 0),
              s.usedWh,
            ),
          ).toBe(true);
          expect(s.afterPct).toBeLessThanOrEqual(s.startPct + 1e-9);
          expect(s.afterPct).toBeGreaterThanOrEqual(-1e-9);
        }
        for (const l of p.loads) {
          expect(
            close(
              l.allocatedWh,
              l.draws.reduce((n, d) => n + d.wh, 0),
            ),
          ).toBe(true);
          expect(
            close(l.runtimeHours, Math.min(p.horizonHours, l.allocatedWh / l.load.watts)),
          ).toBe(true);
          expect(l.runtimeHours).toBeLessThanOrEqual(p.horizonHours + 1e-9);
          expect(l.allocatedWh).toBeLessThanOrEqual(l.neededWh * (1 + 1e-9));
        }
      }),
      { numRuns: 300 },
    );
  });

  it('EN-02 usable energy is capacity x charge x the usable fraction', () => {
    const p = planOf([bank], [], 8);
    expect(p.stores[0]?.usableWh).toBeCloseTo(60 * 1 * DEFAULT_USABLE_FRACTION.powerBank, 9);
    const custom = planOf([{ ...bank, usableFraction: 0.5, chargePct: 40 }], [], 8);
    expect(custom.stores[0]?.usableWh).toBeCloseTo(60 * 0.4 * 0.5, 9);
    expect(custom.stores[0]?.usableFractionIsDefault).toBe(false);
  });

  // ------------------------------------------------------------------ EN-03
  it('EN-03 removing every lower-priority load changes nothing for a higher-priority one', () => {
    fc.assert(
      fc.property(scenarioArb, fc.constantFrom(...CLASSES), (sc, cut) => {
        const full = planOf(sc.stores, sc.loads, sc.horizonHours);
        const kept = sc.loads.filter((l) => rank(l.class) <= rank(cut));
        const partial = planOf(sc.stores, kept, sc.horizonHours);
        for (const l of partial.loads) {
          const same = full.loads.find((x) => x.load.id === l.load.id);
          expect(same).toEqual(l);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('EN-03 a lamp never takes the energy a ventilator needs', () => {
    const tight: EnergyStore = {
      id: 'x',
      name: 'X',
      kind: 'powerBank',
      capacityWh: 100,
      chargePct: 100,
      ac: true,
    };
    const vent: EnergyLoad = {
      id: 'v',
      name: 'Ventilator',
      watts: 8,
      class: 'medical',
      needs: 'usb',
    };
    const lamp: EnergyLoad = { id: 'a', name: 'Lamp', watts: 8, class: 'light', needs: 'usb' };
    const p = planOf([tight], [lamp, vent], 10);
    expect(p.loads.map((l) => l.load.id)).toEqual(['v', 'a']);
    expect(p.loads[0]?.status).toBe('covered');
  });

  // ------------------------------------------------------------------ EN-04
  it('EN-04 a medical load is covered only when it runs the whole horizon', () => {
    fc.assert(
      fc.property(scenarioArb, (sc) => {
        const p = planOf(sc.stores, sc.loads, sc.horizonHours);
        for (const l of p.loads) {
          if (l.status === 'covered') {
            expect(l.runtimeHours).toBeGreaterThanOrEqual(p.horizonHours * (1 - 1e-9));
          } else {
            expect(l.runtimeHours).toBeLessThan(p.horizonHours);
            if (l.load.class === 'medical') expect(l.message).toMatch(/cannot be sustained/);
          }
          expect(['covered', 'partial', 'unsupplied']).toContain(l.status);
          expect(l.status === 'unsupplied').toBe(l.allocatedWh === 0);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('EN-04 one store carries a medical load for the whole horizon when any can', () => {
    const small: EnergyStore = {
      id: 'a',
      name: 'A',
      kind: 'ups',
      capacityWh: 100,
      chargePct: 100,
      ac: true,
    };
    const big: EnergyStore = {
      id: 'b',
      name: 'B',
      kind: 'homeBattery',
      capacityWh: 1000,
      chargePct: 100,
      ac: true,
    };
    const p = planOf([small, big], [{ ...cpap, watts: 50 }], 10);
    expect(p.loads[0]?.draws).toHaveLength(1);
    expect(p.loads[0]?.switches).toBe(0);
    expect(p.loads[0]?.status).toBe('covered');
    // The smaller store that is enough is preferred (best fit), keeping the big one for others.
    const fit = planOf([small, big], [{ ...cpap, watts: 5 }], 10);
    expect(fit.loads[0]?.draws[0]?.storeId).toBe('a');
  });

  it('EN-04 a load that no single store can carry is split, with the swaps counted', () => {
    const a: EnergyStore = {
      id: 'a',
      name: 'A',
      kind: 'powerBank',
      capacityWh: 50,
      chargePct: 100,
      ac: true,
      usableFraction: 1,
    };
    const b: EnergyStore = {
      id: 'b',
      name: 'B',
      kind: 'powerBank',
      capacityWh: 50,
      chargePct: 100,
      ac: true,
      usableFraction: 1,
    };
    const p = planOf([a, b], [{ ...cpap, watts: 10 }], 8);
    expect(p.loads[0]).toMatchObject({ status: 'covered', switches: 1 });
    expect(p.loads[0]?.message).toMatch(/moved between 2 stores/);
  });

  // ------------------------------------------------------------------ EN-05
  it('EN-05 an AC load never draws from a store without an AC outlet, and a pinned load only from its own', () => {
    fc.assert(
      fc.property(scenarioArb, (sc) => {
        const p = planOf(sc.stores, sc.loads, sc.horizonHours);
        const byId = new Map(sc.stores.map((s) => [s.id, s]));
        for (const l of p.loads) {
          for (const d of l.draws) {
            const s = byId.get(d.storeId) as EnergyStore;
            if (l.load.drawsFrom !== undefined) expect(d.storeId).toBe(l.load.drawsFrom);
            else {
              expect(s.kind).not.toBe('phone');
              if (l.load.needs === 'ac') expect(s.ac).toBe(true);
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('EN-05 a phone runs only what is tied to it', () => {
    const tied: EnergyLoad = {
      id: 'self',
      name: 'The phone itself',
      watts: 2,
      class: 'communication',
      needs: 'usb',
      drawsFrom: 'ph',
    };
    const p = planOf([phone, bank], [tied, router], 6);
    expect(p.loads.find((l) => l.load.id === 'self')?.draws.map((d) => d.storeId)).toEqual(['ph']);
    expect(p.loads.find((l) => l.load.id === 'rt')?.draws.map((d) => d.storeId)).toEqual(['pb']);
    const none = planOf([phone], [router], 6);
    expect(none.loads[0]).toMatchObject({ status: 'unsupplied' });
  });

  it('EN-05 an AC medical load with only a power bank is unsupplied, and says so', () => {
    const p = planOf([bank], [cpap], 8);
    expect(p.loads[0]).toMatchObject({ status: 'unsupplied' });
    expect(p.loads[0]?.message).toMatch(/needs an AC outlet/);
    expect(p.loads[0]?.message).toMatch(/cannot be sustained/);
  });

  it('EN-05 a load pinned to a store that is missing or excluded is unsupplied, never moved elsewhere', () => {
    const l: EnergyLoad = { ...router, drawsFrom: 'gone' };
    const p = planOf([bank, inverter], [l], 4);
    expect(p.loads[0]).toMatchObject({ status: 'unsupplied', draws: [] });
  });

  // ------------------------------------------------------------------ EN-06
  it('EN-06 bad stores and loads are left out with a reason and never defaulted', () => {
    const badStores: unknown[] = [
      { ...bank, id: 'z1', capacityWh: 0 },
      { ...bank, id: 'z2', capacityWh: Number.NaN },
      { ...bank, id: 'z3', capacityWh: Number.POSITIVE_INFINITY },
      { ...bank, id: 'z4', capacityWh: undefined },
      { ...bank, id: 'z5', chargePct: -1 },
      { ...bank, id: 'z6', chargePct: 101 },
      { ...bank, id: 'z7', kind: 'nuclear' },
      { ...bank, id: 'z8', ac: 'yes' },
      { ...bank, id: 'z9', usableFraction: 0 },
      { ...bank, id: 'za', usableFraction: 1.5 },
      { ...bank, id: '' },
      { ...bank, id: 'zb', name: '  ' },
      null,
      'x',
    ];
    const badLoads: unknown[] = [
      { ...router, id: 'y1', watts: 0 },
      { ...router, id: 'y2', watts: Number.NaN },
      { ...router, id: 'y3', watts: -5 },
      { ...router, id: 'y4', class: 'luxury' },
      { ...router, id: 'y5', needs: 'gas' },
      { ...router, id: 'y6', drawsFrom: '' },
      { ...router, id: '' },
      null,
    ];
    const p = planOf(
      [bank, ...(badStores as EnergyStore[])],
      [router, ...(badLoads as EnergyLoad[])],
      4,
    );
    expect(p.stores.map((s) => s.store.id)).toEqual(['pb']);
    expect(p.loads.map((l) => l.load.id)).toEqual(['rt']);
    expect(p.excluded).toHaveLength(badStores.length + badLoads.length);
    for (const e of p.excluded) expect(e.reason.length).toBeGreaterThan(0);
    expect(p.excluded.find((e) => e.id === 'z1')?.reason).toMatch(/capacity is not known/);
  });

  it('EN-06 a repeated id leaves out every copy', () => {
    const p = planOf([bank, { ...bank, name: 'again' }], [router, { ...router, watts: 99 }], 4);
    expect(p.stores).toHaveLength(0);
    expect(p.loads).toHaveLength(0);
    expect(p.excluded.map((e) => e.reason)).toEqual(
      expect.arrayContaining(['Two stores share this id.', 'Two loads share this id.']),
    );
  });

  it('EN-06 a horizon outside 0.25 to 168 hours, or not a number, gives no plan', () => {
    for (const h of [
      0,
      0.24,
      169,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '8',
      null,
      undefined,
    ]) {
      const r = planEnergy({ stores: [bank], loads: [router], horizonHours: h as number });
      expect(r.kind).toBe('noPlan');
    }
    for (const x of [null, undefined, 5, 'x']) {
      expect(planEnergy(x as never).kind).toBe('noPlan');
    }
  });

  it('EN-06 hostile input never throws', () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (s, l, h) => {
        const r = planEnergy({ stores: s as never, loads: l as never, horizonHours: h as number });
        expect(['plan', 'noPlan']).toContain(r.kind);
      }),
      { numRuns: 300 },
    );
  });

  // ------------------------------------------------------------------ EN-07
  it('EN-07 raising a store charge never reduces the plan total or un-covers a load', () => {
    fc.assert(
      fc.property(
        scenarioArb,
        fc.nat(),
        fc.double({ min: 0, max: 50, noNaN: true }),
        (sc, at, bump) => {
          const i = at % sc.stores.length;
          const base = planOf(sc.stores, sc.loads, sc.horizonHours);
          const more = sc.stores.map((s, k) =>
            k === i ? { ...s, chargePct: Math.min(100, s.chargePct + bump) } : s,
          );
          const next = planOf(more, sc.loads, sc.horizonHours);
          const total = (p: Plan) => p.loads.reduce((n, l) => n + l.runtimeHours, 0);
          expect(total(next)).toBeGreaterThanOrEqual(total(base) - 1e-6);
          for (const l of base.loads) {
            if (l.status === 'covered') {
              expect(next.loads.find((x) => x.load.id === l.load.id)?.status).toBe('covered');
            }
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  // ------------------------------------------------------------------ EN-08
  it('EN-08 the plan names its model and every default it used', () => {
    const p = planOf([phone, bank, { ...inverter, usableFraction: 0.7 }], [router], 8);
    expect(p.modelVersion).toBe(ENERGY_MODEL_VERSION);
    expect(p.defaultsUsed).toEqual([
      'phone: 90% of the charge counted as usable (Afterglow planning default)',
      'power bank: 85% of the charge counted as usable (Afterglow planning default)',
    ]);
    // A store whose fraction the user set is not listed as a default.
    const user = planOf([{ ...bank, usableFraction: 0.5 }], [router], 8);
    expect(user.defaultsUsed).toEqual([]);
  });

  // ------------------------------------------------------------------ EN-09
  it('EN-09 unit conversions are exact and refuse nonsense', () => {
    expect(whFromMah(10_000)).toBeCloseTo(37, 9);
    expect(whFromMah(5000, 3.85)).toBeCloseTo(19.25, 9);
    expect(whFromFuel(10, 0.5)).toBeCloseTo(20_000, 6);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '5' as never, null as never]) {
      expect(whFromMah(bad)).toBeNull();
      expect(whFromMah(1000, bad)).toBeNull();
      expect(whFromFuel(bad, 0.5)).toBeNull();
      expect(whFromFuel(5, bad)).toBeNull();
    }
  });

  // ------------------------------------------------------------------ worked example
  it('a worked night: CPAP on the inverter, a small router on the power bank, a lamp last', () => {
    const lamp: EnergyLoad = { id: 'lamp', name: 'Lamp', watts: 2, class: 'light', needs: 'usb' };
    const small: EnergyLoad = { ...router, watts: 4 }; // 40 Wh over 10 h, under the bank's 51 Wh
    const p = planOf([phone, bank, inverter], [lamp, cpap, small], 10);
    expect(p.loads.map((l) => `${l.load.id}:${l.status}`)).toEqual([
      'cp:covered',
      'rt:covered',
      'lamp:covered',
    ]);
    expect(p.loads[0]?.draws[0]?.storeId).toBe('inv');
    // USB loads spare the AC store while a USB-only store can carry them.
    expect(p.loads[1]?.draws[0]?.storeId).toBe('pb');
  });

  it('a load the bank cannot carry alone goes to the one store that can, rather than being split', () => {
    const p = planOf([bank, inverter], [router], 10); // 100 Wh over 10 h; bank has 51 Wh usable
    expect(p.loads[0]?.draws.map((d) => d.storeId)).toEqual(['inv']);
    expect(p.loads[0]?.switches).toBe(0);
  });
});
