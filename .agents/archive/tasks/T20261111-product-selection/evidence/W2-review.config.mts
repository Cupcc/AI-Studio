import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export default defineConfig({ resolve: { alias: { '@shared': resolve('apps/desktop/src/shared'), '@review-main': resolve('apps/desktop/src/main'), '@review-testing': resolve('apps/desktop/node_modules/@ai-studio/agent-adapter/dist/testing/index.js') } }, test: { environment:'node', include:[fileURLToPath(new URL('W2-*.test.ts',import.meta.url))] } })
