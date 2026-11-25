import { MODES, scanRgba } from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/** The Plan tab in a real browser: candles, the plan, and the generator ward. */

async function open(page: Page): Promise<void> {
  await page.goto('/#/plan');
  await page.waitForSelector('main');
  await expect(page.getByRole('heading', { name: 'Plan' })).toBeVisible();
}

async function addBank(page: Page, capacity: string, name = 'Bank'): Promise<void> {
  await page.getByRole('button', { name: 'Power bank', exact: true }).click();
  await page.getByLabel('Name (optional)').fill(name);
  await page.getByLabel('Capacity (Wh)').fill(capacity);
  await page.getByRole('button', { name: 'Add battery' }).click();
}

async function addLoad(
  page: Page,
  name: string,
  watts: string,
  cls: string,
  ac = false,
): Promise<void> {
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Power draw (watts)').fill(watts);
  await page.getByRole('button', { name: cls, exact: true }).click();
  if (ac) await page.getByRole('button', { name: 'Needs an AC outlet' }).click();
  await page.getByRole('button', { name: 'Add to the plan' }).click();
}

test('an empty plan asks for what it needs and does not invent a capacity or a wattage', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText(/I need the capacity of each; I will not guess it/)).toBeVisible();
  await expect(page.getByText(/default of 12 h/i)).toBeVisible();
  await expect(page.getByText('Tell me about your home to get a band, not a guess.')).toBeVisible();
});

test('a battery without a capacity is refused with a reason', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Add battery' }).click();
  await expect(page.getByText('Enter the capacity as a number above zero.')).toBeVisible();
  await expect(page.getByText(/% now/)).toHaveCount(0);
});

test('a covered load, then a medical load that cannot be sustained says so plainly', async ({
  page,
}) => {
  await open(page);
  await addBank(page, '50');
  // 4 W for 12 h = 48 Wh, under the bank's 42.5 Wh usable? No: it needs 48 Wh, so it is partial.
  await addLoad(page, 'Ventilator', '4', 'Medical');
  await expect(page.getByText('PARTLY')).toBeVisible();
  await expect(page.getByText(/cannot be sustained/)).toBeVisible();
  // A smaller load fits.
  await addLoad(page, 'Router', '2', 'Communication');
  await expect(page.getByText('COVERED')).toBeVisible();
  // The defaults used are named.
  await expect(page.getByText(/default: power bank: 85%/)).toBeVisible();
});

test('an AC medical load with only a USB power bank is not covered, and says it needs an AC outlet', async ({
  page,
}) => {
  await open(page);
  await addBank(page, '100');
  await addLoad(page, 'CPAP', '30', 'Medical', true);
  await expect(page.getByText('NOT COVERED')).toBeVisible();
  await expect(page.getByText(/needs an AC outlet/).first()).toBeVisible();
});

test("the horizon is a default until it is set, then it is the user's", async ({ page }) => {
  await open(page);
  await expect(page.getByText('12 h', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Increase Cover the next' }).click();
  await expect(page.getByText('13 h', { exact: true })).toBeVisible();
  await expect(page.getByText('Set by you.')).toBeVisible();
  await page.reload();
  await page.waitForSelector('main');
  await expect(page.getByText('13 h', { exact: true })).toBeVisible();
});

test('the ward stays closed with a bar until all four checks are a yes, and a no is a refusal', async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText(/Not set up\. The generator stays off/)).toBeVisible();
  const yes = (q: RegExp) => page.getByRole('button', { name: q });
  await yes(/^Yes: Is the generator outside/).click();
  await yes(/^Yes: Is it at least 20 feet/).click();
  await yes(/^Yes: Does the exhaust point away/).click();
  await expect(page.getByText(/Not set up/)).toBeVisible(); // three of four is still closed
  await page.getByRole('button', { name: /^No: Is it at least 20 feet/ }).click();
  await expect(page.getByText('NOT ALLOWED')).toBeVisible();
  await expect(page.getByText(/Do not run the generator like this/)).toBeVisible();
  await yes(/^Yes: Is it at least 20 feet/).click();
  await yes(/^Yes: Is there a working carbon monoxide alarm/).click();
  await expect(page.getByText(/All four checks are confirmed until/)).toBeVisible();
  await expect(page.getByText(/Not set up/)).toHaveCount(0);
  // The ward never says safe.
  await expect(page.getByText(/\bsafe\b/i)).toHaveCount(0);
});

test('a reported symptom says to get outside and call, and is not saved', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Someone has symptoms' }).click();
  await expect(page.getByRole('alert')).toContainText('Get outside into fresh air immediately');
  await page.reload();
  await page.waitForSelector('main');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('the Plan keeps what was entered after a reload', async ({ page }) => {
  await open(page);
  await addBank(page, '80', 'Kitchen bank');
  await page.reload();
  await page.waitForSelector('main');
  await expect(page.getByText('Kitchen bank').first()).toBeVisible();
});

for (const mode of MODES) {
  test(`the Plan with candles, a partly covered load and the ward stays within the ${mode} ceiling`, async ({
    page,
  }) => {
    await open(page);
    const button = page.getByRole('button', { name: /^Luminance mode:/ });
    for (let i = 0; i < 4; i++) {
      const label = (await button.getAttribute('aria-label')) ?? '';
      if (label.startsWith(`Luminance mode: ${mode}.`)) break;
      await button.click();
      await page.waitForTimeout(350);
    }
    await addBank(page, '50');
    await addLoad(page, 'Ventilator', '4', 'Medical');
    await page.getByRole('button', { name: /^No: Is it at least 20 feet/ }).click();
    await page.getByRole('button', { name: 'Someone has symptoms' }).click();
    await page.waitForTimeout(400);
    const png = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }));
    const r = scanRgba(png.data, png.width, png.height, mode);
    expect(r, `${mode}: ${JSON.stringify(r.examples)}`).toMatchObject({ ok: true });
  });
}
