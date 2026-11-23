import { heliograph } from '@afterglow/core';

/**
 * A simulated camera recording of a Heliograph message, for DEMO mode only.
 * It is made from the real transmit plan and then read by the real reader and
 * decoder, so the demo exercises the whole receive path; only the camera is
 * stood in for. It is deterministic (a fixed pseudo-random sequence), so a demo
 * behaves the same every time. It is never written to a real household.
 */
export function simulateRecording(
  message: heliograph.HeliographMessage,
  profile: heliograph.Profile = heliograph.PROFILES.standard,
): heliograph.GridFrame[] {
  const plan = heliograph.planTransmission(message, 3, profile);
  if (!plan) return [];
  const symbols: number[] = [];
  for (const run of plan.runs) {
    for (let k = 0; k < run.ms / profile.symbolMs; k++) symbols.push(run.lit ? 1 : 0);
  }
  const fps = profile.name === 'fast' ? 60 : 30;
  let seed = 0x9e3779b9;
  const rnd = (): number => {
    seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x297a2d39) >>> 0;
    return seed / 4294967296;
  };
  const scenery = Array.from({ length: 48 }, (_, i) => 40 + ((i * 37) % 120));
  const lead = 1200;
  const frames: heliograph.GridFrame[] = [];
  for (let t = 0; t < lead + symbols.length * profile.symbolMs + 1200; t += 1000 / fps) {
    const k = Math.floor((t - lead) / profile.symbolMs);
    const lit = k >= 0 && k < symbols.length && symbols[k] === 1;
    frames.push({
      tMs: t,
      cells: scenery.map((v, i) =>
        i === 21 ? (lit ? 190 : 18) + (rnd() - 0.5) * 10 : Math.max(0, v + (rnd() - 0.5) * 6),
      ),
    });
  }
  return frames;
}
