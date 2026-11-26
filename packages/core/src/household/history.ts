import { compareEvents } from '../events/log.js';
import type { AfterglowEvent } from '../events/types.js';
import type { MessageName } from '../heliograph/codes.js';
import {
  HOUSEHOLD_EVENT as E,
  type HeardChannel,
  type RemovalReason,
  isAppliancePayload,
  isDoorOpenedPayload,
  isEnergyStorePayload,
  isHeardPayload,
  isItemAddedPayload,
  isItemRemovedPayload,
  isMedicineAddedPayload,
  isMedicineRemovedPayload,
  isOutageSetPayload,
  isRosterSetPayload,
  isWardAnsweredPayload,
} from './events.js';

/**
 * Outage history and the per-event report (product description 7.19): every outage
 * the household's own log records, with what happened during it. Derived only from
 * the log, in log order, so it is the same on every device that holds the same events.
 * An event belongs to an outage when it was logged between that outage's start and
 * end; times come from the events that carry them. Nothing is estimated: an end the
 * log did not record is reported as unknown.
 */

export interface ReportDoor {
  readonly appliance: string;
  readonly openMinutes: number;
  readonly atMs: number;
}
export interface ReportHeard {
  readonly person: string;
  readonly code: MessageName;
  readonly channel: HeardChannel;
  readonly atMs: number;
}
export interface ReportRemoval {
  readonly kind: 'food' | 'medicine';
  /** Food: the FoodKeeper product id; medicine: the product name. */
  readonly productId: number | null;
  readonly product: string | null;
  readonly appliance: string;
  readonly reason: RemovalReason | null;
  readonly atMs: number | null;
}
export interface ReportEnergy {
  readonly store: string;
  readonly fromPct: number;
  readonly toPct: number;
  readonly usedWh: number;
}
export interface ReportCheck {
  readonly check: string;
  readonly answer: 'yes' | 'no' | 'unknown';
  readonly atMs: number;
}

export interface OutageReport {
  readonly startMs: number;
  /** Null while it is still going, or when an older log did not record the end. */
  readonly endMs: number | null;
  readonly ongoing: boolean;
  readonly durationMinutes: number | null;
  readonly doors: readonly ReportDoor[];
  readonly heard: readonly ReportHeard[];
  readonly removals: readonly ReportRemoval[];
  readonly energy: readonly ReportEnergy[];
  /** Total energy drawn from the stores whose charge was updated during the outage. */
  readonly energyUsedWh: number;
  readonly checks: readonly ReportCheck[];
}

interface Open {
  startMs: number;
  doors: ReportDoor[];
  heard: ReportHeard[];
  removals: ReportRemoval[];
  checks: ReportCheck[];
  /** store id → charge when the outage began (or when first seen during it), and the latest. */
  charge: Map<string, { name: string; capacityWh: number; fromPct: number; toPct: number }>;
}

/** Every outage in the log, newest first. */
export function outageReports(
  events: readonly AfterglowEvent[],
  nowMs: number,
): readonly OutageReport[] {
  const sorted = [...events].sort(compareEvents);
  const appliances = new Map<string, string>();
  const people = new Map<string, string>();
  const items = new Map<string, { productId: number; applianceId: string }>();
  const medicines = new Map<string, { product: string; applianceId: string }>();
  const stores = new Map<string, { name: string; capacityWh: number; chargePct: number }>();
  const done: OutageReport[] = [];
  let open: Open | null = null;

  const close = (endMs: number | null): void => {
    if (!open) return;
    const energy = [...open.charge.values()]
      .map((c) => ({
        store: c.name,
        fromPct: c.fromPct,
        toPct: c.toPct,
        usedWh: Math.max(0, ((c.fromPct - c.toPct) / 100) * c.capacityWh),
      }))
      .filter((e) => e.fromPct !== e.toPct);
    const ongoing = endMs === null && open === current;
    const end = ongoing ? null : endMs;
    done.push({
      startMs: open.startMs,
      endMs: end,
      ongoing,
      durationMinutes:
        end !== null
          ? Math.max(0, Math.round((end - open.startMs) / 60_000))
          : ongoing
            ? Math.max(0, Math.round((nowMs - open.startMs) / 60_000))
            : null,
      doors: open.doors,
      heard: open.heard,
      removals: open.removals,
      energy,
      energyUsedWh: Math.round(energy.reduce((s, e) => s + e.usedWh, 0)),
      checks: open.checks,
    });
    open = null;
  };
  let current: Open | null = null;

  for (const ev of sorted) {
    const p = ev.payload;
    switch (ev.type) {
      case E.applianceSet:
        if (isAppliancePayload(p)) appliances.set(p.applianceId, p.name);
        break;
      case E.rosterSet:
        if (isRosterSetPayload(p)) people.set(p.personId, p.name);
        break;
      case E.itemAdded:
        if (isItemAddedPayload(p))
          items.set(p.itemId, { productId: p.productId, applianceId: p.applianceId });
        break;
      case E.medicineAdded:
        if (isMedicineAddedPayload(p)) {
          medicines.set(p.medicineId, { product: p.product, applianceId: p.applianceId });
        }
        break;
      case E.energyStoreSet:
        if (isEnergyStorePayload(p)) {
          stores.set(p.storeId, { name: p.name, capacityWh: p.capacityWh, chargePct: p.chargePct });
          if (open) {
            const had = open.charge.get(p.storeId);
            open.charge.set(p.storeId, {
              name: p.name,
              capacityWh: p.capacityWh,
              fromPct: had ? had.fromPct : p.chargePct,
              toPct: p.chargePct,
            });
          }
        }
        break;
      case E.outageSet:
        if (!isOutageSetPayload(p)) break;
        if (p.startedAtMs !== null) {
          if (open) {
            // A correction of the start time while it is going.
            open.startMs = p.startedAtMs;
          } else {
            open = {
              startMs: p.startedAtMs,
              doors: [],
              heard: [],
              removals: [],
              checks: [],
              charge: new Map(
                [...stores].map(([id, s]) => [
                  id,
                  {
                    name: s.name,
                    capacityWh: s.capacityWh,
                    fromPct: s.chargePct,
                    toPct: s.chargePct,
                  },
                ]),
              ),
            };
            current = open;
          }
        } else if (open) {
          current = null;
          close(p.endedAtMs ?? null);
        }
        break;
      case E.doorOpened:
        if (open && isDoorOpenedPayload(p)) {
          open.doors.push({
            appliance: appliances.get(p.applianceId) ?? 'A removed appliance',
            openMinutes: p.openMinutes,
            atMs: p.atMs,
          });
        }
        break;
      case E.heard:
        if (open && isHeardPayload(p)) {
          open.heard.push({
            person: people.get(p.personId) ?? 'Someone no longer on the list',
            code: p.code,
            channel: p.channel,
            atMs: p.atMs,
          });
        }
        break;
      case E.itemRemoved:
        if (isItemRemovedPayload(p)) {
          const it = items.get(p.itemId);
          if (open && it) {
            open.removals.push({
              kind: 'food',
              productId: it.productId,
              product: null,
              appliance: appliances.get(it.applianceId) ?? 'A removed appliance',
              reason: p.reason ?? null,
              atMs: p.atMs ?? null,
            });
          }
          items.delete(p.itemId);
        }
        break;
      case E.medicineRemoved:
        if (isMedicineRemovedPayload(p)) {
          const m = medicines.get(p.medicineId);
          if (open && m) {
            open.removals.push({
              kind: 'medicine',
              productId: null,
              product: m.product,
              appliance: appliances.get(m.applianceId) ?? 'A removed appliance',
              reason: p.reason ?? null,
              atMs: p.atMs ?? null,
            });
          }
          medicines.delete(p.medicineId);
        }
        break;
      case E.wardAnswered:
        if (open && isWardAnsweredPayload(p)) {
          open.checks.push({ check: p.check, answer: p.answer, atMs: p.atMs });
        }
        break;
      default:
        break;
    }
  }
  if (open) close(null);
  return done.sort((a, b) => b.startMs - a.startMs);
}

/** Totals across the history, for the summary line. */
export function historySummary(reports: readonly OutageReport[]): {
  readonly count: number;
  readonly knownMinutes: number;
  readonly longestMinutes: number | null;
} {
  const known = reports.map((r) => r.durationMinutes).filter((m): m is number => m !== null);
  return {
    count: reports.length,
    knownMinutes: known.reduce((s, m) => s + m, 0),
    longestMinutes: known.length ? Math.max(...known) : null,
  };
}
