import { type ReactNode, useMemo, useState } from 'react';
import { Sources } from '../night-shell/components';
import { Button, ChoiceChip, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import type { CellsAnswer, Place, PlaceKind } from '../public/api';
import type { PlacesAnswer } from '../public/api';
import {
  bearingDeg,
  cellCentre,
  cellOf,
  compassWord,
  distanceM,
  distanceWords,
} from '../public/geo';
import type { Loadable } from '../public/hooks';

/**
 * Lit places and destinations (product description 7.3 "lit places", 7.7
 * "destinations", 7.12 "dependent services"): real OpenStreetMap places near the
 * person's cell, nearest first, each with its distance, its direction and what the crowd
 * map says about its own cell. "Lit" is never assumed: it comes from at least 5 devices.
 */

export const GROUPS: readonly { id: string; label: string; kinds: readonly PlaceKind[] }[] = [
  { id: 'health', label: 'Health', kinds: ['hospital', 'clinic', 'pharmacy'] },
  { id: 'warm', label: 'Shelter and warmth', kinds: ['shelter', 'community'] },
  { id: 'water', label: 'Water', kinds: ['water'] },
  { id: 'fuel', label: 'Fuel and charging', kinds: ['fuel', 'charging'] },
  { id: 'help', label: 'Police and fire', kinds: ['police', 'fire'] },
];

const KIND_WORD: Record<PlaceKind, string> = {
  hospital: 'Hospital',
  clinic: 'Clinic',
  pharmacy: 'Pharmacy',
  shelter: 'Shelter',
  community: 'Community centre',
  fuel: 'Fuel',
  charging: 'Charging point',
  water: 'Water point',
  police: 'Police',
  fire: 'Fire station',
  tower: 'Cell tower',
};

export function cellStateWord(state: string | undefined): string | null {
  switch (state) {
    case 'lit':
      return 'its area has power';
    case 'dark':
      return 'its area is dark';
    case 'comingBack':
      return 'power is coming back there';
    case 'mixed':
      return 'mixed reports there';
    default:
      return null;
  }
}

export interface RankedPlace {
  readonly place: Place;
  readonly distance: number;
  readonly bearing: number;
  readonly cellState: string | undefined;
}

export function rankPlaces(
  places: readonly Place[],
  cell: string,
  cellsAnswer: CellsAnswer | null,
  kinds: readonly PlaceKind[],
): RankedPlace[] {
  const from = cellCentre(cell);
  const byCell = new Map(cellsAnswer?.cells.map((c) => [c.geohash6, c.state]) ?? []);
  return places
    .filter((p) => kinds.includes(p.kind))
    .map((place) => ({
      place,
      distance: distanceM(from, place),
      bearing: bearingDeg(from, place),
      cellState: byCell.get(cellOf(place)),
    }))
    .sort((a, b) => a.distance - b.distance);
}

export function PlaceRow({ r }: { r: RankedPlace }): ReactNode {
  const lit = cellStateWord(r.cellState);
  return (
    <li
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--radius-tile)',
        background: token('surface.2'),
        borderStyle: 'solid',
        borderWidth: 1,
        borderColor: r.cellState === 'lit' ? token('focus.ring') : token('hairline'),
        listStyle: 'none',
      }}
    >
      <div
        style={{
          fontSize: 'var(--type-body)',
          color: token('text.primary'),
          overflowWrap: 'anywhere',
        }}
      >
        {r.place.name ?? KIND_WORD[r.place.kind]}
      </div>
      <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
        {KIND_WORD[r.place.kind]} · {distanceWords(r.distance)} {compassWord(r.bearing)}
        {r.place.backupPower ? ' · has backup power' : ''}
        {lit ? ` · ${lit}` : ''}
        {r.place.openingHours ? ` · ${r.place.openingHours}` : ''}
      </div>
    </li>
  );
}

export function PlacesSection({
  cell,
  places,
  cellsAnswer,
  title = 'Places near you',
  initialGroup = 'health',
}: {
  cell: string;
  places: Loadable<PlacesAnswer>;
  cellsAnswer: CellsAnswer | null;
  title?: string;
  initialGroup?: string;
}): ReactNode {
  const [group, setGroup] = useState(initialGroup);
  const kinds = GROUPS.find((g) => g.id === group)?.kinds ?? [];
  const list = useMemo(
    () =>
      places.kind === 'ready'
        ? rankPlaces(places.value.places, cell, cellsAnswer, kinds).slice(0, 8)
        : [],
    [places, cell, cellsAnswer, kinds],
  );
  return (
    <Section title={title}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {GROUPS.map((g) => (
          <ChoiceChip
            key={g.id}
            label={g.label}
            selected={group === g.id}
            onClick={() => setGroup(g.id)}
          />
        ))}
      </div>
      {places.kind === 'loading' ? (
        <Notice>
          Asking OpenStreetMap for places around your area. The first time can take a minute.
        </Notice>
      ) : places.kind === 'unavailable' ? (
        <>
          <Notice>
            OpenStreetMap's public servers are busy or unreachable right now. I will not invent
            places; try again in a few minutes.
          </Notice>
          {places.retry ? (
            <Button size="sm" onClick={places.retry}>
              Try again
            </Button>
          ) : null}
        </>
      ) : places.kind === 'ready' && list.length === 0 ? (
        <Notice>OpenStreetMap lists none of these within 2 km of your area.</Notice>
      ) : (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((r) => (
            <PlaceRow key={r.place.id} r={r} />
          ))}
        </ul>
      )}
      {places.kind === 'ready' ? (
        <Sources
          labels={[
            places.value.source,
            `fetched ${new Date(places.value.fetchedAt).toLocaleDateString()}`,
            'distances from the middle of your ~1 km area',
          ]}
        >
          A place counts as having power only when at least 5 devices in its own area say so.
          "Backup power" is what OpenStreetMap volunteers recorded, not a live reading.
        </Sources>
      ) : null}
    </Section>
  );
}
