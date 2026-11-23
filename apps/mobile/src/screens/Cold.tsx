import { foodkeeper, household, thermal } from '@afterglow/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { foodIndex } from '../data/foodkeeper';
import { formatClockTime, formatDuration, formatTemp } from '../format';
import {
  MODEL_SOURCE,
  SENSORY_NOTICE,
  USDA_SOURCE,
  applianceSources,
  applianceTileText,
  verdictText,
} from '../household/present';
import { useHousehold } from '../household/useHousehold';
import { SourceChip } from '../night-shell/components';
import { Button, ChoiceChip, Notice, SearchField, Section, Stepper } from '../night-shell/controls';
import { Tombstone } from '../night-shell/costume';
import { token } from '../night-shell/theme';
import { Medicines } from './Medicines';

const CLASS_CHOICES: readonly { cls: thermal.ApplianceClass; label: string }[] = [
  { cls: 'fridge', label: 'Fridge' },
  { cls: 'fridgeFreezerCombo', label: 'Fridge-freezer' },
  { cls: 'freezer', label: 'Freezer' },
  { cls: 'chestFreezer', label: 'Chest freezer' },
  { cls: 'coolerBox', label: 'Cooler box' },
];

const MIN_ROOM_C = -10;
const MAX_ROOM_C = 45;

function VerdictBadge({ label }: { label: string }): ReactNode {
  const loud = label === 'DISCARD' || label === 'LOOK';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        border: `${loud ? 2 : 1}px solid ${loud ? token('focus.ring') : token('hairline')}`,
        color: loud ? token('text.emphasis') : token('text.secondary'),
        fontSize: 'var(--type-caption)',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </span>
  );
}

function VerdictCard({
  displayName,
  verdict,
  elapsedMinutes,
  actions,
}: {
  displayName: string;
  verdict: foodkeeper.FoodVerdict;
  elapsedMinutes: number;
  actions?: ReactNode;
}): ReactNode {
  const text = verdictText(verdict, elapsedMinutes);
  const cited = verdict.kind !== 'unknown' ? verdict : null;
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-tile)',
        background: token('surface.2'),
        border: `1px solid ${token('hairline')}`,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <VerdictBadge label={text.label} />
        <span
          style={{
            fontSize: 'var(--type-body)',
            color: token('text.primary'),
            overflowWrap: 'anywhere',
          }}
        >
          {displayName}
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 'var(--type-body)',
          color: token('text.emphasis'),
          overflowWrap: 'anywhere',
        }}
      >
        {text.headline}
      </div>
      {text.details.length > 0 ? (
        <ul
          style={{
            margin: '8px 0 0',
            paddingLeft: 20,
            fontSize: 'var(--type-caption)',
            color: token('text.secondary'),
          }}
        >
          {text.details.map((d) => (
            <li key={d} style={{ overflowWrap: 'anywhere' }}>
              {d}
            </li>
          ))}
        </ul>
      ) : null}
      {cited ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <SourceChip label={`${USDA_SOURCE} · ${cited.citation.ruleId}`} />
          <SourceChip
            label={`${cited.provenance.snapshotVersion} · ${cited.provenance.thermalModelVersion}`}
          />
          <a
            href={cited.citation.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginTop: 10,
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              fontSize: 'var(--type-caption)',
              color: token('text.secondary'),
            }}
          >
            Read the USDA source
          </a>
        </div>
      ) : null}
      {actions ? (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>{actions}</div>
      ) : null}
    </div>
  );
}

export function Cold({
  nowMs,
  selectedId,
  onSelect,
}: {
  nowMs: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}): ReactNode {
  const { store, state } = useHousehold();
  const { view } = state;
  const [adding, setAdding] = useState(false);
  const [newClass, setNewClass] = useState<thermal.ApplianceClass>('fridge');
  const [newFullness, setNewFullness] = useState<thermal.Fullness>('half');
  const [query, setQuery] = useState('');

  const assessments = useMemo(() => household.assessAll(view, foodIndex, nowMs), [view, nowMs]);
  const elapsed = household.elapsedMinutes(view, nowMs);
  const t = elapsed ?? 0;
  const selected =
    assessments.find((a) => a.model.appliance.id === selectedId) ?? assessments[0] ?? null;

  // Keep the selection valid when appliances come and go.
  useEffect(() => {
    if (selected && selected.model.appliance.id !== selectedId)
      onSelect(selected.model.appliance.id);
    if (!selected && selectedId !== null) onSelect(null);
  }, [selected, selectedId, onSelect]);

  const addAppliance = (): void => {
    const label = CLASS_CHOICES.find((c) => c.cls === newClass)?.label ?? 'Appliance';
    const same = view.appliances.filter((a) => a.class === newClass).length;
    const id = store.addAppliance({
      name: same === 0 ? label : `${label} ${same + 1}`,
      class: newClass,
      fullness: newFullness,
      ambientC: null,
    });
    onSelect(id);
    setAdding(false);
  };

  const results = useMemo(() => foodkeeper.searchFood(foodIndex, query, 6), [query]);

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '8px 20px 120px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}
    >
      <header>
        <h1 style={{ margin: 0, fontSize: 'var(--type-title)', color: token('text.emphasis') }}>
          Cold
        </h1>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--type-body)',
            color: token('text.secondary'),
          }}
        >
          {view.outageStartedAtMs !== null
            ? `Power out since ${formatClockTime(view.outageStartedAtMs)}. Clocks are running.`
            : 'Power is on. These clocks show what would happen if it failed.'}
        </p>
      </header>

      {assessments.length === 0 ? (
        <Section title="Your cold things">
          <Notice>
            Add your fridge and freezer. The app then works out, from physics and USDA guidance, how
            long each one protects your food.
          </Notice>
        </Section>
      ) : (
        <Section title="Your cold things">
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}
          >
            {assessments.map((a) => {
              const text = applianceTileText(a);
              const past = a.headline.kind === 'pastWindow';
              const progress =
                elapsed !== null && a.windowMinutes !== null && a.windowMinutes > 0
                  ? elapsed / a.windowMinutes
                  : 0;
              return (
                <Tombstone
                  key={a.model.appliance.id}
                  title={a.model.appliance.name}
                  epitaph={text.value}
                  caption={text.note}
                  progress={progress}
                  cracked={past}
                  live={elapsed !== null}
                  selected={a.model.appliance.id === selected?.model.appliance.id}
                  onClick={() => onSelect(a.model.appliance.id)}
                />
              );
            })}
          </div>
        </Section>
      )}

      <Section
        title={assessments.length === 0 ? 'Add an appliance' : 'Add another'}
        right={
          assessments.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setAdding(!adding)}>
              {adding ? 'Close' : 'Add'}
            </Button>
          ) : undefined
        }
      >
        {adding || assessments.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CLASS_CHOICES.map((c) => (
                <ChoiceChip
                  key={c.cls}
                  label={c.label}
                  selected={newClass === c.cls}
                  onClick={() => setNewClass(c.cls)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>
                How full?
              </span>
              <ChoiceChip
                label="Full"
                selected={newFullness === 'full'}
                onClick={() => setNewFullness('full')}
              />
              <ChoiceChip
                label="Half full"
                selected={newFullness === 'half'}
                onClick={() => setNewFullness('half')}
              />
            </div>
            <Button variant="primary" onClick={addAppliance}>
              Add it
            </Button>
          </div>
        ) : null}
      </Section>

      {selected ? (
        <>
          <Section title={selected.model.appliance.name}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {applianceSources(selected, thermal.APPLIANCE_MODEL_VERSION).map((s) => (
                  <SourceChip key={s} label={s} />
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>
                  How full?
                </span>
                <ChoiceChip
                  label="Full"
                  selected={selected.model.appliance.fullness === 'full'}
                  onClick={() =>
                    store.updateAppliance(
                      selected.model.appliance.id,
                      toInput(selected.model.appliance, { fullness: 'full' }),
                    )
                  }
                />
                <ChoiceChip
                  label="Half full"
                  selected={selected.model.appliance.fullness === 'half'}
                  onClick={() =>
                    store.updateAppliance(
                      selected.model.appliance.id,
                      toInput(selected.model.appliance, { fullness: 'half' }),
                    )
                  }
                />
              </div>

              <Stepper
                label="Room temperature"
                valueText={formatTemp(selected.model.appliance.ambientC)}
                hint={
                  selected.model.appliance.ambientIsDefault
                    ? 'Default 22 °C. Set yours; a warmer room shortens every clock.'
                    : 'Set by you.'
                }
                decrementDisabled={selected.model.appliance.ambientC <= MIN_ROOM_C}
                incrementDisabled={selected.model.appliance.ambientC >= MAX_ROOM_C}
                onDecrement={() =>
                  store.updateAppliance(
                    selected.model.appliance.id,
                    toInput(selected.model.appliance, {
                      ambientC: selected.model.appliance.ambientC - 1,
                    }),
                  )
                }
                onIncrement={() =>
                  store.updateAppliance(
                    selected.model.appliance.id,
                    toInput(selected.model.appliance, {
                      ambientC: selected.model.appliance.ambientC + 1,
                    }),
                  )
                }
              />

              <div>
                <div style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>
                  Door opened
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <Button onClick={() => store.openDoor(selected.model.appliance.id, 1)}>
                    Opened 1 min
                  </Button>
                  <Button onClick={() => store.openDoor(selected.model.appliance.id, 2)}>
                    Opened 2 min
                  </Button>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 'var(--type-caption)',
                    color: token('text.secondary'),
                  }}
                >
                  {selected.model.doorMinutes > 0
                    ? `${formatDuration(selected.model.doorMinutes)} of door time counted this outage. `
                    : 'Openings count during an outage. '}
                  Cautious estimate, not measured: each minute open closes 2% of the gap to room
                  temperature, so the clocks only ever get shorter. A thermometer will replace it.
                </div>
              </div>
            </div>
          </Section>

          <Section title={`In the ${selected.model.appliance.name.toLowerCase()}`}>
            {selected.items.length === 0 ? (
              <Notice>Nothing listed yet. Search below and add what you keep here.</Notice>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Notice>{SENSORY_NOTICE}</Notice>
                {selected.items.map(({ item, verdict }) => {
                  const name =
                    foodIndex.products.find((p) => p.product.id === item.productId)?.displayName ??
                    'Unknown food';
                  return (
                    <VerdictCard
                      key={item.id}
                      displayName={name}
                      verdict={verdict}
                      elapsedMinutes={t}
                      actions={
                        <>
                          {verdict.kind === 'lookRequired' ? (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => store.checkIce(item.id, 'present')}
                              >
                                Ice crystals remain
                              </Button>
                              <Button size="sm" onClick={() => store.checkIce(item.id, 'absent')}>
                                None left
                              </Button>
                            </>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => store.removeItem(item.id)}
                          >
                            Remove
                          </Button>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Can I eat the …?">
            <SearchField
              label="Search the USDA FoodKeeper list"
              placeholder="chicken, milk, butter, ice cream"
              value={query}
              onChange={setQuery}
            />
            {query.trim().length === 0 ? (
              <Notice>
                Answers use {selected.model.appliance.name.toLowerCase()} as it is now. Every answer
                cites the USDA rule it comes from. Foods USDA does not name are treated as
                perishables.
              </Notice>
            ) : results.length === 0 ? (
              <Notice>
                Not in the USDA FoodKeeper list, so I will not guess. Check the label, or ask the
                USDA Meat and Poultry Hotline.
              </Notice>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {results.map((r) => {
                  const verdict = foodkeeper.assessFood(foodIndex, {
                    productId: r.product.id,
                    compartment: selected.model.kind,
                    state: selected.model.state,
                    minutesSincePowerLoss: t,
                  });
                  const already = selected.items.some((i) => i.item.productId === r.product.id);
                  return (
                    <VerdictCard
                      key={r.product.id}
                      displayName={r.displayName}
                      verdict={verdict}
                      elapsedMinutes={t}
                      actions={
                        already ? (
                          <span
                            style={{
                              fontSize: 'var(--type-caption)',
                              color: token('text.secondary'),
                            }}
                          >
                            Already in the {selected.model.appliance.name.toLowerCase()}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => store.addItem(selected.model.appliance.id, r.product.id)}
                          >
                            Add to {selected.model.appliance.name.toLowerCase()}
                          </Button>
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Remove">
            <Button
              variant="ghost"
              onClick={() => {
                store.removeAppliance(selected.model.appliance.id);
              }}
            >
              Remove {selected.model.appliance.name.toLowerCase()}
            </Button>
          </Section>
        </>
      ) : null}

      <Medicines nowMs={nowMs} applianceId={selected ? selected.model.appliance.id : null} />

      <Section title="Your data">
        <Notice>
          This clears every appliance, food and clock in the space you are in now. It does not
          delete your account (use You for that).
        </Notice>
        <Button
          variant="ghost"
          onClick={() => {
            store.deleteAllData();
            onSelect(null);
          }}
        >
          Clear all household data here
        </Button>
      </Section>

      <Section title="How these numbers are made">
        <Notice>
          Food rules come from {foodIndex.rules.source.publisher}, "{foodIndex.rules.source.title}",
          and the USDA FoodKeeper list ({foodIndex.snapshotVersion}). Temperatures come from a{' '}
          {MODEL_SOURCE} of your appliance that moves toward the room temperature. Nothing here is a
          guess from an AI. Never taste food to test it; when in doubt, throw it out.
        </Notice>
      </Section>
    </main>
  );
}

function toInput(
  a: household.Appliance,
  over: Partial<{ fullness: thermal.Fullness; ambientC: number }>,
) {
  return {
    name: a.name,
    class: a.class,
    fullness: over.fullness ?? a.fullness,
    ambientC: over.ambientC ?? (a.ambientIsDefault ? null : a.ambientC),
  };
}
