import { defineConfig } from 'vitest/config';

/**
 * The same property suite, run in a real browser engine (ADR-002: the core must
 * behave identically on Hermes, V8/JSC and Node). `pnpm test:browser`.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.{test,property.test}.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      name: 'chromium',
    },
  },
});
