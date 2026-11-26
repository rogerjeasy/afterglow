import { alerts } from '@afterglow/core';
import { useMemo } from 'react';
import { foodIndex } from '../data/foodkeeper';
import { useHousehold } from '../household/useHousehold';
import { buildLanternModel, toMinute, viewAt } from '../lantern/model';

/**
 * The household's alerts now, from the core (alerts spec). Only the demo has a
 * neighbourhood, so only the demo has a cell to report "coming back"; elsewhere the
 * crowd is absent and that alert cannot fire.
 */
export function useAlerts(nowMs: number): readonly alerts.Alert[] {
  const { state, demo } = useHousehold();
  const { view } = state;
  return useMemo(() => {
    const start = view.outageStartedAtMs;
    const cell =
      demo && start !== null
        ? viewAt(buildLanternModel(toMinute(start)), toMinute(nowMs)).user
        : null;
    return alerts.evaluateAlerts({
      view,
      foodIndex,
      nowMs,
      outageSource: demo ? 'Grid Sense (simulated senses)' : 'you reported it',
      cell,
    });
  }, [view, demo, nowMs]);
}
