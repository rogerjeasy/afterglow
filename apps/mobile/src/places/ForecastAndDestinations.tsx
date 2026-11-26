import type { household } from '@afterglow/core';
import type { ReactNode } from 'react';
import { formatTemp } from '../format';
import { useGridSense } from '../gridsense/useGridSense';
import type { HouseholdStore } from '../household/store';
import { Sources } from '../night-shell/components';
import { Button, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { useCells, usePlaces, useWeather } from '../public/hooks';
import { PlacesSection } from './PlacesSection';

/**
 * Hours of safety with the real forecast, and where to go (product description 7.7):
 * Open-Meteo's hourly forecast for the person's ~5 km area drives the outdoor
 * temperature of the home model when they choose it, and the nearest warm places,
 * shelters and health facilities come from OpenStreetMap with the crowd's lit state.
 */

const HOUR = 3_600_000;

export function ForecastAndDestinations({
  home,
  store,
  nowMs,
}: {
  home: household.HomePayload | null;
  store: HouseholdStore;
  nowMs: number;
}): ReactNode {
  const gs = useGridSense();
  const weather = useWeather(gs.cell);
  const places = usePlaces(gs.cell);
  const cellsState = useCells(gs.cell, 5, 5);
  if (!gs.cell) {
    return (
      <Section title="Tonight's weather and where to go">
        <Notice>
          Share your area on the Lantern tab to use tonight's forecast for your home and to see the
          nearest warm places and shelters.
        </Notice>
      </Section>
    );
  }
  const hourly =
    weather.kind === 'ready'
      ? weather.value.hourly
      : weather.kind === 'unavailable'
        ? (weather.last?.hourly ?? [])
        : [];
  const next12 = hourly.filter((h) => h.atMs >= nowMs - HOUR && h.atMs < nowMs + 12 * HOUR);
  const next24 = hourly.filter((h) => h.atMs >= nowMs - HOUR && h.atMs < nowMs + 24 * HOUR);
  const low = next24.length ? Math.min(...next24.map((h) => h.tempC)) : null;
  const high = next24.length ? Math.max(...next24.map((h) => h.tempC)) : null;
  // The home model takes one outdoor temperature; the mean of the next 12 hours is the
  // honest single number for "tonight". The band already covers the building's spread.
  const mean12 = next12.length ? next12.reduce((s, h) => s + h.tempC, 0) / next12.length : null;
  const rounded = mean12 === null ? null : Math.round(mean12 * 10) / 10;
  const cellsAnswer =
    cellsState.kind === 'ready'
      ? cellsState.value
      : cellsState.kind === 'unavailable'
        ? cellsState.last
        : null;
  const cold = home ? home.mode === 'cold' : (low ?? 20) < 15;

  return (
    <>
      <Section title="Tonight's weather">
        {weather.kind === 'loading' ? (
          <Notice>Getting the forecast for your area.</Notice>
        ) : low === null || high === null || rounded === null ? (
          <Notice>
            The forecast is unreachable right now. The home model keeps the outdoor temperature you
            set.
          </Notice>
        ) : (
          <>
            <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
              Next 24 hours: {formatTemp(low)} to {formatTemp(high)}. Over the next 12 hours, about{' '}
              {formatTemp(rounded)} on average.
            </div>
            <div
              role="img"
              aria-label={`Hourly forecast from ${formatTemp(low)} to ${formatTemp(high)}`}
              style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 56 }}
            >
              {next24.map((h) => {
                const span = Math.max(1, high - low);
                return (
                  <div
                    key={h.atMs}
                    style={{
                      flex: 1,
                      height: `${12 + ((h.tempC - low) / span) * 44}px`,
                      background: token('control.fill.primary'),
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </div>
            {home ? (
              home.outdoorC === rounded ? (
                <Notice>Your home's hours of safety already use this forecast.</Notice>
              ) : (
                <Button
                  onClick={() => store.setHome({ ...home, outdoorC: rounded })}
                  style={{ width: '100%' }}
                >
                  Use the forecast for my home ({formatTemp(rounded)} instead of{' '}
                  {formatTemp(home.outdoorC)})
                </Button>
              )
            ) : (
              <Notice>
                Tell me about your home above and I can use this forecast for its hours of safety.
              </Notice>
            )}
            <Sources
              labels={[
                weather.kind === 'ready' ? weather.value.source : 'Open-Meteo (last known)',
                'for your ~5 km area',
              ]}
            >
              The forecast is for the open air around your area; the home model turns it into the
              temperature indoors, as a band.
            </Sources>
          </>
        )}
      </Section>
      <PlacesSection
        cell={gs.cell}
        places={places}
        cellsAnswer={cellsAnswer}
        title={cold ? 'Where to go to stay warm' : 'Where to go to stay cool'}
        initialGroup="warm"
      />
    </>
  );
}
