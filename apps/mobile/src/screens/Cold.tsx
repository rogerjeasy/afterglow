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
import { Sources } from '../night-shell/components';
import {
  Button,
  ChoiceChip,
  EditToggle,
  Fold,
  Notice,
  SearchField,
  Section,
  Stepper,
} from '../night-shell/controls';
import { Tombstone } from '../night-shell/costume';
import { navigate } from '../router';
import { cx } from '../ui/kit';
import { Page, PageHeader } from '../ui/page';
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
      className={cx(
        'inline-block rounded-full border-solid px-2.5 py-0.5 text-caption tracking-[0.06em]',
        loud ? 'border-2 border-ring text-emphasis' : 'border border-hairline text-secondary',
      )}
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
    <div className="min-w-0 rounded-[var(--radius-tile)] border border-hairline bg-surface-2 px-4 py-3.5 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <VerdictBadge label={text.label} />
        <span className="text-body text-primary [overflow-wrap:anywhere]">{displayName}</span>
      </div>
      <div className="mt-2 text-body text-emphasis [overflow-wrap:anywhere]">{text.headline}</div>
      {cited ? (
        <Sources
          labels={[
            `${USDA_SOURCE} · ${cited.citation.ruleId}`,
            `${cited.provenance.snapshotVersion} · ${cited.provenance.thermalModelVersion}`,
          ]}
          link={{ href: cited.citation.url, label: 'Read the USDA source' }}
        >
          {text.details.length > 0 ? <Details lines={text.details} /> : null}
        </Sources>
      ) : text.details.length > 0 ? (
        <Details lines={text.details} />
      ) : null}
      {actions ? <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** The rule's own qualifiers for a verdict, as a short list. */
function Details({ lines }: { lines: readonly string[] }): ReactNode {
  return (
    <ul className="m-0 mt-2 list-disc pl-5 text-caption text-secondary">
      {lines.map((d) => (
        <li key={d} className="[overflow-wrap:anywhere]">
          {d}
        </li>
      ))}
    </ul>
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
  const [editing, setEditing] = useState(false);

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
    <Page>
      <PageHeader
        title="Cold"
        eyebrow="Food and medicine"
        icon="tombstone"
        lead={
          view.outageStartedAtMs !== null
            ? `Power out since ${formatClockTime(view.outageStartedAtMs)}. Clocks are running.`
            : 'Power is on. These clocks show what would happen if it failed.'
        }
      />

      {assessments.length === 0 ? (
        <Section title="Your cold things">
          <Notice>
            Add your fridge and freezer. The app then works out, from physics and USDA guidance, how
            long each one protects your food.
          </Notice>
        </Section>
      ) : (
        <Section title="Your cold things" tourId="cold-first">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
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
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {CLASS_CHOICES.map((c) => (
                    <ChoiceChip
                      key={c.cls}
                      label={c.label}
                      selected={newClass === c.cls}
                      onClick={() => setNewClass(c.cls)}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-label text-secondary">How full?</span>
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
                <Button variant="primary" className="sm:self-start sm:px-10" onClick={addAppliance}>
                  Add it
                </Button>
              </div>
            ) : null}
          </Section>

          {selected ? (
            <>
              <Section title={selected.model.appliance.name}>
                <div className="flex flex-col gap-5">
                  <Sources labels={applianceSources(selected, thermal.APPLIANCE_MODEL_VERSION)} />

                  <Fold
                    label={`How full, room temperature${
                      selected.model.appliance.ambientIsDefault ? ' (a default is in use)' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-label text-secondary">How full?</span>
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
                  </Fold>

                  <div>
                    <div className="text-label text-secondary">Door opened</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button onClick={() => store.openDoor(selected.model.appliance.id, 1)}>
                        Opened 1 min
                      </Button>
                      <Button onClick={() => store.openDoor(selected.model.appliance.id, 2)}>
                        Opened 2 min
                      </Button>
                    </div>
                    <div className="mt-2 text-caption text-secondary">
                      {selected.model.doorMinutes > 0
                        ? `${formatDuration(selected.model.doorMinutes)} of door time counted this outage. `
                        : 'Openings count during an outage. '}
                      Cautious estimate, not measured: each minute open closes 2% of the gap to room
                      temperature, so the clocks only ever get shorter.
                    </div>
                  </div>

                  {/* A field check is a calm-day job: offered with the power on, never in the dark. */}
                  {view.outageStartedAtMs === null ? (
                    <div>
                      <div className="text-label text-secondary">Have a fridge thermometer?</div>
                      <div className="mt-1 text-caption text-secondary">
                        Unplug it for a few hours on a calm day and check my numbers against yours.
                        What you measure can only make this clock shorter.
                      </div>
                      <div className="mt-2">
                        <Button onClick={() => navigate('/app/field')}>
                          Check it against a thermometer
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Section>
            </>
          ) : null}
        </div>
        {selected ? (
          <div className="flex min-w-0 flex-col gap-8">
            <Section
              title={`In the ${selected.model.appliance.name.toLowerCase()}`}
              right={
                selected.items.length > 0 ? (
                  <EditToggle editing={editing} onToggle={() => setEditing((e) => !e)} />
                ) : undefined
              }
            >
              {selected.items.length === 0 ? (
                <Notice>Nothing listed yet. Search below and add what you keep here.</Notice>
              ) : (
                <div className="flex flex-col gap-3">
                  <Notice>{SENSORY_NOTICE}</Notice>
                  {selected.items.map(({ item, verdict }) => {
                    const name =
                      foodIndex.products.find((p) => p.product.id === item.productId)
                        ?.displayName ?? 'Unknown food';
                    return (
                      <VerdictCard
                        key={item.id}
                        displayName={name}
                        verdict={verdict}
                        elapsedMinutes={t}
                        actions={
                          verdict.kind !== 'lookRequired' &&
                          verdict.kind !== 'discard' &&
                          !editing ? null : (
                            <>
                              {verdict.kind === 'discard' && !editing ? (
                                // Recorded with the reason, for the outage report (7.19).
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => store.removeItem(item.id, 'discarded')}
                                >
                                  I threw it out
                                </Button>
                              ) : null}
                              {verdict.kind === 'lookRequired' ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => store.checkIce(item.id, 'present')}
                                  >
                                    Ice crystals remain
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => store.checkIce(item.id, 'absent')}
                                  >
                                    None left
                                  </Button>
                                </>
                              ) : null}
                              {editing ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => store.removeItem(item.id)}
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </>
                          )
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
                  Answers use {selected.model.appliance.name.toLowerCase()} as it is now. Every
                  answer cites the USDA rule it comes from. Foods USDA does not name are treated as
                  perishables.
                </Notice>
              ) : results.length === 0 ? (
                <Notice>
                  Not in the USDA FoodKeeper list, so I will not guess. Check the label, or ask the
                  USDA Meat and Poultry Hotline.
                </Notice>
              ) : (
                <div className="flex flex-col gap-3">
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
                            <span className="text-caption text-secondary">
                              Already in the {selected.model.appliance.name.toLowerCase()}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() =>
                                store.addItem(selected.model.appliance.id, r.product.id)
                              }
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
          </div>
        ) : null}
      </div>

      <Medicines nowMs={nowMs} applianceId={selected ? selected.model.appliance.id : null} />

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <Fold label="Remove a fridge or clear data">
          {selected ? (
            <Button
              variant="ghost"
              onClick={() => store.removeAppliance(selected.model.appliance.id)}
            >
              Remove {selected.model.appliance.name.toLowerCase()}
            </Button>
          ) : null}
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
        </Fold>

        <Section title="How these numbers are made">
          <Notice>
            Food rules come from {foodIndex.rules.source.publisher}, "{foodIndex.rules.source.title}
            ", and the USDA FoodKeeper list. Temperatures come from a {MODEL_SOURCE} of your
            appliance that moves toward the room temperature. Nothing here is a guess from an AI.
            Never taste food to test it; when in doubt, throw it out.
          </Notice>
          <Sources
            labels={[
              `${foodIndex.rules.source.publisher}: ${foodIndex.rules.source.title}`,
              `USDA FoodKeeper ${foodIndex.snapshotVersion}`,
              `${MODEL_SOURCE} ${thermal.APPLIANCE_MODEL_VERSION}`,
            ]}
          />
        </Section>
      </div>
    </Page>
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
