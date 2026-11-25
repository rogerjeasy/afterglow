import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.{test,property.test}.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
