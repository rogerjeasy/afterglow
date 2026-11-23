import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { heliograph } from '@afterglow/core';

/** A tiny y4m video of a lamp that follows the transmit plan, for Chromium's fake camera. */
export function writeBlinkVideo(
  path: string,
  message: heliograph.HeliographMessage,
  fps: number,
  profile: heliograph.Profile,
): void {
  if (existsSync(path)) return;
  const plan = heliograph.planTransmission(message, 3, profile);
  if (!plan) throw new Error('bad message');
  const W = 64;
  const H = 48;
  const lead = 1500;
  const total = lead + plan.totalMs + 1500;
  const frames = Math.ceil((total / 1000) * fps);
  const chunks: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < frames; f++) {
    const t = (f / fps) * 1000 - lead;
    let lit = false;
    let at = 0;
    for (const r of plan.runs) {
      if (t >= at && t < at + r.ms) lit = r.lit;
      at += r.ms;
    }
    const frame = Buffer.alloc(W * H + (W * H) / 2, 128);
    frame.fill(lit ? 235 : 16, 0, W * H);
    chunks.push(Buffer.from('FRAME\n'), frame);
  }
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, Buffer.concat(chunks));
  renameSync(tmp, path); // atomic: parallel workers never see a half-written file
}

export function videoPath(name: string): string {
  const dir = join(tmpdir(), 'afterglow-e2e');
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

/** A video of a lamp left on (or off): there is light, but nothing blinks. */
export function writeSteadyVideo(path: string, lit: boolean, fps: number, seconds: number): void {
  if (existsSync(path)) return;
  const W = 64;
  const H = 48;
  const chunks: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`)];
  const frame = Buffer.alloc(W * H + (W * H) / 2, 128);
  frame.fill(lit ? 235 : 16, 0, W * H);
  for (let f = 0; f < fps * seconds; f++) chunks.push(Buffer.from('FRAME\n'), frame);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, Buffer.concat(chunks));
  renameSync(tmp, path);
}
