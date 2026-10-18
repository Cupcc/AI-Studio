import { fileURLToPath } from 'node:url'

// W16 独立安全评审（阶段 1：Files + 项目 Diff + 文件引用链路）。
// 用例直接读取集成 worktree 的源码（apps/desktop/src、packages/agent-adapter/dist），不复制进证据目录。
// 运行（在集成 worktree 根目录）：
//   pnpm exec vitest run --config tasks/archive/T20261009-context-tools/evidence/W16-vitest.config.ts --reporter=verbose
const repository = fileURLToPath(new URL('../../../../', import.meta.url))
const adapterDist = `${repository}packages/agent-adapter/dist`

export default {
  resolve: {
    alias: [
      // 让测试文件里的 vi.mock('electron') 与源码里的 import 'electron' 解析成同一个模块 id（测试文件不在 apps/desktop 内）
      { find: /^electron$/, replacement: `${repository}apps/desktop/node_modules/electron/index.js` },
      { find: '@shared', replacement: `${repository}apps/desktop/src/shared` },
      { find: '@renderer', replacement: `${repository}apps/desktop/src/renderer/src` },
      { find: /^@ai-studio\/agent-adapter\/testing$/, replacement: `${adapterDist}/testing/index.js` },
      { find: /^@ai-studio\/agent-adapter\/claude$/, replacement: `${adapterDist}/claude/index.js` },
      { find: /^@ai-studio\/agent-adapter\/codex$/, replacement: `${adapterDist}/codex/index.js` },
      { find: /^@ai-studio\/agent-adapter$/, replacement: `${adapterDist}/index.js` }
    ]
  },
  test: {
    environment: 'node',
    include: ['tasks/archive/T20261009-context-tools/evidence/W16-*.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
}
