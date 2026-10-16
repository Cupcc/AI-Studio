import base from './W16-vitest.config'

export default {
  ...base,
  test: { ...base.test, include: ['tasks/T20261009-context-tools/evidence/W18-*.test.ts'] }
}
