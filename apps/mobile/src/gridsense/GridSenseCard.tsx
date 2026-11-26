import type { ReactNode } from 'react';
import { senseText } from '../demo/senseWords';
import { Sources } from '../night-shell/components';
import { Button, ChoiceChip, Fold, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { gridSense } from './engine';
import { useGridSense } from './useGridSense';

/**
 * Grid Sense on the Hearth (crowd-reports CR-01, CR-07): what each sense says right now,
 * in words, and the controls that feed it. Nothing here decides; the core's fusion does.
 */

function SenseLine({
  name,
  value,
  note,
}: { name: string; value: string; note: string }): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 'var(--type-label)', color: token('text.primary') }}>
        {name}: <span style={{ color: token('text.emphasis') }}>{value}</span>
      </div>
      <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>{note}</div>
    </div>
  );
}

export function GridSenseCard(): ReactNode {
  const s = useGridSense();
  const words = senseText(s.result, s.crowdAbsent);
  const charging = !s.battery.supported
    ? {
        value: 'not available',
        note: 'This browser does not share the battery. On Android Chrome and the native app it does.',
      }
    : s.battery.charging
      ? { value: 'charging', note: s.chargingNote }
      : { value: 'not charging', note: s.chargingNote };
  const hum = s.listening
    ? { value: 'listening…', note: 'Three short samples. Nothing is recorded or sent.' }
    : s.hum
      ? {
          value:
            s.hum.vote.direction === 'present'
              ? 'hum heard'
              : s.hum.vote.direction === 'absent'
                ? 'no hum'
                : 'unclear',
          note: `${s.hum.reason} ${s.humAtMs ? `(${Math.round((Date.now() - s.humAtMs) / 60000)} min ago)` : ''}`,
        }
      : s.micDenied
        ? {
            value: 'microphone not allowed',
            note: 'Allow it in the browser to let me hear the mains hum.',
          }
        : {
            value: 'not checked yet',
            note: 'Ask me to listen. A quiet room with mains on has a faint hum I can hear.',
          };
  const crowd = !s.cell
    ? {
        value: 'area not shared',
        note: 'Share your area so I can compare with neighbours. Only a ~1 km cell leaves this phone.',
      }
    : s.crowdState === null
      ? { value: 'checking…', note: 'Asking the crowd map about your cell.' }
      : s.crowdState === 'unknown'
        ? {
            value: 'not enough reports',
            note: 'Fewer than 5 devices reported from your cell, so the crowd stays out of it.',
          }
        : {
            value: s.crowdState,
            note: `${s.crowdAbsent > 0 ? `${s.crowdAbsent} devices report no power. ` : ''}From the crowd map.`,
          };

  return (
    <Section title="Grid Sense">
      <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
        {s.result.verdict === 'unknown' ? 'Not sure yet.' : words.headline}{' '}
        <span style={{ color: token('text.secondary') }}>
          {s.result.verdict === 'unknown'
            ? 'I need two senses that agree, or one plus at least 5 neighbours, before I say the power is out.'
            : words.why}
        </span>
      </div>
      <SenseLine name="Charger" value={charging.value} note={charging.note} />
      <SenseLine name="Mains hum" value={hum.value} note={hum.note} />
      <SenseLine name="Neighbours" value={crowd.value} note={crowd.note} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          size="sm"
          variant="primary"
          disabled={s.listening}
          onClick={() => void gridSense.listen()}
        >
          {s.listening ? 'Listening…' : 'Listen to the room'}
        </Button>
        {s.cell ? null : (
          <Button size="sm" disabled={s.locating} onClick={() => void gridSense.shareArea()}>
            {s.locating ? 'Finding your area…' : 'Share my area'}
          </Button>
        )}
      </div>
      {s.locationError ? <Notice>{s.locationError}</Notice> : null}
      {s.lastReport ? (
        <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
          {s.lastReport.sent
            ? `Told the crowd map "${s.lastReport.verdict === 'absent' ? 'no power' : 'power'}" for your cell at ${new Date(s.lastReport.atMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
            : 'Could not reach the crowd map; I will tell it at the next change.'}
        </div>
      ) : null}
      <Fold label="Grid Sense settings">
        <div style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>
          Mains frequency where you are
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <ChoiceChip
            label="50 Hz"
            selected={s.mainsHz === 50}
            onClick={() => gridSense.setMainsHz(50)}
          />
          <ChoiceChip
            label="60 Hz"
            selected={s.mainsHz === 60}
            onClick={() => gridSense.setMainsHz(60)}
          />
        </div>
        <div style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>
          Teach me this phone's microphone
        </div>
        <Button
          size="sm"
          disabled={s.listening}
          onClick={() => void gridSense.calibrate('present')}
        >
          I am near a lamp that is on
        </Button>
        <Button size="sm" disabled={s.listening} onClick={() => void gridSense.calibrate('quiet')}>
          The power is off right now
        </Button>
        {s.calibration ? (
          <Notice>Calibrated for this phone. Hum thresholds now follow what it hears.</Notice>
        ) : null}
        <ChoiceChip
          label={s.auto ? 'Starting and ending outages for me' : 'I start and end outages myself'}
          selected={s.auto}
          onClick={() => gridSense.setAuto(!s.auto)}
        />
        {s.cell ? (
          <Button size="sm" variant="ghost" onClick={() => gridSense.forgetArea()}>
            Forget my area
          </Button>
        ) : null}
      </Fold>
      <Sources
        labels={[
          `Grid Sense: ${s.result.verdict}`,
          `senses that voted: ${[...s.result.votedPositive, ...s.result.votedNegative].join(', ') || 'none'}`,
          `mains ${s.mainsHz} Hz`,
          ...(s.cell ? ['your area: a ~1 km cell'] : []),
        ]}
      >
        {s.result.reason}
      </Sources>
    </Section>
  );
}
