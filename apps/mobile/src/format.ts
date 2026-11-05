/**
 * Display formatting. Durations are written "3 h 10 m", never "3:10" (design
 * 5.3). Minutes are floored: a clock must never show more time than the model
 * says is left (fail-closed.md rule 5).
 */

/** "3 h 10 m", "42 m", "0 m"; beyond 72 h, "3 d 4 h". Negative or non-finite input is "0 m". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 m';
  const total = Math.floor(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours >= 72) {
    const days = Math.floor(hours / 24);
    return `${days} d ${hours % 24} h`;
  }
  if (hours === 0) return `${mins} m`;
  return `${hours} h ${mins} m`;
}

/** The big outage timer: HH:MM:SS from elapsed milliseconds. */
export function formatTimer(elapsedMs: number): string {
  const s = Math.max(0, Math.floor(elapsedMs / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

/** Wall-clock time in the user's own 12 or 24 hour setting. */
export function formatClockTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "4.4 °C" with the unit; one decimal only when needed. */
export function formatTemp(c: number): string {
  const rounded = Math.round(c * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} °C`;
}
