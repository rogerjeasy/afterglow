import { household } from '@afterglow/core';
import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { useHousehold } from '../household/useHousehold';
import { StatusLine } from '../night-shell/components';
import { Button, ChoiceChip, Notice, Section, Stepper, TextField } from '../night-shell/controls';
import { themeVars, token } from '../night-shell/theme';
import {
  STEPS,
  type StepId,
  nextStep,
  previousStep,
  progressText,
  stepIndex,
  summaryLines,
} from '../onboarding/logic';
import { HomeSetup } from './HomeSetup';

/**
 * First run (design 11.1): short, every step skippable, each step collecting
 * something the dark will need. It writes through the same store actions as the
 * Cold and Séance tabs, into the real (guest) space only. Calibrating the ear is
 * not offered because microphone sensing is native work; it is not faked here.
 */

const COLD_CHOICES: readonly { cls: household.AppliancePayload['class']; label: string }[] = [
  { cls: 'fridge', label: 'Fridge' },
  { cls: 'fridgeFreezerCombo', label: 'Fridge-freezer' },
  { cls: 'freezer', label: 'Freezer' },
  { cls: 'chestFreezer', label: 'Chest freezer' },
  { cls: 'coolerBox', label: 'Cooler box' },
];

export function Onboarding({
  onFinish,
  onStartDemo,
  onStartTour,
}: {
  /** Called when setup ends, however it ends. */
  onFinish: (how: 'done' | 'skipped') => void;
  onStartDemo: () => void;
  /** Starts Wisp's one-night tour in the demo (guide spec GD-11). */
  onStartTour: () => void;
}): ReactNode {
  const [step, setStep] = useState<StepId>('welcome');
  const go = (s: StepId): void => {
    setStep(s);
    window.scrollTo(0, 0);
  };

  return (
    <main
      aria-label="Welcome"
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '8px 20px 48px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {step !== 'welcome' && step !== 'done' ? (
        <div>
          <div
            role="img"
            aria-label={`Setup progress: ${progressText(step).toLowerCase()}`}
            style={{ display: 'flex', gap: 6 }}
          >
            {STEPS.slice(1, -1).map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 3,
                  background:
                    stepIndex(s) <= stepIndex(step)
                      ? token('control.fill.primary')
                      : token('surface.3'),
                  border: `1px solid ${token('hairline')}`,
                }}
              />
            ))}
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 'var(--type-caption)',
              color: token('text.secondary'),
            }}
          >
            {progressText(step)}
          </div>
        </div>
      ) : null}

      {step === 'welcome' ? (
        <Welcome
          onStart={() => go('cold')}
          onDemo={() => {
            onFinish('skipped');
            onStartDemo();
          }}
          onSkip={() => onFinish('skipped')}
          onTour={() => {
            onFinish('skipped');
            onStartTour();
          }}
        />
      ) : step === 'cold' ? (
        <ColdStep onBack={() => go(previousStep(step))} onNext={() => go(nextStep(step))} />
      ) : step === 'home' ? (
        <HomeStep onBack={() => go(previousStep(step))} onNext={() => go(nextStep(step))} />
      ) : step === 'people' ? (
        <PeopleStep onBack={() => go(previousStep(step))} onNext={() => go(nextStep(step))} />
      ) : (
        <Done onFinish={() => onFinish('done')} onDemo={() => onStartDemo()} />
      )}
    </main>
  );
}

function Welcome({
  onStart,
  onDemo,
  onSkip,
  onTour,
}: {
  onStart: () => void;
  onDemo: () => void;
  onSkip: () => void;
  onTour: () => void;
}): ReactNode {
  const [previewing, setPreviewing] = useState(false);
  useEffect(() => {
    if (!previewing) return;
    const id = window.setTimeout(() => setPreviewing(false), 5000);
    return () => window.clearTimeout(id);
  }, [previewing]);

  return (
    <>
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--type-display)',
            lineHeight: 1.1,
            color: token('text.emphasis'),
          }}
        >
          The only app you can read when the grid dies.
        </h1>
        <p style={{ margin: '16px 0 0', fontSize: 'var(--type-body)', lineHeight: 1.4 }}>
          Afterglow tells you what in your fridge is still good, how long your medicine and your
          home hold, who is okay, and where the lights still are.
        </p>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 'var(--type-caption)',
            color: token('text.secondary'),
          }}
        >
          Every number names its source, and when I do not know, I say unknown.
        </p>
      </div>

      <Button variant="secondary" onClick={() => setPreviewing(true)}>
        See what the dark looks like
      </Button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button variant="primary" style={{ minHeight: 72 }} onClick={onStart}>
          Set it up (about 2 minutes)
        </Button>
        <Button onClick={onTour}>Take the one-minute tour with Wisp</Button>
        <Button onClick={onDemo}>Show me a simulated night instead</Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip for now
        </Button>
      </div>

      <Notice>
        Nothing leaves this device. You can add things later, in any order, and every step can be
        skipped.
      </Notice>

      {previewing ? <DarkPreview onClose={() => setPreviewing(false)} /> : null}
    </>
  );
}

/** A sample of Night mode in the real Night tokens, over the lit welcome page. */
function DarkPreview({ onClose }: { onClose: () => void }): ReactNode {
  const night = themeVars('night') as CSSProperties;
  return (
    <dialog
      open
      aria-label="A preview of Night mode"
      style={{
        ...night,
        position: 'fixed',
        inset: 0,
        margin: 0,
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        maxHeight: 'none',
        border: 'none',
        zIndex: 30,
        background: 'var(--bg)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 24,
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 520, width: '100%', margin: '0 auto' }}>
        <StatusLine
          live
          timer="GRID DOWN 00:00:12"
          line="14 devices in your cell lost power. Fridge: about 3 h 10 m."
        />
        <p
          style={{
            marginTop: 20,
            fontSize: 'var(--type-body)',
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
          }}
        >
          This is Night mode: dim red on pure black, so you can read the screen and still see the
          room. The numbers here are a sample.
        </p>
        <button
          type="button"
          className="press"
          onClick={onClose}
          style={{
            marginTop: 8,
            minHeight: 56,
            width: '100%',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--focus-ring)',
            background: 'var(--control-fill-primary)',
            color: 'var(--control-label-primary)',
            fontSize: 'var(--type-label)',
          }}
        >
          Back to the light
        </button>
      </div>
    </dialog>
  );
}

function StepFooter({
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Button variant="primary" style={{ minHeight: 64 }} onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </Button>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="ghost" onClick={onNext}>
          Skip this step
        </Button>
      </div>
    </div>
  );
}

function ColdStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }): ReactNode {
  const { store, state } = useHousehold();
  const appliances = state.view.appliances;
  const add = (cls: household.AppliancePayload['class'], label: string): void => {
    const same = appliances.filter((a) => a.class === cls).length;
    store.addAppliance({
      name: same === 0 ? label : `${label} ${same + 1}`,
      class: cls,
      fullness: 'half',
      ambientC: null,
    });
  };
  return (
    <>
      <Section title="Your cold things">
        <p style={{ margin: 0, fontSize: 'var(--type-body)', lineHeight: 1.4 }}>
          Tap what you have. When the power fails I will say how long each one keeps its food cold.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {COLD_CHOICES.map((c) => (
            <ChoiceChip
              key={c.cls}
              label={`Add ${c.label.toLowerCase()}`}
              selected={false}
              onClick={() => add(c.cls, c.label)}
            />
          ))}
        </div>
        {appliances.length === 0 ? (
          <Notice>Nothing added yet. You can skip this and add them on the Cold tab.</Notice>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {appliances.map((a) => (
              <li
                key={a.id}
                style={{
                  padding: 14,
                  borderRadius: 'var(--radius-tile)',
                  background: token('surface.2'),
                  border: `1px solid ${token('hairline')}`,
                }}
              >
                <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
                  {a.name}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <ChoiceChip
                    label="Half full"
                    selected={a.fullness === 'half'}
                    onClick={() =>
                      store.updateAppliance(a.id, {
                        name: a.name,
                        class: a.class,
                        fullness: 'half',
                        ambientC: null,
                      })
                    }
                  />
                  <ChoiceChip
                    label="Full"
                    selected={a.fullness === 'full'}
                    onClick={() =>
                      store.updateAppliance(a.id, {
                        name: a.name,
                        class: a.class,
                        fullness: 'full',
                        ambientC: null,
                      })
                    }
                  />
                  <Button size="sm" variant="ghost" onClick={() => store.removeAppliance(a.id)}>
                    Remove {a.name}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Notice>
          A full freezer holds its cold longer than a half-full one, so the fullness matters. Foods
          come later, on the Cold tab.
        </Notice>
      </Section>
      <StepFooter onBack={onBack} onNext={onNext} />
    </>
  );
}

function HomeStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }): ReactNode {
  const { store, state } = useHousehold();
  return (
    <>
      <Section title="Your home">
        <p style={{ margin: 0, fontSize: 'var(--type-body)', lineHeight: 1.4 }}>
          This lets me say how many hours your home stays safe without heating or cooling, as a band
          and not a guess.
        </p>
        {state.view.home ? (
          <Notice>Saved. You can change it any time from the Hearth.</Notice>
        ) : null}
        <HomeSetup
          current={state.view.home}
          onSave={(home) => {
            store.setHome(home);
            onNext();
          }}
          onCancel={onNext}
        />
      </Section>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="ghost" onClick={onNext}>
          Skip this step
        </Button>
      </div>
    </>
  );
}

function PeopleStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }): ReactNode {
  const { store, state } = useHousehold();
  const roster = state.view.roster;
  const free = household.freeSlot(state.view);
  const [name, setName] = useState('');
  const [slot, setSlot] = useState<number>(() => free ?? 0);
  const taken = roster.find((m) => m.slot === slot);
  const add = (): void => {
    if (name.trim() === '' || taken) return;
    store.addPerson(name, slot);
    setName('');
    const next = household.freeSlot(store.getState().view);
    if (next !== null) setSlot(next);
  };
  return (
    <>
      <Section title="Your people">
        <p style={{ margin: 0, fontSize: 'var(--type-body)', lineHeight: 1.4 }}>
          The people you look after. Until you hear from them they show as ghosts, so you can see at
          a glance who has not checked in.
        </p>
        <TextField
          label="Their name"
          value={name}
          onChange={setName}
          hint="Only a name and a number are kept: no phone number, no address."
        />
        <Stepper
          label="Their number on your list"
          valueText={`No. ${slot}`}
          hint={
            taken
              ? `Number ${slot} is already ${taken.name}. Pick another so a message can be told apart.`
              : 'When they send you a message, this number says who it is from. Agree it with them.'
          }
          decrementDisabled={slot <= 0}
          incrementDisabled={slot >= 63}
          onDecrement={() => setSlot(Math.max(0, slot - 1))}
          onIncrement={() => setSlot(Math.min(63, slot + 1))}
        />
        <Button
          variant="primary"
          disabled={name.trim() === '' || taken !== undefined || free === null}
          onClick={add}
        >
          Add to my list
        </Button>
        {roster.length > 0 ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {roster.map((m) => (
              <li
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-control)',
                  background: token('surface.2'),
                  border: `1px solid ${token('hairline')}`,
                }}
              >
                <span style={{ overflowWrap: 'anywhere' }}>
                  {m.name} · No. {m.slot}
                </span>
                <Button size="sm" variant="ghost" onClick={() => store.removePerson(m.id)}>
                  Remove {m.name}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Notice>
          Add only people who agree. Nobody appears on anyone's list without their say-so.
        </Notice>
      </Section>
      <StepFooter onBack={onBack} onNext={onNext} />
    </>
  );
}

function Done({ onFinish, onDemo }: { onFinish: () => void; onDemo: () => void }): ReactNode {
  const { state } = useHousehold();
  const { done, open } = summaryLines({
    appliances: state.view.appliances.length,
    homeSet: state.view.home !== null,
    people: state.view.roster.length,
  });
  return (
    <>
      <Section title="You are set up">
        {done.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: 22, display: 'grid', gap: 8 }}>
            {done.map((d) => (
              <li key={d} style={{ fontSize: 'var(--type-body)', lineHeight: 1.4 }}>
                {d}
              </li>
            ))}
          </ul>
        ) : (
          <Notice>
            You skipped every step. That is fine: nothing is lost, and the tabs invite you.
          </Notice>
        )}
      </Section>
      <Section title="Still open">
        <ul
          style={{
            margin: 0,
            paddingLeft: 22,
            display: 'grid',
            gap: 6,
            fontSize: 'var(--type-caption)',
            color: token('text.secondary'),
          }}
        >
          {open.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </Section>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button variant="primary" style={{ minHeight: 72 }} onClick={onFinish}>
          Open the Hearth
        </Button>
        <Button onClick={onDemo}>Try a simulated night</Button>
      </div>
    </>
  );
}
