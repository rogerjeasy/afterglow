import { type LuminanceMode, MODES, scanRgba } from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/** A first visit, in a real browser, with nothing remembered. */
test.use({ storageState: { cookies: [], origins: [] } });

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

async function overflow(page: Page): Promise<{ scroll: number; client: number; wide: string[] }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const wide: string[] = [];
    for (const el of document.querySelectorAll('main *, header *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
        wide.push(`${el.tagName} ${(el.textContent ?? '').slice(0, 20)}`);
      }
    }
    return { scroll: doc.scrollWidth, client: doc.clientWidth, wide: wide.slice(0, 6) };
  });
}

const welcome = (page: Page) =>
  page.getByRole('heading', { name: 'The only app you can read when the grid dies.' });

test('a first visit is welcomed, with no tab bar to get lost in', async ({ page }) => {
  await page.goto('/#/');
  await expect(welcome(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set it up (about 2 minutes)' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Show me a simulated night instead' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
  await expect(page.getByText('Nothing leaves this device.')).toBeVisible();
});

test('the dark preview shows Night mode and closes', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'See what the dark looks like' }).click();
  const dialog = page.getByRole('dialog', { name: 'A preview of Night mode' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('GRID DOWN 00:00:12')).toBeVisible();
  await expect(dialog.getByText(/The numbers here are a sample/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to the light' }).click();
  await expect(dialog).toHaveCount(0);
});

test('the full walk puts real data in the real household, and is not shown again', async ({
  page,
}) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Set it up (about 2 minutes)' }).click();

  // Cold things
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Add fridge', exact: true }).click();
  await page.getByRole('button', { name: 'Add freezer', exact: true }).click();
  await page.getByRole('button', { name: 'Full', exact: true }).last().click();
  await expect(page.getByText('Fridge', { exact: true })).toBeVisible();
  await expect(page.getByText('Freezer', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Home
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'I do not know' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  // People
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
  await page.getByLabel('Their name').fill('Mrs Dlamini');
  await page.getByRole('button', { name: 'Add to my list' }).click();
  await expect(page.getByText('Mrs Dlamini · No. 0')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Done
  await expect(page.getByText('You are set up')).toBeVisible();
  await expect(page.getByText(/2 cold things/)).toBeVisible();
  await expect(page.getByText(/Your home: the Hearth can show hours of safety/)).toBeVisible();
  await expect(page.getByText(/1 person on your list/)).toBeVisible();
  await expect(page.getByText(/pharmacist-approved table/)).toBeVisible();
  await page.getByRole('button', { name: 'Open the Hearth' }).click();

  // The Hearth is computed from what was entered, and the tab bar is back.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByText('Fridge', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Freezer', { exact: true }).first()).toBeVisible();

  await page.reload();
  await page.waitForSelector('main');
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByText('Fridge', { exact: true }).first()).toBeVisible();
});

test('skipping every step costs nothing and says so', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Set it up (about 2 minutes)' }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Skip this step' }).first().click();
  }
  await expect(page.getByText('You are set up')).toBeVisible();
  await expect(page.getByText(/You skipped every step/)).toBeVisible();
  await page.getByRole('button', { name: 'Open the Hearth' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('the home step can be skipped with its own Cancel', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Set it up (about 2 minutes)' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Step 3 of 3')).toBeVisible();
});

test('Skip for now goes straight to the Hearth and is remembered', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.reload();
  await page.waitForSelector('main');
  await expect(welcome(page)).toHaveCount(0);
});

test('the welcome offers a simulated night, which opens the demo, not the real space', async ({
  page,
}) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Show me a simulated night instead' }).click();
  await expect(page.getByText(/Demo: simulated household and neighbourhood/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit demo' })).toBeVisible();
  await expect(page.getByText(/GRID DOWN/)).toBeVisible();
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.getByText(/No outage reported/)).toBeVisible();
});

test('a scenario link skips the welcome, and #/welcome replays it', async ({ page }) => {
  await page.goto('/?phase=outage&elapsed=30#/');
  await expect(welcome(page)).toHaveCount(0);
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.goto('/#/welcome');
  await expect(welcome(page)).toBeVisible();
});

test('a person who already has data is never welcomed over it', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'afterglow.household.events.v1',
      JSON.stringify([
        {
          deviceEpoch: 'dev-e2e',
          lamport: 1,
          type: 'household.appliance.set',
          payload: {
            applianceId: 'a1',
            name: 'Fridge',
            class: 'fridge',
            fullness: 'full',
            ambientC: 22,
          },
        },
      ]),
    );
    window.localStorage.setItem('afterglow.household.epoch.v1', 'dev-e2e');
  });
  await page.goto('/#/');
  await page.waitForSelector('main');
  await expect(welcome(page)).toHaveCount(0);
});

for (const width of [320, 390, 768]) {
  test(`every step fits at ${width} px without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/#/');
    const check = async (label: string): Promise<void> => {
      const o = await overflow(page);
      expect(o.scroll, `${label}: ${JSON.stringify(o)}`).toBeLessThanOrEqual(o.client);
      expect(o.wide, label).toEqual([]);
    };
    await check('welcome');
    await page.getByRole('button', { name: 'Set it up (about 2 minutes)' }).click();
    await page.getByRole('button', { name: 'Add fridge', exact: true }).click();
    await check('cold');
    await page.getByRole('button', { name: 'Next' }).click();
    await check('home');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page
      .getByLabel('Their name')
      .fill('A name that is long enough to need wrapping on a phone');
    await page.getByRole('button', { name: 'Add to my list' }).click();
    await check('people');
    await page.getByRole('button', { name: 'Next' }).click();
    await check('done');
  });
}

for (const mode of MODES) {
  test(`every onboarding step stays within the ${mode} ceiling and red`, async ({ page }) => {
    await page.goto('/#/');
    await setMode(page, mode);
    const scan = async (label: string): Promise<void> => {
      await page.waitForTimeout(350);
      const png = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }));
      const r = scanRgba(png.data, png.width, png.height, mode);
      expect(
        r,
        `${label} in ${mode}: ${r.offenders} offending. ${JSON.stringify(r.examples)}`,
      ).toMatchObject({
        ok: true,
      });
    };
    await scan('welcome');
    await page.getByRole('button', { name: 'See what the dark looks like' }).click();
    await scan('dark preview');
    await page.getByRole('button', { name: 'Back to the light' }).click();
    await page.getByRole('button', { name: 'Set it up (about 2 minutes)' }).click();
    await page.getByRole('button', { name: 'Add fridge', exact: true }).click();
    await scan('cold');
    await page.getByRole('button', { name: 'Next' }).click();
    await scan('home');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByLabel('Their name').fill('Paulo');
    await page.getByRole('button', { name: 'Add to my list' }).click();
    await scan('people');
    await page.getByRole('button', { name: 'Next' }).click();
    await scan('done');
  });
}
