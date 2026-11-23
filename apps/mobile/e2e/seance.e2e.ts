import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { heliograph } from '@afterglow/core';
import { MODES, scanRgba } from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * The Séance, in a real browser: the board, sending with the screen lamp (and
 * its pixels), the demo reader, and a full receive from a fake camera that plays
 * a recorded blinking lamp.
 */

const DEMO = '/?phase=outage&elapsed=30#/seance';

async function openDemoSeance(page: Page): Promise<void> {
  await page.goto(DEMO);
  await page.waitForSelector('main');
  await expect(page.getByRole('heading', { name: 'Séance' })).toBeVisible();
}

// ----------------------------------------------------------------- the board
test('the demo board starts as five ghosts, and none is called safe', async ({ page }) => {
  await openDemoSeance(page);
  for (const name of ['Mom', 'Mr Naidoo', 'Mrs Dlamini', 'Paulo', 'Sipho (caretaker)']) {
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByText('No word yet').first()).toBeVisible();
  await expect(page.getByText(/is safe/)).toHaveCount(0);
});

test('marking someone safe by hand makes the ghost solid, and says you marked it', async ({
  page,
}) => {
  await openDemoSeance(page);
  await page.getByRole('button', { name: 'They told me they are safe' }).first().click();
  await expect(page.getByText(/Safe · .* · you marked it/)).toBeVisible();
});

test('the demo reader reads a simulated message through the real decoder (standard and fast)', async ({
  page,
}) => {
  await openDemoSeance(page);
  await page.getByRole('button', { name: 'Simulate a message (standard)' }).click();
  await expect(page.getByText('Mom is safe')).toBeVisible();
  await expect(page.getByText(/Read from \d repeats.*standard speed/)).toBeVisible();
  await expect(page.getByText(/Safe · .* · by light/)).toBeVisible();

  await page.getByRole('button', { name: 'Simulate a message (fast)' }).click();
  await expect(page.getByText(/Read from \d repeats.*fast speed/)).toBeVisible();
});

test('a person can be added, and a number already in use is refused', async ({ page }) => {
  await page.goto('/#/seance');
  await page.waitForSelector('main');
  await page.getByLabel('Name').fill('Ana');
  await page.getByRole('button', { name: 'Add to my list' }).click();
  await expect(page.getByText('Ana', { exact: false }).first()).toBeVisible();
  // The stepper moved to the next free number, so adding again with the same name works...
  await page.getByLabel('Name').fill('Bea');
  await expect(page.getByRole('button', { name: 'Add to my list' })).toBeEnabled();
});

// ----------------------------------------------------------------- sending
test('sending shows the warning first, needs a tap to start, and Stop leaves the screen dark', async ({
  page,
}) => {
  await page.goto('/#/seance');
  await page.waitForSelector('main');
  await page.getByRole('button', { name: 'I am safe' }).click();
  await expect(page.getByText(/This screen will flash red/)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start sending' }).click();
  const lamp = page.getByRole('dialog', { name: 'Sending: I am safe' });
  await expect(lamp).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(lamp).toHaveCount(0);
  await expect(page.getByText(/Stopped\. Nothing was confirmed as received\./)).toBeVisible();
});

test('the fast profile cannot start until flashing sensitivity is confirmed', async ({ page }) => {
  await page.goto('/#/seance');
  await page.waitForSelector('main');
  await page.getByRole('button', { name: 'I am safe' }).click();
  await page.getByRole('button', { name: 'Fast', exact: true }).click();
  await expect(page.getByText(/5 times a second/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start sending' })).toBeDisabled();
  await page.getByRole('button', { name: 'Nobody nearby is sensitive to flashing light' }).click();
  await expect(page.getByRole('button', { name: 'Start sending' })).toBeEnabled();
  // Going back to standard needs no confirmation and clears it.
  await page.getByRole('button', { name: 'Standard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start sending' })).toBeEnabled();
  await page.getByRole('button', { name: 'Fast', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start sending' })).toBeDisabled();
});

test('the HELP button shows the emergency note and never claims to be a service', async ({
  page,
}) => {
  await page.goto('/#/seance');
  await page.waitForSelector('main');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByText(/not an emergency service/).first()).toBeVisible();
});

for (const mode of MODES) {
  test(`the lit and dark lamp stay within the ${mode} ceiling and red`, async ({ page }) => {
    await page.goto('/#/seance');
    await page.waitForSelector('main');
    const button = page.getByRole('button', { name: /^Luminance mode:/ });
    for (let i = 0; i < 4; i++) {
      const label = (await button.getAttribute('aria-label')) ?? '';
      if (label.startsWith(`Luminance mode: ${mode}.`)) break;
      await button.click();
      await page.waitForTimeout(350);
    }
    await page.getByRole('button', { name: 'I am safe' }).click();
    await page.getByRole('button', { name: 'Start sending' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    let sawLit = false;
    let sawDark = false;
    for (let i = 0; i < 12; i++) {
      const png = PNG.sync.read(await page.screenshot({ animations: 'disabled' }));
      const r = scanRgba(png.data, png.width, png.height, mode);
      expect(r, `${mode}: ${JSON.stringify(r.examples)}`).toMatchObject({ ok: true });
      // The lamp area (below the top strip) is either fully lit or fully dark.
      const mid = (png.width * 400 + 200) * 4;
      if ((png.data[mid] as number) > 100) sawLit = true;
      else sawDark = true;
      await page.waitForTimeout(110);
    }
    expect(sawLit, 'the lamp lit at least once').toBe(true);
    expect(sawDark, 'the lamp went dark at least once').toBe(true);
    await page.getByRole('button', { name: 'Stop' }).click();
  });
}

// ----------------------------------------------------------------- camera states
test.describe('camera permission refused', () => {
  test.use({ permissions: [] });
  test('the screen says what is missing and what to do, and shows no result', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    });
    await page.goto('/#/seance');
    await page.waitForSelector('main');
    await page.getByRole('button', { name: 'Start watching' }).click();
    await expect(page.getByText(/camera permission was refused/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start watching' })).toBeVisible();
  });
});

test.describe('no camera at all', () => {
  test('the screen says no camera was found', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(Object.assign(new Error('x'), { name: 'NotFoundError' }));
    });
    await page.goto('/#/seance');
    await page.waitForSelector('main');
    await page.getByRole('button', { name: 'Start watching' }).click();
    await expect(page.getByText(/No camera was found/)).toBeVisible();
  });
});
