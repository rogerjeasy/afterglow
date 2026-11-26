import { events } from '@afterglow/core';
import { KEYS } from '../household/store';

/**
 * Merge two copies of one account's data (cloud-accounts CA-10). The household is an
 * append-only event log whose reduction does not depend on order (EV-03), so two
 * devices that changed it apart are merged by taking every event from both. Nothing
 * is dropped. Each device keeps its own epoch, so the two can never mint the same
 * event identity. Any other key keeps the local value.
 */

function readEvents(raw: string | undefined): events.AfterglowEvent[] {
  if (!raw) return [];
  try {
    const x: unknown = JSON.parse(raw);
    return Array.isArray(x) ? (x as events.AfterglowEvent[]) : [];
  } catch {
    return [];
  }
}

/** Append one by one, so a malformed event is skipped, never fatal (as the store does). */
function logOf(list: readonly events.AfterglowEvent[]): events.EventLog {
  let log = events.EventLog.empty();
  for (const e of list) {
    try {
      log = log.append(e);
    } catch {
      // skipped
    }
  }
  return log;
}

export function mergeData(
  local: Readonly<Record<string, string>>,
  remote: Readonly<Record<string, string>>,
): Record<string, string> {
  const merged: Record<string, string> = { ...remote, ...local };
  const all = [...readEvents(remote[KEYS.events]), ...readEvents(local[KEYS.events])];
  merged[KEYS.events] = JSON.stringify(logOf(all).toArray());
  // The epoch identifies this device's events; never adopt another device's.
  const epoch = local[KEYS.epoch];
  if (epoch === undefined) delete merged[KEYS.epoch];
  else merged[KEYS.epoch] = epoch;
  return merged;
}
