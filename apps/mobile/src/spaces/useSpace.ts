import { useEffect, useSyncExternalStore } from 'react';
import { foodIndex } from '../data/foodkeeper';
import { loadDemoHousehold } from '../demo/household';
import { browserStorage } from '../household/store';
import { type SpaceController, type SpaceState, createSpaceController } from './controller';

let singleton: SpaceController | null = null;

/** The one space controller for the running app, created on first use. */
export function getSpaceController(): SpaceController {
  if (!singleton) {
    singleton = createSpaceController({
      rawStorage: browserStorage(),
      now: () => Date.now(),
      randomId: () =>
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID().slice(0, 12)
          : Math.random().toString(36).slice(2, 14),
      seedDemo: (store) => loadDemoHousehold(store, foodIndex),
    });
  }
  return singleton;
}

export function useSpace(): { controller: SpaceController; space: SpaceState } {
  const controller = getSpaceController();
  const space = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  return { controller, space };
}

/**
 * Idle lock and save-health polling (ACC-13). Any pointer, key or touch counts
 * as activity. Mounted once at the top of the app.
 */
export function useIdleLock(): void {
  useEffect(() => {
    const c = getSpaceController();
    const touch = (): void => c.touch();
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    const id = window.setInterval(() => {
      c.checkIdle();
      c.checkSaveHealth();
    }, 5000);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      window.clearInterval(id);
    };
  }, []);
}
