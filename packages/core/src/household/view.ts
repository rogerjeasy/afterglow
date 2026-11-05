import type { EventLog } from '../events/log.js';
import { type Versioned, lwwField, reduce } from '../events/reduce.js';
import type { AfterglowEvent } from '../events/types.js';
import type { IceCrystals } from '../foodkeeper/types.js';
import type { ApplianceClass, Fullness } from '../thermal/archetypes.js';
import {
  DEFAULT_AMBIENT_C,
  HOUSEHOLD_EVENT,
  type HomePayload,
  isAppliancePayload,
  isApplianceRemovedPayload,
  isDoorOpenedPayload,
  isHomePayload,
  isIceCheckedPayload,
  isItemAddedPayload,
  isItemRemovedPayload,
  isOutageSetPayload,
} from './events.js';

export interface Appliance {
  readonly id: string;
  readonly name: string;
  readonly class: ApplianceClass;
  readonly fullness: Fullness;
  readonly ambientC: number;
  /** True when the user never set a room temperature and the 22 C reference is in use (HH-07). */
  readonly ambientIsDefault: boolean;
}
export interface FoodItem {
  readonly id: string;
  readonly applianceId: string;
  readonly productId: number;
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
  readonly doors: readonly DoorOpening[];
  readonly outageStartedAtMs: number | null;
  readonly iceChecks: Readonly<Record<string, IceCheck>>;
  readonly home: HomePayload | null;
}

interface Internal {
  readonly appliances: ReadonlyMap<string, Versioned<Appliance | null>>;
  readonly items: ReadonlyMap<string, Versioned<FoodItem | null>>;
  readonly doors: readonly DoorOpening[];
  readonly outage: Versioned<number | null> | undefined;
  readonly iceChecks: ReadonlyMap<string, Versioned<IceCheck>>;
  readonly home: Versioned<HomePayload> | undefined;
}

const INITIAL: Internal = {
  appliances: new Map(),
  items: new Map(),
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
    doors,
    outageStartedAtMs: s.outage?.value ?? null,
    iceChecks,
    home: s.home?.value ?? null,
  };
}
