/**
 * Geohash-6 encode/decode (CE-02, CE-06). Standard base-32 geohash algorithm.
 * Location in Afterglow exists only as a geohash-6 cell — never coordinates.
 */

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const BASE32_SET = new Set(BASE32.split(''));

export const GEOHASH_PRECISION = 6;

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface CellBounds {
  readonly latMin: number;
  readonly latMax: number;
  readonly lngMin: number;
  readonly lngMax: number;
}

/** True when a string is exactly 6 valid base-32 geohash characters (CE-02). */
export function isGeohash6(value: string): boolean {
  if (value.length !== GEOHASH_PRECISION) return false;
  for (const ch of value) {
    if (!BASE32_SET.has(ch)) return false;
  }
  return true;
}

/** Encode a lat/lng to a geohash of the given precision (default 6). */
export function encodeGeohash(point: LatLng, precision = GEOHASH_PRECISION): string {
  if (point.lat < -90 || point.lat > 90) throw new Error(`lat out of range: ${point.lat}`);
  if (point.lng < -180 || point.lng > 180) throw new Error(`lng out of range: ${point.lng}`);

  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true; // start with longitude

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (point.lng >= mid) {
        ch = (ch << 1) + 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (point.lat >= mid) {
        ch = (ch << 1) + 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    if (bit < 4) {
      bit += 1;
    } else {
      hash += BASE32[ch] as string;
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/** Decode a geohash to its cell bounds. */
export function decodeBounds(geohash: string): CellBounds {
  if (!isGeohash6(geohash) && geohash.length !== GEOHASH_PRECISION) {
    // allow other precisions for internal use, but reject invalid chars
    for (const c of geohash) {
      if (!BASE32_SET.has(c)) throw new Error(`invalid geohash char: ${c}`);
    }
  }
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let even = true;

  for (const ch of geohash) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`invalid geohash char: ${ch}`);
    for (let mask = 16; mask >= 1; mask >>= 1) {
      if (even) {
        const mid = (lngMin + lngMax) / 2;
        if (idx & mask) lngMin = mid;
        else lngMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (idx & mask) latMin = mid;
        else latMax = mid;
      }
      even = !even;
    }
  }
  return { latMin, latMax, lngMin, lngMax };
}

/** Decode a geohash to the centre point of its cell. */
export function decodeCenter(geohash: string): LatLng {
  const b = decodeBounds(geohash);
  return { lat: (b.latMin + b.latMax) / 2, lng: (b.lngMin + b.lngMax) / 2 };
}
