import { useEffect, useState } from 'react';
import {
  type CellsAnswer,
  type PlacesAnswer,
  type WeatherAnswer,
  fetchCells,
  fetchPlaces,
  fetchWeather,
} from './api';

/**
 * React hooks over the public API. Each one remembers its last good answer in the
 * session so a dropped connection keeps showing the last map, places and forecast,
 * with the time they were fetched (product description 7.3 "offline: last map with
 * timestamps").
 */

export type Loadable<T> =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly last: T | null }
  | { readonly kind: 'ready'; readonly value: T; readonly atMs: number }
  | {
      readonly kind: 'unavailable';
      readonly last: T | null;
      readonly lastAtMs: number | null;
      /** Ask again, when the source may have recovered. */
      readonly retry?: () => void;
    };

const memory = new Map<string, { value: unknown; atMs: number }>();

function remembered<T>(key: string): { value: T; atMs: number } | null {
  const hit = memory.get(key);
  return hit ? { value: hit.value as T, atMs: hit.atMs } : null;
}

/** The crowd cells around the person's cell, refreshed every minute. */
export function useCells(cell: string | null, cols = 5, rows = 5): Loadable<CellsAnswer> {
  const key = `cells:${cell}:${cols}x${rows}`;
  const [state, setState] = useState<Loadable<CellsAnswer>>(() => {
    const hit = remembered<CellsAnswer>(key);
    return hit
      ? { kind: 'ready', value: hit.value, atMs: hit.atMs }
      : cell
        ? { kind: 'loading', last: null }
        : { kind: 'idle' };
  });
  useEffect(() => {
    if (!cell) {
      setState({ kind: 'idle' });
      return;
    }
    let live = true;
    const load = async (): Promise<void> => {
      const answer = await fetchCells(cell, cols, rows);
      if (!live) return;
      if (answer) {
        memory.set(key, { value: answer, atMs: Date.now() });
        setState({ kind: 'ready', value: answer, atMs: Date.now() });
      } else {
        const hit = remembered<CellsAnswer>(key);
        setState({ kind: 'unavailable', last: hit?.value ?? null, lastAtMs: hit?.atMs ?? null });
      }
    };
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [cell, cols, rows, key]);
  return state;
}

/** Public places near the cell. The server may need a minute the first time; ask again. */
export function usePlaces(cell: string | null): Loadable<PlacesAnswer> {
  const key = `places:${cell}`;
  const [state, setState] = useState<Loadable<PlacesAnswer>>(() => {
    const hit = remembered<PlacesAnswer>(key);
    return hit
      ? { kind: 'ready', value: hit.value, atMs: hit.atMs }
      : cell
        ? { kind: 'loading', last: null }
        : { kind: 'idle' };
  });
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt re-runs the fetch on "Try again"
  useEffect(() => {
    if (!cell) {
      setState({ kind: 'idle' });
      return;
    }
    if (remembered<PlacesAnswer>(key)) return;
    setState({ kind: 'loading', last: null });
    let live = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async (): Promise<void> => {
      const r = await fetchPlaces(cell);
      if (!live) return;
      if (r.kind === 'ready') {
        memory.set(key, { value: r.answer, atMs: Date.now() });
        setState({ kind: 'ready', value: r.answer, atMs: Date.now() });
      } else if (r.kind === 'loading' && tries++ < 24) {
        setState({ kind: 'loading', last: null });
        timer = setTimeout(() => void load(), 15_000);
      } else {
        setState({
          kind: 'unavailable',
          last: null,
          lastAtMs: null,
          retry: () => setAttempt((a) => a + 1),
        });
      }
    };
    void load();
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [cell, key, attempt]);
  return state;
}

/** The hourly forecast for the cell's area, refreshed every 30 minutes. */
export function useWeather(cell: string | null): Loadable<WeatherAnswer> {
  const key = `weather:${cell?.slice(0, 5)}`;
  const [state, setState] = useState<Loadable<WeatherAnswer>>(() => {
    const hit = remembered<WeatherAnswer>(key);
    return hit
      ? { kind: 'ready', value: hit.value, atMs: hit.atMs }
      : cell
        ? { kind: 'loading', last: null }
        : { kind: 'idle' };
  });
  useEffect(() => {
    if (!cell) {
      setState({ kind: 'idle' });
      return;
    }
    let live = true;
    const load = async (): Promise<void> => {
      const answer = await fetchWeather(cell);
      if (!live) return;
      if (answer) {
        memory.set(key, { value: answer, atMs: Date.now() });
        setState({ kind: 'ready', value: answer, atMs: Date.now() });
      } else {
        const hit = remembered<WeatherAnswer>(key);
        setState({ kind: 'unavailable', last: hit?.value ?? null, lastAtMs: hit?.atMs ?? null });
      }
    };
    void load();
    const id = setInterval(() => void load(), 30 * 60_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [cell, key]);
  return state;
}

/** The compass heading in degrees from north, when the device offers one (else null). */
export function useHeading(): {
  heading: number | null;
  ask: () => void;
  needsPermission: boolean;
} {
  const [heading, setHeading] = useState<number | null>(null);
  const [granted, setGranted] = useState(false);
  type IOSOrientation = typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<string>;
  };
  const needsPermission =
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof (DeviceOrientationEvent as IOSOrientation).requestPermission === 'function' &&
    !granted;
  useEffect(() => {
    const onOrientation = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }): void => {
      if (typeof e.webkitCompassHeading === 'number') setHeading(e.webkitCompassHeading);
      else if (e.absolute && typeof e.alpha === 'number') setHeading((360 - e.alpha) % 360);
    };
    const evt =
      'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(evt, onOrientation as EventListener);
    return () => window.removeEventListener(evt, onOrientation as EventListener);
  }, []);
  const ask = (): void => {
    const req = (DeviceOrientationEvent as IOSOrientation).requestPermission;
    if (req) void req().then((r) => setGranted(r === 'granted'));
  };
  return { heading, ask, needsPermission };
}
