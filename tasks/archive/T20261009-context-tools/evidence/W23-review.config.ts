import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../../../', import.meta.url))
export default defineConfig({
  resolve: { alias: [
    { find: '@shared', replacement: `${root}apps/desktop/src/shared` },
    { find: /^@ai-studio\/agent-adapter$/, replacement: `${root}packages/agent-adapter/src/index.ts` },
    { find: '@ai-studio/agent-adapter/testing', replacement: `${root}packages/agent-adapter/src/testing/index.ts` }
  ] },
  test: { include: ['tasks/archive/T20261009-context-tools/evidence/W23-*.test.ts'], environment: 'node', testTimeout: 15000 }
})
