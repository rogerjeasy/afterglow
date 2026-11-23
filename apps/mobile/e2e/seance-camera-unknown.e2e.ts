import { heliograph } from '@afterglow/core';
import { expect, test } from '@playwright/test';
import { videoPath, writeBlinkVideo } from './blink-video';

/** A valid message from a number that is not on the list is shown, but never attributed. */
const VIDEO = videoPath('stranger-help-standard.y4m');
writeBlinkVideo(VIDEO, { code: 'HELP', slot: 40, sequence: 2 }, 30, heliograph.PROFILES.standard);

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

test('a message from an unknown number names no one, offers to add them, and shows the emergency note', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto('/?phase=outage&elapsed=30#/seance');
  await page.waitForSelector('main');
  await page.getByRole('button', { name: 'Start watching' }).click();
  await expect(page.getByText('Number 40 needs help')).toBeVisible({ timeout: 200_000 });
  await expect(page.getByText(/not on your list, so I cannot say who it is/)).toBeVisible();
  await expect(page.getByText(/not an emergency service/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add number 40 to my list' })).toBeVisible();
  // Nobody on the board was marked as having sent it.
  await expect(page.getByText(/Needs help · /)).toHaveCount(0);
});
