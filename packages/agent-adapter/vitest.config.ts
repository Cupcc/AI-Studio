import { defineConfig } from 'vitest/config';

// Unit tests only: no real CLI processes, no model calls.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.integration.test.ts', 'node_modules/**', 'dist/**'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
