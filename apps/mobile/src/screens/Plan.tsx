import { coguard, energy, household } from '@afterglow/core';
import { type ReactNode, useMemo, useState } from 'react';
import { formatTemp } from '../format';
import { hoursOfSafetyText } from '../household/present';
import { useHousehold } from '../household/useHousehold';
import { LibrarySection } from '../library/LibrarySection';
import { Sources } from '../night-shell/components';
import { Button, ChoiceChip, Fold, Notice, Stepper, TextField } from '../night-shell/controls';
import { Candle } from '../night-shell/costume';
import { GraveyardChart } from '../night-shell/graveyard';
import { token } from '../night-shell/theme';
import { ForecastAndDestinations } from '../places/ForecastAndDestinations';
import { type DeviceProfile, MEDICAL_DEVICES } from '../plan/devices';
import { nightText } from '../plan/graveyard';
import {
  CLASS_LABEL,
  KIND_LABEL,
  PLAN_SOURCE,
  STATUS_LABEL,
  checkLine,
  drawText,
  hoursText,
  parsePositive,
  validUntil,
  whText,
} from '../plan/present';
import { navigate } from '../router';
import { ScheduleSection } from '../schedule/ScheduleSection';
import { Page, PageHeader, Panel } from '../ui/page';
import { HomeSetup } from './HomeSetup';

const STORE_KINDS = Object.keys(KIND_LABEL) as energy.StoreKind[];
const LOAD_CLASSES = Object.keys(CLASS_LABEL) as energy.LoadClass[];
/** Kinds that normally have an AC outlet; the user can still flip it. */
const AC_BY_DEFAULT: ReadonlySet<energy.StoreKind> = new Set(['homeBattery', 'ups', 'generator']);

function Badge({ label, loud }: { label: string; loud: boolean }): ReactNode {
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

/** The hours-of-safety band as a bar: earliest, likely and latest crossing (design 7.7). */
function BandBar({ h }: { h: Extract<household.HoursOfSafety, { kind: 'band' }> }): ReactNode {
  const top = h.latestMinutes ?? h.midMinutes * 1.6;
  const span = Math.max(top, 1);
  const pct = (m: number): number => Math.max(0, Math.min(100, (m / span) * 100));
  return (
    <div
      role="img"
      aria-label={`Between ${Math.round(h.earliestMinutes / 6) / 10} and ${
        h.latestMinutes === null ? 'more than' : Math.round(h.latestMinutes / 6) / 10
      } hours, likely ${Math.round(h.midMinutes / 6) / 10} hours`}
      style={{
        position: 'relative',
        height: 28,
        borderRadius: 6,
        border: `1px solid ${token('hairline')}`,
        background: token('surface.1'),
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `${pct(h.earliestMinutes)}%`,
          width: `${Math.max(2, pct(h.latestMinutes ?? span) - pct(h.earliestMinutes))}%`,
          // Hatched, not solid: a band is a range, not a point (design 11.7).
          background: `repeating-linear-gradient(45deg, ${token('control.fill.primary')} 0 4px, transparent 4px 8px)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: `calc(${pct(h.midMinutes)}% - 1px)`,
          width: 3,
          background: token('text.emphasis'),
        }}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string | undefined;
}): ReactNode {
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
    />
  );
}

/**
 * The Plan: hours of safety, the candles (energy stores and what each carries)
 * and the ward (CO Guard). Every number comes from the deterministic core, every
 * default is labelled, and anything it cannot cover is said plainly.
 */
export function Plan({ nowMs }: { nowMs: number }): ReactNode {
  const { store, state, demo } = useHousehold();
  const { view } = state;

  // ---- hours of safety
  const hours = useMemo(() => household.hoursOfSafety(view, nowMs), [view, nowMs]);
  const homeText = hoursOfSafetyText(hours);
  const shift = useMemo(() => household.graveyardShift(view, nowMs), [view, nowMs]);
  const shiftText = shift.kind === 'night' ? nightText(shift, nowMs) : null;
  const [settingUpHome, setSettingUpHome] = useState(false);

  // ---- candles
  const assessment = useMemo(() => household.assessEnergy(view), [view]);
  const [kind, setKind] = useState<energy.StoreKind>('powerBank');
  const [sName, setSName] = useState('');
  const [capText, setCapText] = useState('');
  const [unit, setUnit] = useState<'wh' | 'mah'>('wh');
  const [charge, setCharge] = useState(100);
  const [ac, setAc] = useState(false);
  const [lName, setLName] = useState('');
  const [wattsText, setWattsText] = useState('');
  const [lClass, setLClass] = useState<energy.LoadClass>('communication');
  const [needs, setNeeds] = useState<energy.Need>('usb');
  const [device, setDevice] = useState<DeviceProfile | null>(null);
  const [touched, setTouched] = useState(false);

  const capacity =
    unit === 'wh'
      ? parsePositive(capText)
      : (() => {
          const mah = parsePositive(capText);
          return mah === null ? null : energy.whFromMah(mah);
        })();
  const watts = parsePositive(wattsText);

  const addStore = (): void => {
    setTouched(true);
    if (capacity === null) return;
    store.addEnergyStore({
      name: sName.trim() === '' ? KIND_LABEL[kind] : sName.trim(),
      kind,
      capacityWh: capacity,
      chargePct: charge,
      ac,
    });
    setSName('');
    setCapText('');
    setTouched(false);
  };
  const addLoad = (): void => {
    setTouched(true);
    if (watts === null || lName.trim() === '') return;
    store.addEnergyLoad({ name: lName.trim(), watts, class: lClass, needs });
    setLName('');
    setWattsText('');
    setDevice(null);
    setTouched(false);
  };

  const plan = assessment.result.kind === 'plan' ? assessment.result.plan : null;
  const names = new Map(view.energyStores.map((s) => [s.id, s.name]));

  // ---- ward
  const [symptoms, setSymptoms] = useState(false);
  const ward = useMemo(
    () => household.assessWardOf(view, nowMs, symptoms),
    [view, nowMs, symptoms],
  );
  const until = ward.ward === 'open' ? validUntil(view.wardAnswers, coguard.MAX_AGE_MS) : null;

  return (
    <Page>
      <PageHeader
        title="Plan"
        eyebrow="Power and readiness"
        icon="candle"
        lead="What the night allows: how long your home holds, what your batteries can carry, and a gate for the generator."
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <Panel title="Hours of safety" icon="clock">
          <div className="flex flex-col gap-3">
            <div className="clock text-[length:var(--type-clock-lg)] text-emphasis">
              {homeText.value}
            </div>
            <div className="text-caption text-secondary">
              {hours.kind === 'unknown'
                ? 'Tell me about your home to get a band, not a guess.'
                : homeText.note}
            </div>
            {hours.kind === 'band' ? <BandBar h={hours} /> : null}
            <Sources
              labels={[
                ...homeText.sources,
                ...(view.home
                  ? [`${formatTemp(view.home.indoorC)} in, ${formatTemp(view.home.outdoorC)} out`]
                  : []),
              ]}
            />
            <Button onClick={() => setSettingUpHome(true)}>
              {view.home ? 'Change my home' : 'Tell me about my home'}
            </Button>
            {settingUpHome ? (
              <HomeSetup
                current={view.home}
                onCancel={() => setSettingUpHome(false)}
                onSave={(home) => {
                  store.setHome(home);
                  setSettingUpHome(false);
                }}
              />
            ) : null}
          </div>
        </Panel>

        {shift.kind === 'night' && shiftText ? (
          <Panel title="Graveyard shift" icon="tombstone" tourId="graveyard">
            <div className="flex flex-col gap-3">
              <div className="clock text-[length:var(--type-clock-lg)] text-emphasis">
                {shiftText.headline}
              </div>
              <div className="text-body [overflow-wrap:anywhere]">{shiftText.detail}</div>
              <GraveyardChart night={shift} nowMs={nowMs} />
              <div className="text-caption text-secondary">
                {shiftText.axis}
                {view.outageStartedAtMs === null
                  ? ' No outage has started, so this is what a power cut now would do.'
                  : ''}
              </div>
              <Sources labels={shiftText.sources} />
              <Notice>
                An indoor-temperature estimate from the building's heat-loss time constant. Warming
                centres and where to go are not shown yet.
              </Notice>
              {view.outageStartedAtMs === null ? (
                <div>
                  <Button onClick={() => navigate('/app/field')}>
                    Check it against a thermometer tonight
                  </Button>
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <Panel title="Candles" icon="battery">
          <div className="flex flex-col gap-5">
            <Stepper
              label="Cover the next"
              valueText={hoursText(assessment.horizonHours)}
              hint={
                assessment.horizonIsDefault
                  ? 'A default of 12 h. Set how long you need to cover: until dawn, or until the schedule says power returns.'
                  : 'Set by you.'
              }
              decrementDisabled={assessment.horizonHours <= energy.MIN_HORIZON_HOURS + 0.5}
              incrementDisabled={assessment.horizonHours >= energy.MAX_HORIZON_HOURS}
              onDecrement={() => store.setHorizon(Math.max(1, assessment.horizonHours - 1))}
              onIncrement={() =>
                store.setHorizon(Math.min(energy.MAX_HORIZON_HOURS, assessment.horizonHours + 1))
              }
            />

            {view.energyStores.length === 0 ? (
              <Notice>
                No batteries yet. Add the power banks, batteries and generators you have. I need the
                capacity of each; I will not guess it.
              </Notice>
            ) : (
              <div className="flex flex-col gap-2.5">
                {view.energyStores.map((s) => {
                  const outcome = plan?.stores.find((o) => o.store.id === s.id);
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        gap: 14,
                        alignItems: 'center',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-tile)',
                        background: token('surface.2'),
                        border: `1px solid ${token('hairline')}`,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Candle
                        startPct={s.chargePct}
                        afterPct={outcome?.afterPct ?? s.chargePct}
                        label={s.name}
                      />
                      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 'var(--type-body)',
                            color: token('text.primary'),
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {s.name}
                        </div>
                        <div
                          style={{
                            fontSize: 'var(--type-caption)',
                            color: token('text.secondary'),
                          }}
                        >
                          {KIND_LABEL[s.kind]} · {whText(s.capacityWh)} · {Math.round(s.chargePct)}%
                          now
                          {outcome ? ` · ${Math.round(outcome.afterPct)}% after the plan` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button
                          size="sm"
                          onClick={() =>
                            store.updateEnergyStore(s.id, {
                              ...s,
                              chargePct: Math.max(0, s.chargePct - 10),
                            })
                          }
                          ariaLabel={`Lower the charge of ${s.name} by 10 percent`}
                        >
                          −10%
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            store.updateEnergyStore(s.id, {
                              ...s,
                              chargePct: Math.min(100, s.chargePct + 10),
                            })
                          }
                          ariaLabel={`Raise the charge of ${s.name} by 10 percent`}
                        >
                          +10%
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => store.removeEnergyStore(s.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {view.energyLoads.length === 0 ? (
              <Notice>
                Nothing to power yet. Add what you must keep running (a CPAP, a router, a lamp) and
                its power draw in watts, from its label.
              </Notice>
            ) : null}

            {plan ? (
              <div className="flex flex-col gap-2.5">
                {plan.loads.map((l) => (
                  <div
                    key={l.load.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-tile)',
                      background: token('surface.2'),
                      border: `${l.status !== 'covered' && l.load.class === 'medical' ? 2 : 1}px solid ${
                        l.status !== 'covered' && l.load.class === 'medical'
                          ? token('focus.ring')
                          : token('hairline')
                      }`,
                    }}
                  >
                    <div
                      style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}
                    >
                      <Badge
                        label={STATUS_LABEL[l.status]}
                        loud={l.status !== 'covered' && l.load.class === 'medical'}
                      />
                      <span
                        style={{
                          fontSize: 'var(--type-body)',
                          color: token('text.primary'),
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {l.load.name}
                      </span>
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 'var(--type-body)',
                        color: token('text.emphasis'),
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {l.message}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 'var(--type-caption)',
                        color: token('text.secondary'),
                      }}
                    >
                      {CLASS_LABEL[l.load.class]} · {l.load.watts} W ·{' '}
                      {l.load.needs === 'ac' ? 'needs AC' : 'USB'} · from {drawText(l, names)} ·{' '}
                      {hoursText(l.runtimeHours)} of {hoursText(plan.horizonHours)}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => store.removeEnergyLoad(l.load.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {plan.excluded.map((e) => (
                  <Notice key={`${e.kind}-${e.id}-${e.reason}`}>
                    A {e.kind} was left out. {e.reason}
                  </Notice>
                ))}
                <Sources
                  labels={[
                    `${PLAN_SOURCE} · ${plan.modelVersion}`,
                    ...plan.defaultsUsed.map((d) => `default: ${d}`),
                  ]}
                >
                  An estimate that assumes each load runs without a break. Real devices cycle and
                  lose some energy in conversion.
                </Sources>
              </div>
            ) : assessment.result.kind === 'noPlan' ? (
              <Notice>{assessment.result.reason}</Notice>
            ) : null}

            <Fold label="Add a battery">
              <div className="flex flex-col gap-3.5">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {STORE_KINDS.map((k) => (
                    <ChoiceChip
                      key={k}
                      label={KIND_LABEL[k]}
                      selected={kind === k}
                      onClick={() => {
                        setKind(k);
                        setAc(AC_BY_DEFAULT.has(k));
                      }}
                    />
                  ))}
                </div>
                <NumberField label="Name (optional)" value={sName} onChange={setSName} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ChoiceChip
                    label="Watt-hours (Wh)"
                    selected={unit === 'wh'}
                    onClick={() => setUnit('wh')}
                  />
                  <ChoiceChip
                    label="Milliamp-hours (mAh)"
                    selected={unit === 'mah'}
                    onClick={() => setUnit('mah')}
                  />
                </div>
                <NumberField
                  label={unit === 'wh' ? 'Capacity (Wh)' : 'Capacity (mAh)'}
                  value={capText}
                  onChange={setCapText}
                  hint={
                    unit === 'mah'
                      ? `Converted at ${energy.DEFAULT_CELL_VOLTS} V, the usual cell voltage (a default). Check the label for Wh if it has one.`
                      : 'Printed on the battery or in its manual.'
                  }
                  error={
                    touched && capacity === null
                      ? 'Enter the capacity as a number above zero.'
                      : undefined
                  }
                />
                <Stepper
                  label="Charge now"
                  valueText={`${charge}%`}
                  decrementDisabled={charge <= 0}
                  incrementDisabled={charge >= 100}
                  onDecrement={() => setCharge(Math.max(0, charge - 10))}
                  onIncrement={() => setCharge(Math.min(100, charge + 10))}
                />
                <ChoiceChip
                  label="Has a mains-style (AC) outlet"
                  selected={ac}
                  onClick={() => setAc(!ac)}
                />
                <Button variant="primary" onClick={addStore}>
                  Add battery
                </Button>
              </div>
            </Fold>

            <Fold label="Add something to power">
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-2">
                  <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
                    A medical device? Pick it and I will power it first.
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {MEDICAL_DEVICES.map((d) => (
                      <ChoiceChip
                        key={d.name}
                        label={d.name}
                        selected={device?.name === d.name}
                        onClick={() => {
                          setDevice(d);
                          setLName(d.name);
                          setLClass('medical');
                          setNeeds(d.needs);
                        }}
                      />
                    ))}
                  </div>
                </div>
                <NumberField label="Name" value={lName} onChange={setLName} />
                <NumberField
                  label="Power draw (watts)"
                  value={wattsText}
                  onChange={setWattsText}
                  hint={
                    device && lName === device.name
                      ? `${device.name}: ${device.typical}. Use the watts on your own device's label: I do not guess watts.`
                      : 'From its label or manual. I do not guess watts.'
                  }
                  error={
                    touched && watts === null
                      ? 'Enter the watts as a number above zero.'
                      : undefined
                  }
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {LOAD_CLASSES.map((c) => (
                    <ChoiceChip
                      key={c}
                      label={CLASS_LABEL[c]}
                      selected={lClass === c}
                      onClick={() => setLClass(c)}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ChoiceChip
                    label="Runs from USB"
                    selected={needs === 'usb'}
                    onClick={() => setNeeds('usb')}
                  />
                  <ChoiceChip
                    label="Needs an AC outlet"
                    selected={needs === 'ac'}
                    onClick={() => setNeeds('ac')}
                  />
                </div>
                <Button variant="primary" onClick={addLoad}>
                  Add to the plan
                </Button>
              </div>
            </Fold>
          </div>
        </Panel>

        <Panel title="Generator ward" icon="shield" tourId="ward">
          <div className="flex flex-col gap-3.5">
            <div
              style={{
                padding: 16,
                borderRadius: 'var(--radius-tile)',
                background: token('surface.2'),
                border: `${ward.ward === 'closed' ? 2 : 1}px solid ${ward.ward === 'closed' ? token('focus.ring') : token('hairline')}`,
              }}
            >
              <div style={{ fontSize: 'var(--type-body)', color: token('text.emphasis') }}>
                {ward.ward === 'closed'
                  ? 'Not set up. The generator stays off until every check is confirmed.'
                  : `All four checks are confirmed${until ? ` until ${until}` : ''}.`}
              </div>
              {/* The closed bar of the ward: it stays across the card until the conditions are met. */}
              {ward.ward === 'closed' ? (
                <div
                  aria-hidden="true"
                  className="ward-bar"
                  style={{
                    height: 6,
                    marginTop: 12,
                    borderRadius: 3,
                    background: token('focus.ring'),
                  }}
                />
              ) : null}
              <div
                style={{
                  marginTop: 10,
                  fontSize: 'var(--type-caption)',
                  color: token('text.secondary'),
                }}
              >
                {ward.notice} Answers expire after 6 hours (an Afterglow rule), so check again when
                you move or refuel it.
              </div>
            </div>

            {ward.checks.map((c) => {
              const line = checkLine(c);
              const own = view.wardAnswers[c.spec.id];
              return (
                <div
                  key={c.spec.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-tile)',
                    background: token('surface.2'),
                    border: `${line.loud ? 2 : 1}px solid ${line.loud ? token('focus.ring') : token('hairline')}`,
                  }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge label={line.label} loud={line.loud} />
                    <span
                      style={{
                        fontSize: 'var(--type-body)',
                        color: token('text.primary'),
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {c.spec.question}
                    </span>
                  </div>
                  {line.detail ? (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 'var(--type-caption)',
                        color: token('text.secondary'),
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {line.detail}
                    </div>
                  ) : null}
                  <div
                    style={{
                      marginTop: 8,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <Button
                      size="sm"
                      variant={own?.answer === 'yes' ? 'primary' : 'secondary'}
                      onClick={() => store.answerWard(c.spec.id, 'yes')}
                      ariaLabel={`Yes: ${c.spec.question}`}
                    >
                      Yes
                    </Button>
                    <Button
                      size="sm"
                      variant={own?.answer === 'no' ? 'primary' : 'secondary'}
                      onClick={() => store.answerWard(c.spec.id, 'no')}
                      ariaLabel={`No: ${c.spec.question}`}
                    >
                      No
                    </Button>
                    <a
                      href={c.spec.source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        minHeight: 44,
                        display: 'inline-flex',
                        alignItems: 'center',
                        fontSize: 'var(--type-caption)',
                        color: token('text.secondary'),
                      }}
                    >
                      {c.spec.source.title}
                    </a>
                  </div>
                </div>
              );
            })}

            <ChoiceChip
              label="Someone has symptoms"
              selected={symptoms}
              onClick={() => setSymptoms(!symptoms)}
            />
            <div className="text-caption text-secondary">
              Symptoms: {coguard.SYMPTOMS.join(', ')}. This is asked here and never saved.
            </div>
            {ward.symptomAdvice ? (
              <div
                role="alert"
                style={{
                  padding: 16,
                  borderRadius: 'var(--radius-tile)',
                  border: `2px solid ${token('focus.ring')}`,
                  background: token('surface.2'),
                  fontSize: 'var(--type-body)',
                  color: token('text.emphasis'),
                }}
              >
                {ward.symptomAdvice}
              </div>
            ) : null}
            <Notice>
              Afterglow is not an emergency service or a carbon monoxide alarm. It cannot detect
              gas. Only a working alarm can.
            </Notice>
          </div>
        </Panel>
      </div>

      {/* The demo is a simulated household with no real area; forecast and places are real-only. */}
      {demo ? null : <ForecastAndDestinations home={view.home} store={store} nowMs={nowMs} />}

      {demo ? null : <ScheduleSection nowMs={nowMs} />}

      <LibrarySection />
    </Page>
  );
}
