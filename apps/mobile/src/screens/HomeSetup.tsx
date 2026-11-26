import { household, thermal } from '@afterglow/core';
import { type ReactNode, useState } from 'react';
import { formatTemp } from '../format';
import { useHousehold } from '../household/useHousehold';
import { Button, ChoiceChip, Notice, Stepper } from '../night-shell/controls';
import { token } from '../night-shell/theme';

const TYPE_LABEL: Record<string, string> = {
  apartment: 'Flat',
  detachedHouse: 'Detached house',
  townhouse: 'Townhouse',
  informalDwelling: 'Informal dwelling',
};
const VINTAGE_LABEL: Record<string, string> = {
  pre1980: 'before 1980',
  '1980to2000': '1980 to 2000',
  post2000: 'after 2000',
  post2010: 'after 2010',
  any: 'any age',
};
const INSULATION_LABEL: Record<string, string> = {
  poor: 'poorly insulated',
  medium: 'average insulation',
  good: 'well insulated',
  passive: 'passive-house standard',
};

function archetypeLabel(a: thermal.ArchetypeQuery): string {
  return `${TYPE_LABEL[a.type] ?? a.type}, ${VINTAGE_LABEL[a.vintage] ?? a.vintage}, ${
    INSULATION_LABEL[a.insulation] ?? a.insulation
  }`;
}

const COLD_DEFAULT_C = 15;
const HEAT_DEFAULT_C = 32;

/**
 * Tell the app about your home so hours of safety can be a band instead of a
 * guess. Only buildings the archetype table has data for are offered, plus "I
 * don't know", which gives the wide default band (HH-06).
 */
export function HomeSetup({
  current,
  onSave,
  onCancel,
}: {
  current: household.HomePayload | null;
  onSave: (home: household.HomePayload) => void;
  onCancel: () => void;
}): ReactNode {
  const archetypes = thermal.listArchetypes();
  const startIndex = current?.archetype
    ? archetypes.findIndex(
        (a) =>
          a.type === current.archetype?.type &&
          a.vintage === current.archetype?.vintage &&
          a.insulation === current.archetype?.insulation &&
          a.climate === current.archetype?.climate,
      )
    : -1;
  const [choice, setChoice] = useState<number>(startIndex);
  const [mode, setMode] = useState<'cold' | 'heat'>(current?.mode ?? 'cold');
  const [indoorC, setIndoorC] = useState(current?.indoorC ?? 20);
  const [outdoorC, setOutdoorC] = useState(current?.outdoorC ?? 5);
  const [thresholdC, setThresholdC] = useState(current?.thresholdC ?? COLD_DEFAULT_C);
  // Personal risk profiles (HH-18): a stricter line when someone here is vulnerable.
  const { state: hh } = useHousehold();
  const needs = household.householdNeeds(hh.view);
  const careLine = household.careThresholdC(mode, needs);
  const needsWords = needs
    .map((n) => (n === 'infant' ? 'a baby' : n === 'elderly' ? 'older' : 'medically fragile'))
    .join(', ');

  const pickMode = (m: 'cold' | 'heat'): void => {
    setMode(m);
    setThresholdC(m === 'cold' ? COLD_DEFAULT_C : HEAT_DEFAULT_C);
  };
  const picked = choice >= 0 ? archetypes[choice] : undefined;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 'var(--radius-tile)',
        background: token('surface.1'),
        border: `1px solid ${token('hairline')}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <div>
        <div style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>
          Your home
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {archetypes.map((a, i) => (
            <ChoiceChip
              key={`${a.type}-${a.vintage}-${a.insulation}-${a.climate}`}
              label={archetypeLabel(a)}
              selected={choice === i}
              onClick={() => setChoice(i)}
            />
          ))}
          <ChoiceChip
            label="I do not know"
            selected={choice === -1}
            onClick={() => setChoice(-1)}
          />
        </div>
        <div
          style={{ marginTop: 8, fontSize: 'var(--type-caption)', color: token('text.secondary') }}
        >
          {picked
            ? 'Heat-loss time constant from building-science archetypes.'
            : 'Without your building type the answer is a wide band, clearly marked.'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>
          Worry about
        </span>
        <ChoiceChip label="Cold" selected={mode === 'cold'} onClick={() => pickMode('cold')} />
        <ChoiceChip label="Heat" selected={mode === 'heat'} onClick={() => pickMode('heat')} />
      </div>

      <Stepper
        label="Indoor now"
        valueText={formatTemp(indoorC)}
        onDecrement={() => setIndoorC((v) => Math.max(-10, v - 1))}
        onIncrement={() => setIndoorC((v) => Math.min(45, v + 1))}
      />
      <Stepper
        label="Outdoor"
        valueText={formatTemp(outdoorC)}
        hint="Type today's outdoor temperature, or use tonight's forecast on the Plan tab."
        onDecrement={() => setOutdoorC((v) => Math.max(-40, v - 1))}
        onIncrement={() => setOutdoorC((v) => Math.min(50, v + 1))}
      />
      <Stepper
        label={mode === 'cold' ? 'Too cold below' : 'Too hot above'}
        valueText={formatTemp(thresholdC)}
        hint={
          mode === 'cold'
            ? '15 °C is a common cold-risk limit. Use a higher one for babies, older people or anyone frail.'
            : '32 °C is a common heat-risk limit. Use a lower one for babies, older people or anyone frail.'
        }
        onDecrement={() => setThresholdC((v) => v - 1)}
        onIncrement={() => setThresholdC((v) => v + 1)}
      />
      {careLine !== null && (mode === 'cold' ? thresholdC < careLine : thresholdC > careLine) ? (
        <Notice>
          Someone you look after is marked {needsWords}. A safer line for them is{' '}
          {formatTemp(careLine)}.{' '}
          <Button size="sm" onClick={() => setThresholdC(careLine)}>
            Use {formatTemp(careLine)}
          </Button>
        </Notice>
      ) : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          onClick={() =>
            onSave({
              archetype: picked
                ? {
                    type: picked.type,
                    vintage: picked.vintage,
                    insulation: picked.insulation,
                    climate: picked.climate,
                  }
                : null,
              indoorC,
              outdoorC,
              mode,
              thresholdC,
            })
          }
        >
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
