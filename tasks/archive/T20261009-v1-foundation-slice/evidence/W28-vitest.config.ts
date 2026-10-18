import { fileURLToPath } from 'node:url'
const file = (path: string) => fileURLToPath(new URL(path, import.meta.url))
export default {
  resolve: { alias: [
    { find: '@shared', replacement: file('../../../../apps/desktop/src/shared') },
    { find: /^@ai-studio\/agent-adapter$/, replacement: file('../../../../packages/agent-adapter/src/index.ts') },
    { find: '@ai-studio/agent-adapter/testing', replacement: file('../../../../packages/agent-adapter/src/testing/index.ts') },
    { find: '@ai-studio/agent-adapter/codex', replacement: file('../../../../packages/agent-adapter/src/codex/index.ts') },
    { find: '@ai-studio/agent-adapter/claude', replacement: file('../../../../packages/agent-adapter/src/claude/index.ts') },
  ] },
  test: { include: ['tasks/archive/T20261009-v1-foundation-slice/evidence/W28-*.test.ts'], environment: 'node', testTimeout: 15000 },
}
