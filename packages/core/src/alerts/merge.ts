import { type Alert, PRIORITY_RANK } from './types.js';

/**
 * One alert per key, however many channels reported it (AL-02), in a fixed order
 * (AL-07). Merging keeps the earliest start, the most urgent priority, the
 * union of sources sorted, and the representative fields of the earliest report
 * (ties broken by a canonical comparison), so the result does not depend on the
 * order the reports arrived in.
 */

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A total order on alerts, used both to pick a representative and to sort. */
export function compareAlerts(a: Alert, b: Alert): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.sinceMs - b.sinceMs ||
    cmp(a.key, b.key) ||
    cmp(JSON.stringify(a), JSON.stringify(b))
  );
}

export function mergeAlerts(...lists: readonly (readonly Alert[])[]): readonly Alert[] {
  const byKey = new Map<string, Alert[]>();
  for (const list of lists) {
    for (const a of list) {
      const group = byKey.get(a.key);
      if (group) group.push(a);
      else byKey.set(a.key, [a]);
    }
  }
  const merged: Alert[] = [];
  for (const group of byKey.values()) {
    const sorted = [...group].sort(compareAlerts);
    const first = sorted[0] as Alert;
    const sources = [...new Set(group.flatMap((a) => a.sources))].sort(cmp);
    merged.push({
      ...first,
      sinceMs: Math.min(...group.map((a) => a.sinceMs)),
      sources,
    });
  }
  return merged.sort(compareAlerts);
}
