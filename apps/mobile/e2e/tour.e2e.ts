import { type LuminanceMode, MODES, scanRgba } from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * Wisp's one-night tour in a real browser (guide spec GD-03, GD-06, GD-08 to GD-11).
 * The pure rules (the script, facts, state machine) are property-tested in
 * src/guide/guide.property.test.ts; this file proves the shell carries them out.
 */

const STEPS = 11;
const bubble = (page: Page) => page.locator('[data-wisp="bubble"]');
const primary = (page: Page) => page.locator('[data-wisp="actions"] button').first();

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

async function scan(page: Page, mode: LuminanceMode, name: string): Promise<void> {
  await page.waitForTimeout(350);
  const png = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
  const result = scanRgba(png.data, png.width, png.height, mode);
  expect(
    result,
    `${name} in ${mode}: ${result.offenders} offending pixels, brightest red ${result.maxRed}. First: ${JSON.stringify(result.examples)}`,
  ).toMatchObject({ ok: true });
}

/** The highlighted target sits in the clear space above the bubble. */
async function expectTargetClear(page: Page, step: number): Promise<void> {
  const target = page.locator('.tour-target');
  await expect(target, `step ${step} has a highlighted target`).toHaveCount(1);
  await expect(target).toBeVisible();
  const t = await target.boundingBox();
  const b = await bubble(page).boundingBox();
  expect(t && b && t.y < b.y, `step ${step}: target top is above the bubble`).toBe(true);
}

async function noOverflow(page: Page): Promise<void> {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
}

test('GD-06 the whole night: every step shows its target above the bubble, and the power comes back', async ({
  page,
}) => {
  await page.goto('/?tour=1');
  await expect(bubble(page)).toContainText("I'm Wisp");
  await expect(page.getByText('POWER ON')).toBeVisible();
  const tabs: string[] = [];
  for (let i = 0; i < STEPS; i++) {
    await expectTargetClear(page, i);
    tabs.push(new URL(page.url()).hash);
    // Wisp never says a number the screen did not compute: the lights-out line repeats the cell's count.
    if (i === 1) {
      const status = (await page.locator('[data-tour="status"]').textContent()) ?? '';
      const n = /(\d+) phones/.exec((await bubble(page).textContent()) ?? '')?.[1];
      expect(n).toBeTruthy();
      expect(status).toContain(`${n} devices in your cell lost power`);
    }
    await primary(page).click();
  }
  expect(new Set(tabs)).toEqual(new Set(['#/', '#/cold', '#/lantern', '#/seance', '#/plan']));
  await expect(bubble(page)).toContainText('That was one night');
  await expect(page.getByText('POWER ON')).toBeVisible();
});

test('GD-08 the tour fits a 320 px phone with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/?tour=1');
  for (let i = 0; i < STEPS; i++) {
    await expect(bubble(page)).toBeVisible();
    await noOverflow(page);
    const b = await bubble(page).boundingBox();
    expect(b && b.x >= 0 && b.x + b.width <= 320).toBe(true);
    await primary(page).click();
  }
});

test('GD-10 the tour runs by keyboard, and Escape skips it', async ({ page }) => {
  await page.goto('/?tour=1');
  await expect(primary(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(bubble(page)).toContainText('Lights out');
  await expect(primary(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(bubble(page)).toContainText('That was one night');
  for (const name of ['Set up my own home', 'Keep exploring', 'Replay']) {
    const box = await page.getByRole('button', { name }).boundingBox();
    expect(box && box.height >= 44, name).toBe(true);
  }
});

test('GD-11 the tour can be found on the welcome, the Hearth and the You screen, and replayed', async ({
  browser,
}) => {
  // A first visit: the welcome offers it.
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const first = await fresh.newPage();
  await first.goto('/#/');
  await first.getByRole('button', { name: 'Take the one-minute tour with Wisp' }).click();
  await expect(bubble(first)).toContainText("I'm Wisp");
  // Replay from the finish card returns to the first step.
  await first.keyboard.press('Escape');
  await first.getByRole('button', { name: 'Replay' }).click();
  await expect(bubble(first)).toContainText("I'm Wisp");
  await fresh.close();

  const ctx = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [{ name: 'afterglow.onboarding.v1', value: 'skipped' }],
        },
      ],
    },
  });
  const page = await ctx.newPage();
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Show me a night with Wisp, the guide' }).click();
  await expect(bubble(page)).toContainText("I'm Wisp");
  await page.goto('/#/you');
  await page.reload();
  await page.getByRole('button', { name: 'Take the one-minute tour with Wisp' }).click();
  await expect(bubble(page)).toContainText("I'm Wisp");
  await ctx.close();
});

test('GD-03 the tour leaves the real household untouched', async ({ page }) => {
  await page.goto('/?tour=1');
  await primary(page).click(); // lights out, in the demo
  await expect(page.getByText(/GRID DOWN/)).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Keep exploring' }).click();
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.getByText(/No outage reported/)).toBeVisible();
  await expect(bubble(page)).toHaveCount(0);
});

for (const mode of MODES) {
  test(`GD-09 the tour passes the pixel scan in ${mode}`, async ({ page }) => {
    await page.goto('/?tour=1');
    for (let i = 0; i < STEPS; i++) {
      await setMode(page, mode);
      await scan(page, mode, `tour step ${i}`);
      await primary(page).click();
    }
    await setMode(page, mode);
    await scan(page, mode, 'tour finish');
  });
}
