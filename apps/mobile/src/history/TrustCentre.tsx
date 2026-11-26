import { cells, energy, heliograph, thermal } from '@afterglow/core';
import type { ReactNode } from 'react';
import { Fold, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';

/**
 * The trust centre (product description 7.19, 7.6 "validation"): every model the
 * app uses to give an answer, what it is anchored to, what it does not know, and the
 * version that produced the numbers on screen. Written from the code's own constants,
 * so it cannot drift from what runs.
 */

interface Model {
  readonly name: string;
  readonly version: string;
  readonly does: string;
  readonly anchoredTo: string;
  readonly limits: string;
}

const MODELS: readonly Model[] = [
  {
    name: 'Fridge and freezer clocks',
    version: thermal.APPLIANCE_MODEL_VERSION,
    does: 'Warms each compartment toward the room along a curve, and adds a step for each time the door was opened.',
    anchoredTo:
      'USDA outage guidance: a closed fridge keeps food safe about 4 hours; a full freezer about 48 hours, a half-full one about 24. Fridge danger at 4.4 °C (40 °F).',
    limits:
      'It models a typical appliance, not yours: seals, age and how packed it is shift the time. A thermometer reading always beats the model, and the app says when it is guessing.',
  },
  {
    name: 'Hours of safety at home',
    version: thermal.BUILDING_MODEL_VERSION,
    does: 'Cools or warms the home toward the outdoor temperature and says when it may cross the line you chose.',
    anchoredTo:
      'Building time constants by type, age and insulation from published building-science ranges; the cold line defaults to 15 °C and the heat line to 32 °C.',
    limits:
      'Shown as a band, never one number, because buildings differ widely. "I don’t know my building" uses the widest band.',
  },
  {
    name: 'Medicine clocks',
    version: 'pharmacist-approved table',
    does: 'Counts time out of the fridge against the label’s own allowance for that product.',
    anchoredTo: 'Only a pharmacist-approved table of label limits; nothing is inferred.',
    limits:
      'If the table is not published with this build, no clock is shown. It is not medical advice: ask your pharmacist.',
  },
  {
    name: 'Energy plan (candles)',
    version: energy.ENERGY_MODEL_VERSION,
    does: 'Shares your batteries between the loads you listed, medical devices first, for the hours you plan for.',
    anchoredTo:
      'The capacities and wattages you entered, with a usable fraction per kind of store.',
    limits:
      'An unknown capacity is left out rather than guessed. Real batteries fade with age and cold.',
  },
  {
    name: 'Grid Sense',
    version: 'fusion rules',
    does: 'Decides whether mains power is present from this phone’s senses, and only says "out" when two senses agree, or one agrees with at least 5 neighbours.',
    anchoredTo:
      'The charger edge (battery API), the mains hum at the 2nd and 3rd harmonics of 50 or 60 Hz, and the crowd.',
    limits:
      'A quiet room may have no hum to hear; a phone off its charger has no edge. Then it says "not sure", never a guess.',
  },
  {
    name: 'Crowd map',
    version: `k = ${cells.K_ANONYMITY}`,
    does: 'Counts signed reports per ~1 km cell over the last 30 minutes.',
    anchoredTo: `A cell is shown only when at least ${cells.K_ANONYMITY} different devices reported from it.`,
    limits:
      'Fewer phones means no answer, not a weaker one. One phone key may report from at most two cells a day.',
  },
  {
    name: 'Heliograph codes',
    version: `${heliograph.PROFILES.standard.symbolMs} ms symbols`,
    does: 'Sends one of a few short codes by light or sound, three times, with error correction.',
    anchoredTo:
      'A fixed frame: preamble, Hamming-coded payload and a CRC; a repeat vote when frames disagree.',
    limits:
      'A frame it cannot read asks for a repeat; it never guesses a code. Light needs a line of sight; sound needs a quiet room.',
  },
];

export function TrustCentre(): ReactNode {
  return (
    <Section title="How each answer is made">
      <span style={{ fontSize: 'var(--type-body)', color: token('text.secondary') }}>
        Every number in Afterglow comes from one of these. Each says what it is anchored to and what
        it does not know.
      </span>
      {MODELS.map((m) => (
        <Fold key={m.name} label={m.name}>
          <dl style={{ margin: 0, display: 'grid', gap: 8, color: token('text.primary') }}>
            {(
              [
                ['What it does', m.does],
                ['Anchored to', m.anchoredTo],
                ['What it does not know', m.limits],
                ['Version', m.version],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
                  {k}
                </dt>
                <dd style={{ margin: 0, fontSize: 'var(--type-body)' }}>{v}</dd>
              </div>
            ))}
          </dl>
        </Fold>
      ))}
    </Section>
  );
}
