import type { Fridge, LogEntry, Site } from './api';

/**
 * Cold-chain (product description 7.14 "cold-chain compliance", consoles BC-04): from
 * the readings staff log, each fridge's excursions outside its range — starting at the
 * first reading out of range and ending at the next reading back in range (or still
 * open) — and the generator's log. Nothing is interpolated: an excursion's length is
 * bounded by the readings that were actually taken, and the report says so.
 */

export interface Excursion {
  readonly fridgeId: string;
  readonly startMs: number;
  /** The first reading back in range, or null while it is still out. */
  readonly endMs: number | null;
  readonly worstC: number;
  readonly direction: 'warm' | 'cold';
}

export interface FridgeSummary {
  readonly fridge: Fridge;
  readonly readings: number;
  readonly minC: number | null;
  readonly maxC: number | null;
  readonly lastC: number | null;
  readonly lastAtMs: number | null;
  readonly excursions: readonly Excursion[];
}

export function summariseFridges(
  site: Site,
  entries: readonly LogEntry[],
): readonly FridgeSummary[] {
  return site.fridges.map((f) => {
    const rs = entries
      .filter(
        (e): e is Extract<LogEntry, { kind: 'reading' }> =>
          e.kind === 'reading' && e.fridgeId === f.id,
      )
      .sort((a, b) => a.atMs - b.atMs);
    const excursions: Excursion[] = [];
    let open: { startMs: number; worstC: number; direction: 'warm' | 'cold' } | null = null;
    for (const r of rs) {
      const out = r.tempC > f.maxC ? 'warm' : r.tempC < f.minC ? 'cold' : null;
      if (out) {
        if (!open) open = { startMs: r.atMs, worstC: r.tempC, direction: out };
        else
          open.worstC =
            out === 'warm' ? Math.max(open.worstC, r.tempC) : Math.min(open.worstC, r.tempC);
      } else if (open) {
        excursions.push({ fridgeId: f.id, ...open, endMs: r.atMs });
        open = null;
      }
    }
    if (open) excursions.push({ fridgeId: f.id, ...open, endMs: null });
    const temps = rs.map((r) => r.tempC);
    const last = rs[rs.length - 1];
    return {
      fridge: f,
      readings: rs.length,
      minC: temps.length ? Math.min(...temps) : null,
      maxC: temps.length ? Math.max(...temps) : null,
      lastC: last?.tempC ?? null,
      lastAtMs: last?.atMs ?? null,
      excursions,
    };
  });
}

export function generatorSummary(entries: readonly LogEntry[]): {
  readonly starts: number;
  readonly litres: number;
  readonly events: readonly Extract<LogEntry, { kind: 'generator' }>[];
} {
  const events = entries
    .filter((e): e is Extract<LogEntry, { kind: 'generator' }> => e.kind === 'generator')
    .sort((a, b) => a.atMs - b.atMs);
  return {
    starts: events.filter((e) => e.event === 'start').length,
    litres: events.reduce((s, e) => s + (e.event === 'refuel' ? (e.litres ?? 0) : 0), 0),
    events,
  };
}

const when = (ms: number): string =>
  new Date(ms).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

export function coldChainReport(
  site: Site,
  entries: readonly LogEntry[],
  days: number,
  nowMs: number,
): string {
  const lines: string[] = [];
  lines.push(`Cold-chain report: ${site.name}`);
  lines.push(`Period: the last ${days} days, to ${when(nowMs)}`);
  lines.push('');
  for (const s of summariseFridges(site, entries)) {
    lines.push(`${s.fridge.name} (safe range ${s.fridge.minC} to ${s.fridge.maxC} °C)`);
    if (s.readings === 0) {
      lines.push('- No readings logged.');
      continue;
    }
    lines.push(
      `- ${s.readings} readings, from ${s.minC} to ${s.maxC} °C; last ${s.lastC} °C at ${when(s.lastAtMs as number)}`,
    );
    if (s.excursions.length === 0) lines.push('- No excursions.');
    for (const x of s.excursions) {
      lines.push(
        `- Excursion (${x.direction === 'warm' ? 'too warm' : 'too cold'}, worst ${x.worstC} °C): from ${when(x.startMs)} ${
          x.endMs === null
            ? 'and still out of range'
            : `to ${when(x.endMs)}, at most ${Math.round((x.endMs - x.startMs) / 60_000)} minutes between readings`
        }`,
      );
    }
  }
  const g = generatorSummary(entries);
  lines.push('');
  lines.push(`Generator: ${g.starts} starts, ${g.litres} litres added`);
  for (const e of g.events) {
    lines.push(`- ${when(e.atMs)}: ${e.event}${e.litres ? ` ${e.litres} L` : ''}`);
  }
  lines.push('');
  lines.push(
    'From readings logged by staff in Afterglow Business. An excursion lasts from the first reading out of range to the first reading back in range; its true length may be shorter. Decisions on affected stock follow the product labels and your pharmacist or supervisor.',
  );
  return lines.join('\n');
}
