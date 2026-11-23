import { FRAME_SYMBOLS } from './frame.js';

/**
 * Two physical rates for the same frame (HL-12). The frame is 64 symbols either
 * way; only the symbol length differs.
 */
export type ProfileName = 'standard' | 'fast';

export interface Profile {
  readonly name: ProfileName;
  readonly symbolMs: number;
  /** The receiver attempts this profile only when the camera reaches this speed. */
  readonly minFps: number;
}

export const PROFILES: Readonly<Record<ProfileName, Profile>> = {
  standard: { name: 'standard', symbolMs: 200, minFps: 0 },
  fast: { name: 'fast', symbolMs: 100, minFps: 40 },
};

/** Both profiles, slowest (most robust) first. */
export const PROFILE_LIST: readonly Profile[] = [PROFILES.standard, PROFILES.fast];

export const frameMsOf = (p: Profile): number => FRAME_SYMBOLS * p.symbolMs;

/** Timestamps are rounded and the median wobbles, so the speed limit has a small margin. */
export const SPEED_TOLERANCE = 1.05;

/** The longest median frame interval a profile is attempted at, in ms (infinite means no limit). */
export const maxFrameIntervalMs = (p: Profile): number =>
  p.minFps > 0 ? (1000 / p.minFps) * SPEED_TOLERANCE : Number.POSITIVE_INFINITY;
