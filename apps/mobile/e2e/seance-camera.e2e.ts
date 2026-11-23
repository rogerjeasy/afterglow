import { heliograph } from '@afterglow/core';
import { expect, test } from '@playwright/test';
import { videoPath, writeBlinkVideo } from './blink-video';

/**
 * The whole receive path in a real browser: Chromium's fake camera plays a video
 * of a lamp blinking Mom's SAFE, and the app must read it through getUserMedia,
 * the grid reduction, the tracker, the reader and the decoder, then update the board.
 */
// Mom is slot 3 in the demo household.
const MOM_SAFE = { code: 'SAFE', slot: 3, sequence: 1 } as const;
const VIDEO = videoPath('mom-safe-standard.y4m');
writeBlinkVideo(VIDEO, MOM_SAFE, 30, heliograph.PROFILES.standard);

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

test('the camera, tracker, reader and decoder read "Mom is safe" and update the board', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/?phase=outage&elapsed=30#/seance');
  await page.waitForSelector('main');
  await expect(page.getByText(/is safe/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect(page.getByText(/camera \d+ frames\/s/)).toBeVisible({ timeout: 20_000 });
  // It shows nothing as a message until two repeats agree.
  await expect(page.getByText('Mom is safe')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText(/Read from \d repeats/)).toBeVisible();
  await expect(page.getByText(/Safe · .* · by light/)).toBeVisible();
  // Watching stopped by itself once the message was read.
  await expect(page.getByRole('button', { name: 'Start watching' })).toBeVisible();
});
