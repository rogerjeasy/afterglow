/**
 * Lamport logical clock (EV-07). Pure: each operation returns a new clock value
 * rather than mutating, so it is safe to use in reducers and tests.
 */

export interface LamportClock {
  readonly value: number;
}

export function createClock(value = 0): LamportClock {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Lamport clock must start at a non-negative integer, got ${value}`);
  }
  return { value };
}

/** Advance the clock to issue a new local event: strictly greater than any seen. */
export function tick(clock: LamportClock): LamportClock {
  return { value: clock.value + 1 };
}

/**
 * Merge an observed external lamport into the clock, then tick: the result is
 * strictly greater than both the local and the observed value.
 */
export function observe(clock: LamportClock, externalLamport: number): LamportClock {
  if (!Number.isInteger(externalLamport) || externalLamport < 0) {
    throw new Error(`Observed lamport must be a non-negative integer, got ${externalLamport}`);
  }
  return { value: Math.max(clock.value, externalLamport) + 1 };
}
