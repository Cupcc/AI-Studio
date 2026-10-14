import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const repository = fileURLToPath(new URL('../../../', import.meta.url))
// An unintegrated worker fix may be checked separately; this is never the final integration verdict.
const terminalReviewRoot = process.env.W4_TERMINAL_REVIEW_ROOT || repository

export default {
  resolve: {
    alias: {
      '@w4-terminal-service': resolve(terminalReviewRoot, 'apps/desktop/src/main/services/terminal/service.ts'),
      '@w4-terminal-driver': resolve(terminalReviewRoot, 'apps/desktop/src/main/services/terminal/driver.ts'),
      '@shared/tools/terminal': resolve(terminalReviewRoot, 'apps/desktop/src/shared/tools/terminal.ts'),
      '@shared': fileURLToPath(new URL('../../../apps/desktop/src/shared', import.meta.url)),
      '@ai-studio/agent-adapter': fileURLToPath(new URL('../../../packages/agent-adapter/dist/index.js', import.meta.url)),
      '@xterm/headless': fileURLToPath(new URL('../../../apps/desktop/node_modules/@xterm/headless', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['tasks/T20261009-context-tools/evidence/W4-*.test.ts'],
    maxWorkers: 1
  }
}
