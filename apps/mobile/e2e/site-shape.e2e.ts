import { expect, test } from '@playwright/test';

/**
 * WX-09: the front door stays short and the menu stays small. A household needs three
 * pages before trying it; everything else is one link away in the footer.
 */

test('WX-09 the header offers three pages, sign in and the app', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Site' }).first();
  await expect(nav.getByRole('link')).toHaveText(['Features', 'How it works', 'Science & privacy']);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Open the app' })).toBeVisible();
});

test('WX-09 organisations and pricing stay reachable from the phone menu and the footer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  const menu = page.locator('#site-menu');
  await expect(menu.getByRole('link', { name: 'For organisations' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Pricing' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Take the tour' })).toBeVisible();
  await page.getByRole('button', { name: 'Close menu' }).click();
  await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Pricing' })).toBeAttached();
});

test('WX-09 the homepage tells its story in at most six sections and fits the phone budget', async ({
  page,
}) => {
  await page.goto('/');
  const sections = await page
    .locator('main section')
    .evaluateAll((all) => all.filter((s) => !s.parentElement?.closest('section')).length);
  expect(sections).toBeLessThanOrEqual(6);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  // 15,042 px before the trim on 2026-11-27; about 8,800 after it.
  expect(height).toBeLessThanOrEqual(9500);
});
