import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { personReportFor } from './engine';

/** crowd-reports CR-17: the person's own outage button joins the crowd map, once. */
describe('CR-17 person reports', () => {
  const base = { spaceChanged: false, demo: false, sensed: 'unknown' as const };

  it('CR-17 "Power just went out" reports absent; "Power is back" reports present', () => {
    expect(personReportFor({ ...base, wasOutage: false, outage: true })).toBe('absent');
    expect(personReportFor({ ...base, wasOutage: true, outage: false })).toBe('present');
  });

  it('CR-17 never from the demo, a space change, or when nothing changed', () => {
    expect(personReportFor({ ...base, demo: true, wasOutage: false, outage: true })).toBeNull();
    expect(
      personReportFor({ ...base, spaceChanged: true, wasOutage: false, outage: true }),
    ).toBeNull();
    expect(personReportFor({ ...base, wasOutage: true, outage: true })).toBeNull();
  });

  it('CR-17 property: never doubles a verdict the senses already reported', () => {
    const verdict = fc.constantFrom('present', 'absent', 'unknown') as fc.Arbitrary<
      'present' | 'absent' | 'unknown'
    >;
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        verdict,
        (w, o, sc, d, s) => {
          const r = personReportFor({
            wasOutage: w,
            outage: o,
            spaceChanged: sc,
            demo: d,
            sensed: s,
          });
          if (r === null) return true;
          return r !== s && !d && !sc && w !== o && r === (o ? 'absent' : 'present');
        },
      ),
    );
  });
});
