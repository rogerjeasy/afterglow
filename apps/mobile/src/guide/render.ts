import type { FactKey, TourStep } from './script';

/**
 * Fills a line from facts (guide spec GD-01). A slot shows its fact exactly as
 * given: nothing is rounded, converted or recomputed here. If any slot has no
 * fact, the whole line falls back, so Wisp never says half a sentence or a
 * number that the core did not produce.
 */

export type TourFacts = Partial<Record<FactKey, string>>;

const SLOT = /\{(\w+)\}/g;

/** The slot names a template uses, in order. */
export function slotsOf(template: string): string[] {
  return [...template.matchAll(SLOT)].map((m) => m[1] as string);
}

export interface RenderedLine {
  readonly text: string;
  /** False when the fallback was used. */
  readonly filled: boolean;
}

export function renderLine(step: TourStep, facts: TourFacts): RenderedLine {
  const slots = slotsOf(step.line);
  const missing = slots.some((s) => {
    const v = facts[s as FactKey];
    return v === undefined || v.trim() === '';
  });
  if (missing) return { text: step.fallback, filled: false };
  return {
    text: step.line.replace(SLOT, (_, name: string) => facts[name as FactKey] as string),
    filled: true,
  };
}

/** The longest a fact may be for GD-08 to hold. Facts are clock times, durations and counts. */
export const MAX_FACT_LENGTH = 24;
