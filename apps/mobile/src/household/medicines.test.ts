import { formulary, household } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { DISCLAIMER_TEXT, medicineText, provenanceChips, worstMedicine } from './present';
import { KEYS, createHouseholdStore, memoryStorage } from './store';

const make = (initial: Record<string, string> = {}) => {
  const storage = memoryStorage(initial);
  let n = 0;
  const store = createHouseholdStore({ storage, now: () => 1_000_000, randomId: () => `id${++n}` });
  return { storage, store };
};
const FRIDGE = { name: 'Fridge', class: 'fridge', fullness: 'full', ambientC: 28 } as const;

// A fictional validated entry through the real admission path, with a toy signature.
const entry = (() => {
  const u = {
    product: 'Zorbex',
    labelVersion: 'L1',
    condition: 'inUse' as const,
    maxTempC: 40,
    maxDays: 5,
    notes: 'fixture',
    source: {
      title: 'Fictional label',
      url: 'https://example.test/a',
      excerpt: 'fictional excerpt',
    },
    approver: 'A. Reviewer',
    approvedAt: '2026-03-01',
  };
  const f = formulary.buildFormulary(
    { formularyVersion: '1', entries: [{ ...u, signature: 'x' }] },
    () => true,
  );
  return f;
})();

describe('medicines in the household store', () => {
  it('stores only the names, and restores them after a reload', () => {
    const a = make();
    const id = a.store.addAppliance(FRIDGE);
    const mid = a.store.addMedicine(id, 'Zorbex', 'inUse');
    expect(a.store.getState().view.medicines).toEqual([
      { id: mid, applianceId: id, product: 'Zorbex', condition: 'inUse' },
    ]);
    const raw = a.storage.getItem(KEYS.events) ?? '';
    expect(raw).toContain('Zorbex');
    expect(raw).not.toMatch(/maxDays|maxTempC|labelVersion|excerpt/);
    const b = make({
      [KEYS.events]: raw,
      ...(a.storage.getItem(KEYS.epoch)
        ? { [KEYS.epoch]: a.storage.getItem(KEYS.epoch) as string }
        : {}),
    });
    expect(b.store.getState().view.medicines).toHaveLength(1);
  });

  it('removes a medicine, and clearing household data clears medicines too', () => {
    const { store } = make();
    const id = store.addAppliance(FRIDGE);
    const mid = store.addMedicine(id, 'Zorbex', 'unopened');
    store.removeMedicine(mid);
    expect(store.getState().view.medicines).toEqual([]);
    store.addMedicine(id, 'Zorbex', 'unopened');
    store.deleteAllData();
    expect(store.getState().view.medicines).toEqual([]);
  });
});

describe('medicine wording', () => {
  const setup = (withTable: boolean, outage: boolean, minutes = 600) => {
    const { store } = make();
    const id = store.addAppliance(FRIDGE);
    store.addMedicine(id, 'Zorbex', 'inUse');
    if (outage) store.startOutage(1_000_000);
    const view = store.getState().view;
    return household.assessMedicines(
      view,
      withTable ? entry : null,
      1_000_000 + (outage ? minutes * 60_000 : 0),
    );
  };

  it('no table: no clock, ask your pharmacist, no provenance, no promise', () => {
    const [a] = setup(false, true);
    expect(a?.kind).toBe('notInTable');
    const t = medicineText(a as household.MedicineAssessment);
    expect(t.label).toBe('NOT IN TABLE');
    expect(t.provenance).toBeNull();
    expect(`${t.headline} ${t.details.join(' ')}`).toMatch(/pharmacist/i);
  });

  it('power on: found, no clock yet, label shown', () => {
    const [a] = setup(true, false);
    const t = medicineText(a as household.MedicineAssessment);
    expect(t.label).toBe('NO CLOCK YET');
    expect(t.provenance?.labelVersion).toBe('L1');
  });

  it('a running clock carries provenance, the disclaimer and the in-use caveat', () => {
    const [a] = setup(true, true, 600);
    const t = medicineText(a as household.MedicineAssessment);
    expect(['CLOCK RUNNING', 'IN FRIDGE RANGE', 'ALLOWANCE USED UP', 'BEYOND LABEL']).toContain(
      t.label,
    );
    expect(t.provenance?.disclaimer).toBe(DISCLAIMER_TEXT);
    expect(provenanceChips(t.provenance as NonNullable<typeof t.provenance>).join(' ')).toMatch(
      /approved by A\. Reviewer, 2026-03-01/,
    );
    if (t.label === 'CLOCK RUNNING')
      expect(t.details.join(' ')).toMatch(/days since you first opened/);
  });

  it('every state avoids the word "safe", and the disclaimer matches the core', () => {
    expect(DISCLAIMER_TEXT).toBe(formulary.DISCLAIMER);
    for (const minutes of [0, 30, 600, 5000, 20_000]) {
      for (const withTable of [true, false]) {
        for (const a of setup(withTable, minutes > 0, minutes)) {
          const t = medicineText(a);
          expect(`${t.label} ${t.headline} ${t.details.join(' ')}`).not.toMatch(/safe/i);
        }
      }
    }
  });

  it('the worst medicine wins, and an empty list has none', () => {
    expect(worstMedicine([])).toBeNull();
    const { store } = make();
    const id = store.addAppliance(FRIDGE);
    store.addMedicine(id, 'Zorbex', 'inUse');
    store.addMedicine(id, 'Unlisted product', 'unopened');
    const list = household.assessMedicines(store.getState().view, entry, 1_000_000);
    expect(list.map((a) => a.kind).sort()).toEqual(['noOutage', 'notInTable']);
    expect(worstMedicine(list)?.text.label).toBe('NOT IN TABLE');
  });
});
