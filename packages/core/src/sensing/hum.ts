import type { SenseVote } from '../fusion/types.js';

/**
 * Mains hum (product description 7.2; grid-sense GS spec). Appliances and wiring on
 * mains radiate acoustic energy at the 2nd and 3rd harmonics of the grid frequency
 * (100/150 Hz on 50 Hz grids, 120/180 Hz on 60 Hz). A short microphone sample is
 * compared at those frequencies against the 80-200 Hz noise floor around them.
 *
 * Pure: samples in, a vote out. The samples never leave the device and are never
 * stored (privacy-aggregation.md); only the vote does.
 */

export type MainsHz = 50 | 60;

/** Signal power at one frequency, by the Goertzel algorithm (one DFT bin, no FFT needed). */
export function goertzelPower(
  samples: ArrayLike<number>,
  sampleRate: number,
  freq: number,
): number {
  const n = samples.length;
  if (n === 0 || !(sampleRate > 0)) return 0;
  const k = Math.round((n * freq) / sampleRate);
  const w = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = (samples[i] as number) + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Number.isFinite(power) && power > 0 ? power / (n * n) : 0;
}

export interface HumCalibration {
  /** The harmonic-to-floor ratio measured near a lamp that was on (mains present). */
  readonly presentRatio: number;
  /** The ratio measured with mains absent or far from wiring, when known. */
  readonly quietRatio?: number;
}

export interface HumReading {
  readonly vote: SenseVote;
  /** Harmonic power over the surrounding floor; 1 means no hum at all. */
  readonly ratio: number;
  /** Root-mean-square level of the sample, to tell a muted microphone from a quiet room. */
  readonly rms: number;
  /** Why the vote is what it is, in plain words. */
  readonly reason: string;
}

/** Below this RMS the microphone gave silence (muted, blocked or a filtered stream). */
const MIN_RMS = 1e-4;
/** Default thresholds, used until the device has been calibrated near a lamp. */
const DEFAULT_PRESENT_RATIO = 6;
const DEFAULT_ABSENT_RATIO = 1.6;

function floorPower(samples: ArrayLike<number>, rate: number, avoid: readonly number[]): number {
  const powers: number[] = [];
  for (let f = 80; f <= 200; f += 5) {
    if (avoid.some((h) => Math.abs(f - h) < 8)) continue;
    powers.push(goertzelPower(samples, rate, f));
  }
  if (powers.length === 0) return 0;
  // The median, so one loud neighbour bin (a voice, a fan) cannot fake a quiet floor.
  powers.sort((a, b) => a - b);
  return powers[Math.floor(powers.length / 2)] as number;
}

/**
 * Judge one sample. Present when the harmonics stand well above the floor; absent
 * only when the room is audible but the harmonics are at the floor; otherwise unknown.
 */
export function humVerdict(
  samples: ArrayLike<number>,
  sampleRate: number,
  mainsHz: MainsHz,
  calibration: HumCalibration | null = null,
): HumReading {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (samples[i] as number) ** 2;
  const rms = samples.length > 0 ? Math.sqrt(sum / samples.length) : 0;
  const harmonics = [2 * mainsHz, 3 * mainsHz];
  const unknown = (reason: string, ratio = 1): HumReading => ({
    vote: { sense: 'hum', direction: 'unknown', confidence: 0 },
    ratio,
    rms,
    reason,
  });
  // Need at least half a second for 1-2 Hz resolution at the harmonics.
  if (samples.length < sampleRate / 2) return unknown('The sample was too short to hear the hum.');
  if (rms < MIN_RMS) return unknown('The microphone gave silence, so I cannot tell.');

  const harmonic = harmonics.reduce((s, f) => s + goertzelPower(samples, sampleRate, f), 0) / 2;
  const floor = floorPower(samples, sampleRate, harmonics);
  const ratio = floor > 0 ? harmonic / floor : harmonic > 0 ? Number.POSITIVE_INFINITY : 1;

  const presentAt = calibration
    ? Math.max(3, calibration.presentRatio * 0.4)
    : DEFAULT_PRESENT_RATIO;
  const absentBelow = calibration?.quietRatio
    ? Math.min(presentAt / 2, Math.max(1.2, calibration.quietRatio * 1.3))
    : DEFAULT_ABSENT_RATIO;

  if (ratio >= presentAt) {
    return {
      vote: {
        sense: 'hum',
        direction: 'present',
        confidence: Math.min(1, ratio / (presentAt * 2)),
      },
      ratio,
      rms,
      reason: `Mains hum heard at ${harmonics.join(' and ')} Hz.`,
    };
  }
  if (ratio <= absentBelow) {
    return {
      vote: { sense: 'hum', direction: 'absent', confidence: calibration ? 0.8 : 0.6 },
      ratio,
      rms,
      reason: `The room is audible but there is no hum at ${harmonics.join(' or ')} Hz.`,
    };
  }
  return unknown('A faint hum, not clear enough either way.', ratio);
}
