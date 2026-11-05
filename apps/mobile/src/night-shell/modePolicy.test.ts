import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decideMode } from './modePolicy';

describe('Luminance mode policy (night vision)', () => {
  it('a change of space never brightens and never replays Lights-Out', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (outage, wasOutage) => {
        const d = decideMode({ outage, wasOutage, spaceChanged: true });
        expect(d).not.toBe('ember');
        expect(d).not.toBe('lightsOut');
      }),
    );
  });

  it('a change of space while dark stays in Night', () => {
    expect(decideMode({ outage: true, wasOutage: true, spaceChanged: true })).toBe('night');
    expect(decideMode({ outage: true, wasOutage: false, spaceChanged: true })).toBe('night');
  });

  it('only a real power change moves the mode', () => {
    expect(decideMode({ outage: true, wasOutage: false, spaceChanged: false })).toBe('lightsOut');
    expect(decideMode({ outage: false, wasOutage: true, spaceChanged: false })).toBe('ember');
    expect(decideMode({ outage: true, wasOutage: true, spaceChanged: false })).toBe('keep');
    expect(decideMode({ outage: false, wasOutage: false, spaceChanged: false })).toBe('keep');
  });

  it('brightening to Ember happens only when power returns in the same space', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), (outage, wasOutage, spaceChanged) => {
        if (decideMode({ outage, wasOutage, spaceChanged }) === 'ember') {
          expect(spaceChanged).toBe(false);
          expect(wasOutage).toBe(true);
          expect(outage).toBe(false);
        }
      }),
    );
  });
});
