import { fusion } from '@afterglow/core';

/**
 * The demo neighbourhood scenario for "Demo night".
 *
 * These are the sense votes the Lights-Out moment feeds into the real
 * deterministic fusion core. Nothing here decides the verdict — fuse() does,
 * exactly as it would on a phone in a real blackout.
 */

export type DemoPhase = 'powered' | 'outage';

/** Votes for the two phases of the demo. */
const VOTES: Record<DemoPhase, readonly fusion.SenseVote[]> = {
  // Mains present: the hum is audible and a lit surface flickers at 100 Hz.
  powered: [
    { sense: 'hum', direction: 'present', confidence: 0.92 },
    { sense: 'flicker', direction: 'present', confidence: 0.74 },
  ],
  // Outage: the charger dropped and the hum is gone; corroborated by the
  // crowd (14 neighbours reported absent), which exceeds k=5.
  outage: [
    { sense: 'chargingEdge', direction: 'absent', confidence: 1 },
    { sense: 'hum', direction: 'absent', confidence: 0.86 },
  ],
};

export const DEMO_K = 5;
export const DEMO_NEIGHBOURS_ABSENT = 14;

export interface ScenarioResult {
  readonly phase: DemoPhase;
  readonly verdict: fusion.MainsVerdict;
  readonly result: fusion.FusionResult;
  readonly neighboursAbsent: number;
}

/** Run a phase's votes through the real fusion core. */
export function runScenario(phase: DemoPhase): ScenarioResult {
  const context: fusion.FusionContext = {
    neighbourAbsentReports: phase === 'outage' ? DEMO_NEIGHBOURS_ABSENT : 0,
    k: DEMO_K,
  };
  const result = fusion.fuse(VOTES[phase], context);
  return {
    phase,
    verdict: result.verdict,
    result,
    neighboursAbsent: context.neighbourAbsentReports,
  };
}
