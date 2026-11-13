import { defineConfig } from '@playwright/test'

// Electron smoke tests run against the built app in out/ (`pnpm test:e2e`
// builds first). One worker: each test launches its own Electron instance.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  // On CI a one-off timing failure on the runner VM is retried once and reported as flaky instead of failing the run.
  // The failed attempt keeps its trace (e2e/harness.ts). Local runs never retry.
  retries: process.env.CI ? 1 : 0,
  // scripts/remote-ci.mjs reads the JSON report to print failed and flaky tests with their traces.
  reporter: [['list'], ['json', { outputFile: '../../.runtime/desktop-e2e/report.json' }]],
  outputDir: '../../.runtime/desktop-e2e/test-results'
})
