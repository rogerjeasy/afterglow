import { goertzelPower } from '../sensing/hum.js';

/**
 * The acoustic Heliograph (product description 7.9 "acoustic channel"): the same
 * frames as the light, carried room to room by frequency-shift-keyed tones. The
 * speaker plays the mark tone where the lamp would be lit and the space tone where
 * it would be dark, so the receiver turns each short block of microphone samples into
 * a "brightness" (how much of the energy is in the mark tone) and hands the series
 * to the same decoder, error correction and repeat vote as the camera.
 */

export interface TonePair {
  readonly name: 'audible' | 'quiet';
  /** Played where the lamp would be lit. */
  readonly markHz: number;
  /** Played where the lamp would be dark. */
  readonly spaceHz: number;
}

export const TONE_PAIRS: Readonly<Record<TonePair['name'], TonePair>> = {
  /** Carries through doors and thin walls; clearly audible. */
  audible: { name: 'audible', markHz: 2400, spaceHz: 1600 },
  /** Near-ultrasonic: most adults barely hear it; shorter range, needs a quiet room. */
  quiet: { name: 'quiet', markHz: 18_600, spaceHz: 17_800 },
};

/** Below this RMS the block is silence and reads as dark. */
export const SILENCE_RMS = 2e-4;

/**
 * One block of microphone samples as a brightness on the decoder's 0..255 scale:
 * the mark tone's share of the two tones' energy. Silence and anything that is
 * neither tone read as 0, the same as the space tone, so no stray noise looks lit.
 */
export function toneLevel(samples: Float32Array, sampleRate: number, pair: TonePair): number {
  if (samples.length === 0 || !(sampleRate > 0)) return 0;
  let sq = 0;
  for (const s of samples) sq += s * s;
  if (Math.sqrt(sq / samples.length) < SILENCE_RMS) return 0;
  if (pair.markHz >= sampleRate / 2 || pair.spaceHz >= sampleRate / 2) return 0;
  const mark = goertzelPower(samples, sampleRate, pair.markHz);
  const space = goertzelPower(samples, sampleRate, pair.spaceHz);
  const total = mark + space;
  if (!(total > 0)) return 0;
  return Math.round((255 * mark) / total);
}
