import { useSyncExternalStore } from 'react';
import { type GridSenseState, gridSense } from './engine';

/** The Grid Sense engine's state, for React. */
export function useGridSense(): GridSenseState {
  return useSyncExternalStore(gridSense.subscribe, gridSense.getState, gridSense.getState);
}
