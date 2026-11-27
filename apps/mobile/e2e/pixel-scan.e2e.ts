import {
  type Hue,
  type LuminanceMode,
  MODES,
  resolveToken,
  scanRgba,
} from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * NS-10 / NS-11: every route, in every mode and in the outage state, painted
 * by a real browser, must stay under the mode's luminance ceiling and be red.
 * NS-21: the same routes, modes and ceilings in the amber variant, which must
 * stay amber-family. The judging is the pure `scanRgba`; this file only drives
 * the browser.
 */

const MIN = 60_000;
const ev = (lamport: number, type: string, payload: unknown) => ({
  deviceEpoch: 'dev-e2e',
  lamport,
  type: `household.${type}`,
  payload,
});

/** A guest household in the middle of an outage, holding one medicine and no approved table. */
function seededEvents(nowMs: number) {
  return [
    ev(1, 'appliance.set', {
      applianceId: 'a1',
      name: 'Fridge',
      class: 'fridge',
      fullness: 'full',
      ambientC: 26,
    }),
    ev(2, 'medicine.added', {
      medicineId: 'm1',
      applianceId: 'a1',
      product: 'Zorbex',
      condition: 'inUse',
    }),
    ev(3, 'outage.set', { startedAtMs: nowMs - 45 * MIN }),
  ];
}

async function setMode(page: Page, mode: LuminanceMode): Promise<void> {
  const button = page.getByRole('button', { name: /^Luminance mode:/ });
  for (let i = 0; i < 4; i++) {
    const label = (await button.getAttribute('aria-label')) ?? '';
    if (label.startsWith(`Luminance mode: ${mode}.`)) return;
    await button.click();
    await page.waitForTimeout(350); // the mode crossfade
  }
  throw new Error(`could not reach mode ${mode}`);
}

async function scan(page: Page, mode: LuminanceMode, name: string, hue: Hue): Promise<void> {
  // Reveal-on-scroll content is hidden until scrolled to; show it all so the scan sees it.
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('.reveal')) e.classList.add('is-in');
  });
  await page.waitForTimeout(900);
  const png = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }));
  const result = scanRgba(png.data, png.width, png.height, mode, 5, hue);
  expect(
    result,
    `${name} in ${mode} (${hue}): ${result.offenders} offending pixels of ${result.pixels}, brightest red ${result.maxRed}. First: ${JSON.stringify(result.examples)}`,
  ).toMatchObject({ ok: true });
}

interface Scenario {
  readonly name: string;
  readonly url: string;
  readonly seed?: boolean;
  /** Field-check runs with readings, so the charts and dots are scanned too (FC-09). */
  readonly fieldRuns?: boolean;
}

/** A finished fridge run, an open night run and a Séance count, all with data. */
function seededFieldRuns(nowMs: number) {
  const start = nowMs - 5 * 60 * MIN;
  return {
    runs: [
      {
        id: 'cold-e2e',
        kind: 'cold',
        startedAtMs: start,
        applianceId: 'a1',
        applianceName: 'Fridge',
        applianceClass: 'fridge',
        fullness: 'full',
        ambientC: 24,
        startC: 3.2,
        readings: [60, 120, 180, 240].map((m, i) => ({ atMs: start + m * MIN, c: 3.6 + i * 0.5 })),
        endedAtMs: start + 250 * MIN,
      },
      {
        id: 'home-e2e',
        kind: 'home',
        startedAtMs: start,
        archetype: null,
        mode: 'cold',
        thresholdC: 15,
        outdoorC: 2,
        startC: 20,
        readings: [60, 120, 240].map((m, i) => ({ atMs: start + m * MIN, c: 19.2 - i * 0.8 })),
        endedAtMs: null,
      },
      {
        id: 'seance-e2e',
        kind: 'seance',
        startedAtMs: start,
        distanceM: 3,
        setting: 'indoors, lights off',
        profile: 'standard',
        trials: [
          { sent: 'SAFE', outcome: 'read', seconds: 28, atMs: start + MIN },
          { sent: 'SAFE', outcome: 'refused', seconds: null, atMs: start + 2 * MIN },
        ],
        endedAtMs: null,
      },
    ],
  };
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'hearth, power on', url: '/#/' },
  { name: 'cold, power on', url: '/#/cold' },
  { name: 'you, power on', url: '/#/you' },
  { name: 'hearth, demo outage', url: '/?phase=outage&elapsed=30#/' },
  { name: 'cold, demo outage', url: '/?phase=outage&elapsed=30#/cold' },
  { name: 'you, demo outage', url: '/?phase=outage&elapsed=30#/you' },
  { name: 'plan, power on', url: '/#/plan' },
  { name: 'plan, demo outage', url: '/?phase=outage&elapsed=30#/plan' },
  { name: 'lantern, power on', url: '/#/lantern' },
  { name: 'lantern, demo outage', url: '/?phase=outage&elapsed=30#/lantern' },
  { name: 'seance, power on', url: '/#/seance' },
  { name: 'seance, demo outage', url: '/?phase=outage&elapsed=30#/seance' },
  { name: 'alerts, power on', url: '/#/alerts' },
  { name: 'alerts, demo outage late in the night', url: '/?phase=outage&elapsed=300#/alerts' },
  { name: 'hearth, medicine with no table', url: '/#/', seed: true },
  { name: 'cold, medicine with no table', url: '/#/cold', seed: true },
  // WX-08: the front door is scanned like the product.
  { name: 'home page', url: '/' },
  { name: 'features page', url: '/features' },
  { name: 'how it works page', url: '/how-it-works' },
  { name: 'science and privacy page', url: '/science' },
  { name: 'organisations page', url: '/organisations' },
  { name: 'pricing page', url: '/pricing' },
  { name: 'not found page', url: '/nowhere-at-all' },
  { name: 'sign in', url: '/signin' },
  { name: 'sign up', url: '/signup' },
  // FC-09: field checks, empty and with readings drawn.
  { name: 'field checks, empty', url: '/app/field' },
  { name: 'field checks, with readings', url: '/app/field', seed: true, fieldRuns: true },
];

async function run(page: Page, scenario: Scenario, mode: LuminanceMode, hue: Hue): Promise<void> {
  if (scenario.seed) {
    const events = seededEvents(Date.now());
    await page.addInitScript((json) => {
      window.localStorage.setItem('afterglow.household.events.v1', json);
      window.localStorage.setItem('afterglow.household.epoch.v1', 'dev-e2e');
    }, JSON.stringify(events));
  }
  if (scenario.fieldRuns) {
    await page.addInitScript(
      (json) => {
        window.localStorage.setItem('afterglow.fieldcheck.v1', json);
      },
      JSON.stringify(seededFieldRuns(Date.now())),
    );
  }
  if (hue === 'amber') {
    await page.addInitScript(() => window.localStorage.setItem('afterglow.hue.v1', 'amber'));
  }
  await page.goto(scenario.url);
  await page.waitForSelector('main');
  await setMode(page, mode);
  if (hue === 'amber') {
    // Not vacuous: the page really is painting the amber tokens.
    const live = await page.evaluate(() => ({
      hue: document.documentElement.dataset.hue,
      primary: getComputedStyle(document.documentElement)
        .getPropertyValue('--text-primary')
        .trim()
        .toLowerCase(),
    }));
    expect(live).toEqual({
      hue: 'amber',
      primary: resolveToken(mode, 'text.primary', 'amber').toLowerCase(),
    });
  }
  await scan(page, mode, scenario.name, hue);
}

for (const scenario of SCENARIOS) {
  for (const mode of MODES) {
    test(`NS-10/11 ${scenario.name} stays within the ${mode} ceiling and red`, async ({ page }) => {
      await run(page, scenario, mode, 'red');
    });
    test(`NS-21 amber ${scenario.name} stays within the ${mode} ceiling and amber`, async ({
      page,
    }) => {
      await run(page, scenario, mode, 'amber');
    });
  }
}

test('the scan really sees a bright pixel (it is not vacuous)', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForSelector('main');
  await setMode(page, 'night');
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'probe';
    d.style.cssText =
      'position:fixed;top:0;left:0;width:40px;height:40px;background:#ff0000;z-index:99';
    document.body.appendChild(d);
  });
  const png = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  expect(scanRgba(png.data, png.width, png.height, 'night').ok).toBe(false);
  await page.evaluate(() => {
    const d = document.getElementById('probe');
    if (d) d.style.background = '#00ff00';
  });
  const green = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  const g = scanRgba(green.data, green.width, green.height, 'night');
  expect(g.ok).toBe(false);
  expect(g.examples[0]?.reason).toBe('not red');
});

test('NS-21 the amber scan really sees a bright pixel and a green one', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('afterglow.hue.v1', 'amber'));
  await page.goto('/#/');
  await page.waitForSelector('main');
  await setMode(page, 'night');
  const shoot = async (background: string) => {
    await page.evaluate((bg) => {
      let d = document.getElementById('probe');
      if (!d) {
        d = document.createElement('div');
        d.id = 'probe';
        d.style.cssText = 'position:fixed;top:0;left:0;width:40px;height:40px;z-index:99';
        document.body.appendChild(d);
      }
      d.style.background = bg;
    }, background);
    const png = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
    return scanRgba(png.data, png.width, png.height, 'night', 5, 'amber');
  };
  // #784300 is one red unit above the Night amber ceiling token: too bright.
  const bright = await shoot('#784300');
  expect(bright.ok).toBe(false);
  expect(bright.examples[0]?.reason).toBe('too bright');
  const green = await shoot('#004000');
  expect(green.ok).toBe(false);
  expect(green.examples[0]?.reason).toBe('not amber');
});
