import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { EventLog } from '../events/log.js';
import type { AfterglowEvent } from '../events/types.js';
import { MESSAGE_CODES, type MessageName } from '../heliograph/codes.js';
import { assessRoster, attributeMessage, freeSlot } from './derive.js';
import { HOUSEHOLD_EVENT, householdEvent } from './events.js';
import { buildHouseholdView } from './view.js';

const E = HOUSEHOLD_EVENT;
const ev = (type: string, payload: unknown, lamport: number, epoch = 'dev-a'): AfterglowEvent =>
  householdEvent(type as (typeof E)[keyof typeof E], payload, epoch, lamport);
const viewOf = (events: AfterglowEvent[]) =>
  buildHouseholdView(events.reduce((l, e) => l.append(e), EventLog.empty()));

const person = (id: string, name: string, slot: number) => ({ personId: id, name, slot });
const heard = (
  id: string,
  code: MessageName,
  atMs: number,
  channel: 'light' | 'sound' | 'sms' | 'ble' | 'manual' = 'light',
) => ({ personId: id, code, atMs, channel });

const OUTAGE = 1_000_000_000_000;
const NAMES = Object.keys(MESSAGE_CODES) as MessageName[];

describe('Roster properties', () => {
  // ------------------------------------------------------------------ HH-11
  it('HH-11 a member is a name and a slot, and nothing else is kept', () => {
    const v = viewOf([
      ev(
        E.rosterSet,
        { ...person('p1', 'Mrs Dlamini', 12), phone: '+27 82 000 0000', address: 'x' },
        1,
      ),
    ]);
    // `care` comes only from its own guardian event (HH-18), never from this payload.
    expect(v.roster).toEqual([
      { id: 'p1', name: 'Mrs Dlamini', slot: 12, heard: null, care: null },
    ]);
    expect(JSON.stringify(v.roster)).not.toMatch(/phone|address|27 82/);
  });

  it('HH-11 malformed roster and heard events are ignored', () => {
    const bad: unknown[] = [
      null,
      'x',
      {},
      person('', 'A', 1),
      person('p', '', 1),
      person('p', '   ', 1),
      person('p', 'x'.repeat(61), 1),
      person('p', 'a\u0000b', 1),
      person('p', 'A', -1),
      person('p', 'A', 64),
      person('p', 'A', 1.5),
      person('p', 'A', Number.NaN),
      { ...person('p', 'A', 1), slot: '1' },
    ];
    for (const [i, payload] of bad.entries()) {
      expect(viewOf([ev(E.rosterSet, payload, 1)]).roster, `roster #${i}`).toEqual([]);
    }
    const base = [ev(E.rosterSet, person('p1', 'A', 1), 1)];
    const badHeard: unknown[] = [
      null,
      {},
      heard('p1', 'NOPE' as MessageName, 5),
      heard('p1', 'toString' as MessageName, 5),
      heard('p1', 'SAFE', -1),
      heard('p1', 'SAFE', Number.NaN),
      { ...heard('p1', 'SAFE', 5), channel: 'carrier-pigeon' },
      { ...heard('p1', 'SAFE', 5), personId: '' },
    ];
    for (const [i, payload] of badHeard.entries()) {
      expect(viewOf([...base, ev(E.heard, payload, 2)]).roster[0]?.heard, `heard #${i}`).toBeNull();
    }
  });

  it('HH-11 the later of a set and a removal wins, and a removed member keeps no word', () => {
    const base = [
      ev(E.rosterSet, person('p1', 'A', 1), 1),
      ev(E.heard, heard('p1', 'SAFE', 10), 2),
    ];
    expect(viewOf([...base, ev(E.rosterRemoved, { personId: 'p1' }, 3)]).roster).toEqual([]);
    const back = viewOf([
      ...base,
      ev(E.rosterRemoved, { personId: 'p1' }, 3),
      ev(E.rosterSet, person('p1', 'A2', 2), 4),
    ]);
    expect(back.roster.map((m) => m.name)).toEqual(['A2']);
  });

  it('HH-11 the latest word is kept whatever order events arrive in', () => {
    const wordArb = fc.record({
      code: fc.constantFrom(...NAMES),
      atMs: fc.integer({ min: 0, max: 5 }),
      channel: fc.constantFrom<'light' | 'sound' | 'sms' | 'ble' | 'manual'>(
        'light',
        'sound',
        'sms',
        'ble',
        'manual',
      ),
    });
    fc.assert(
      fc.property(fc.array(wordArb, { minLength: 1, maxLength: 10 }), (words) => {
        const events = [
          ev(E.rosterSet, person('p1', 'A', 1), 0),
          ...words.map((w, i) => ev(E.heard, heard('p1', w.code, w.atMs, w.channel), i + 1)),
        ];
        const forward = viewOf(events);
        const backward = viewOf([...events].reverse());
        expect(backward).toEqual(forward);
        const latest = Math.max(...words.map((w) => w.atMs));
        expect(forward.roster[0]?.heard?.atMs).toBe(latest);
      }),
      { numRuns: 300 },
    );
  });

  // ------------------------------------------------------------------ HH-12
  it('HH-12 nobody heard from is a ghost, and a ghost is never called safe', () => {
    const v = viewOf([
      ev(E.rosterSet, person('p1', 'A', 1), 1),
      ev(E.rosterSet, person('p2', 'B', 2), 2),
    ]);
    const board = assessRoster(v);
    expect(board.map((b) => b.state)).toEqual(['ghost', 'ghost']);
    expect(board.every((b) => !b.safe)).toBe(true);
  });

  it('HH-12 word from before the outage began does not count, and word after it does', () => {
    const v = (atMs: number, code: MessageName = 'SAFE') =>
      viewOf([
        ev(E.rosterSet, person('p1', 'A', 1), 1),
        ev(E.heard, heard('p1', code, atMs), 2),
        ev(E.outageSet, { startedAtMs: OUTAGE }, 3),
      ]);
    expect(assessRoster(v(OUTAGE - 1))[0]).toMatchObject({ state: 'ghost', safe: false });
    expect(assessRoster(v(OUTAGE))[0]).toMatchObject({ state: 'heard', safe: true });
    expect(assessRoster(v(OUTAGE + 5000, 'NEED_WATER'))[0]).toMatchObject({
      state: 'heard',
      safe: false,
    });
  });

  it('HH-12 with the power on, word counts whenever it was said', () => {
    const v = viewOf([
      ev(E.rosterSet, person('p1', 'A', 1), 1),
      ev(E.heard, heard('p1', 'SAFE', 5), 2),
    ]);
    expect(assessRoster(v)[0]).toMatchObject({ state: 'heard', safe: true });
  });

  it('HH-12 help comes first, then ghosts, then everyone heard from', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            code: fc.option(fc.constantFrom(...NAMES), { nil: undefined }),
            old: fc.boolean(),
          }),
          { minLength: 1, maxLength: 12 },
        ),
        (people) => {
          const events: AfterglowEvent[] = [ev(E.outageSet, { startedAtMs: OUTAGE }, 0)];
          people.forEach((p, i) => {
            events.push(ev(E.rosterSet, person(`p${i}`, `Person ${i}`, i), 1 + i * 2));
            if (p.code)
              events.push(
                ev(E.heard, heard(`p${i}`, p.code, OUTAGE + (p.old ? -100 : 100)), 2 + i * 2),
              );
          });
          const board = assessRoster(viewOf(events));
          const rank = { help: 0, ghost: 1, heard: 2 } as const;
          for (let i = 1; i < board.length; i++) {
            expect(rank[(board[i] as { state: keyof typeof rank }).state]).toBeGreaterThanOrEqual(
              rank[(board[i - 1] as { state: keyof typeof rank }).state],
            );
          }
          for (const b of board) {
            const h = b.member.heard;
            const current = h !== null && h.atMs >= OUTAGE;
            if (b.safe) expect(current && h?.code === 'SAFE').toBe(true);
            if (b.state === 'help') expect(h?.code).toBe('HELP');
            if (!current) expect(b.state).toBe('ghost');
          }
          expect(board).toHaveLength(people.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  // ------------------------------------------------------------------ HH-13
  it('HH-13 a message is attributed only to the one member who has that slot', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 63 }), { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 0, max: 63 }),
        fc.constantFrom(...NAMES),
        (slots, slot, code) => {
          const v = viewOf(
            slots.map((s, i) => ev(E.rosterSet, person(`p${i}`, `P${i}`, s), i + 1)),
          );
          const a = attributeMessage(v, { code, slot });
          if (slots.includes(slot)) {
            expect(a.kind).toBe('known');
            if (a.kind === 'known') expect(a.member.slot).toBe(slot);
          } else expect(a).toEqual({ kind: 'unknownSlot', slot });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('HH-13 a slot shared by two people is refused, never attributed to either', () => {
    const v = viewOf([
      ev(E.rosterSet, person('p1', 'A', 7), 1),
      ev(E.rosterSet, person('p2', 'B', 7), 2),
      ev(E.rosterSet, person('p3', 'C', 8), 3),
    ]);
    expect(attributeMessage(v, { code: 'SAFE', slot: 7 })).toEqual({
      kind: 'ambiguousSlot',
      slot: 7,
      count: 2,
    });
    expect(attributeMessage(v, { code: 'SAFE', slot: 8 }).kind).toBe('known');
    // Moving one of them resolves it.
    const fixed = viewOf([
      ev(E.rosterSet, person('p1', 'A', 7), 1),
      ev(E.rosterSet, person('p2', 'B', 7), 2),
      ev(E.rosterSet, person('p2', 'B', 9), 4),
    ]);
    expect(attributeMessage(fixed, { code: 'SAFE', slot: 7 }).kind).toBe('known');
  });

  it('HH-13 the lowest free slot is offered, and none when all 64 are taken', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 63 }), { maxLength: 64 }), (used) => {
        const v = viewOf(used.map((s, i) => ev(E.rosterSet, person(`p${i}`, `P${i}`, s), i + 1)));
        const free = freeSlot(v);
        if (used.length === 64) expect(free).toBeNull();
        else {
          expect(free).not.toBeNull();
          expect(used.includes(free as number)).toBe(false);
          for (let s = 0; s < (free as number); s++) expect(used.includes(s)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
