import type { EnergyLoad, EnergyStore } from '../energy/types.js';
import type { EventLog } from '../events/log.js';
import { type Versioned, lwwField, reduce } from '../events/reduce.js';
import type { AfterglowEvent } from '../events/types.js';
import type { IceCrystals } from '../foodkeeper/types.js';
import type { ApplianceClass, Fullness } from '../thermal/archetypes.js';
import {
  type CareNeed,
  DEFAULT_AMBIENT_C,
  HOUSEHOLD_EVENT,
  type HeardPayload,
  type HomePayload,
  isAppliancePayload,
  isApplianceRemovedPayload,
  isCareSetPayload,
  isDoorOpenedPayload,
  isEnergyLoadPayload,
  isEnergyRemovedPayload,
  isEnergyStorePayload,
  isHeardPayload,
  isHomePayload,
  isHorizonPayload,
  isIceCheckedPayload,
  isItemAddedPayload,
  isItemRemovedPayload,
  isMedicineAddedPayload,
  isMedicineRemovedPayload,
  isOutageSetPayload,
  isRosterRemovedPayload,
  isRosterSetPayload,
  isWardAnsweredPayload,
} from './events.js';

export interface Appliance {
  readonly id: string;
  readonly name: string;
  readonly class: ApplianceClass;
  readonly fullness: Fullness;
  readonly ambientC: number;
  /** True when the user never set a room temperature and the 22 C reference is in use (HH-07). */
  readonly ambientIsDefault: boolean;
  /** A thermometer-measured time constant in minutes (FC-07); absent when none was measured. */
  readonly measuredTauMinutes?: number;
}
export interface FoodItem {
  readonly id: string;
  readonly applianceId: string;
  readonly productId: number;
}
export interface MedicineItem {
  readonly id: string;
  readonly applianceId: string;
  readonly product: string;
  readonly condition: 'unopened' | 'inUse';
}
export interface RosterMember {
  readonly id: string;
  readonly name: string;
  readonly slot: number;
  /** The latest word from them, or null when nothing has been heard. */
  readonly heard: Omit<HeardPayload, 'personId'> | null;
  /** The guardian's settings for them, or null when none were set. */
  readonly care?: {
    readonly cadenceHours: number | null;
    readonly needs: readonly CareNeed[];
  } | null;
}
export interface WardAnswer {
  readonly answer: 'yes' | 'no' | 'unknown';
  readonly atMs: number;
}
export interface DoorOpening {
  readonly applianceId: string;
  readonly openMinutes: number;
  readonly atMs: number;
}
export interface IceCheck {
  readonly answer: IceCrystals;
  readonly atMs: number;
}

export interface HouseholdView {
  readonly appliances: readonly Appliance[];
  readonly items: readonly FoodItem[];
  readonly medicines: readonly MedicineItem[];
  readonly roster: readonly RosterMember[];
  readonly energyStores: readonly EnergyStore[];
  readonly energyLoads: readonly EnergyLoad[];
  /** The hours the user chose to plan for, or null (a labelled default applies). */
  readonly horizonHours: number | null;
  readonly wardAnswers: Readonly<Record<string, WardAnswer>>;
  readonly doors: readonly DoorOpening[];
  readonly outageStartedAtMs: number | null;
  readonly iceChecks: Readonly<Record<string, IceCheck>>;
  readonly home: HomePayload | null;
}

interface Internal {
  readonly appliances: ReadonlyMap<string, Versioned<Appliance | null>>;
  readonly items: ReadonlyMap<string, Versioned<FoodItem | null>>;
  readonly medicines: ReadonlyMap<string, Versioned<MedicineItem | null>>;
  readonly people: ReadonlyMap<string, Versioned<{ name: string; slot: number } | null>>;
  readonly heard: ReadonlyMap<string, HeardPayload>;
  readonly care: ReadonlyMap<
    string,
    Versioned<{ cadenceHours: number | null; needs: readonly CareNeed[] }>
  >;
  readonly stores: ReadonlyMap<string, Versioned<EnergyStore | null>>;
  readonly eloads: ReadonlyMap<string, Versioned<EnergyLoad | null>>;
  readonly horizon: Versioned<number> | undefined;
  readonly ward: ReadonlyMap<string, Versioned<WardAnswer>>;
  readonly doors: readonly DoorOpening[];
  readonly outage: Versioned<number | null> | undefined;
  readonly iceChecks: ReadonlyMap<string, Versioned<IceCheck>>;
  readonly home: Versioned<HomePayload> | undefined;
}

const INITIAL: Internal = {
  appliances: new Map(),
  items: new Map(),
  medicines: new Map(),
  people: new Map(),
  heard: new Map(),
  care: new Map(),
  stores: new Map(),
  eloads: new Map(),
  horizon: undefined,
  ward: new Map(),
  doors: [],
  outage: undefined,
  iceChecks: new Map(),
  home: undefined,
};

function put<T>(
  map: ReadonlyMap<string, Versioned<T>>,
  key: string,
  event: AfterglowEvent,
  value: T,
): ReadonlyMap<string, Versioned<T>> {
  const next = new Map(map);
  next.set(key, lwwField(map.get(key), event, value));
  return next;
}

/**
 * The reducer. Malformed payloads and foreign event types change nothing
 * (HH-03). The log is already totally ordered, so LWW is deterministic (HH-02).
 */
function step(state: Internal, event: AfterglowEvent): Internal {
  const p = event.payload;
  switch (event.type) {
    case HOUSEHOLD_EVENT.applianceSet: {
      if (!isAppliancePayload(p)) return state;
      const appliance: Appliance = {
        id: p.applianceId,
        name: p.name,
        class: p.class,
        fullness: p.fullness,
        ambientC: p.ambientC ?? DEFAULT_AMBIENT_C,
        ambientIsDefault: p.ambientC === null,
        ...(typeof p.measuredTauMinutes === 'number'
          ? { measuredTauMinutes: p.measuredTauMinutes }
          : {}),
      };
      return { ...state, appliances: put(state.appliances, p.applianceId, event, appliance) };
    }
    case HOUSEHOLD_EVENT.applianceRemoved: {
      if (!isApplianceRemovedPayload(p)) return state;
      return { ...state, appliances: put(state.appliances, p.applianceId, event, null) };
    }
    case HOUSEHOLD_EVENT.itemAdded: {
      if (!isItemAddedPayload(p)) return state;
      const item: FoodItem = { id: p.itemId, applianceId: p.applianceId, productId: p.productId };
      return { ...state, items: put(state.items, p.itemId, event, item) };
    }
    case HOUSEHOLD_EVENT.itemRemoved: {
      if (!isItemRemovedPayload(p)) return state;
      return { ...state, items: put(state.items, p.itemId, event, null) };
    }
    case HOUSEHOLD_EVENT.medicineAdded: {
      if (!isMedicineAddedPayload(p)) return state;
      const medicine: MedicineItem = {
        id: p.medicineId,
        applianceId: p.applianceId,
        product: p.product,
        condition: p.condition,
      };
      return { ...state, medicines: put(state.medicines, p.medicineId, event, medicine) };
    }
    case HOUSEHOLD_EVENT.medicineRemoved: {
      if (!isMedicineRemovedPayload(p)) return state;
      return { ...state, medicines: put(state.medicines, p.medicineId, event, null) };
    }
    case HOUSEHOLD_EVENT.rosterSet: {
      if (!isRosterSetPayload(p)) return state;
      return {
        ...state,
        people: put(state.people, p.personId, event, { name: p.name, slot: p.slot }),
      };
    }
    case HOUSEHOLD_EVENT.rosterRemoved: {
      if (!isRosterRemovedPayload(p)) return state;
      return { ...state, people: put(state.people, p.personId, event, null) };
    }
    case HOUSEHOLD_EVENT.careSet: {
      if (!isCareSetPayload(p)) return state;
      return {
        ...state,
        care: put(state.care, p.personId, event, {
          cadenceHours: p.cadenceHours,
          needs: [...p.needs].sort(),
        }),
      };
    }
    case HOUSEHOLD_EVENT.heard: {
      if (!isHeardPayload(p)) return state;
      const next = new Map(state.heard);
      const prev = next.get(p.personId);
      // Latest word wins; an exact tie is broken by a canonical comparison so the
      // result does not depend on arrival order (HH-01).
      if (!prev || p.atMs > prev.atMs || (p.atMs === prev.atMs && canonical(p) > canonical(prev))) {
        next.set(p.personId, p);
      }
      return { ...state, heard: next };
    }
    case HOUSEHOLD_EVENT.energyStoreSet: {
      if (!isEnergyStorePayload(p)) return state;
      const { storeId, ...rest } = p;
      return { ...state, stores: put(state.stores, storeId, event, { id: storeId, ...rest }) };
    }
    case HOUSEHOLD_EVENT.energyStoreRemoved: {
      if (!isEnergyRemovedPayload(p, 'storeId')) return state;
      return {
        ...state,
        stores: put(state.stores, (p as { storeId: string }).storeId, event, null),
      };
    }
    case HOUSEHOLD_EVENT.energyLoadSet: {
      if (!isEnergyLoadPayload(p)) return state;
      const { loadId, ...rest } = p;
      return { ...state, eloads: put(state.eloads, loadId, event, { id: loadId, ...rest }) };
    }
    case HOUSEHOLD_EVENT.energyLoadRemoved: {
      if (!isEnergyRemovedPayload(p, 'loadId')) return state;
      return { ...state, eloads: put(state.eloads, (p as { loadId: string }).loadId, event, null) };
    }
    case HOUSEHOLD_EVENT.horizonSet: {
      if (!isHorizonPayload(p)) return state;
      return { ...state, horizon: lwwField(state.horizon, event, p.hours) };
    }
    case HOUSEHOLD_EVENT.wardAnswered: {
      if (!isWardAnsweredPayload(p)) return state;
      return {
        ...state,
        ward: put(state.ward, p.check, event, { answer: p.answer, atMs: p.atMs }),
      };
    }
    case HOUSEHOLD_EVENT.doorOpened: {
      if (!isDoorOpenedPayload(p)) return state;
      const door: DoorOpening = {
        applianceId: p.applianceId,
        openMinutes: p.openMinutes,
        atMs: p.atMs,
      };
      return { ...state, doors: [...state.doors, door] };
    }
    case HOUSEHOLD_EVENT.outageSet: {
      if (!isOutageSetPayload(p)) return state;
      return { ...state, outage: lwwField(state.outage, event, p.startedAtMs) };
    }
    case HOUSEHOLD_EVENT.iceChecked: {
      if (!isIceCheckedPayload(p)) return state;
      return {
        ...state,
        iceChecks: put(state.iceChecks, p.itemId, event, { answer: p.answer, atMs: p.atMs }),
      };
    }
    case HOUSEHOLD_EVENT.homeSet: {
      if (!isHomePayload(p)) return state;
      return { ...state, home: lwwField(state.home, event, p) };
    }
    default:
      return state;
  }
}

const canonical = (h: HeardPayload): string => `${h.code}|${h.channel}`;
const byId = <T extends { readonly id: string }>(a: T, b: T): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Reduce an event log into the household view (HH-01). Pure and deterministic. */
export function buildHouseholdView(log: EventLog): HouseholdView {
  const s = reduce(log, step, INITIAL);
  const appliances = [...s.appliances.values()]
    .map((v) => v.value)
    .filter((a): a is Appliance => a !== null)
    .sort(byId);
  const live = new Set(appliances.map((a) => a.id));
  // Items whose appliance was removed are dropped with it.
  const items = [...s.items.values()]
    .map((v) => v.value)
    .filter((i): i is FoodItem => i !== null && live.has(i.applianceId))
    .sort(byId);
  const medicines = [...s.medicines.values()]
    .map((v) => v.value)
    .filter((m): m is MedicineItem => m !== null && live.has(m.applianceId))
    .sort(byId);
  const roster: RosterMember[] = [...s.people.entries()]
    .flatMap(([id, v]) =>
      v.value === null ? [] : [{ id, name: v.value.name, slot: v.value.slot }],
    )
    .map((m) => {
      const h = s.heard.get(m.id);
      const c = s.care.get(m.id)?.value ?? null;
      return {
        ...m,
        heard: h ? { code: h.code, atMs: h.atMs, channel: h.channel } : null,
        care: c,
      };
    })
    .sort(byId);
  const energyStores = [...s.stores.values()]
    .map((v) => v.value)
    .filter((x): x is EnergyStore => x !== null)
    .sort(byId);
  const energyLoads = [...s.eloads.values()]
    .map((v) => v.value)
    .filter((x): x is EnergyLoad => x !== null)
    .sort(byId);
  const wardAnswers: Record<string, WardAnswer> = {};
  for (const [id, v] of [...s.ward.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    wardAnswers[id] = v.value;
  }
  const iceChecks: Record<string, IceCheck> = {};
  for (const [id, v] of [...s.iceChecks.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    iceChecks[id] = v.value;
  }
  const doors = [...s.doors].sort(
    (a, b) =>
      a.atMs - b.atMs ||
      (a.applianceId < b.applianceId ? -1 : a.applianceId > b.applianceId ? 1 : 0) ||
      a.openMinutes - b.openMinutes,
  );
  return {
    appliances,
    items,
    medicines,
    roster,
    energyStores,
    energyLoads,
    horizonHours: s.horizon?.value ?? null,
    wardAnswers,
    doors,
    outageStartedAtMs: s.outage?.value ?? null,
    iceChecks,
    home: s.home?.value ?? null,
  };
}
