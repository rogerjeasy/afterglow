import { describe, expect, it } from 'vitest';
import { fuse } from './fuse.js';
import { DEFAULT_K, type FusionContext } from './types.js';

const noNeighbours: FusionContext = { neighbourAbsentReports: 0, k: DEFAULT_K };

describe('Grid Sense fusion examples', () => {
  it('declares present on hum alone', () => {
    const res = fuse([{ sense: 'hum', direction: 'present', confidence: 0.9 }]);
    expect(res.verdict).toBe('present');
    expect(res.votedPositive).toEqual(['hum']);
  });

  it('declares present on flicker (positive-only) alone', () => {
    const res = fuse([{ sense: 'flicker', direction: 'present', confidence: 0.7 }]);
    expect(res.verdict).toBe('present');
  });

  it('stays unknown on a lone charging-edge drop with no corroboration', () => {
    const res = fuse(
      [{ sense: 'chargingEdge', direction: 'absent', confidence: 1 }],
      noNeighbours,
    );
    expect(res.verdict).toBe('unknown');
  });

  it('declares absent when charging-edge and hum both say absent', () => {
    const res = fuse([
      { sense: 'chargingEdge', direction: 'absent', confidence: 1 },
      { sense: 'hum', direction: 'absent', confidence: 0.8 },
    ]);
    expect(res.verdict).toBe('absent');
    expect(res.votedNegative).toEqual(['chargingEdge', 'hum']);
  });

  it('declares absent on one negative corroborated by >= k neighbours', () => {
    const res = fuse([{ sense: 'chargingEdge', direction: 'absent', confidence: 1 }], {
      neighbourAbsentReports: 5,
      k: DEFAULT_K,
    });
    expect(res.verdict).toBe('absent');
  });

  it('treats home telemetry grid-loss as authoritative', () => {
    const res = fuse([{ sense: 'telemetry', direction: 'absent', confidence: 1 }], noNeighbours);
    expect(res.verdict).toBe('absent');
  });

  it('stays unknown when a negative is contradicted by telemetry-present', () => {
    const res = fuse([
      { sense: 'chargingEdge', direction: 'absent', confidence: 1 },
      { sense: 'telemetry', direction: 'present', confidence: 1 },
    ]);
    expect(res.verdict).toBe('unknown');
  });

  it('returns unknown on silence (all unknown)', () => {
    const res = fuse([
      { sense: 'hum', direction: 'unknown', confidence: 0 },
      { sense: 'flicker', direction: 'unknown', confidence: 0 },
    ]);
    expect(res.verdict).toBe('unknown');
  });

  it('returns unknown on no votes at all', () => {
    expect(fuse([]).verdict).toBe('unknown');
  });
});
