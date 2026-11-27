import { ceilingRed, scanRgba } from '@afterglow/design-system';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { pngSize, scanPng } from './pixelScan.js';

type Px = [number, number, number];

function png(width: number, height: number, paint: (x: number, y: number) => Px): Uint8Array {
  const img = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = paint(x, y);
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(img);
}

describe('pixel_scan_png', () => {
  it('MCP-04 a black and dim-red PNG passes in every mode', () => {
    const bytes = png(16, 9, (x) => (x % 2 === 0 ? [0, 0, 0] : [0x90, 0, 0]));
    for (const mode of ['night', 'dusk', 'ember'] as const) {
      const r = scanPng(bytes, mode, 5);
      if ('refused' in r) throw new Error(r.reason);
      expect(r.ok).toBe(true);
      expect(r.offenders).toBe(0);
      expect(r.worstOffenders).toEqual([]);
      expect(r.ceilingRed).toBe(ceilingRed(mode));
    }
  });

  it('MCP-04 the verdict and counts are the design-system scanner verdict', () => {
    const bytes = png(20, 10, (x, y) =>
      x === 3 && y === 2 ? [0xff, 0, 0] : x === 7 ? [0x40, 0x40, 0x40] : [0x20, 0, 0],
    );
    const decoded = PNG.sync.read(Buffer.from(bytes));
    const expected = scanRgba(decoded.data, 20, 10, 'night');
    const r = scanPng(bytes, 'night', 50);
    if ('refused' in r) throw new Error(r.reason);
    expect(r.ok).toBe(expected.ok);
    expect(r.offenders).toBe(expected.offenders);
    expect(r.maxRed).toBe(expected.maxRed);
    expect(r.offenders).toBe(11);
  });

  it('MCP-04 the worst offender comes first and the list is capped', () => {
    const bytes = png(10, 10, (x, y) => {
      if (x === 9 && y === 9) return [0xff, 0, 0]; // 90 steps over the night ceiling
      if (x === 0 && y === 0) return [0xa6, 0, 0]; // one step over
      if (x === 5 && y === 5) return [0x00, 0xc0, 0x00]; // green
      return [0, 0, 0];
    });
    const r = scanPng(bytes, 'night', 2);
    if ('refused' in r) throw new Error(r.reason);
    expect(r.ok).toBe(false);
    expect(r.offenders).toBe(3);
    expect(r.worstOffenders).toHaveLength(2);
    expect(r.worstOffenders[0]).toEqual({
      x: 5,
      y: 5,
      hex: '#00C000',
      reason: 'not red',
      excess: 3 * 0xc0,
    });
    expect(r.worstOffenders[1]).toMatchObject({ x: 9, y: 9, reason: 'too bright', excess: 90 });
  });

  it('MCP-04 bytes that are not a PNG are refused, never passed', () => {
    for (const bytes of [
      new Uint8Array(),
      new TextEncoder().encode('not a png'),
      new Uint8Array(64),
    ]) {
      const r = scanPng(bytes, 'night', 5);
      expect('refused' in r).toBe(true);
    }
  });
});

describe('MCP-04 a decompression bomb is refused before decoding', () => {
  it('MCP-04 a header claiming 100000 x 100000 pixels is refused from the header alone', () => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    bytes.set(
      [...'IHDR'].map((c) => c.charCodeAt(0)),
      12,
    );
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 100_000);
    view.setUint32(20, 100_000);
    expect(pngSize(bytes)).toEqual({ width: 100_000, height: 100_000 });
    const r = scanPng(bytes, 'night', 5);
    expect(r).toMatchObject({ refused: true });
    expect('reason' in r && r.reason).toContain('pixels');
  });
});
