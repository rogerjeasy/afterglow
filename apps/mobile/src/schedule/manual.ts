import { schedule } from '@afterglow/core';
import { useSyncExternalStore } from 'react';

/**
 * The manual schedule provider (product description 7.4 "a manual-schedule provider
 * for anywhere else", consoles SC-01): the windows a utility announced — on the
 * radio, a notice, a WhatsApp group — typed or pasted by the person. They are merged
 * by the core's deterministic schedule merge and kept on this phone only.
 */

export interface ManualWindow {
  readonly startMs: number;
  readonly endMs: number;
}

const KEY = 'afterglow.schedule.manual.v1';
const MIN = 60_000;
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function load(): ManualWindow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (w): w is ManualWindow =>
        typeof w === 'object' &&
        w !== null &&
        Number.isFinite(w.startMs) &&
        Number.isFinite(w.endMs) &&
        w.endMs > w.startMs,
    );
  } catch {
    return [];
  }
}

let windows: ManualWindow[] = typeof localStorage === 'undefined' ? [] : load();
const listeners = new Set<() => void>();
function save(next: ManualWindow[]): void {
  // Keep 14 days of past windows for the comparison, and at most 200 in all.
  const cutoff = Date.now() - 14 * 24 * 60 * MIN;
  windows = next
    .filter((w) => w.endMs > cutoff)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(-200);
  try {
    localStorage.setItem(KEY, JSON.stringify(windows));
  } catch {
    // private mode
  }
  for (const l of listeners) l();
}

export function useManualSchedule(): readonly ManualWindow[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => windows,
  );
}
export const addWindows = (ws: readonly ManualWindow[]): void => save([...windows, ...ws]);
export const removeWindow = (w: ManualWindow): void =>
  save(windows.filter((x) => x.startMs !== w.startMs || x.endMs !== w.endMs));
export const clearSchedule = (): void => save([]);

/**
 * Lines such as "18:00-20:30", "tomorrow 06:00-08:30", "Fri 20:00 - 22:30" or
 * "2026-11-28 04:00-06:30". A window that ends before it starts runs past midnight.
 * Returns the windows read and the lines that could not be read.
 */
export function parseSchedule(
  text: string,
  nowMs: number,
): { windows: ManualWindow[]; unread: string[] } {
  const out: ManualWindow[] = [];
  const unread: string[] = [];
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim().toLowerCase();
    if (!line) continue;
    const m = line.match(/^(.*?)(\d{1,2})[:h.](\d{2})\s*(?:-|–|to|until)\s*(\d{1,2})[:h.](\d{2})/);
    if (!m) {
      unread.push(raw.trim());
      continue;
    }
    const dayWord = (m[1] ?? '').trim().replace(/[,:]$/, '');
    const day = new Date(today);
    if (dayWord === '' || dayWord === 'today') {
      // today
    } else if (dayWord === 'tomorrow') {
      day.setDate(day.getDate() + 1);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dayWord)) {
      const [y, mo, d] = dayWord.split('-').map(Number) as [number, number, number];
      day.setFullYear(y, mo - 1, d);
    } else {
      const i = DAYS.findIndex((d) => dayWord.startsWith(d));
      if (i < 0) {
        unread.push(raw.trim());
        continue;
      }
      day.setDate(day.getDate() + ((i - day.getDay() + 7) % 7));
    }
    const [h1, m1, h2, m2] = [m[2], m[3], m[4], m[5]].map(Number) as [
      number,
      number,
      number,
      number,
    ];
    if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) {
      unread.push(raw.trim());
      continue;
    }
    const start = new Date(day);
    start.setHours(h1, m1, 0, 0);
    const end = new Date(day);
    end.setHours(h2, m2, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
    out.push({ startMs: start.getTime(), endMs: end.getTime() });
  }
  return { windows: out, unread };
}

/** The merged timeline, the window under way now (if any) and the next one. */
export function scheduleNow(ws: readonly ManualWindow[], nowMs: number) {
  const timeline = schedule.mergeSchedule(
    ws.map((w) => ({
      areaId: 'manual',
      source: 'announced (typed by you)',
      startMinute: Math.floor(w.startMs / MIN),
      endMinute: Math.ceil(w.endMs / MIN),
      fetchedAt: 0,
    })),
  );
  const minute = Math.floor(nowMs / MIN);
  const current = timeline.find((w) => w.startMinute <= minute && minute < w.endMinute) ?? null;
  const next = schedule.nextWindow(timeline, minute);
  return { timeline, current, next: next.kind === 'window' ? next.window : null };
}

/** How the announced windows compared with the outages this household recorded. */
export function adherence(
  ws: readonly ManualWindow[],
  outages: readonly { startMs: number; endMs: number | null }[],
  nowMs: number,
): schedule.Adherence {
  const { timeline } = scheduleNow(ws, nowMs);
  const past = timeline.filter((w) => w.endMinute <= Math.floor(nowMs / MIN));
  const observed = outages
    .filter((o) => o.endMs !== null)
    .map((o) => ({
      startMinute: Math.floor(o.startMs / MIN),
      endMinute: Math.ceil((o.endMs as number) / MIN),
    }));
  return schedule.scoreAdherence(past, observed);
}
