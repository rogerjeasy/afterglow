import type { CameraError } from '@afterglow/adapters';
import type { heliograph, household } from '@afterglow/core';
import { formatClockTime } from '../format';

/**
 * Words for the Séance screen. The core decides who is a ghost and what a
 * message says; this only words it. "Safe" appears only for a member whose
 * latest word is SAFE and is current (HH-12), never as a default.
 */

export const EMERGENCY_NOTE =
  'Afterglow is not an emergency service. If someone is in danger, call your local emergency number (for example 112 or 911).';

export const FLASH_WARNING =
  'This screen will flash red. Do not use it near anyone who is sensitive to flashing light. You can stop at any time.';

export const FAST_CONFIRM =
  'Fast mode flashes 5 times a second, more than the 3 a second many guidelines advise. Use it only if nobody nearby is sensitive to flashing light.';

/** Human names for the message set, in the words used on the buttons. */
export const MESSAGE_LABEL: Record<heliograph.MessageName, string> = {
  SAFE: 'I am safe',
  HELP: 'Help',
  NEED_MEDS: 'Need medicine',
  NEED_WATER: 'Need water',
  NEED_HEAT: 'Need heat',
  NEED_COOL: 'Need cooling',
  CHARGE_HERE: 'Charge here',
  WATER_HERE: 'Water here',
  OPEN_HERE: 'Open here',
  COMING: 'Coming',
  ACK: 'Got it',
};

/** What a heard message reads as when someone else sent it ("Mrs Dlamini: SAFE"). */
export const MESSAGE_FROM: Record<heliograph.MessageName, string> = {
  SAFE: 'is safe',
  HELP: 'needs help',
  NEED_MEDS: 'needs medicine',
  NEED_WATER: 'needs water',
  NEED_HEAT: 'needs heat',
  NEED_COOL: 'needs cooling',
  CHARGE_HERE: 'has a place to charge',
  WATER_HERE: 'has water',
  OPEN_HERE: 'is open',
  COMING: 'is coming',
  ACK: 'got your message',
};

const CHANNEL: Record<household.HeardChannel, string> = {
  light: 'by light',
  sound: 'by sound',
  sms: 'by text',
  ble: 'by Bluetooth',
  manual: 'you marked it',
};

export interface RowText {
  readonly line: string;
  /** Fully visible once they have been heard from; translucent as a ghost. */
  readonly solid: boolean;
  readonly loud: boolean;
}

export function rowText(entry: household.RosterEntry, outage: boolean): RowText {
  const h = entry.member.heard;
  if (entry.state === 'ghost') {
    return {
      line:
        h === null
          ? 'No word yet'
          : outage
            ? `No word since the outage began. Last word ${formatClockTime(h.atMs)}, before it.`
            : 'No word yet',
      solid: false,
      loud: false,
    };
  }
  const when = h ? formatClockTime(h.atMs) : '';
  const how = h ? CHANNEL[h.channel] : '';
  if (entry.state === 'help') {
    return { line: `Needs help · ${when} · ${how}`, solid: true, loud: true };
  }
  const what = h ? (entry.safe ? 'Safe' : MESSAGE_LABEL[h.code]) : '';
  return { line: `${what} · ${when} · ${how}`, solid: true, loud: false };
}

export type ReceiveText = {
  readonly headline: string;
  readonly detail: string;
  readonly kind: 'message' | 'unknownSlot' | 'ambiguousSlot' | 'repeat' | 'waiting';
  readonly help: boolean;
};

/** The result card after watching: a message, or an honest refusal (fail-closed rule 7). */
export function receiveText(
  result: heliograph.HeliographResult,
  attribution: household.Attribution | null,
): ReceiveText {
  if (result.kind === 'noSignal') {
    return { headline: 'Watching…', detail: result.reason, kind: 'waiting', help: false };
  }
  if (result.kind === 'repeatRequested') {
    return {
      headline: 'Could not read it · ask them to repeat',
      detail: result.reason,
      kind: 'repeat',
      help: false,
    };
  }
  const code = result.message.code;
  const help = code === 'HELP';
  if (!attribution || attribution.kind === 'unknownSlot') {
    return {
      headline: `Number ${result.message.slot} ${MESSAGE_FROM[code]}`,
      detail: `Number ${result.message.slot} is not on your list, so I cannot say who it is. Add them to see their name.`,
      kind: 'unknownSlot',
      help,
    };
  }
  if (attribution.kind === 'ambiguousSlot') {
    return {
      headline: `A message came from number ${attribution.slot}`,
      detail: `${attribution.count} people share number ${attribution.slot}, so I will not say which one. Give each person their own number.`,
      kind: 'ambiguousSlot',
      help,
    };
  }
  return {
    headline: `${attribution.member.name} ${MESSAGE_FROM[code]}`,
    detail: `Read from ${result.repeatsAgreed} repeats${result.voted ? ' (voted)' : ''}, ${result.profile} speed.`,
    kind: 'message',
    help,
  };
}

export function cameraErrorText(e: CameraError): string {
  switch (e) {
    case 'denied':
      return 'The camera permission was refused. Without it I cannot read light. Allow the camera in your browser settings and try again.';
    case 'noCamera':
      return 'No camera was found on this device.';
    case 'busy':
      return 'The camera is in use by another app. Close it and try again.';
    case 'insecure':
      return 'The camera needs a secure page (https). Open Afterglow from its https address.';
    case 'unavailable':
      return 'This browser cannot open the camera.';
  }
}

/** "about 38 s" for a transmission, from the plan itself. */
export function durationText(totalMs: number): string {
  return `about ${Math.round(totalMs / 1000)} s`;
}
