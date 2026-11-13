import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
const alias = {
  '@shared': fileURLToPath(new URL('../../src/shared', import.meta.url)),
  '@renderer': fileURLToPath(new URL('../../src/renderer/src', import.meta.url))
}
export default defineConfig({ resolve: { alias }, test: { environment: 'node', include: ['.runtime/review-probe/**/*.probe.test.ts'], root: fileURLToPath(new URL('../..', import.meta.url)) } })
