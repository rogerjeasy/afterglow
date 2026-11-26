import { events, household } from '@afterglow/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { KEYS, createHouseholdStore, memoryStorage } from '../household/store';
import { deriveLoginSecret, normaliseEmail } from './loginSecret';
import { mergeData } from './merge';

const E = household.HOUSEHOLD_EVENT;
const idOf = (e: events.AfterglowEvent): string => `${e.deviceEpoch}|${e.lamport}|${e.type}`;

/** Events written by one device: its epoch, increasing lamport, real household event types. */
const deviceEvents = (epoch: string) =>
  fc
    .array(
      fc.oneof(
        fc
          .record({
            personId: fc.constantFrom('p1', 'p2', 'p3'),
            name: fc.constantFrom('Mom', 'Paulo'),
            slot: fc.nat({ max: 63 }),
          })
          .map((p) => ({ type: E.rosterSet, p })),
        fc
          .option(fc.integer({ min: 0, max: 2_000_000_000_000 }), { nil: null })
          .map((startedAtMs) => ({ type: E.outageSet, p: { startedAtMs } })),
        fc
          .constantFrom('x1', 'x2')
          .map((applianceId) => ({ type: E.applianceRemoved, p: { applianceId } })),
      ),
      { maxLength: 15 },
    )
    .map((list): events.AfterglowEvent[] =>
      list.map((x, i) => household.householdEvent(x.type, x.p, epoch, i + 1)),
    );

const asData = (
  list: readonly events.AfterglowEvent[],
  epoch?: string,
  extra: Record<string, string> = {},
) => ({
  ...extra,
  [KEYS.events]: JSON.stringify(list),
  ...(epoch === undefined ? {} : { [KEYS.epoch]: epoch }),
});
const eventsOf = (data: Record<string, string>): events.AfterglowEvent[] =>
  JSON.parse(data[KEYS.events] ?? '[]') as events.AfterglowEvent[];

describe('Cloud accounts (app side)', () => {
  it('CA-09 the login secret is deterministic per email and passphrase, and differs across emails', async () => {
    const it = 1000; // the property is about the inputs, not the cost
    const a = await deriveLoginSecret('Ana@Example.com ', 'a long and quiet lantern', it);
    expect(a).toBe(await deriveLoginSecret('ana@example.com', 'a long and quiet lantern', it));
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toContain('lantern');
    expect(a).not.toBe(await deriveLoginSecret('bea@example.com', 'a long and quiet lantern', it));
    expect(a).not.toBe(await deriveLoginSecret('ana@example.com', 'a long and quiet lanterN', it));
    await fc.assert(
      fc.asyncProperty(
        fc.emailAddress(),
        fc.emailAddress(),
        fc.string({ minLength: 12, maxLength: 40 }),
        async (e1, e2, p) => {
          fc.pre(normaliseEmail(e1) !== normaliseEmail(e2));
          const [s1, s2] = await Promise.all([
            deriveLoginSecret(e1, p, it),
            deriveLoginSecret(e2, p, it),
          ]);
          expect(s1).not.toBe(s2);
          expect(s1).not.toBe(p);
        },
      ),
      { numRuns: 40 },
    );
  });

  it('CA-10 merging two copies keeps every event of both', () => {
    fc.assert(
      fc.property(
        deviceEvents('dev-a'),
        deviceEvents('dev-b'),
        fc.subarray([0, 1, 2, 3]),
        (mine, theirs, sharedIdx) => {
          // Some events were already shared before the two devices diverged.
          const shared = sharedIdx
            .map((i) => mine[i])
            .filter((e): e is events.AfterglowEvent => e !== undefined);
          const local = asData(mine, 'dev-a');
          const remote = asData([...shared, ...theirs], 'dev-b');
          const merged = mergeData(local, remote);
          const ids = new Set(eventsOf(merged).map(idOf));
          for (const e of [...mine, ...theirs]) expect(ids.has(idOf(e))).toBe(true);
          // No duplicates, nothing invented.
          expect(ids.size).toBe(new Set([...mine, ...theirs].map(idOf)).size);
          expect(eventsOf(merged)).toHaveLength(ids.size);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('CA-10 the merge is idempotent and its events do not depend on which side is local', () => {
    fc.assert(
      fc.property(deviceEvents('dev-a'), deviceEvents('dev-b'), (mine, theirs) => {
        const a = asData(mine, 'dev-a');
        const b = asData(theirs, 'dev-b');
        const ab = mergeData(a, b);
        expect(mergeData(ab, b)).toEqual(ab);
        const ba = mergeData(b, a);
        expect(new Set(eventsOf(ab).map(idOf))).toEqual(new Set(eventsOf(ba).map(idOf)));
        // And the household both sides would show is the same.
        const viewOf = (d: Record<string, string>) =>
          household.buildHouseholdView(events.EventLog.from(eventsOf(d)));
        expect(viewOf(ab)).toEqual(viewOf(ba));
      }),
      { numRuns: 300 },
    );
  });

  it('CA-10 each device keeps its own epoch, never the other’s', () => {
    expect(mergeData(asData([], 'dev-a'), asData([], 'dev-b'))[KEYS.epoch]).toBe('dev-a');
    // A device with no epoch yet does not inherit one; the store will make its own.
    expect(mergeData(asData([]), asData([], 'dev-b'))[KEYS.epoch]).toBeUndefined();
  });

  it('CA-10 other keys keep the local value, and malformed events are dropped, not fatal', () => {
    const merged = mergeData(
      { ...asData([], 'dev-a'), 'afterglow.seance.slot.v1': '7' },
      { [KEYS.events]: '{not json', 'afterglow.seance.slot.v1': '3', other: 'kept' },
    );
    expect(merged['afterglow.seance.slot.v1']).toBe('7');
    expect(merged.other).toBe('kept');
    expect(eventsOf(merged)).toEqual([]);
  });

  it('CA-10 people added on two devices are all there after a merge (ids never collide)', () => {
    let n = 0;
    const deviceStore = () => {
      const storage = memoryStorage();
      const store = createHouseholdStore({ storage, now: () => 1, randomId: () => `x${++n}` });
      return { storage, store };
    };
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('Mom', 'Paulo', 'Sipho', 'Mrs Dlamini'), { maxLength: 6 }),
        fc.array(fc.constantFrom('Ana', 'Bea', 'Mr Naidoo'), { maxLength: 6 }),
        (onA, onB) => {
          const a = deviceStore();
          const b = deviceStore();
          onA.forEach((name, i) => a.store.addPerson(name, i));
          onB.forEach((name, i) => b.store.addPerson(name, 10 + i));
          const dataOf = (st: ReturnType<typeof memoryStorage>) => ({
            [KEYS.events]: st.getItem(KEYS.events) ?? '[]',
            [KEYS.epoch]: st.getItem(KEYS.epoch) ?? '',
          });
          const merged = mergeData(dataOf(a.storage), dataOf(b.storage));
          const view = household.buildHouseholdView(events.EventLog.from(eventsOf(merged)));
          expect(view.roster.map((p) => p.name).sort()).toEqual([...onA, ...onB].sort());
        },
      ),
      { numRuns: 300 },
    );
  });
});
