import type { fusion } from '@afterglow/core';

/**
 * Grid Sense in plain words (night-shell NS-14). The fusion core decides and
 * records which senses voted; this only says it the way a person would. The
 * sense identifiers stay in the source control, never in the main text.
 */

const PRESENT: Record<fusion.SenseId, string> = {
  chargingEdge: 'this phone is charging from the wall',
  hum: 'the mains hum is there',
  flicker: 'the lights flicker at mains rate',
  magnetometer: 'the phone feels the mains field',
  telemetry: 'the home battery sees the grid',
};

const ABSENT: Record<fusion.SenseId, string> = {
  chargingEdge: 'this phone stopped charging',
  hum: 'the mains hum went quiet',
  // Positive-only senses never vote absent (fail-closed rule 2); worded anyway so the map is total.
  flicker: 'the lights stopped flickering at mains rate',
  magnetometer: 'the mains field is gone',
  telemetry: 'the home battery reports the grid lost',
};

function join(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

const capital = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export interface SenseText {
  readonly headline: string;
  readonly why: string;
}

/**
 * The Hearth's "how I know the power state" sentence.
 * `neighbours` is the count of neighbouring reports that corroborated, when any.
 */
export function senseText(result: fusion.FusionResult, neighbours: number): SenseText {
  switch (result.verdict) {
    case 'absent': {
      const said = result.votedNegative.map((s) => ABSENT[s]);
      const crowd = neighbours > 0 ? [`${neighbours} phones nearby agree`] : [];
      return { headline: 'Power is out here.', why: `${capital(join([...said, ...crowd]))}.` };
    }
    case 'present': {
      const said = result.votedPositive.map((s) => PRESENT[s]);
      return {
        headline: 'Power is on here.',
        why: said.length > 0 ? `${capital(join(said))}.` : 'A sense found mains power.',
      };
    }
    case 'unknown':
      return {
        headline: 'Not sure yet.',
        why: 'The senses do not agree enough to say, so I will not guess. Plug the phone in, or let it hear the room.',
      };
  }
}
