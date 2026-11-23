import type { AfterglowEvent } from '../events/types.js';
import type { IceCrystals } from '../foodkeeper/types.js';
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
}
export interface ApplianceRemovedPayload {
  readonly applianceId: string;
}
export interface ItemAddedPayload {
  readonly itemId: string;
  readonly applianceId: string;
  readonly productId: number;
}
export interface ItemRemovedPayload {
  readonly itemId: string;
}
export interface DoorOpenedPayload {
  readonly applianceId: string;
  readonly openMinutes: number;
  readonly atMs: number;
}
export interface OutageSetPayload {
  /** Wall-clock ms when the power went out; null when power is back on. */
  readonly startedAtMs: number | null;
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
    (x.ambientC === null || isTemp(x.ambientC))
  );
}
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
export function isItemRemovedPayload(x: unknown): x is ItemRemovedPayload {
  return isRecord(x) && isId(x.itemId);
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
  return isRecord(x) && (x.startedAtMs === null || isMs(x.startedAtMs));
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
  return isRecord(x) && isId(x.medicineId);
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
