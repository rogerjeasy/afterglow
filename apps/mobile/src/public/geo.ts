import { cells } from '@afterglow/core';

/**
 * Distance and bearing from the centre of the person's cell (all the app keeps of
 * where they are) to a public place. Plain great-circle maths; no map tiles needed.
 */

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing in degrees clockwise from true north. */
export function bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const POINTS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];
export function compassWord(deg: number): string {
  return POINTS[Math.round(deg / 45) % 8] as string;
}

export function distanceWords(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

export function cellCentre(cell: string): { lat: number; lng: number } {
  return cells.decodeCenter(cell);
}

/** The cell a place is in, so it can be shown lit or dark from the crowd map. */
export function cellOf(p: { lat: number; lng: number }): string {
  return cells.encodeGeohash(p);
}
