import { expect, test } from '@playwright/test';

/**
 * The Alerts centre in a real browser (alerts spec, task 5). The rules are
 * property-tested in packages/core/src/alerts; this checks the shell shows them.
 */

const bell = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: /^Alerts:/ });

test('AL-03 with the power on there is nothing to report, and the bell says none', async ({
  page,
}) => {
  await page.goto('/#/');
  await expect(bell(page)).toHaveAttribute('aria-label', 'Alerts: none');
  await bell(page).click();
  await expect(page.getByText(/Nothing to report\. With the power on I stay quiet/)).toBeVisible();
});

test('AL-04 late in the demo night the fridge alert says the same time as the Hearth', async ({
  page,
}) => {
  await page.goto('/?phase=outage&elapsed=170#/');
  const hearthFridge = (
    (await page.locator('[data-tour="tile-fridge"] .clock').first().textContent()) ?? ''
  ).trim();
  expect(hearthFridge).toMatch(/^\d+ m$|^\d+ h \d+ m$/);
  await expect(bell(page)).toHaveAttribute('aria-label', /^Alerts: [1-9]/);
  await bell(page).click();
  await expect(page.getByRole('heading', { name: 'Alerts' })).toBeVisible();
  // Same core number, same words: "Fridge: 18 m left" beside a Hearth tombstone reading "18 m".
  await expect(page.getByText(`Fridge: ${hearthFridge} left`)).toBeVisible();
  await expect(page.getByText(/^Power out since /)).toBeVisible();
  // Each alert shows how it is known, one tap away.
  const first = page.getByRole('listitem').first();
  await first.getByRole('button', { name: /^How I know/ }).click();
  await expect(first.getByText('USDA FSIS outage guidance')).toBeVisible();
});

test('AL-07 the most urgent alert comes first', async ({ page }) => {
  // Five hours in: the fridge is past its window (critical) and leads the list.
  await page.goto('/?phase=outage&elapsed=300#/alerts');
  const first = page.getByRole('listitem').first();
  await expect(first.getByText('Now', { exact: true })).toBeVisible();
  await expect(first.getByText(/: past its safe window$/)).toBeVisible();
  await expect(bell(page)).toHaveAttribute('aria-label', /needs you now/);
});
