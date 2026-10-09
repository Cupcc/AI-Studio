import { fileURLToPath } from 'node:url'
import { defineConfig } from '../../../apps/desktop/node_modules/vitest/dist/config.js'
const alias = { '@shared': fileURLToPath(new URL('../../../apps/desktop/src/shared', import.meta.url)) }
export default defineConfig({ resolve: { alias }, test: { environment: 'jsdom', include: ['tasks/T20261009-session-slice/evidence/W6-renderer.test.ts'] } })
