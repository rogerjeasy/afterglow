import { CHECKS } from '../coguard/ward.js';
import { MAX_HORIZON_HOURS, MIN_HORIZON_HOURS, loadProblem, storeProblem } from '../energy/plan.js';
import type { EnergyLoad, EnergyStore } from '../energy/types.js';
import type { AfterglowEvent } from '../events/types.js';
import type { IceCrystals } from '../foodkeeper/types.js';
import { MAX_SLOT, MESSAGE_CODES, type MessageName, nameOfCode } from '../heliograph/codes.js';
import type { ApplianceClass, ArchetypeQuery, Fullness } from '../thermal/archetypes.js';

/**
 * Household events. Everything the user tells the app is an append-only event
 * (architecture 4.5); the view is a pure reduction. Payloads are validated by
 * guards: a malformed event is ignored, never trusted (HH-03).
 */
export const HOUSEHOLD_EVENT = {
  applianceSet: 'household.appliance.set',
  applianceRemoved: 'household.appliance.removed',
  itemAdded: 'household.item.added',
  itemRemoved: 'household.item.removed',
  doorOpened: 'household.door.opened',
  outageSet: 'household.outage.set',
  iceChecked: 'household.ice.checked',
  homeSet: 'household.home.set',
  medicineAdded: 'household.medicine.added',
  medicineRemoved: 'household.medicine.removed',
  rosterSet: 'household.roster.set',
  rosterRemoved: 'household.roster.removed',
  heard: 'household.roster.heard',
  careSet: 'household.roster.care.set',
  energyStoreSet: 'household.energy.store.set',
  energyStoreRemoved: 'household.energy.store.removed',
  energyLoadSet: 'household.energy.load.set',
  energyLoadRemoved: 'household.energy.load.removed',
  horizonSet: 'household.energy.horizon.set',
  wardAnswered: 'household.coguard.answered',
} as const;

export type HouseholdEventType = (typeof HOUSEHOLD_EVENT)[keyof typeof HOUSEHOLD_EVENT];

/** The reference room temperature, used (and labelled) when the user has not set one. */
export const DEFAULT_AMBIENT_C = 22;

const APPLIANCE_CLASSES: ReadonlySet<string> = new Set([
  'fridge',
  'fridgeFreezerCombo',
  'freezer',
  'chestFreezer',
  'coolerBox',
  'pharmacyFridge',
  'vaccineColdBox',
]);

export interface AppliancePayload {
  readonly applianceId: string;
  readonly name: string;
  readonly class: ApplianceClass;
  readonly fullness: Fullness;
  /** Room temperature; null means "not set" and the 22 C reference is used and labelled. */
  readonly ambientC: number | null;
  /**
   * A time constant measured with a thermometer (field-checks FC-07), in minutes. Absent or
   * null on older logs and when nothing was measured. The core uses it only when it makes the
   * clock shorter than the class default (FC-03).
   */
  readonly measuredTauMinutes?: number | null;
}
export interface ApplianceRemovedPayload {
  readonly applianceId: string;
}
export interface ItemAddedPayload {
  readonly itemId: string;
  readonly applianceId: string;
  readonly productId: number;
}
/** Why something left a compartment, for the outage report (optional; older logs lack it). */
export type RemovalReason = 'discarded' | 'used';
export interface ItemRemovedPayload {
  readonly itemId: string;
  readonly atMs?: number;
  readonly reason?: RemovalReason;
}
export interface DoorOpenedPayload {
  readonly applianceId: string;
  readonly openMinutes: number;
  readonly atMs: number;
}
export interface OutageSetPayload {
  /** Wall-clock ms when the power went out; null when power is back on. */
  readonly startedAtMs: number | null;
  /** When the power came back (only with startedAtMs null; older logs lack it). */
  readonly endedAtMs?: number;
}
export interface IceCheckedPayload {
  readonly itemId: string;
  readonly answer: IceCrystals;
  readonly atMs: number;
}
export type HomeRiskMode = 'cold' | 'heat';
export interface HomePayload {
  /** Null means "I don't know my building": the wide default band applies. */
  readonly archetype: ArchetypeQuery | null;
  readonly indoorC: number;
  readonly outdoorC: number;
  readonly mode: HomeRiskMode;
  readonly thresholdC: number;
}

export interface MedicineAddedPayload {
  readonly medicineId: string;
  readonly applianceId: string;
  /** The product name as chosen from the validated table. No storage data lives here (HH-08). */
  readonly product: string;
  readonly condition: 'unopened' | 'inUse';
}
export interface MedicineRemovedPayload {
  readonly medicineId: string;
  readonly atMs?: number;
  readonly reason?: RemovalReason;
}
export type HeardChannel = 'light' | 'sound' | 'sms' | 'ble' | 'manual';
const HEARD_CHANNELS: ReadonlySet<string> = new Set(['light', 'sound', 'sms', 'ble', 'manual']);
export interface RosterSetPayload {
  readonly personId: string;
  readonly name: string;
  readonly slot: number;
}
/** Who needs extra care (product description 7.10, 7.6 "personal risk profiles"). */
export type CareNeed = 'infant' | 'elderly' | 'medical';
export const CARE_NEEDS: readonly CareNeed[] = ['infant', 'elderly', 'medical'];
/**
 * A guardian's settings for one person: how often they should check in during an
 * outage (null: no rhythm) and what makes them vulnerable. Stored on the device only.
 */
export interface CareSetPayload {
  readonly personId: string;
  readonly cadenceHours: number | null;
  readonly needs: readonly CareNeed[];
}
export interface RosterRemovedPayload {
  readonly personId: string;
}
export interface HeardPayload {
  readonly personId: string;
  readonly code: MessageName;
  readonly atMs: number;
  readonly channel: HeardChannel;
}
export interface EnergyStorePayload extends Omit<EnergyStore, 'id'> {
  readonly storeId: string;
}
export interface EnergyLoadPayload extends Omit<EnergyLoad, 'id'> {
  readonly loadId: string;
}
export interface WardAnsweredPayload {
  readonly check: string;
  readonly answer: 'yes' | 'no' | 'unknown';
  readonly atMs: number;
}
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64;
const isTemp = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= -60 && x <= 80;
const isMs = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 8.64e15;
const isShortText = (x: unknown): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= 80;

export function isAppliancePayload(x: unknown): x is AppliancePayload {
  return (
    isRecord(x) &&
    isId(x.applianceId) &&
    isShortText(x.name) &&
    typeof x.class === 'string' &&
    APPLIANCE_CLASSES.has(x.class) &&
    (x.fullness === 'full' || x.fullness === 'half') &&
    (x.ambientC === null || isTemp(x.ambientC)) &&
    (x.measuredTauMinutes === undefined ||
      x.measuredTauMinutes === null ||
      (typeof x.measuredTauMinutes === 'number' &&
        Number.isFinite(x.measuredTauMinutes) &&
        x.measuredTauMinutes > 0 &&
        x.measuredTauMinutes <= MAX_MEASURED_TAU_MINUTES))
  );
}
/** A measured time constant longer than this (about 70 days) is a typing mistake (FC-07). */
export const MAX_MEASURED_TAU_MINUTES = 100_000;
export function isApplianceRemovedPayload(x: unknown): x is ApplianceRemovedPayload {
  return isRecord(x) && isId(x.applianceId);
}
export function isItemAddedPayload(x: unknown): x is ItemAddedPayload {
  return (
    isRecord(x) &&
    isId(x.itemId) &&
    isId(x.applianceId) &&
    typeof x.productId === 'number' &&
    Number.isInteger(x.productId)
  );
}
const isReason = (x: unknown): boolean => x === undefined || x === 'discarded' || x === 'used';
const optMs = (x: unknown): boolean => x === undefined || isMs(x);
export function isItemRemovedPayload(x: unknown): x is ItemRemovedPayload {
  return isRecord(x) && isId(x.itemId) && optMs(x.atMs) && isReason(x.reason);
}
export function isDoorOpenedPayload(x: unknown): x is DoorOpenedPayload {
  return (
    isRecord(x) &&
    isId(x.applianceId) &&
    typeof x.openMinutes === 'number' &&
    Number.isFinite(x.openMinutes) &&
    x.openMinutes >= 0 &&
    x.openMinutes <= 240 &&
    isMs(x.atMs)
  );
}
export function isOutageSetPayload(x: unknown): x is OutageSetPayload {
  if (!isRecord(x)) return false;
  if (x.startedAtMs === null) return optMs(x.endedAtMs);
  return isMs(x.startedAtMs) && x.endedAtMs === undefined;
}
export function isIceCheckedPayload(x: unknown): x is IceCheckedPayload {
  return (
    isRecord(x) &&
    isId(x.itemId) &&
    (x.answer === 'present' || x.answer === 'absent') &&
    isMs(x.atMs)
  );
}
export function isHomePayload(x: unknown): x is HomePayload {
  if (!isRecord(x)) return false;
  const a = x.archetype;
  const archetypeOk =
    a === null ||
    (isRecord(a) &&
      typeof a.type === 'string' &&
      typeof a.vintage === 'string' &&
      typeof a.insulation === 'string' &&
      typeof a.climate === 'string');
  return (
    archetypeOk &&
    isTemp(x.indoorC) &&
    isTemp(x.outdoorC) &&
    (x.mode === 'cold' || x.mode === 'heat') &&
    isTemp(x.thresholdC)
  );
}

export function isMedicineAddedPayload(x: unknown): x is MedicineAddedPayload {
  return (
    isRecord(x) &&
    isId(x.medicineId) &&
    isId(x.applianceId) &&
    typeof x.product === 'string' &&
    x.product.trim().length > 0 &&
    x.product.length <= 200 &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
    !/[\u0000-\u001f\u007f]/.test(x.product) &&
    (x.condition === 'unopened' || x.condition === 'inUse')
  );
}
export function isMedicineRemovedPayload(x: unknown): x is MedicineRemovedPayload {
  return isRecord(x) && isId(x.medicineId) && optMs(x.atMs) && isReason(x.reason);
}
// biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
export function isCareSetPayload(x: unknown): x is CareSetPayload {
  if (!isRecord(x) || !isId(x.personId)) return false;
  const c = x.cadenceHours;
  const cadenceOk =
    c === null || (typeof c === 'number' && Number.isInteger(c) && c >= 1 && c <= 24);
  const n = x.needs;
  return (
    cadenceOk &&
    Array.isArray(n) &&
    n.length <= CARE_NEEDS.length &&
    n.every((v) => CARE_NEEDS.includes(v as CareNeed)) &&
    new Set(n).size === n.length
  );
}
export function isRosterSetPayload(x: unknown): x is RosterSetPayload {
  return (
    isRecord(x) &&
    isId(x.personId) &&
    typeof x.name === 'string' &&
    x.name.trim().length > 0 &&
    x.name.length <= 60 &&
    !CONTROL_CHARS.test(x.name) &&
    typeof x.slot === 'number' &&
    Number.isInteger(x.slot) &&
    x.slot >= 0 &&
    x.slot <= MAX_SLOT
  );
}
export function isRosterRemovedPayload(x: unknown): x is RosterRemovedPayload {
  return isRecord(x) && isId(x.personId);
}
export function isHeardPayload(x: unknown): x is HeardPayload {
  return (
    isRecord(x) &&
    isId(x.personId) &&
    typeof x.code === 'string' &&
    Object.prototype.hasOwnProperty.call(MESSAGE_CODES, x.code) &&
    nameOfCode((MESSAGE_CODES as Record<string, number>)[x.code] as number) === x.code &&
    isMs(x.atMs) &&
    typeof x.channel === 'string' &&
    HEARD_CHANNELS.has(x.channel)
  );
}
export function isEnergyStorePayload(x: unknown): x is EnergyStorePayload {
  if (!isRecord(x) || !isId(x.storeId)) return false;
  const { storeId, ...rest } = x;
  return storeProblem({ id: storeId, ...rest }) === null;
}
export function isEnergyLoadPayload(x: unknown): x is EnergyLoadPayload {
  if (!isRecord(x) || !isId(x.loadId)) return false;
  const { loadId, ...rest } = x;
  return loadProblem({ id: loadId, ...rest }) === null;
}
export function isEnergyRemovedPayload(x: unknown, key: 'storeId' | 'loadId'): boolean {
  return isRecord(x) && isId(x[key]);
}
export function isHorizonPayload(x: unknown): x is { readonly hours: number } {
  return (
    isRecord(x) &&
    typeof x.hours === 'number' &&
    Number.isFinite(x.hours) &&
    x.hours >= MIN_HORIZON_HOURS &&
    x.hours <= MAX_HORIZON_HOURS
  );
}
export function isWardAnsweredPayload(x: unknown): x is WardAnsweredPayload {
  return (
    isRecord(x) &&
    typeof x.check === 'string' &&
    CHECKS.some((c) => c.id === x.check) &&
    (x.answer === 'yes' || x.answer === 'no' || x.answer === 'unknown') &&
    isMs(x.atMs)
  );
}
/** Build a household event; the caller supplies identity (device epoch, lamport) and model version. */
export function householdEvent<T extends HouseholdEventType>(
  type: T,
  payload: unknown,
  deviceEpoch: string,
  lamport: number,
): AfterglowEvent<T> {
  return { deviceEpoch, lamport, type, payload };
}
