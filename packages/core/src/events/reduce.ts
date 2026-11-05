import type { EventLog } from './log.js';
import type { AfterglowEvent, Reducer } from './types.js';

/**
 * Reduce an ordered log into a view (EV-03). Pure: depends only on the log's
 * ordered events and the reducer. Replaying the same log reproduces the same
 * view; arrival order does not matter because the log is already ordered.
 */
export function reduce<TState>(log: EventLog, reducer: Reducer<TState>, initial: TState): TState {
  let state = initial;
  for (const event of log.toArray()) {
    state = reducer(state, event);
  }
  return state;
}

/**
 * A field set by an event, carrying the logical timestamp that produced it, so
 * last-writer-wins can be decided deterministically (EV-05).
 */
export interface Versioned<T> {
  readonly value: T;
  readonly lamport: number;
  readonly deviceEpoch: string;
}

/**
 * Decide last-writer-wins between an incumbent versioned field and a candidate
 * event value (EV-05). The greater `(lamport, deviceEpoch)` wins. Ties on both
 * (impossible for a single device by EV-07, possible only for identical events
 * which dedup removes) keep the incumbent.
 */
export function lwwField<T>(
  incumbent: Versioned<T> | undefined,
  event: AfterglowEvent,
  value: T,
): Versioned<T> {
  const candidate: Versioned<T> = {
    value,
    lamport: event.lamport,
    deviceEpoch: event.deviceEpoch,
  };
  if (incumbent === undefined) return candidate;
  if (candidate.lamport > incumbent.lamport) return candidate;
  if (candidate.lamport < incumbent.lamport) return incumbent;
  // equal lamport: break by deviceEpoch (greater wins), else keep incumbent
  return candidate.deviceEpoch > incumbent.deviceEpoch ? candidate : incumbent;
}

/**
 * Accumulate an append-only entry (EV-06): never applies LWW, always keeps all
 * entries. Returned array is a new array (no mutation).
 */
export function appendOnly<T>(current: readonly T[], entry: T): readonly T[] {
  return [...current, entry];
}
