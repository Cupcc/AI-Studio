import { defineConfig } from 'vitest/config';

// Real CLI tests. Each suite must gate itself with `describeRealCli` from `src/testing`,
// so the run is skipped unless AI_STUDIO_REAL_CLI=1 is set explicitly.
export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    environment: 'node',
    passWithNoTests: true,
    testTimeout: 180_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
