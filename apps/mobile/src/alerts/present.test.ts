import type { alerts } from '@afterglow/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatDuration } from '../format';
import { alertText } from './present';

const KINDS: readonly alerts.AlertKind[] = [
  'outage',
  'foodSoon',
  'foodPast',
  'homeSoon',
  'homeReached',
  'help',
  'comingBack',
];
const ENGINE = /chargingEdge|fusion core|\b[a-z]+(?:-[a-z]+)*-v\d+\b|undefined|null|NaN/;

const alertArb: fc.Arbitrary<alerts.Alert> = fc.record({
  key: fc.string({ minLength: 1, maxLength: 8 }),
  kind: fc.constantFrom(...KINDS),
  priority: fc.constantFrom('critical', 'high', 'normal'),
  subject: fc.constantFrom('Fridge', 'Freezer', 'Mom', 'Your home'),
  sinceMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  minutes: fc.option(fc.nat({ max: 5000 }), { nil: null }),
  sources: fc.constant(['s']),
});

describe('Alert words', () => {
  it('AL-01 every kind is said in plain words, never an engine identifier or a hole', () => {
    fc.assert(
      fc.property(alertArb, (a) => {
        const t = alertText(a);
        expect(t.title.length).toBeGreaterThan(0);
        expect(t.body.length).toBeGreaterThan(0);
        expect(`${t.title} ${t.body}`).not.toMatch(ENGINE);
      }),
      { numRuns: 2000 },
    );
  });

  it('AL-04 a timed alert says the core’s minutes, floored, and names its subject', () => {
    fc.assert(
      fc.property(alertArb, fc.nat({ max: 5000 }), (a, m) => {
        const t = alertText({ ...a, kind: 'foodSoon', minutes: m });
        expect(t.title).toBe(`${a.subject}: ${formatDuration(m)} left`);
        const h = alertText({ ...a, kind: 'homeSoon', minutes: m });
        expect(h.title).toContain(formatDuration(m));
      }),
    );
  });

  it('AL-03 a HELP names the person and the emergency number, and never claims to be one', () => {
    const t = alertText({
      key: 'help:p:1',
      kind: 'help',
      priority: 'critical',
      subject: 'Mom',
      sinceMs: 0,
      minutes: null,
      sources: ['heard by light'],
    });
    expect(t.title).toBe('Mom sent HELP');
    expect(t.body).toMatch(/emergency number/);
    expect(t.body).toMatch(/not an emergency service/);
  });
});
