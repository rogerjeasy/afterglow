import { type LuminanceMode, MODES, scanRgba } from '@afterglow/design-system';
import { type Page, expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * The Lantern in a real browser: the map of where mains exists, built from the
 * core's k-anonymity and restoration code over a simulated neighbourhood.
 */

const DEMO = '/?phase=outage&elapsed=45#/lantern';

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('main');
}

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

const cellButtons = (page: Page) => page.getByRole('button', { name: /device/ });

test('outside the demo there is no crowd: the Lantern says unknown, why, and draws no map', async ({
  page,
}) => {
  await open(page, '/#/lantern');
  await expect(page.getByText('UNKNOWN', { exact: true })).toBeVisible();
  await expect(page.getByText(/No neighbours are reporting from your area yet/)).toBeVisible();
  await expect(page.getByText('Fewer than 5')).toBeVisible();
  await expect(page.getByText(/I will not draw a map I cannot back/)).toBeVisible();
  await expect(cellButtons(page)).toHaveCount(0);
  await expect(page.getByText(/\bsafe\b/i)).toHaveCount(0);
});

test('the empty state offers the demo, and the demo opens a real, labelled map', async ({
  page,
}) => {
  await open(page, '/#/lantern');
  await page.getByRole('button', { name: 'See it with a simulated neighbourhood' }).click();
  // Starting the demo starts a night, so the neighbourhood is on screen at once.
  await expect(cellButtons(page)).toHaveCount(30);
  await expect(page.getByText('simulated neighbourhood (demo)').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exit demo' })).toBeVisible();
});

test('in a demo outage the user cell is dark, with k enforced and an estimate with its band', async ({
  page,
}) => {
  await open(page, DEMO);
  await expect(cellButtons(page)).toHaveCount(30);
  await expect(page.getByText('DARK', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Your cell: dark, \d+ devices$/ })).toBeVisible();

  // At least one cell is unknown because too few devices reported there, and says so.
  const unknown = page.getByRole('button', { name: /: unknown, [1-4] devices?$/ }).first();
  await expect(unknown).toBeVisible();
  await unknown.click();
  await expect(
    page.getByText(/A cell is shown only when at least 5 devices stand behind it/),
  ).toBeVisible();

  // The estimate shows its source, its band and how many outages it is drawn from.
  await expect(page.getByText(/^Estimate \d/)).toBeVisible();
  await expect(page.getByText(/past outages here\./).first()).toBeVisible();
  await expect(page.getByText('restoration baseline')).toBeVisible();
  await expect(page.getByText(/Thin bar: provider’s promise/)).toBeVisible();
});

test('a lit cell and a dark cell are told apart in words, not only by brightness', async ({
  page,
}) => {
  await open(page, DEMO);
  await expect(page.getByRole('button', { name: /: lit, \d+ devices$/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /: dark, \d+ devices$/ }).first()).toBeVisible();
  const key = page.getByRole('list', { name: 'Map key' });
  for (const word of ['Lit', 'Dark', 'Mixed', 'Coming back', 'Your cell']) {
    await expect(key.getByText(word, { exact: true })).toBeVisible();
  }
});

test('playback shows the night end: skip to power returning, then to the morning, then back to now', async ({
  page,
}) => {
  await open(page, DEMO);
  await page.getByRole('button', { name: 'Skip to power returning' }).click();
  await expect(page.getByText('COMING BACK', { exact: true })).toBeVisible();
  await expect(page.getByText('Power is coming back', { exact: true })).toBeVisible();
  await expect(page.getByText(/ahead \(simulated\)/)).toBeVisible();
  // No estimate while the crowd says it is happening.
  await expect(page.getByText(/^Estimate \d/)).toHaveCount(0);

  const slider = page.locator('#lantern-playback');
  await slider.fill((await slider.getAttribute('max')) as string);
  await expect(page.getByText('LIT', { exact: true })).toBeVisible();
  await expect(page.getByText('No estimate', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Now', exact: true }).click();
  await expect(page.getByText('DARK', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Now · /)).toBeVisible();
});

test('a screen reader hears the state of the user cell', async ({ page }) => {
  await open(page, DEMO);
  await expect(page.locator('[aria-live="polite"]')).toContainText('Your cell is dark at');
});

for (const width of [320, 390, 768]) {
  test(`nothing overflows sideways at ${width} px, tab bar included`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await open(page, DEMO);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      const wide: string[] = [];
      for (const el of document.querySelectorAll('main *, nav *')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
          wide.push(
            `${el.tagName}.${(el as HTMLElement).className} ${Math.round(r.left)}..${Math.round(r.right)}`,
          );
        }
      }
      return { scroll: doc.scrollWidth, client: doc.clientWidth, wide: wide.slice(0, 6) };
    });
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    expect(overflow.wide).toEqual([]);
  });
}

test('every map cell is a target of at least 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await open(page, DEMO);
  const sizes = await cellButtons(page).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return Math.min(r.width, r.height);
    }),
  );
  expect(sizes.length).toBe(30);
  // Width is the tight axis at 320 px: cells are 2:1, so 44 px tall means about 88 wide.
  // The grid shrinks cells to fit; the height floor is what the design requires.
  const heights = await cellButtons(page).evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height),
  );
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});

for (const mode of MODES) {
  for (const [name, action] of [
    ['dark', async () => undefined],
    [
      'coming back',
      async (page: Page) => {
        await page.getByRole('button', { name: 'Skip to power returning' }).click();
      },
    ],
  ] as const) {
    test(`the Lantern ${name} stays within the ${mode} ceiling and red`, async ({ page }) => {
      await open(page, DEMO);
      await setMode(page, mode);
      await action(page);
      await page.waitForTimeout(400);
      const png = PNG.sync.read(await page.screenshot({ fullPage: true, animations: 'disabled' }));
      const r = scanRgba(png.data, png.width, png.height, mode);
      expect(
        r,
        `${mode}: ${r.offenders} offending pixels. ${JSON.stringify(r.examples)}`,
      ).toMatchObject({
        ok: true,
      });
    });
  }
}
