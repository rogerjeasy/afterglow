/**
 * The closed label of a source control (night-shell NS-13). The working of every
 * number sits one tap away, but a default is never hidden behind that tap
 * (fail-closed.md rule 6): if any source is a default, the closed label says so.
 */

export const SOURCES_LABEL = 'How I know';

/** A source label that names a default ("defaults: room 22 °C", "default: 12 h", "default band"). */
export function isDefaultSource(label: string): boolean {
  return /\bdefaults?\b/i.test(label);
}

export interface SourcesSummary {
  readonly label: string;
  readonly usesDefaults: boolean;
}

export function sourcesSummary(labels: readonly string[]): SourcesSummary {
  const usesDefaults = labels.some(isDefaultSource);
  return {
    label: usesDefaults ? `${SOURCES_LABEL} · uses defaults` : SOURCES_LABEL,
    usesDefaults,
  };
}
