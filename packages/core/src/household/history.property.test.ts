import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AfterglowEvent } from '../events/types.js';
import { HOUSEHOLD_EVENT as E } from './events.js';
import { type OutageReport, historySummary, outageReports } from './history.js';

/**
 * Outage history and the per-event report (.kiro/specs/history-reports HR-01..HR-04):
 * derived only from the household's own log, in log order, so every device that holds
 * the same events shows the same history; nothing is estimated.
 */

const T0 = Date.UTC(2026, 10, 27, 18, 0, 0);
const MIN = 60_000;

type Step =
  | { readonly k: 'start'; readonly dt: number }
  | { readonly k: 'end'; readonly dt: number; readonly recorded: boolean }
  | { readonly k: 'door'; readonly dt: number; readonly minutes: number }
  | { readonly k: 'heard'; readonly dt: number; readonly code: 'SAFE' | 'HELP' }
  | {
      readonly k: 'remove';
      readonly dt: number;
      readonly reason: 'discarded' | 'used' | null;
      readonly timed: boolean;
    }
  | { readonly k: 'charge'; readonly dt: number; readonly pct: number }
  | { readonly k: 'check'; readonly dt: number; readonly answer: 'yes' | 'no' | 'unknown' };

const dtArb = fc.integer({ min: 0, max: 240 });
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { arbitrary: fc.record({ k: fc.constant('start' as const), dt: dtArb }), weight: 3 },
  {
    arbitrary: fc.record({ k: fc.constant('end' as const), dt: dtArb, recorded: fc.boolean() }),
    weight: 3,
  },
  fc.record({
    k: fc.constant('door' as const),
    dt: dtArb,
    minutes: fc.integer({ min: 0, max: 240 }),
  }),
  fc.record({
    k: fc.constant('heard' as const),
    dt: dtArb,
    code: fc.constantFrom('SAFE' as const, 'HELP' as const),
  }),
  fc.record({
    k: fc.constant('remove' as const),
    dt: dtArb,
    reason: fc.constantFrom('discarded' as const, 'used' as const, null),
    timed: fc.boolean(),
  }),
  fc.record({
    k: fc.constant('charge' as const),
    dt: dtArb,
    pct: fc.integer({ min: 0, max: 100 }),
  }),
  fc.record({
    k: fc.constant('check' as const),
    dt: dtArb,
    answer: fc.constantFrom('yes' as const, 'no' as const, 'unknown' as const),
  }),
);

interface Expected {
  startMs: number;
  endMs: number | null;
  ongoing: boolean;
  doors: number[];
  heard: string[];
  removals: { reason: string | null; atMs: number | null }[];
  checks: string[];
}

/** Build a log from the steps (two devices, interleaved) and what each outage must contain. */
function build(steps: readonly Step[]) {
  const events: AfterglowEvent[] = [];
  let lamport = 0;
  const ev = (type: string, payload: unknown) =>
    events.push({
      deviceEpoch: lamport % 2 ? 'device-b' : 'device-a',
      lamport: lamport++,
      type,
      payload,
    });
  ev(E.applianceSet, {
    applianceId: 'fridge-1',
    name: 'Kitchen fridge',
    class: 'fridge',
    fullness: 'full',
    ambientC: null,
  });
  ev(E.rosterSet, { personId: 'p1', name: 'Ana', slot: 1 });
  ev(E.energyStoreSet, {
    storeId: 's1',
    name: 'Power bank',
    kind: 'powerBank',
    capacityWh: 100,
    chargePct: 100,
    ac: false,
  });
  const expected: Expected[] = [];
  let open: Expected | null = null;
  let t = T0;
  let item = 0;
  for (const s of steps) {
    t += s.dt * MIN;
    if (s.k === 'start') {
      ev(E.outageSet, { startedAtMs: t });
      if (open) open.startMs = t;
      else {
        open = {
          startMs: t,
          endMs: null,
          ongoing: false,
          doors: [],
          heard: [],
          removals: [],
          checks: [],
        };
        expected.push(open);
      }
    } else if (s.k === 'end') {
      ev(E.outageSet, s.recorded ? { startedAtMs: null, endedAtMs: t } : { startedAtMs: null });
      if (open) open.endMs = s.recorded ? t : null;
      open = null;
    } else if (s.k === 'door') {
      ev(E.doorOpened, { applianceId: 'fridge-1', openMinutes: s.minutes, atMs: t });
      open?.doors.push(t);
    } else if (s.k === 'heard') {
      ev(E.heard, { personId: 'p1', code: s.code, atMs: t, channel: 'light' });
      open?.heard.push(s.code);
    } else if (s.k === 'remove') {
      const itemId = `item-${item++}`;
      ev(E.itemAdded, { itemId, applianceId: 'fridge-1', productId: 1 });
      ev(E.itemRemoved, {
        itemId,
        ...(s.timed ? { atMs: t } : {}),
        ...(s.reason ? { reason: s.reason } : {}),
      });
      open?.removals.push({ reason: s.reason, atMs: s.timed ? t : null });
    } else if (s.k === 'charge') {
      ev(E.energyStoreSet, {
        storeId: 's1',
        name: 'Power bank',
        kind: 'powerBank',
        capacityWh: 100,
        chargePct: s.pct,
        ac: false,
      });
    } else {
      ev(E.wardAnswered, { check: 'outdoors', answer: s.answer, atMs: t });
      open?.checks.push(s.answer);
    }
  }
  if (open) open.ongoing = true;
  return { events, expected, nowMs: t + 5 * MIN };
}

const shuffled = <T>(xs: readonly T[], seed: number): T[] => {
  const out = [...xs];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
};

describe('History reports (HR-01..HR-04)', () => {
  it('HR-01 every device holding the same events, in any arrival order, shows the same history', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), fc.integer(), (steps, seed) => {
        const { events, nowMs } = build(steps);
        expect(outageReports(shuffled(events, seed), nowMs)).toEqual(outageReports(events, nowMs));
      }),
    );
  });

  it('HR-01 an event belongs to the outage it was logged in, and to no other', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        const { events, expected, nowMs } = build(steps);
        const got = outageReports(events, nowMs);
        expect(got).toHaveLength(expected.length);
        const byStart = [...expected].sort((a, b) => b.startMs - a.startMs);
        for (const [i, r] of got.entries()) {
          const e = byStart[i] as Expected;
          expect(r.startMs).toBe(e.startMs);
          expect(r.doors.map((d) => d.atMs)).toEqual(e.doors);
          expect(r.heard.map((h) => h.code)).toEqual(e.heard);
          expect(r.checks.map((c) => c.answer)).toEqual(e.checks);
          expect(r.doors.every((d) => d.appliance === 'Kitchen fridge')).toBe(true);
          expect(r.heard.every((h) => h.person === 'Ana' && h.channel === 'light')).toBe(true);
        }
      }),
    );
  });

  it('HR-02 a recorded end gives the end and the duration; an older log without it says unknown, never an estimate', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        const { events, expected, nowMs } = build(steps);
        const got = outageReports(events, nowMs);
        const byStart = [...expected].sort((a, b) => b.startMs - a.startMs);
        for (const [i, r] of got.entries()) {
          const e = byStart[i] as Expected;
          expect(r.ongoing).toBe(e.ongoing);
          expect(r.endMs).toBe(e.ongoing ? null : e.endMs);
          if (r.ongoing)
            expect(r.durationMinutes).toBe(Math.max(0, Math.round((nowMs - r.startMs) / MIN)));
          else if (r.endMs === null) expect(r.durationMinutes).toBeNull();
          else expect(r.durationMinutes).toBe(Math.max(0, Math.round((r.endMs - r.startMs) / MIN)));
        }
        const sum = historySummary(got);
        const known = got.map((r) => r.durationMinutes).filter((m): m is number => m !== null);
        expect(sum.count).toBe(got.length);
        expect(sum.knownMinutes).toBe(known.reduce((a, b) => a + b, 0));
        expect(sum.longestMinutes).toBe(known.length ? Math.max(...known) : null);
      }),
    );
  });

  it('HR-03 a removal during an outage carries its time and reason when the log has them, null when not', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        const { events, expected, nowMs } = build(steps);
        const got = outageReports(events, nowMs);
        const byStart = [...expected].sort((a, b) => b.startMs - a.startMs);
        for (const [i, r] of got.entries()) {
          expect(r.removals.map((x) => ({ reason: x.reason, atMs: x.atMs }))).toEqual(
            byStart[i]?.removals,
          );
          for (const x of r.removals)
            expect(x).toMatchObject({ kind: 'food', productId: 1, appliance: 'Kitchen fridge' });
        }
      }),
    );
  });

  it('HR-04 energy drawn is from the charge at the start to the latest, only for stores updated during the outage', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 6 }),
        fc.integer({ min: 1, max: 5000 }),
        (atStart, updates, cap) => {
          const events: AfterglowEvent[] = [];
          let lamport = 0;
          const ev = (type: string, payload: unknown) =>
            events.push({ deviceEpoch: 'd', lamport: lamport++, type, payload });
          const store = (pct: number) => ({
            storeId: 's1',
            name: 'Battery',
            kind: 'powerBank',
            capacityWh: cap,
            chargePct: pct,
            ac: false,
          });
          ev(E.energyStoreSet, store(atStart));
          ev(E.outageSet, { startedAtMs: T0 });
          for (const p of updates) ev(E.energyStoreSet, store(p));
          ev(E.outageSet, { startedAtMs: null, endedAtMs: T0 + 60 * MIN });
          const [r] = outageReports(events, T0 + 120 * MIN) as [OutageReport];
          const last = updates.at(-1) ?? atStart;
          if (last === atStart) {
            expect(r.energy).toEqual([]);
            expect(r.energyUsedWh).toBe(0);
          } else {
            const used = Math.max(0, ((atStart - last) / 100) * cap);
            expect(r.energy).toEqual([
              { store: 'Battery', fromPct: atStart, toPct: last, usedWh: used },
            ]);
            expect(r.energyUsedWh).toBe(Math.round(used));
          }
        },
      ),
    );
  });

  it('HR-04 a quiet outage reports empty sections, not invented ones', () => {
    const events: AfterglowEvent[] = [
      { deviceEpoch: 'd', lamport: 0, type: E.outageSet, payload: { startedAtMs: T0 } },
      {
        deviceEpoch: 'd',
        lamport: 1,
        type: E.outageSet,
        payload: { startedAtMs: null, endedAtMs: T0 + 90 * MIN },
      },
    ];
    expect(outageReports(events, T0 + 100 * MIN)).toEqual([
      {
        startMs: T0,
        endMs: T0 + 90 * MIN,
        ongoing: false,
        durationMinutes: 90,
        doors: [],
        heard: [],
        removals: [],
        energy: [],
        energyUsedWh: 0,
        checks: [],
      },
    ]);
  });
});
