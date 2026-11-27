import { resolveToken } from '@afterglow/design-system';
import { expect, test } from '@playwright/test';

/**
 * NS-22: the colour setting. Amber is chosen on the You screen, remembered on
 * this device, independent of the luminance mode, and painted from the first
 * frame after a reload, so a person who chose amber never sees red first.
 */

const AMBER = /^Amber \(easier with red colour blindness\)$/;
const RED = /^Red \(best for night vision\)$/;

test('NS-22 amber is chosen on You, persists across a reload, and applies before paint', async ({
  page,
}) => {
  await page.goto('/app/account');
  await page.waitForSelector('main');
  const amber = page.getByRole('button', { name: AMBER });
  const red = page.getByRole('button', { name: RED });
  // Red is the default.
  await expect(red).toHaveAttribute('aria-pressed', 'true');
  await expect(amber).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.dataset.hue)).toBe('red');

  const modeBefore = await page.evaluate(() => document.documentElement.dataset.mode);
  await amber.click();
  await expect(amber).toHaveAttribute('aria-pressed', 'true');
  const after = await page.evaluate(() => ({
    hue: document.documentElement.dataset.hue,
    mode: document.documentElement.dataset.mode,
    saved: window.localStorage.getItem('afterglow.hue.v1'),
  }));
  // The hue changes; the luminance mode does not.
  expect(after).toEqual({ hue: 'amber', mode: modeBefore, saved: 'amber' });

  // Before the app's code runs on reload, watch every moment content appears in
  // #root. Mutation callbacks run before the browser paints, so each record is
  // what a frame with content would show.
  await page.addInitScript(() => {
    const seen: { hue: string | undefined; primary: string }[] = [];
    (window as unknown as { __hueSeen: typeof seen }).__hueSeen = seen;
    new MutationObserver(() => {
      const root = document.getElementById('root');
      if (!root || root.childElementCount === 0) return;
      const html = document.documentElement;
      seen.push({
        hue: html.dataset.hue,
        primary: getComputedStyle(html).getPropertyValue('--text-primary').trim().toLowerCase(),
      });
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await page.waitForSelector('main');
  await expect(page.getByRole('button', { name: AMBER })).toHaveAttribute('aria-pressed', 'true');
  const seen = await page.evaluate(
    () => (window as unknown as { __hueSeen: { hue?: string; primary: string }[] }).__hueSeen,
  );
  expect(seen.length).toBeGreaterThan(0);
  const mode = (await page.evaluate(() => document.documentElement.dataset.mode)) as
    | 'night'
    | 'dusk'
    | 'ember';
  const amberValues = new Set(
    (['night', 'dusk', 'ember'] as const).map((m) =>
      resolveToken(m, 'text.primary', 'amber').toLowerCase(),
    ),
  );
  for (const s of seen) {
    expect(s.hue).toBe('amber');
    expect(amberValues.has(s.primary), `a frame painted ${s.primary}, not amber`).toBe(true);
  }
  expect(seen.at(-1)?.primary).toBe(resolveToken(mode, 'text.primary', 'amber').toLowerCase());

  // The public site follows the same choice.
  await page.goto('/');
  await page.waitForSelector('main');
  expect(await page.evaluate(() => document.documentElement.dataset.hue)).toBe('amber');

  // And red comes back with one tap.
  await page.goto('/app/account');
  await page.getByRole('button', { name: RED }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.hue)).toBe('red');
  expect(await page.evaluate(() => window.localStorage.getItem('afterglow.hue.v1'))).toBe('red');
});
