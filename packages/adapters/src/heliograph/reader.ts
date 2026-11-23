import { heliograph } from '@afterglow/core';

/**
 * A rolling reader over camera grid frames. It keeps the last `windowMs` of
 * frames, and on each `read()` finds the blinking cell and decodes it. Nothing
 * is stored beyond the window and nothing leaves the device: the frames are
 * numbers, not images (privacy-aggregation rule 3).
 */
export interface Reader {
  push(frame: heliograph.GridFrame): void;
  read(): heliograph.HeliographResult;
  /** How many frames are held and the camera speed they imply (0 when unknown). */
  stats(): { readonly frames: number; readonly fps: number };
  reset(): void;
}

/** Two repeats of a standard frame take 25.6 s; three take 38.4 s. Keep room for a few more. */
export const DEFAULT_WINDOW_MS = 70_000;

export function createReader(windowMs: number = DEFAULT_WINDOW_MS): Reader {
  let frames: heliograph.GridFrame[] = [];
  return {
    push(frame) {
      const last = frames[frames.length - 1];
      // A frame that is not later than the last is dropped, never reordered.
      if (last && !(frame.tMs > last.tMs)) return;
      frames.push(frame);
      const cutoff = frame.tMs - windowMs;
      if (frames.length > 0 && (frames[0] as heliograph.GridFrame).tMs < cutoff) {
        let i = 0;
        while (i < frames.length && (frames[i] as heliograph.GridFrame).tMs < cutoff) i++;
        frames = frames.slice(i);
      }
      if (frames.length > heliograph.MAX_SAMPLES) frames = frames.slice(-heliograph.MAX_SAMPLES);
    },
    read() {
      if (frames.length < 2) return { kind: 'noSignal', reason: 'Waiting for the camera.' };
      const series = heliograph.trackSeries(frames);
      if (series === null) return { kind: 'noSignal', reason: 'No blinking light is in view yet.' };
      return heliograph.decodeBrightness(series);
    },
    stats() {
      if (frames.length < 2) return { frames: frames.length, fps: 0 };
      const span =
        (frames[frames.length - 1] as heliograph.GridFrame).tMs -
        (frames[0] as heliograph.GridFrame).tMs;
      return { frames: frames.length, fps: span > 0 ? ((frames.length - 1) * 1000) / span : 0 };
    },
    reset() {
      frames = [];
    },
  };
}
