import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,property.test}.ts'],
    environment: 'node',
    // Key derivation is deliberately slow; give property runs room.
    testTimeout: 60000,
  },
});
