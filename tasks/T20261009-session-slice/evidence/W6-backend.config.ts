import { fileURLToPath } from 'node:url'
import { defineConfig } from '../../../apps/desktop/node_modules/vitest/dist/config.js'
export default defineConfig({ resolve: { alias: { '@shared': fileURLToPath(new URL('../../../apps/desktop/src/shared', import.meta.url)) } }, test: { environment: 'node', include: ['tasks/T20261009-session-slice/evidence/W6-backend.test.ts'] } })
