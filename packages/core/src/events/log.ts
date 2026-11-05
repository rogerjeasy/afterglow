import { type AfterglowEvent, type EventId, eventId } from './types.js';

/** Thrown when an event fails validation (EV-01). */
export class InvalidEventError extends Error {
  constructor(reason: string) {
    super(`Invalid event: ${reason}`);
    this.name = 'InvalidEventError';
  }
}

/** Validate an event's shape (EV-01). Throws InvalidEventError on failure. */
export function validateEvent(event: AfterglowEvent): void {
  if (typeof event.deviceEpoch !== 'string' || event.deviceEpoch.length === 0) {
    throw new InvalidEventError('deviceEpoch must be a non-empty string');
  }
  if (!Number.isInteger(event.lamport) || event.lamport < 0) {
    throw new InvalidEventError('lamport must be a non-negative integer');
  }
  if (typeof event.type !== 'string' || event.type.length === 0) {
    throw new InvalidEventError('type must be a non-empty string');
  }
  if (!('payload' in event)) {
    throw new InvalidEventError('payload is required');
  }
}

/**
 * Deterministic total order (EV-02): by lamport ascending, ties broken by
 * deviceEpoch ascending, then by type ascending for full determinism when two
 * append-only events from the same device share a lamport is impossible by
 * EV-07 but we keep the tie-break total regardless.
 */
export function compareEvents(a: AfterglowEvent, b: AfterglowEvent): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.deviceEpoch !== b.deviceEpoch) return a.deviceEpoch < b.deviceEpoch ? -1 : 1;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return 0;
}

/**
 * A stable canonical string for an entire event, including its payload, used
 * only to pick a deterministic survivor when two events share an identity but
 * differ in payload. Object keys are sorted so serialization is canonical.
 */
function canonicalString(event: AfterglowEvent): string {
  const canon = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canon);
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canon(obj[key]);
    }
    return out;
  };
  return JSON.stringify({
    deviceEpoch: event.deviceEpoch,
    lamport: event.lamport,
    type: event.type,
    modelVersion: event.modelVersion ?? null,
    payload: canon(event.payload),
  });
}

/** True when `a` sorts strictly before `b` by canonical string. */
function canonicalLess(a: AfterglowEvent, b: AfterglowEvent): boolean {
  return canonicalString(a) < canonicalString(b);
}

/**
 * An immutable, de-duplicated, totally-ordered event log (EV-01, EV-02, EV-04).
 *
 * The log never mutates in place: `append` returns a new log. Duplicate events
 * (same `(deviceEpoch, lamport, type)`) are ignored (EV-04). Events are kept in
 * sorted order so reduction is deterministic regardless of arrival order.
 */
export class EventLog {
  private readonly events: readonly AfterglowEvent[];
  private readonly ids: ReadonlySet<EventId>;

  private constructor(events: readonly AfterglowEvent[], ids: ReadonlySet<EventId>) {
    this.events = events;
    this.ids = ids;
  }

  static empty(): EventLog {
    return new EventLog([], new Set());
  }

  /** Build a log from events in any order; validates, dedups, and sorts. */
  static from(events: Iterable<AfterglowEvent>): EventLog {
    let log = EventLog.empty();
    for (const event of events) {
      log = log.append(event);
    }
    return log;
  }

  /**
   * Append one event, returning a new log. Idempotent on identity (EV-04).
   *
   * Identity is `(deviceEpoch, lamport, type)`, excluding payload. When two
   * events share an identity but carry different payloads (a corrected
   * re-send), dedup must still be order-independent (EV-03, EV-06): we keep a
   * deterministic representative chosen by canonical payload ordering, never
   * "first arrived".
   */
  append(event: AfterglowEvent): EventLog {
    validateEvent(event);
    const id = eventId(event);
    if (!this.ids.has(id)) {
      const merged = [...this.events, event].sort(compareEvents);
      const ids = new Set(this.ids);
      ids.add(id);
      return new EventLog(merged, ids);
    }
    // Identity already present: keep the deterministic representative.
    const existing = this.events.find((e) => eventId(e) === id) as AfterglowEvent;
    if (canonicalLess(event, existing)) {
      const replaced = this.events.map((e) => (eventId(e) === id ? event : e)).sort(compareEvents);
      return new EventLog(replaced, this.ids);
    }
    return this;
  }

  /** Append many events, returning a new log. */
  appendAll(events: Iterable<AfterglowEvent>): EventLog {
    let log: EventLog = this;
    for (const event of events) {
      log = log.append(event);
    }
    return log;
  }

  /** The ordered events (EV-02). */
  toArray(): readonly AfterglowEvent[] {
    return this.events;
  }

  get size(): number {
    return this.events.length;
  }

  has(event: AfterglowEvent): boolean {
    return this.ids.has(eventId(event));
  }
}
