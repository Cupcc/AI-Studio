import base from 'W16-vitest.config'
export default { ...base, test: { ...base.test, include: ['tasks/archive/T20261009-context-tools/evidence/W21-*.test.ts'] } }
