import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Tests of the pure game engine are fast; bump the default if we add slow ones.
    testTimeout: 5000,
  },
});
