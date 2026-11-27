import { type Page, expect, test } from '@playwright/test';

/**
 * The Night Shell design pass in a real browser (NS-13 to NS-17): calm screens
 * that still show their working. The pure rules are in
 * src/night-shell/designPass.property.test.ts.
 */

const ROUTES = ['#/', '#/lantern', '#/seance', '#/cold', '#/plan', '#/you', '#/alerts'] as const;
const OUTAGE = '/?phase=outage&elapsed=45';
/** Engine identifiers that must not reach the main text (NS-14). */
const ENGINE = /chargingEdge|fusion core|\b[a-z]+(?:-[a-z]+)*-v\d+\b|demo votes/;

async function visibleText(page: Page): Promise<string> {
  await page.waitForSelector('main');
  return page.evaluate(() => document.body.innerText);
}

test('NS-14 no engine identifiers in visible text on any screen, power on or out', async ({
  page,
}) => {
  for (const base of ['/', OUTAGE]) {
    for (const route of ROUTES) {
      await page.goto(`${base}${route}`);
      const text = await visibleText(page);
      const hit = ENGINE.exec(text);
      expect(hit?.[0] ?? null, `${base}${route}`).toBeNull();
    }
  }
  // The Hearth says in words how it knows.
  await page.goto(`${OUTAGE}#/`);
  await expect(
    page.getByText('This phone stopped charging and the mains hum went quiet.'),
  ).toBeVisible();
});

test('NS-13 sources open on a tap, name every source, and never hide a default', async ({
  page,
}) => {
  await page.goto(`${OUTAGE}#/`);
  const fridge = page.locator('[data-tour="tile-fridge"]');
  const control = fridge.getByRole('button', { name: /^How I know/ });
  await expect(control).toHaveText(/uses defaults/);
  await expect(control).toHaveAttribute('aria-expanded', 'false');
  const box = await control.boundingBox();
  expect(box && box.height >= 44).toBe(true);
  await control.click();
  await expect(control).toHaveAttribute('aria-expanded', 'true');
  // Open, the model version and the default itself are there to read.
  await expect(fridge.getByText(/thermal-appliance-v\d/)).toBeVisible();
  await expect(fridge.getByText(/^defaults: /)).toBeVisible();
  await control.click();
  await expect(fridge.getByText(/thermal-appliance-v\d/)).toHaveCount(0);
});

const BUDGETS: Record<string, number> = {
  // 2026-11-27 (web-experience): 1950 -> 2050. The Hearth now sets in Atkinson Hyperlegible
  // (design 5.1), which runs wider than the system UI face it was measured with, and keeps
  // the actions in their own block. Readiness, the page heading and the long demo notice
  // were moved off the phone layout to stay close to the old height.
  '#/': 2050,
  // Same reason as the Hearth (2400 -> 2500); its lead is hidden on phones, said again below.
  '#/lantern': 2500,
  // Same reason (2450 -> 2650); its lead, which says what a ghost means, stays on phones.
  '#/seance': 2650,
  // Same reason (3400 -> 3650).
  '#/cold': 3650,
  // Same reason (4000 -> 4400); its panels have titled rows. Nothing was unfolded.
  '#/plan': 4400,
};

test('NS-15 every screen fits its height budget in the demo outage', async ({ page }) => {
  for (const [route, budget] of Object.entries(BUDGETS)) {
    await page.goto(`${OUTAGE}${route}`);
    await page.waitForSelector('main');
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(h, `${route} is ${h} px`).toBeLessThanOrEqual(budget);
  }
});

test('NS-15 forms and list management stay folded until asked for', async ({ page }) => {
  await page.goto(`${OUTAGE}#/plan`);
  await expect(page.getByRole('button', { name: 'Add a battery', exact: true })).toBeVisible();
  await expect(page.getByLabel('Capacity (Wh)')).toHaveCount(0);
  await page.goto(`${OUTAGE}#/seance`);
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit list' }).click();
  await expect(page.getByRole('button', { name: 'Remove', exact: true }).first()).toBeVisible();
  await page.goto(`${OUTAGE}#/cold`);
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  // A default room temperature is named even while its setting is folded.
  await expect(
    page.getByRole('button', { name: /room temperature \(a default is in use\)/ }),
  ).toBeVisible();
});

test('NS-16 Hearth compartments are tombstones and ghosts solidify when heard', async ({
  page,
}) => {
  await page.goto(`${OUTAGE}#/`);
  const stone = page.locator('[data-tour="tile-fridge"] > button').first();
  const radius = await stone.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(radius).toBe('24px');
  const ghosts = page.locator('[data-tour="tile-people"] svg path[fill-opacity]');
  await expect(ghosts).toHaveCount(5);
  for (const op of await ghosts.evaluateAll((els) =>
    els.map((e) => e.getAttribute('fill-opacity')),
  ))
    expect(op).toBe('0.35');

  await page.getByRole('button', { name: 'Séance', exact: true }).click();
  await page
    .getByRole('button', { name: /^They told me .* is safe$/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Hearth', exact: true }).click();
  const after = await ghosts.evaluateAll((els) => els.map((e) => e.getAttribute('fill-opacity')));
  expect(after.filter((o) => o === '1')).toHaveLength(1);
  expect(after.filter((o) => o === '0.35')).toHaveLength(4);
});

test.describe('motion as people really have it set', () => {
  // The suite runs with reduced motion, which would hide a loop and pass vacuously.
  test.use({ reducedMotion: 'no-preference' });

  test('NS-17 no infinite animation on any screen or in the tour', async ({ page }) => {
    const infinite = (): Promise<number> =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY).length,
      );
    for (const route of ROUTES) {
      await page.goto(`${OUTAGE}${route}`);
      await page.waitForSelector('main');
      expect(await infinite(), route).toBe(0);
    }
    await page.goto('/?tour=1');
    await expect(page.locator('[data-wisp="bubble"]')).toBeVisible();
    expect(await infinite(), 'tour').toBe(0);
  });
});
