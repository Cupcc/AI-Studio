# 验收：T20261011-test-workflow

本记录随任务归档；主 Agent 仅修正归档后的相对链接，独立验收结论保持原样。

## 未覆盖与待决事项

- W1 不启动 Electron E2E、打包冒烟或真实 CLI；窗口验证由主 Agent 串行执行，避免与其他会话争抢焦点。远端 GitHub Actions 尚未执行，不能以 actionlint 通过代替远端结果。
- 本次没有 UI 或 CLI 协议变更；不宣称产品核心场景、真实模型链路已验收。
- W1-01 首轮阻塞已由实现者修复并由 W1 复验通过；当前独立评审范围没有未解决阻塞项。
- 全量基础检查、构建、打包与 GUI 自动化的主 Agent 自检结果由 [task.md](task.md) 负责记录。W1 没有亲自重跑这些检查，不把转述结果当作独立执行。

## 人工审阅

- 用户 2026-10-11 的「accept」确认优化方向，不等于实现 diff 或产品交付已人工接受。
- AI 任务关闭与人工接受按本轮提供的仓库规则区分；本文件不代替主 Agent 的任务状态管理。

## 结论与运行环境

- 总体结论：独立脚本／门禁评审范围通过。完整工作流执行与远端部署仍受上方未覆盖项约束，不作全范围产品验收结论。
- 验收者：W1 / review，未参与实现；唯一写入文件为本记录。
- 日期与代码基线：2026-10-11；`810d230fc341697ecb850f40ea63eac20fee9767` 加本任务未提交 diff，包括 CI、根及桌面 package.json、锁文件、负责文档与新增 `scripts/check-{scope,docs,commit}.mjs`、`scripts/check-workflow.test.mjs`、`scripts/vitest.config.mjs`。
- 平台与应用形态：Darwin arm64；Node v26.10.0、pnpm 12.10.1；本地脚本与静态配置评审。
- Provider 与 CLI：不适用，没有模型请求。
- 使用 Vitest skill 核对独立脚本测试配置及测试过滤边界；未修改实现或测试。

## 验收结果

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| [task.md](task.md) 文档快路径及保守兜底 | 审查明确清单、`--no-renames`、空 diff 与未知路径；运行脚本测试 | 文档豁免不覆盖代码／配置，重命名检查两端 | 修复后普通执行与外部 index 环境各 36 项通过 | Vitest／源码评审 | 通过 | 本文件命令记录；[脚本测试](../../../scripts/check-workflow.test.mjs) |
| [task.md](task.md) 本地链接、入链与部分暂存 | 独立运行文档检查，检查 tree 快照及 fixture | 未暂存修复／未跟踪文件不能掩盖暂存断链 | 0 新问题，4 个历史问题；部分暂存与中文空格路径测试通过 | Node／Vitest | 通过 | 本文件命令记录；[文档检查](../../../scripts/check-docs.mjs) |
| [task.md](task.md) CI 触发及比较范围 | 审查 workflow、push before→HEAD、PR merge-base→合并快照及手动强制；运行 actionlint | 分支备份 push 不重复；无基线和空变化保守检查 | 配置与场景测试符合；actionlint 退出 0 | 静态评审／本地 fixture | 本地通过，远端未覆盖 | [CI](../../../.github/workflows/ci.yml)、[范围判定](../../../scripts/check-scope.mjs) |
| [task.md](task.md) 构建复用与独立命令 | 审查根命令及 desktop job 顺序 | Adapter 基础检查只构建一次；桌面同基线复用；独立命令先构建 | 命令图符合；W1 未启动应用构建或 GUI 测试 | 配置评审 | 静态通过 | [根命令](../../../package.json)、[桌面命令](../../../apps/desktop/package.json) |
| [task.md](task.md) 开发文档与验收边界 | 审查相关 Markdown diff、标题表格和相对链接 | 明确局部验证不是完整验收 | 负责文档保持边界，`git diff --check` 通过 | Markdown 源码预览／链接检查 | 通过 | [脚本说明](../../../scripts/README.md)、[贡献指南](../../../CONTRIBUTING.md) |
| [task.md](task.md) 提交门禁无副作用 | 向脚本测试传入独立外部 `GIT_INDEX_FILE`，比较前后摘要与条目 | fixture 不改调用者 index | 初次发现改写；修复后摘要不变、cached diff 为空，见 W1-01 | 独立临时 index；未触碰真实暂存区 | 修复后通过 | 下文 W1-01 |

## 命令记录

2026-10-11，W1 独立执行：

```text
pnpm test:scripts
  Test Files 1 passed (1); Tests 30 passed (30)
pnpm check:docs
  Documentation: 0 new issue(s); 4 baseline issue(s) unchanged or removed.
git diff --check
  exit 0
actionlint .github/workflows/ci.yml
  exit 0
```

实现者随后新增了 5 个真实 `check-commit` 入口测试；W1 在外部 index 边界探测中独立执行该 35 项版本，全部通过，但发现下面的副作用。

修复后 W1 于 14:32 独立复验：普通执行与传入外部 `GIT_INDEX_FILE` 各 36 项通过；重新运行文档检查仍为 0 新／4 历史问题，actionlint 与 diff whitespace 检查退出 0。最终评审文件 SHA-1（用来识别尚未提交的精确基线）：

```text
5e6448d48697d3759df36b917273098c29955331  scripts/check-scope.mjs
de22bcef9a6fd4972e9ebd257126a4adbebbe0b7  scripts/check-docs.mjs
bc30317a45eee8ebda13704c8f929f82f87cfb3e  scripts/check-commit.mjs
314fdb43fc1b5396ff5a60f28ed371e977221c80  scripts/check-workflow.test.mjs
15e0f291b332f4637ac03237eedb74e969d531ea  scripts/vitest.config.mjs
cb61e2f76c4783f0eaf5762688952b8dd331911b  .github/workflows/ci.yml
9e79d7ffdfa89174c2031901022022ca2f879e27  package.json
587d9327a183fa1958bb8b95b48eb68b1f4f845f  apps/desktop/package.json
```

## 缺陷与复验

### W1-01 — 阻塞：脚本测试继承 Git hook 的外部 index 并改写调用者暂存区

- 位置：`scripts/check-workflow.test.mjs` 的 `repo()`、`git()` 调用与 gate 子进程环境；共享 `git()` 默认继承调用者环境。
- 原因：hook 可传入绝对 `GIT_INDEX_FILE`；fixture 虽有独立 cwd，却仍使用继承的 index。测试中的 `git add` / `git commit` 会写调用者 index。其他 Git 仓库定位环境变量也需隔离。
- 复现：在专用临时目录创建 index，`GIT_INDEX_FILE=<临时 index> git read-tree HEAD`；记录 sha1；以相同环境运行 `pnpm test:scripts`；再记录 sha1 与 `git ls-files`。
- 实际：`/tmp/studio-w1-git-env.V1bRDV/index` 的摘要从 `9ebb696cacfd713e4888f82edc7b8e88c8b83051` 变为 `0eba2f33a98d6c7af95c7518d009082718abfa35`，结束只含 `README.md`、`source.ts`，但 35 项测试全部通过。
- 安全范围：本次探测只写专用临时 index，没有向真实仓库 index 传入该环境，没有修改真实暂存区或提交。
- 已通知实现者：隔离 fixture 的 Git 环境并增加调用者 index 不变回归；正常 `check-commit` 必须继续尊重用户 Git 指定的 index，不应全局删除生产 helper 的环境变量。
- 修复：实现者在每项 fixture 运行前用 `vi.stubEnv` 清除继承的 `GIT_*`，完成后恢复；生产 helper 不变。新增 fixture 环境断言，36 项测试版本摘要见上方精确基线。
- 复验：W1 重复同一场景，专用 `/tmp/studio-w1-git-env-fixed.p9BZWP/index` 前后摘要均为 `9ebb696cacfd713e4888f82edc7b8e88c8b83051`，`git diff --cached --stat HEAD` 为空；36 项测试通过。
- 结论：已修复并独立复验通过；复验者未参与修复。
