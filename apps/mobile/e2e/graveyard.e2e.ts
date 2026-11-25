import { type LuminanceMode, MODES, scanRgba } from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/** The Graveyard Shift on the Plan tab: the night as an axis, with the crossing as a headstone. */

const DEMO = '/?phase=outage&elapsed=30#/plan';

async function setMode(page: Page, mode: LuminanceMode): Promise<void> {
  const button = page.getByRole('button', { name: /^Luminance mode:/ });
  for (let i = 0; i < 4; i++) {
    const label = (await button.getAttribute('aria-label')) ?? '';
    if (label.startsWith(`Luminance mode: ${mode}.`)) return;
    await button.click();
    await page.waitForTimeout(350);
  }
  throw new Error(`could not reach mode ${mode}`);
}

test('without a home there is no night to draw, and the page says what is missing', async ({
  page,
}) => {
  await page.goto('/#/plan');
  await page.waitForSelector('main');
  await expect(page.getByRole('heading', { name: 'Graveyard shift' })).toHaveCount(0);
  await expect(page.getByText('Tell me about your home to get a band, not a guess.')).toBeVisible();
});

test('with a home the night is drawn, said in words, and sourced', async ({ page }) => {
  await page.goto(DEMO);
  await page.waitForSelector('main');
  const section = page.getByRole('heading', { name: 'Graveyard shift' });
  await expect(section).toBeVisible();
  await expect(page.getByText(/^15 °C at /).first()).toBeVisible();
  await expect(page.getByText(/falls to 15 °C/)).toBeVisible();
  await expect(page.getByText(/Likely between /)).toBeVisible();
  await expect(page.getByText(/The axis covers the next 12 h, a default\./)).toBeVisible();
  await expect(page.getByText('thermal-building-v1').first()).toBeVisible();
  await expect(page.getByText('archetype band')).toBeVisible();
  // The chart is one labelled image whose label is the same sentence.
  await expect(page.getByRole('img', { name: /^15 °C at .*Likely between/ })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Chart key' })).toContainText(
    'Dashed: your line, 15 °C',
  );
  await expect(page.getByText(/Warming centres and where to go are not shown yet/)).toBeVisible();
});

test('the table says the same night, one row an hour from now', async ({ page }) => {
  await page.goto(DEMO);
  await page.waitForSelector('main');
  await page.getByText('Show the night as a table').click();
  const table = page.getByRole('table');
  await expect(table.getByRole('row')).toHaveCount(14); // header plus 13 hours: now to 12 h
  await expect(table.getByRole('row').nth(1)).toContainText('Now');
  await expect(table.getByRole('row').nth(1)).toContainText('19.6 °C');
  await expect(table.getByRole('columnheader', { name: 'Range' })).toBeVisible();
});

test('changing the horizon changes the axis and drops the "default" label', async ({ page }) => {
  await page.goto(DEMO);
  await page.waitForSelector('main');
  await page.getByRole('button', { name: 'Increase Cover the next' }).click();
  await expect(page.getByText(/covers the next 13 h, the length you chose\./)).toBeVisible();
});

test('a home the weather never takes to the line gets no headstone, and says why', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'afterglow.household.events.v1',
      JSON.stringify([
        {
          deviceEpoch: 'dev-e2e',
          lamport: 1,
          type: 'household.home.set',
          payload: { archetype: null, indoorC: 20, outdoorC: 18, mode: 'cold', thresholdC: 15 },
        },
      ]),
    );
    window.localStorage.setItem('afterglow.household.epoch.v1', 'dev-e2e');
  });
  await page.goto('/#/plan');
  await page.waitForSelector('main');
  await expect(page.getByText('No headstone tonight')).toBeVisible();
  await expect(
    page.getByText(/does not take your home down to the threshold/).first(),
  ).toBeVisible();
  await expect(page.getByText('Headstone: crossing')).toHaveCount(0);
});

test('an unknown building is a wide band and says so, never a good guess', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'afterglow.household.events.v1',
      JSON.stringify([
        {
          deviceEpoch: 'dev-e2e',
          lamport: 1,
          type: 'household.home.set',
          payload: { archetype: null, indoorC: 20, outdoorC: 2, mode: 'cold', thresholdC: 15 },
        },
      ]),
    );
    window.localStorage.setItem('afterglow.household.epoch.v1', 'dev-e2e');
  });
  await page.goto('/#/plan');
  await page.waitForSelector('main');
  await expect(page.getByText(/I do not know your building, so this is a wide band/)).toBeVisible();
  await expect(page.getByText('default band').first()).toBeVisible();
});

for (const width of [320, 390, 768]) {
  test(`the night fits at ${width} px with the table open`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(DEMO);
    await page.waitForSelector('main');
    await page.getByText('Show the night as a table').click();
    const o = await page.evaluate(() => {
      const doc = document.documentElement;
      const wide: string[] = [];
      for (const el of document.querySelectorAll('main *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
          wide.push(`${el.tagName} ${(el.textContent ?? '').slice(0, 20)}`);
        }
      }
      return { scroll: doc.scrollWidth, client: doc.clientWidth, wide: wide.slice(0, 6) };
    });
    expect(o.scroll, JSON.stringify(o)).toBeLessThanOrEqual(o.client);
    expect(o.wide).toEqual([]);
  });
}

for (const mode of MODES) {
  test(`the night stays within the ${mode} ceiling and red, table open`, async ({ page }) => {
    await page.goto(DEMO);
    await page.waitForSelector('main');
    await setMode(page, mode);
    await page.getByText('Show the night as a table').click();
    await page.getByRole('heading', { name: 'Graveyard shift' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    const png = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }));
    const r = scanRgba(png.data, png.width, png.height, mode);
    expect(r, `${mode}: ${r.offenders} offending. ${JSON.stringify(r.examples)}`).toMatchObject({
      ok: true,
    });
  });
}
