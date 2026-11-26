import { type ReactNode, useMemo } from 'react';
import { Sources } from '../night-shell/components';
import { Button, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import type { PlacesAnswer } from '../public/api';
import { bearingDeg, cellCentre, compassWord, distanceM, distanceWords } from '../public/geo';
import { type Loadable, useHeading } from '../public/hooks';

/**
 * Signal Finder (product description 7.11): the nearest mapped cell towers with their
 * distance and direction, an arrow that turns with the phone when a compass is
 * available, and the advice that works during an outage.
 */

function Arrow({ deg }: { deg: number }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      style={{
        flex: 'none',
        transform: `rotate(${deg}deg)`,
        transition: 'transform 180ms ease-out',
      }}
      fill="none"
      stroke={token('text.emphasis')}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18M5 10l7-7 7 7" />
    </svg>
  );
}

export function SignalSection({
  cell,
  places,
}: { cell: string; places: Loadable<PlacesAnswer> }): ReactNode {
  const { heading, ask, needsPermission } = useHeading();
  const towers = useMemo(() => {
    if (places.kind !== 'ready') return [];
    const from = cellCentre(cell);
    return places.value.places
      .filter((p) => p.kind === 'tower')
      .map((p) => ({ p, d: distanceM(from, p), b: bearingDeg(from, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
  }, [places, cell]);

  return (
    <Section title="Find a signal">
      {places.kind !== 'ready' ? (
        <Notice>Tower positions come with the places around your area.</Notice>
      ) : towers.length === 0 ? (
        <Notice>No cell towers are mapped within 4 km of your area in OpenStreetMap.</Notice>
      ) : (
        <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {towers.map(({ p, d, b }) => (
            <li
              key={p.id}
              style={{
                listStyle: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 'var(--radius-tile)',
                background: token('surface.2'),
              }}
            >
              <Arrow deg={heading === null ? b : b - heading} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
                  {distanceWords(d)} {compassWord(b)}
                </div>
                <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
                  {p.operator ?? p.name ?? 'Mapped mobile mast'}
                  {heading === null
                    ? ' · arrow points from north'
                    : ' · arrow turns with your phone'}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {needsPermission ? (
        <Button size="sm" onClick={ask}>
          Use the compass
        </Button>
      ) : null}
      <Notice>
        During an outage, towers run on batteries for a few hours. Send texts rather than calls: a
        text retries until it gets through. Higher floors and windows facing the tower help. If a
        lit neighbour has Wi-Fi on backup power, Wi-Fi calling works even when the mobile network
        does not.
      </Notice>
      <Sources labels={['OpenStreetMap: mapped mobile masts', 'compass: this phone']}>
        Masts are as mapped by volunteers; not every tower is mapped, and a mapped one may be down.
      </Sources>
    </Section>
  );
}
