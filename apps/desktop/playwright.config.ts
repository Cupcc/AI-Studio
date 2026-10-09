import { defineConfig } from '@playwright/test'

// Electron smoke tests run against the built app in out/ (`pnpm test:e2e`
// builds first). One worker: each test launches its own Electron instance.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  outputDir: '../../.runtime/desktop-e2e/test-results'
})
