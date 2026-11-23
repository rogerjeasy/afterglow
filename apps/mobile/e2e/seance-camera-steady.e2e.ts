import { expect, test } from '@playwright/test';
import { videoPath, writeSteadyVideo } from './blink-video';

/** A lamp that is on but never blinks must never be read as a message. */
const VIDEO = videoPath('steady-lit.y4m');
writeSteadyVideo(VIDEO, true, 30, 10);

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${VIDEO}`,
    ],
  },
});

test('a steady lamp stays "no blinking light" and is never a message', async ({ page }) => {
  await page.goto('/?phase=outage&elapsed=30#/seance');
  await page.waitForSelector('main');
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect(page.getByText(/camera \d+ frames\/s/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/No blinking light is in view yet/)).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(8_000);
  await expect(page.getByText(/ is safe| needs help/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop watching' })).toBeVisible();
});
