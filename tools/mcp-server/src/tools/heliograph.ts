import { heliograph } from '@afterglow/core';

/**
 * heliograph_encode (MCP-08). The frame bits and the transmit plan for both
 * profiles, straight from the core. An out-of-range message is refused, the
 * same way `encodeFrame` refuses it.
 */

export const MESSAGE_NAMES = Object.keys(heliograph.MESSAGE_CODES) as [
  heliograph.MessageName,
  ...heliograph.MessageName[],
];

export interface EncodeQuery {
  readonly message: string;
  readonly slot: number;
  readonly sequence?: number | undefined;
  readonly repeats?: number | undefined;
}

export type EncodeAnswer =
  | {
      readonly message: heliograph.MessageName;
      readonly code: number;
      readonly slot: number;
      readonly sequence: number;
      readonly frameBits: string;
      readonly preambleBits: string;
      readonly codedBits: string;
      readonly plans: readonly {
        readonly profile: heliograph.ProfileName;
        readonly symbolMs: number;
        readonly frameMs: number;
        readonly repeats: number;
        readonly symbols: number;
        readonly totalMs: number;
        readonly runs: number;
        readonly needsCameraFps: number;
      }[];
    }
  | { readonly refused: true; readonly reason: string };

export function heliographEncode(q: EncodeQuery): EncodeAnswer {
  const sequence = q.sequence ?? 0;
  const repeats = q.repeats ?? heliograph.DEFAULT_REPEATS;
  const msg = { code: q.message as heliograph.MessageName, slot: q.slot, sequence };
  const frame = heliograph.encodeFrame(msg);
  if (frame === null) {
    return {
      refused: true,
      reason: `Not a valid message: the name must be one of ${MESSAGE_NAMES.join(', ')}, slot 0..${heliograph.MAX_SLOT}, sequence 0..${heliograph.MAX_SEQUENCE}.`,
    };
  }
  const plans = [];
  for (const profile of heliograph.PROFILE_LIST) {
    const plan = heliograph.planTransmission(msg, repeats, profile);
    if (plan === null) {
      return {
        refused: true,
        reason: `Not a valid repeat count: 1..${heliograph.MAX_REPEATS}.`,
      };
    }
    plans.push({
      profile: profile.name,
      symbolMs: profile.symbolMs,
      frameMs: heliograph.frameMsOf(profile),
      repeats: plan.repeats,
      symbols: plan.symbols,
      totalMs: plan.totalMs,
      runs: plan.runs.length,
      needsCameraFps: profile.minFps,
    });
  }
  const bits = frame.join('');
  return {
    message: msg.code,
    code: heliograph.MESSAGE_CODES[msg.code],
    slot: q.slot,
    sequence,
    frameBits: bits,
    preambleBits: bits.slice(0, heliograph.PREAMBLE.length),
    codedBits: bits.slice(heliograph.PREAMBLE.length),
    plans,
  };
}
