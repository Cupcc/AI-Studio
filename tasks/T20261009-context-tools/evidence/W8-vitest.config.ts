import { fileURLToPath } from 'node:url'

// 被评审源码：未提交（staged）的清理 worktree，只读使用，不复制进证据目录。
// 该目录与本 worktree 同级：<worktrees>/runtime-tools-cleanup。
const cleanupAdapter = fileURLToPath(new URL('../../../../runtime-tools-cleanup/packages/agent-adapter/src', import.meta.url))
const adapterSource = process.env.W8_ADAPTER_SRC || cleanupAdapter
// 可选差分基线：`git archive 2f4bb5a packages/agent-adapter/src | tar -x -C <dir>` 后把
// W8_BASE_SRC 指向 <dir>/packages/agent-adapter/src；未设置时差分用例自动跳过。
const baseSource = process.env.W8_BASE_SRC || ''

export default {
  resolve: {
    alias: [
      { find: /^@w8base\/(.*)$/, replacement: `${baseSource || '/__w8_base_not_set__'}/$1` },
      { find: /^@w8\/(.*)$/, replacement: `${adapterSource}/$1` }
    ]
  },
  test: {
    environment: 'node',
    include: ['tasks/T20261009-context-tools/evidence/W8-*.test.ts'],
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
}
