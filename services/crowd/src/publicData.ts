import { cells } from '@afterglow/core';

/**
 * Public data behind the app's lit places, destinations, Signal Finder and the
 * weather that drives hours of safety (product description 7.3, 7.7, 7.11, 7.12).
 *
 * Adapter pattern (tech.md): fetch, normalise, health. Only the centre of the
 * person's ~1 km cell is ever sent to a third party, never their position
 * (privacy-aggregation.md). Upstream failures return null, never a guess.
 */

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
  /** OSM says it has backup power (a generator or emergency supply). */
  readonly backupPower: boolean;
  readonly openingHours: string | null;
  readonly operator: string | null;
}

export interface PlacesResult {
  readonly center: { readonly lat: number; readonly lng: number };
  readonly radiusM: number;
  readonly places: readonly Place[];
  readonly source: string;
  readonly fetchedAt: string;
}

/**
 * Public Overpass instances, tried in order. The main server can refuse cloud address
 * ranges or be busy; the others mirror the same OpenStreetMap data.
 */
const OVERPASS = [
  // Ordered by measured reachability from AWS (2026-11-26): the main server refuses
  // AWS address ranges (connect timeout), others were slow or overloaded that night.
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
// Lean enough for a busy public server: places within 2 km, towers within 4 km.
const RADIUS_M = 2000;
const TOWER_RADIUS_M = 4000;

function kindOf(tags: Record<string, string>): PlaceKind | null {
  const a = tags.amenity;
  if (a === 'hospital') return 'hospital';
  if (a === 'clinic' || a === 'doctors') return 'clinic';
  if (a === 'pharmacy') return 'pharmacy';
  // A real shelter only. In OpenStreetMap `amenity=shelter` is mostly bus stops, picnic
  // roofs and lean-tos; sending someone there in a blackout would be wrong.
  if (
    tags.social_facility === 'shelter' ||
    tags.emergency === 'assembly_point' ||
    (a === 'shelter' && tags.shelter_type === 'emergency')
  ) {
    return 'shelter';
  }
  if (a === 'shelter') return null;
  if (a === 'community_centre' || a === 'townhall' || a === 'library') return 'community';
  if (a === 'fuel') return 'fuel';
  if (a === 'charging_station') return 'charging';
  if (a === 'drinking_water' || a === 'water_point' || tags.emergency === 'water_tank')
    return 'water';
  if (a === 'police') return 'police';
  if (a === 'fire_station') return 'fire';
  if (tags['communication:mobile_phone'] === 'yes' || tags['tower:type'] === 'communication') {
    return 'tower';
  }
  return null;
}

function hasBackup(tags: Record<string, string>): boolean {
  return (
    tags['power_supply:backup'] === 'yes' ||
    tags.backup_generator === 'yes' ||
    tags['generator:source'] !== undefined ||
    tags.emergency_power === 'yes'
  );
}

const AMENITIES = [
  'hospital',
  'clinic',
  'doctors',
  'pharmacy',
  'shelter',
  'community_centre',
  'townhall',
  'library',
  'fuel',
  'charging_station',
  'drinking_water',
  'water_point',
  'police',
  'fire_station',
];

/**
 * A union of exact-tag lookups, which Overpass answers from its tag index; a regex
 * over the same tags made the public server scan everything (42 s measured).
 */
export function overpassQuery(lat: number, lng: number): string {
  const a = (r: number) => `(around:${r},${lat.toFixed(5)},${lng.toFixed(5)})`;
  const parts = [
    ...AMENITIES.map((v) => `nwr${a(RADIUS_M)}[amenity=${v}];`),
    `nwr${a(RADIUS_M)}[social_facility=shelter];`,
    `nwr${a(RADIUS_M)}[emergency=water_tank];`,
    `nwr${a(RADIUS_M)}[emergency=assembly_point];`,
    `nwr${a(TOWER_RADIUS_M)}["communication:mobile_phone"=yes];`,
    `nwr${a(TOWER_RADIUS_M)}["tower:type"=communication];`,
  ];
  // The server gives up after 25 s, so a busy one fails fast and the next is tried.
  return `[out:json][timeout:25];(${parts.join('')});out center tags 200;`;
}

/** Turn Overpass elements into places; anything without a position or a known kind is dropped. */
export function normalisePlaces(json: unknown): Place[] {
  const elements = (json as { elements?: unknown })?.elements;
  if (!Array.isArray(elements)) return [];
  const out: Place[] = [];
  for (const e of elements) {
    const el = e as {
      type?: string;
      id?: number;
      lat?: number;
      lon?: number;
      center?: { lat?: number; lon?: number };
      tags?: Record<string, string>;
    };
    const tags = el.tags ?? {};
    const kind = kindOf(tags);
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!kind || typeof lat !== 'number' || typeof lng !== 'number') continue;
    out.push({
      id: `${el.type ?? 'n'}/${el.id ?? 0}`,
      kind,
      name: tags.name ?? tags['name:en'] ?? null,
      lat,
      lng,
      backupPower: hasBackup(tags),
      openingHours: tags.opening_hours ?? null,
      operator: tags.operator ?? null,
    });
  }
  return out;
}

export async function fetchPlaces(geohash6: string, fetcher = fetch): Promise<PlacesResult | null> {
  const c = cells.decodeCenter(geohash6);
  const body = `data=${encodeURIComponent(overpassQuery(c.lat, c.lng))}`;
  // One budget for all tries, inside the function's 90 s.
  const deadline = Date.now() + 85_000;
  for (const url of OVERPASS) {
    const left = deadline - Date.now();
    if (left < 5_000) break;
    const host = new URL(url).host;
    const t0 = Date.now();
    try {
      const r = await fetcher(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          // Overpass refuses clients without an identifying user agent (406).
          'user-agent': 'Afterglow/1.0 (blackout companion; open source)',
        },
        body,
        // The public servers can take a minute when busy; this runs off the request path.
        signal: AbortSignal.timeout(Math.min(left, 30_000)),
      });
      if (!r.ok) {
        console.log(JSON.stringify({ upstream: host, status: r.status, ms: Date.now() - t0 }));
        continue;
      }
      const places = normalisePlaces(await r.json());
      console.log(
        JSON.stringify({
          upstream: host,
          status: r.status,
          places: places.length,
          ms: Date.now() - t0,
        }),
      );
      return {
        center: c,
        radiusM: RADIUS_M,
        places,
        source: 'OpenStreetMap contributors (ODbL), via Overpass',
        fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      // The error's kind only: never the query, which holds a cell centre.
      const err = e as { name?: string; cause?: { code?: string } };
      console.log(
        JSON.stringify({
          upstream: host,
          error: err.name ?? 'error',
          cause: err.cause?.code ?? null,
          ms: Date.now() - t0,
        }),
      );
    }
  }
  return null;
}

export interface WeatherResult {
  readonly center: { readonly lat: number; readonly lng: number };
  /** Hourly outdoor temperature from now, in °C, with the hour each value starts (ms). */
  readonly hourly: readonly {
    readonly atMs: number;
    readonly tempC: number;
    readonly feelsC: number;
  }[];
  readonly source: string;
  readonly fetchedAt: string;
}

export async function fetchWeather(
  geohash6: string,
  fetcher = fetch,
): Promise<WeatherResult | null> {
  const c = cells.decodeCenter(geohash6);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat.toFixed(3)}&longitude=${c.lng.toFixed(3)}&hourly=temperature_2m,apparent_temperature&forecast_days=3&timezone=UTC&timeformat=unixtime`;
  try {
    const r = await fetcher(url, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      hourly?: { time?: number[]; temperature_2m?: number[]; apparent_temperature?: number[] };
    };
    const t = j.hourly?.time ?? [];
    const temp = j.hourly?.temperature_2m ?? [];
    const feels = j.hourly?.apparent_temperature ?? [];
    const hourly = t
      .map((s, i) => ({ atMs: s * 1000, tempC: temp[i] as number, feelsC: feels[i] as number }))
      .filter((h) => Number.isFinite(h.atMs) && Number.isFinite(h.tempC));
    if (hourly.length === 0) return null;
    return {
      center: c,
      hourly,
      source: 'Open-Meteo forecast (CC BY 4.0)',
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
