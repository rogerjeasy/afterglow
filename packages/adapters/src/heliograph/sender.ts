import type { heliograph } from '@afterglow/core';

/**
 * The torch (or screen-lamp) sender. It follows `planTransmission` against an
 * absolute schedule: every boundary is `start + planned time`, never "wait this
 * long after the last one", so timer lateness cannot accumulate into clock
 * drift over a 38 s transmission (the receiver tolerates +-3%).
 */
export interface SenderDeps {
  /** A monotonic clock in ms. */
  readonly now: () => number;
  /** Resolve after about `ms` (it may be late, never early). */
  readonly wait: (ms: number) => Promise<void>;
  readonly setLit: (lit: boolean) => void;
  readonly isCancelled: () => boolean;
}

export type SendOutcome = 'done' | 'cancelled';

export async function runTransmission(
  plan: heliograph.TransmitPlan,
  deps: SenderDeps,
): Promise<SendOutcome> {
  const start = deps.now();
  let boundary = start;
  try {
    for (const run of plan.runs) {
      if (deps.isCancelled()) return 'cancelled';
      deps.setLit(run.lit);
      boundary += run.ms;
      const remaining = boundary - deps.now();
      if (remaining > 0) await deps.wait(remaining);
    }
    return deps.isCancelled() ? 'cancelled' : 'done';
  } finally {
    // Whatever happens, the lamp ends dark.
    deps.setLit(false);
  }
}
