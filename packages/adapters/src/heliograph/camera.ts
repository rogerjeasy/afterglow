import type { heliograph } from '@afterglow/core';

/**
 * The web camera source (getUserMedia). Each video frame is reduced in place to
 * an 8 x 6 grid of brightness numbers; the picture itself is never stored,
 * sent or kept after the callback returns (privacy-aggregation rule 3).
 *
 * Verified in a real browser by the Playwright test with a fake camera; there is
 * no unit test for the DOM calls.
 */
export type CameraError = 'insecure' | 'unavailable' | 'denied' | 'noCamera' | 'busy';

export interface CameraSession {
  readonly stop: () => void;
}

export type CameraResult =
  | { readonly kind: 'ok'; readonly session: CameraSession }
  | { readonly kind: 'error'; readonly error: CameraError };

export const GRID_COLS = 8;
export const GRID_ROWS = 6;
const SAMPLE_W = 64;
const SAMPLE_H = 48;

export function errorOf(e: unknown): CameraError {
  const name = typeof e === 'object' && e !== null ? (e as { name?: unknown }).name : undefined;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'noCamera';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'unavailable';
}

/** Per-cell mean of the brightest channel (a red lamp is bright in R, white light in all). */
export function gridOf(rgba: Uint8ClampedArray, width: number, height: number): number[] {
  const cells = new Array<number>(GRID_COLS * GRID_ROWS).fill(0);
  const counts = new Array<number>(GRID_COLS * GRID_ROWS).fill(0);
  for (let y = 0; y < height; y++) {
    const row = Math.min(GRID_ROWS - 1, Math.floor((y * GRID_ROWS) / height));
    for (let x = 0; x < width; x++) {
      const col = Math.min(GRID_COLS - 1, Math.floor((x * GRID_COLS) / width));
      const i = (y * width + x) * 4;
      const v = Math.max(rgba[i] as number, rgba[i + 1] as number, rgba[i + 2] as number);
      const c = row * GRID_COLS + col;
      cells[c] = (cells[c] as number) + v;
      counts[c] = (counts[c] as number) + 1;
    }
  }
  return cells.map((sum, c) => sum / Math.max(1, counts[c] as number));
}

export async function openCamera(
  onFrame: (frame: heliograph.GridFrame) => void,
): Promise<CameraResult> {
  if (typeof window === 'undefined' || !window.isSecureContext) {
    return { kind: 'error', error: 'insecure' };
  }
  if (!navigator.mediaDevices?.getUserMedia) return { kind: 'error', error: 'unavailable' };

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        frameRate: { ideal: 60 },
        width: { ideal: 320 },
        height: { ideal: 240 },
      },
    });
  } catch (e) {
    return { kind: 'error', error: errorOf(e) };
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_W;
  canvas.height = SAMPLE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    for (const t of stream.getTracks()) t.stop();
    return { kind: 'error', error: 'unavailable' };
  }

  let stopped = false;
  let rafId = 0;
  const tick = (now: number): void => {
    if (stopped) return;
    if (video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
      const { data } = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
      onFrame({ tMs: now, cells: gridOf(data, SAMPLE_W, SAMPLE_H) });
    }
    schedule();
  };
  const withVfc = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number) => void) => number;
    cancelVideoFrameCallback?: (id: number) => void;
  };
  const schedule = (): void => {
    rafId = withVfc.requestVideoFrameCallback
      ? withVfc.requestVideoFrameCallback((now) => tick(now))
      : requestAnimationFrame(tick);
  };
  try {
    await video.play();
  } catch (e) {
    for (const t of stream.getTracks()) t.stop();
    return { kind: 'error', error: errorOf(e) };
  }
  schedule();

  return {
    kind: 'ok',
    session: {
      stop() {
        stopped = true;
        if (withVfc.cancelVideoFrameCallback) withVfc.cancelVideoFrameCallback(rafId);
        else cancelAnimationFrame(rafId);
        for (const t of stream.getTracks()) t.stop();
        video.srcObject = null;
      },
    },
  };
}
