import { defineConfig } from '../../../apps/desktop/node_modules/@playwright/test'
export default defineConfig({ testDir: '.', testMatch: /W3-(app|project)\.spec\.ts$/, timeout: 60000, workers: 1, reporter: [['list']], outputDir: '../../../.runtime/w3-test-results' })
