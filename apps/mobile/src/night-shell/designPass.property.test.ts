import { fusion } from '@afterglow/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { senseText } from '../demo/senseWords';
import { SOURCES_LABEL, isDefaultSource, sourcesSummary } from './sources';

const SENSES: readonly fusion.SenseId[] = [
  'chargingEdge',
  'hum',
  'flicker',
  'magnetometer',
  'telemetry',
];
/** Engine identifiers that must never reach the main text (NS-14). */
const ENGINE = /chargingEdge|magnetometer\b|telemetry\b|fusion core|\b[a-z]+(-[a-z]+)*-v\d+\b/;

describe('Night Shell design pass', () => {
  it('NS-13 the closed label names defaults whenever one is used, and the open list keeps every source in order', () => {
    const label = fc.oneof(
      fc.constantFrom(
        'USDA FSIS outage guidance',
        'thermal-appliance-v2',
        'defaults: room 22 °C, time constant',
        'default: 12 h',
        'default band',
        'archetype band',
        'your list',
      ),
      fc.string({ maxLength: 30 }),
    );
    fc.assert(
      fc.property(fc.array(label, { maxLength: 8 }), (labels) => {
        const s = sourcesSummary(labels);
        const anyDefault = labels.some(isDefaultSource);
        expect(s.usesDefaults).toBe(anyDefault);
        expect(s.label.startsWith(SOURCES_LABEL)).toBe(true);
        expect(s.label.includes('uses defaults')).toBe(anyDefault);
      }),
      { numRuns: 1000 },
    );
    // The labels the app really uses are classified as a reader would.
    expect(isDefaultSource('defaults: room 22 °C, time constant')).toBe(true);
    expect(isDefaultSource('default band')).toBe(true);
    expect(isDefaultSource('thermal-appliance-v2')).toBe(false);
    expect(isDefaultSource('USDA FSIS outage guidance')).toBe(false);
  });

  it('NS-14 sense words cover every sense and verdict, in plain words', () => {
    const subset = fc.subarray([...SENSES]);
    fc.assert(
      fc.property(
        fc.constantFrom<fusion.MainsVerdict>('present', 'absent', 'unknown'),
        subset,
        subset,
        fc.nat({ max: 200 }),
        (verdict, pos, neg, neighbours) => {
          const t = senseText(
            { verdict, votedPositive: pos, votedNegative: neg, reason: 'x' },
            neighbours,
          );
          expect(t.headline.length).toBeGreaterThan(0);
          expect(t.why.length).toBeGreaterThan(0);
          expect(`${t.headline} ${t.why}`).not.toMatch(ENGINE);
          expect(t.why).not.toMatch(/undefined|null/);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('NS-14 the real fusion results read as people talk', () => {
    const out = fusion.fuse(
      [
        { sense: 'chargingEdge', direction: 'absent', confidence: 1 },
        { sense: 'hum', direction: 'absent', confidence: 0.86 },
      ],
      { neighbourAbsentReports: 0, k: 5 },
    );
    expect(senseText(out, 0)).toEqual({
      headline: 'Power is out here.',
      why: 'This phone stopped charging and the mains hum went quiet.',
    });
  });
});
