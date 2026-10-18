import previous from 'W4-vitest.config'

export default {
  ...previous,
  test: { ...previous.test, include: ['tasks/archive/T20261009-context-tools/evidence/W5-*.test.ts'] }
}
