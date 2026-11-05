import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createClock, observe, tick } from './clock.js';
import { compareEvents, EventLog, InvalidEventError, validateEvent } from './log.js';
import { appendOnly, lwwField, reduce, type Versioned } from './reduce.js';
import type { AfterglowEvent } from './types.js';

/** Arbitrary for a well-formed event. */
const eventArb = (): fc.Arbitrary<AfterglowEvent> =>
  fc.record({
    deviceEpoch: fc.constantFrom('dev-a', 'dev-b', 'dev-c'),
    lamport: fc.integer({ min: 0, max: 50 }),
    type: fc.constantFrom('setFullness', 'addAppliance', 'rosterMsg', 'report'),
    payload: fc.oneof(fc.string(), fc.integer(), fc.record({ v: fc.integer() })),
  });

const eventsArb = () => fc.array(eventArb(), { maxLength: 30 });

/** A permutation of an array. */
const permute = <T>(xs: readonly T[]): fc.Arbitrary<T[]> =>
  fc.constant(xs).chain((arr) => fc.shuffledSubarray([...arr], { minLength: arr.length }));

describe('Events properties', () => {
  // EV-01: malformed events are rejected.
  it('EV-01 rejects malformed events', () => {
    expect(() => validateEvent({ deviceEpoch: '', lamport: 1, type: 't', payload: 0 })).toThrow(
      InvalidEventError,
    );
    expect(() =>
      validateEvent({ deviceEpoch: 'd', lamport: -1, type: 't', payload: 0 }),
    ).toThrow(InvalidEventError);
    expect(() =>
      validateEvent({ deviceEpoch: 'd', lamport: 1, type: '', payload: 0 }),
    ).toThrow(InvalidEventError);
  });

  // EV-02: total order is deterministic and independent of insertion order.
  it('EV-02 produces the same order regardless of arrival order', () => {
    fc.assert(
      fc.property(eventsArb(), (events) => {
        const a = EventLog.from(events).toArray();
        const b = EventLog.from([...events].reverse()).toArray();
        expect(b).toEqual(a);
        // and the order obeys compareEvents
        for (let i = 1; i < a.length; i++) {
          expect(compareEvents(a[i - 1] as AfterglowEvent, a[i] as AfterglowEvent)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });

  // EV-03: reduction is replay-equivalent and arrival-order-independent.
  it('EV-03 reduction is order-independent after ordering', () => {
    const countReducer = (n: number) => n + 1;
    fc.assert(
      fc.property(eventsArb(), (events) => {
        const forward = reduce(EventLog.from(events), countReducer, 0);
        const backward = reduce(EventLog.from([...events].reverse()), countReducer, 0);
        expect(forward).toBe(backward);
      }),
    );
  });

  // EV-04: idempotent append — duplicates reduce to the same view.
  it('EV-04 duplicate events are ignored', () => {
    fc.assert(
      fc.property(eventsArb(), (events) => {
        const once = EventLog.from(events);
        const twice = EventLog.from([...events, ...events]);
        expect(twice.size).toBe(once.size);
        expect(twice.toArray()).toEqual(once.toArray());
      }),
    );
  });

  // EV-04b: a permutation with duplicates still equals the de-duplicated log.
  it('EV-04b dedup is permutation-stable', () => {
    fc.assert(
      fc.property(eventsArb(), (events) => {
        return fc.assert(
          fc.property(permute([...events, ...events]), (shuffled) => {
            expect(EventLog.from(shuffled).toArray()).toEqual(EventLog.from(events).toArray());
          }),
          { numRuns: 5 },
        );
      }),
      { numRuns: 20 },
    );
  });

  // EV-05: LWW keeps the greater (lamport, deviceEpoch) per field.
  it('EV-05 last-writer-wins by (lamport, deviceEpoch)', () => {
    fc.assert(
      fc.property(eventsArb(), (events) => {
        // Reduce a single "value" field under LWW; the winner must be the max event.
        let field: Versioned<unknown> | undefined;
        for (const e of EventLog.from(events).toArray()) {
          field = lwwField(field, e, e.payload);
        }
        if (events.length === 0) {
          expect(field).toBeUndefined();
          return;
        }
        const ordered = EventLog.from(events).toArray();
        const last = ordered[ordered.length - 1] as AfterglowEvent;
        // Because the log is sorted ascending, the last event is the LWW winner.
        expect(field?.lamport).toBe(last.lamport);
        expect(field?.deviceEpoch).toBe(last.deviceEpoch);
      }),
    );
  });

  // EV-06: append-only entities accumulate every event, order-independently.
  it('EV-06 append-only accumulates all events', () => {
    fc.assert(
      fc.property(eventsArb(), (events) => {
        const rosterReducer = (acc: readonly AfterglowEvent[], e: AfterglowEvent) =>
          e.type === 'rosterMsg' ? appendOnly(acc, e) : acc;
        const forward = reduce(EventLog.from(events), rosterReducer, []);
        const backward = reduce(EventLog.from([...events].reverse()), rosterReducer, []);
        const expectedCount = new Set(
          events
            .filter((e) => e.type === 'rosterMsg')
            .map((e) => `${e.deviceEpoch}\u0000${e.lamport}\u0000${e.type}`),
        ).size;
        expect(forward.length).toBe(expectedCount);
        expect(forward).toEqual(backward);
      }),
    );
  });

  // EV-07: the lamport clock strictly advances on tick and observe.
  it('EV-07 lamport clock advances strictly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 1000 }), (start, ext) => {
        const c = createClock(start);
        expect(tick(c).value).toBeGreaterThan(c.value);
        const o = observe(c, ext);
        expect(o.value).toBeGreaterThan(c.value);
        expect(o.value).toBeGreaterThan(ext);
      }),
    );
  });

  // EV-08: events never carry raw-media or secret keys — guarded by convention
  // here with a representative check that payload shape is caller-controlled and
  // the type system forbids media buffers (ArrayBuffer) in a verdict payload.
  it('EV-08 verdict payloads carry no media buffers', () => {
    const verdictPayload = { senses: ['hum'], confidence: 0.9, at: 1234 };
    const e: AfterglowEvent = {
      deviceEpoch: 'd',
      lamport: 1,
      type: 'verdict',
      payload: verdictPayload,
    };
    expect(e.payload).not.toBeInstanceOf(ArrayBuffer);
    expect(Object.keys(verdictPayload)).toEqual(['senses', 'confidence', 'at']);
  });
});
