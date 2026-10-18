import { defineConfig } from '../../../../apps/desktop/node_modules/@playwright/test'
export default defineConfig({ testDir: '.', testMatch: /W6-.*\.spec\.ts$/, timeout: 60000, workers: 1, reporter: [['list']], outputDir: '../../../../.runtime/w6-test-results' })
