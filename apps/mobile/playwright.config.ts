import { defineConfig } from '@playwright/test';

/**
 * Browser tests for the Night Shell (NS-10 to NS-12). They run against the
 * production build served by `vite preview`, so build first: `pnpm e2e` does.
 * Not part of `pnpm test`, which stays fast and browser-free.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: true,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    // Phones smooth text in greyscale. Desktop Chromium on Linux uses sub-pixel (LCD)
    // smoothing, which paints coloured fringes at glyph edges: harmless for pure red, which
    // has no green to fringe, but greener than the amber ramp in amber mode. Scan what a
    // phone shows (NS-21).
    launchOptions: { args: ['--disable-lcd-text'] },
    // Every test but the onboarding one starts as a person who has already been welcomed.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:4173',
          localStorage: [{ name: 'afterglow.onboarding.v1', value: 'skipped' }],
        },
      ],
    },
  },
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
