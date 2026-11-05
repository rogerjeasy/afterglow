/**
 * Event-sourcing types for the Afterglow local store.
 *
 * Everything that persists is an append-only event; views are pure reductions
 * over the ordered log (architecture §4.5). No I/O lives here.
 */

/** A per-device rotating identifier. Not a stable identity (privacy). */
export type DeviceEpoch = string;

/**
 * An immutable event.
 *
 * Identity is `(deviceEpoch, lamport, type)` (EV-04). `payload` carries no raw
 * media and no secrets (EV-08). `modelVersion` records which model produced a
 * value, when one did, so decisions can be replayed.
 */
export interface AfterglowEvent<TType extends string = string, TPayload = unknown> {
  readonly deviceEpoch: DeviceEpoch;
  /** Monotonic logical clock per device; strictly increasing (EV-07). */
  readonly lamport: number;
  readonly type: TType;
  readonly payload: TPayload;
  readonly modelVersion?: string;
}

/** The stable identity string for dedup (EV-04). */
export type EventId = string;

export function eventId(event: AfterglowEvent): EventId {
  return `${event.deviceEpoch}\u0000${event.lamport}\u0000${event.type}`;
}

/** A pure reducer folding an event into a view (EV-03). */
export type Reducer<TState> = (state: TState, event: AfterglowEvent) => TState;
