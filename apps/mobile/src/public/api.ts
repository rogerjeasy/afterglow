import raw from '../cloud/config.json';

/**
 * The anonymous public API (`services/crowd`, `.kiro/specs/crowd-reports`): crowd
 * reports, k-anonymous cells, public places and the weather. No account is needed;
 * the safety functions never wait on one (ACC-01). Every call fails soft: offline or
 * unreachable returns null, and the screens say so instead of guessing.
 */

const base =
  typeof raw.publicApiUrl === 'string' && /^https:\/\/[a-z0-9.-]+$/.test(raw.publicApiUrl)
    ? raw.publicApiUrl
    : null;

export const PUBLIC_API_URL: string | null = base;

export type CellStateValue = 'dark' | 'lit' | 'mixed' | 'comingBack' | 'unknown';

export interface PublishedCell {
  readonly geohash6: string;
  readonly row: number;
  readonly col: number;
  readonly state: CellStateValue;
  readonly deviceCount: number;
  readonly windowStart: number;
}

export interface CellsAnswer {
  readonly asOfMinute: number;
  readonly userCell: string;
  readonly cols: number;
  readonly rows: number;
  readonly cells: readonly PublishedCell[];
}

export type PlaceKind =
  | 'hospital'
  | 'clinic'
  | 'pharmacy'
  | 'shelter'
  | 'community'
  | 'fuel'
  | 'charging'
  | 'water'
  | 'police'
  | 'fire'
  | 'tower';

export interface Place {
  readonly id: string;
  readonly kind: PlaceKind;
  readonly name: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly backupPower: boolean;
  readonly openingHours: string | null;
  readonly operator: string | null;
}

export interface PlacesAnswer {
  readonly places: readonly Place[];
  readonly source: string;
  readonly fetchedAt: string;
}

export interface WeatherAnswer {
  readonly hourly: readonly {
    readonly atMs: number;
    readonly tempC: number;
    readonly feelsC: number;
  }[];
  readonly source: string;
  readonly fetchedAt: string;
}

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  if (!base) return { status: 0, body: null };
  try {
    const r = await fetch(`${base}${path}`, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const body = r.status === 200 || r.status === 202 ? ((await r.json()) as T) : null;
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export async function fetchCells(center: string, cols = 5, rows = 5): Promise<CellsAnswer | null> {
  const r = await getJson<CellsAnswer>(`/v1/cells?center=${center}&cols=${cols}&rows=${rows}`);
  return r.status === 200 ? r.body : null;
}

/** Places for a cell. A cache miss answers "loading" while the server fetches; ask again. */
export async function fetchPlaces(
  cell: string,
): Promise<
  { kind: 'ready'; answer: PlacesAnswer } | { kind: 'loading' } | { kind: 'unavailable' }
> {
  const r = await getJson<PlacesAnswer>(`/v1/places?cell=${cell}`);
  if (r.status === 200 && r.body) return { kind: 'ready', answer: r.body };
  if (r.status === 202) return { kind: 'loading' };
  return { kind: 'unavailable' };
}

export async function fetchWeather(cell: string): Promise<WeatherAnswer | null> {
  const r = await getJson<WeatherAnswer>(`/v1/weather?cell=${cell}`);
  return r.status === 200 ? r.body : null;
}

export async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  if (!base) return { status: 0, json: null };
  try {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    let json: unknown = null;
    try {
      json = await r.json();
    } catch {
      // empty or non-JSON body
    }
    return { status: r.status, json };
  } catch {
    return { status: 0, json: null };
  }
}
