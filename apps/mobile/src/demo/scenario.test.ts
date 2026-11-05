import { describe, expect, it } from 'vitest';
import { runScenario } from './scenario';

describe('demo scenario drives the real fusion core', () => {
  it('powered phase is present', () => {
    const s = runScenario('powered');
    expect(s.verdict).toBe('present');
    expect(s.result.votedPositive).toContain('hum');
  });

  it('outage phase is absent, corroborated by neighbours', () => {
    const s = runScenario('outage');
    expect(s.verdict).toBe('absent');
    expect(s.neighboursAbsent).toBe(14);
    expect(s.result.votedNegative).toContain('chargingEdge');
  });
});
