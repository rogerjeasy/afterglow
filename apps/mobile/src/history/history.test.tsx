import { readFileSync } from 'node:fs';
import { cells, energy, heliograph, household, thermal } from '@afterglow/core';
import fc from 'fast-check';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The report and the trust centre only lay text out; the Night Shell primitives are
// replaced by plain elements so the text can be read in Node (and folds show their content).
vi.mock('../night-shell/controls', () => ({
  Section: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  Fold: ({ label, children }: { label: string; children: ReactNode }) => (
    <details open>
      <summary>{label}</summary>
      {children}
    </details>
  ),
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  Notice: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock('../night-shell/components', () => ({ Sources: () => null }));
vi.mock('../night-shell/theme', () => ({ token: () => 'red' }));
vi.mock('../household/useHousehold', () => ({ useHousehold: () => ({}), useNow: () => 0 }));

const { reportText } = await import('./HistorySection');
const { TrustCentre } = await import('./TrustCentre');
const { printReport } = await import('./export');

/**
 * The outage report and the trust centre (.kiro/specs/history-reports HR-02, HR-04..HR-07).
 */

const T0 = Date.UTC(2026, 10, 27, 18, 0, 0);
const codes = Object.keys(heliograph.MESSAGE_CODES) as heliograph.MessageName[];
const reportArb: fc.Arbitrary<household.OutageReport> = fc
  .record({
    startMs: fc.integer({ min: T0, max: T0 + 1e9 }),
    end: fc.oneof(
      fc.constant('ongoing' as const),
      fc.constant('unrecorded' as const),
      fc.integer({ min: 0, max: 5000 }),
    ),
    doors: fc.array(
      fc.record({
        appliance: fc.constantFrom('Kitchen fridge', 'Chest freezer'),
        openMinutes: fc.integer({ min: 0, max: 240 }),
        atMs: fc.integer({ min: T0, max: T0 + 1e9 }),
      }),
      { maxLength: 3 },
    ),
    heard: fc.array(
      fc.record({
        person: fc.constantFrom('Ana', 'Mrs Dlamini'),
        code: fc.constantFrom(...codes),
        channel: fc.constantFrom(
          'light',
          'sound',
          'sms',
          'ble',
          'manual',
        ) as fc.Arbitrary<household.HeardChannel>,
        atMs: fc.integer({ min: T0, max: T0 + 1e9 }),
      }),
      { maxLength: 3 },
    ),
    removals: fc.array(
      fc.record({
        kind: fc.constant('medicine' as const),
        productId: fc.constant(null),
        product: fc.constantFrom('Insulin glargine', 'Insulin aspart'),
        appliance: fc.constant('Kitchen fridge'),
        reason: fc.constantFrom('discarded' as const, 'used' as const, null),
        atMs: fc.option(fc.integer({ min: T0, max: T0 + 1e9 }), { nil: null }),
      }),
      { maxLength: 3 },
    ),
    energy: fc.array(
      fc.record({
        store: fc.constantFrom('Power bank', 'Laptop'),
        fromPct: fc.integer({ min: 0, max: 100 }),
        toPct: fc.integer({ min: 0, max: 100 }),
        usedWh: fc.integer({ min: 0, max: 500 }),
      }),
      { maxLength: 2 },
    ),
    checks: fc.array(
      fc.record({
        check: fc.constant('outdoors'),
        answer: fc.constantFrom('yes' as const, 'no' as const, 'unknown' as const),
        atMs: fc.integer({ min: T0, max: T0 + 1e9 }),
      }),
      { maxLength: 2 },
    ),
  })
  .map(({ end, ...r }) => ({
    ...r,
    ongoing: end === 'ongoing',
    endMs: typeof end === 'number' ? r.startMs + end * 60_000 : null,
    durationMinutes: end === 'unrecorded' ? null : typeof end === 'number' ? end : 42,
    energyUsedWh: Math.round(r.energy.reduce((s, e) => s + e.usedWh, 0)),
  }));

afterEach(() => vi.unstubAllGlobals());

describe('Outage report text (HR-02, HR-04, HR-06)', () => {
  it('HR-04 every section is listed, and a section with nothing recorded says so', () => {
    fc.assert(
      fc.property(reportArb, (r) => {
        const text = reportText(r);
        const lines = text.split('\n');
        expect(lines[0]).toBe('Afterglow outage report');
        expect(text).toContain('Power went out: ');
        expect(text.includes('Doors opened: none recorded')).toBe(r.doors.length === 0);
        expect(text.includes('Thrown out or used: nothing recorded')).toBe(r.removals.length === 0);
        expect(text.includes('Check-ins: none recorded')).toBe(r.heard.length === 0);
        expect(text.includes('no store charge was updated during the outage')).toBe(
          r.energy.length === 0,
        );
        expect(text.includes('Safety checks answered:')).toBe(r.checks.length > 0);
        // One line per recorded thing.
        const items = lines.filter((l) => l.startsWith('- ')).length;
        expect(items).toBe(
          r.doors.length + r.removals.length + r.heard.length + r.energy.length + r.checks.length,
        );
        for (const x of r.removals) {
          const why =
            x.reason === 'discarded' ? 'thrown out' : x.reason === 'used' ? 'used' : 'removed';
          expect(text).toContain(`${x.product} (${x.appliance}): ${why}`);
        }
        for (const e of r.energy)
          expect(text).toContain(`- ${e.store}: ${e.fromPct}% to ${e.toPct}%`);
        for (const h of r.heard) expect(text).toContain(`- ${h.person}: `);
        expect(text).not.toMatch(/undefined|NaN|null/);
      }),
    );
  });

  it('HR-02 an end the log did not record reads "time not recorded", never an estimate', () => {
    fc.assert(
      fc.property(reportArb, (r) => {
        const text = reportText(r);
        if (r.ongoing) expect(text).toMatch(/\nStill out \(.+ so far\)\n/);
        else if (r.endMs === null) {
          expect(text).toContain('\nPower came back: time not recorded\n');
          expect(text).not.toMatch(/Power came back: .*\(/);
        } else expect(text).toMatch(/\nPower came back: .+ \(.+\)\n/);
      }),
    );
  });

  it('HR-06 the report says no schedule provider is connected instead of inventing a promised time', () => {
    fc.assert(
      fc.property(reportArb, (r) => {
        expect(reportText(r)).toContain(
          'Schedule: no provider connected, so no promised time to compare.',
        );
      }),
    );
  });
});

describe('Saving and printing (HR-05)', () => {
  it('HR-05 any report from a log survives the JSON file unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            start: fc.boolean(),
            dt: fc.integer({ min: 0, max: 600 }),
            recorded: fc.boolean(),
          }),
          { maxLength: 12 },
        ),
        (steps) => {
          let t = T0;
          const events = steps.map((s, i) => {
            t += s.dt * 60_000;
            const payload = s.start
              ? { startedAtMs: t }
              : s.recorded
                ? { startedAtMs: null, endedAtMs: t }
                : { startedAtMs: null };
            return {
              deviceEpoch: 'd',
              lamport: i,
              type: household.HOUSEHOLD_EVENT.outageSet,
              payload,
            };
          });
          for (const r of household.outageReports(events, t + 60_000)) {
            const file = JSON.stringify(
              { format: 'afterglow.outage-report.v1', report: r },
              null,
              2,
            );
            expect(JSON.parse(file)).toEqual({ format: 'afterglow.outage-report.v1', report: r });
          }
        },
      ),
    );
  });

  it('HR-05 printing shows only the report, as dark text on white, and cleans up after', () => {
    const appended: { className: string; textContent: string; removed: boolean }[] = [];
    const classes = new Set<string>();
    const listeners = new Map<string, () => void>();
    let printed = 0;
    vi.stubGlobal('document', {
      createElement: () => {
        const el = {
          className: '',
          textContent: '',
          removed: false,
          remove: () => {
            el.removed = true;
          },
        };
        return el;
      },
      body: {
        append: (el: (typeof appended)[number]) => appended.push(el),
        classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
      },
    });
    vi.stubGlobal('window', {
      addEventListener: (k: string, f: () => void) => listeners.set(k, f),
      removeEventListener: (k: string) => listeners.delete(k),
      print: () => {
        printed++;
      },
    });
    printReport('Afterglow outage report\nPower went out: 18:00');
    expect(printed).toBe(1);
    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      className: 'print-only',
      textContent: 'Afterglow outage report\nPower went out: 18:00',
    });
    expect(classes.has('printing-report')).toBe(true);
    listeners.get('afterprint')?.();
    expect(appended[0]?.removed).toBe(true);
    expect(classes.has('printing-report')).toBe(false);
    expect(listeners.size).toBe(0);
    // The print styles: everything else hidden, the report black on white.
    const css = readFileSync(new URL('../night-shell/night-shell.css', import.meta.url), 'utf8');
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(
      /body\.printing-report > \*:not\(\.print-only\)\s*\{\s*display: none !important;/,
    );
    expect(print).toMatch(
      /body\.printing-report \.print-only \{[^}]*color: #000;[^}]*background: #fff;/,
    );
  });
});

describe('Trust centre (HR-07)', () => {
  it('HR-07 lists each model with what it does, its anchor, its limits and the version from the code', () => {
    const html = renderToStaticMarkup(<TrustCentre />);
    const models: [string, string][] = [
      ['Fridge and freezer clocks', thermal.APPLIANCE_MODEL_VERSION],
      ['Hours of safety at home', thermal.BUILDING_MODEL_VERSION],
      ['Medicine clocks', 'pharmacist-approved table'],
      ['Energy plan (candles)', energy.ENERGY_MODEL_VERSION],
      ['Grid Sense', 'fusion rules'],
      ['Crowd map', `k = ${cells.K_ANONYMITY}`],
      ['Heliograph codes', `${heliograph.PROFILES.standard.symbolMs} ms symbols`],
    ];
    const folds = html.split('<details').slice(1);
    expect(folds).toHaveLength(models.length);
    for (const [i, [name, version]] of models.entries()) {
      const f = folds[i] as string;
      expect(f).toContain(`<summary>${name}</summary>`);
      for (const k of ['What it does', 'Anchored to', 'What it does not know', 'Version']) {
        expect(f).toContain(`>${k}</dt>`);
      }
      expect(f).toMatch(new RegExp(`<dd[^>]*>${version.replace(/[()]/g, '\\$&')}</dd>`));
      for (const dd of f.match(/<dd[^>]*>([^<]*)<\/dd>/g) ?? [])
        expect(dd.replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(3);
    }
  });
});
