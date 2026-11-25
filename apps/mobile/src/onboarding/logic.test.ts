import { describe, expect, it } from 'vitest';
import { memoryStorage } from '../household/store';
import {
  FLAG_KEY,
  STEPS,
  clearFlag,
  nextStep,
  previousStep,
  progressText,
  readFlag,
  shouldOnboard,
  summaryLines,
  writeFlag,
} from './logic';

const first = { flag: null, spaceKind: 'guest', hasHouseholdData: false, search: '' } as const;

describe('Onboarding logic', () => {
  it('OB-01 a first visit to the real space is welcomed', () => {
    expect(shouldOnboard(first)).toBe(true);
  });

  it('OB-02 it is never shown in the demo, an account, over existing data, or for a scenario link', () => {
    expect(shouldOnboard({ ...first, spaceKind: 'demo' })).toBe(false);
    expect(shouldOnboard({ ...first, spaceKind: 'account' })).toBe(false);
    expect(shouldOnboard({ ...first, hasHouseholdData: true })).toBe(false);
    expect(shouldOnboard({ ...first, search: '?phase=outage&elapsed=30' })).toBe(false);
    expect(shouldOnboard({ ...first, search: '?utm=x' })).toBe(true);
  });

  it('OB-03 finishing or skipping is remembered, and a damaged flag means not yet', () => {
    const s = memoryStorage();
    expect(readFlag(s)).toBeNull();
    writeFlag(s, 'skipped');
    expect(readFlag(s)).toBe('skipped');
    expect(shouldOnboard({ ...first, flag: readFlag(s) })).toBe(false);
    writeFlag(s, 'done');
    expect(readFlag(s)).toBe('done');
    clearFlag(s);
    expect(readFlag(s)).toBeNull();
    const bad = memoryStorage({ [FLAG_KEY]: 'yes please' });
    expect(readFlag(bad)).toBeNull();
  });

  it('OB-04 blocked storage never throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readFlag(blocked)).toBeNull();
    expect(() => writeFlag(blocked, 'done')).not.toThrow();
    expect(() => clearFlag(blocked)).not.toThrow();
  });

  it('OB-05 the steps run welcome to done and stop at both ends', () => {
    expect(STEPS[0]).toBe('welcome');
    expect(STEPS[STEPS.length - 1]).toBe('done');
    expect(nextStep('welcome')).toBe('cold');
    expect(nextStep('done')).toBe('done');
    expect(previousStep('cold')).toBe('welcome');
    expect(previousStep('welcome')).toBe('welcome');
    expect(progressText('cold')).toBe('Step 1 of 3');
    expect(progressText('people')).toBe('Step 3 of 3');
    expect(progressText('welcome')).toBe('');
    expect(progressText('done')).toBe('');
  });

  it('OB-06 the summary claims only what was entered and lists what is open', () => {
    const none = summaryLines({ appliances: 0, homeSet: false, people: 0 });
    expect(none.done).toEqual([]);
    expect(none.open.join(' ')).toContain('Cold things');
    expect(none.open.join(' ')).toContain('wide band');
    const all = summaryLines({ appliances: 2, homeSet: true, people: 1 });
    expect(all.done).toHaveLength(3);
    expect(all.done[0]).toContain('2 cold things');
    expect(all.done[2]).toContain('1 person on your list');
    // Medicines and batteries are always still open: onboarding never collects them.
    expect(all.open.join(' ')).toContain('pharmacist-approved');
    expect(all.open.join(' ')).toContain('Plan tab');
    expect(all.done.join(' ')).not.toMatch(/\bsafe\b/i);
  });
});
