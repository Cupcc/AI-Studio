import { fileURLToPath } from 'node:url'
const app = new URL('../../../../apps/desktop/', import.meta.url)
export default {
  resolve: { alias: {
    '@shared': fileURLToPath(new URL('src/shared', app)),
    vitest: fileURLToPath(new URL('node_modules/vitest/dist/index.js', app))
  } },
  test: { environment: 'node', include: ['tasks/archive/T20261011-project-view-implementation/evidence/W2-review.test.ts'] }
}
