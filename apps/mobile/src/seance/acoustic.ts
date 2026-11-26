import { heliograph } from '@afterglow/core';

/**
 * The acoustic Heliograph on the phone (product description 7.9). Sending plays the
 * transmit plan as two tones, scheduled on the audio clock so the timing is exact
 * even when the page is busy. Listening turns each ~20 ms of microphone audio into a
 * level and hands the series to the same decoder as the camera.
 */

export interface ToneSending {
  readonly done: Promise<'done' | 'cancelled'>;
  stop(): void;
}

export function sendTones(plan: heliograph.TransmitPlan, pair: heliograph.TonePair): ToneSending {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.connect(gain).connect(ctx.destination);
  const t0 = ctx.currentTime + 0.15;
  // A short fade in and out, so the speaker does not click.
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.6, t0);
  let t = t0;
  for (const run of plan.runs) {
    osc.frequency.setValueAtTime(run.lit ? pair.markHz : pair.spaceHz, t);
    t += run.ms / 1000;
  }
  gain.gain.setValueAtTime(0.6, t);
  gain.gain.linearRampToValueAtTime(0, t + 0.05);
  osc.start(ctx.currentTime);
  osc.stop(t + 0.1);
  let settle: (o: 'done' | 'cancelled') => void = () => {};
  const done = new Promise<'done' | 'cancelled'>((r) => {
    settle = r;
  });
  let finished = false;
  const finish = (o: 'done' | 'cancelled'): void => {
    if (finished) return;
    finished = true;
    void ctx.close();
    settle(o);
  };
  osc.onended = () => finish('done');
  return {
    done,
    stop() {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      finish('cancelled');
    },
  };
}

export type ListenError = 'unsupported' | 'denied' | 'failed';

export interface ToneListening {
  /** The decoder's answer over everything heard so far. */
  read(): heliograph.HeliographResult;
  /** How loud the tones are, 0..1, for the level meter. */
  level(): number;
  stop(): void;
}

export async function listenTones(
  pair: heliograph.TonePair,
): Promise<{ kind: 'ok'; session: ToneListening } | { kind: 'error'; error: ListenError }> {
  if (!navigator.mediaDevices?.getUserMedia) return { kind: 'error', error: 'unsupported' };
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (e) {
    const name = (e as { name?: string }).name;
    return {
      kind: 'error',
      error: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed',
    };
  }
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  // ~21 ms at 48 kHz: ten blocks per symbol at the standard rate, five at the fast one.
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const samples: heliograph.BrightnessSample[] = [];
  let lastLevel = 0;
  const timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const level = heliograph.toneLevel(buf, ctx.sampleRate, pair);
    lastLevel = level / 255;
    samples.push({ tMs: performance.now(), level });
    // Keep inside the decoder's limit: the last ~3 minutes is plenty for three repeats.
    if (samples.length > heliograph.MAX_SAMPLES - 100) samples.splice(0, 2000);
  }, 20);
  return {
    kind: 'ok',
    session: {
      read: () => heliograph.decodeBrightness(samples),
      level: () => lastLevel,
      stop() {
        window.clearInterval(timer);
        for (const tr of stream.getTracks()) tr.stop();
        void ctx.close();
      },
    },
  };
}

export function listenErrorText(e: ListenError): string {
  switch (e) {
    case 'unsupported':
      return 'This browser cannot use the microphone. Watch for light instead.';
    case 'denied':
      return 'Microphone access is off for Afterglow. Allow it in the browser settings to listen for a code.';
    default:
      return 'The microphone could not be opened. Close other apps using it and try again.';
  }
}
