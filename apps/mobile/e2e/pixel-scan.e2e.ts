import { type LuminanceMode, MODES, scanRgba } from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * NS-10 / NS-11: every route, in every mode and in the outage state, painted
 * by a real browser, must stay under the mode's luminance ceiling and be red.
 * The judging is the pure `scanRgba`; this file only drives the browser.
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

async function scan(page: Page, mode: LuminanceMode, name: string): Promise<void> {
  // Reveal-on-scroll content is hidden until scrolled to; show it all so the scan sees it.
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('.reveal')) e.classList.add('is-in');
  });
  await page.waitForTimeout(900);
  const png = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }));
  const result = scanRgba(png.data, png.width, png.height, mode);
  expect(
    result,
    `${name} in ${mode}: ${result.offenders} offending pixels of ${result.pixels}, brightest red ${result.maxRed}. First: ${JSON.stringify(result.examples)}`,
  ).toMatchObject({ ok: true });
}

interface Scenario {
  readonly name: string;
  readonly url: string;
  readonly seed?: boolean;
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
];

for (const scenario of SCENARIOS) {
  for (const mode of MODES) {
    test(`NS-10/11 ${scenario.name} stays within the ${mode} ceiling and red`, async ({ page }) => {
      if (scenario.seed) {
        const events = seededEvents(Date.now());
        await page.addInitScript((json) => {
          window.localStorage.setItem('afterglow.household.events.v1', json);
          window.localStorage.setItem('afterglow.household.epoch.v1', 'dev-e2e');
        }, JSON.stringify(events));
      }
      await page.goto(scenario.url);
      await page.waitForSelector('main');
      await setMode(page, mode);
      await scan(page, mode, scenario.name);
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
