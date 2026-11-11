# 验收：T20261106-scoped-checks

## 未覆盖与边界

- 本次只评审检查策略及脚本，不运行应用单测、Electron、打包或真实 CLI；不构成 Files／输入框功能验收。
- 未触发远端 GitHub Actions；CI 结论限于工作流及调用链静态检查。
- 自动影响映射需要随跨模块依赖更新；全局配置未知时阻断是本次明确保留的边界，不以全量回归兜底。
- 规则 diff 仍待人工审阅；本内部任务不另设人工功能签收。

## AI 结论与运行环境

- 当前结论：通过。本次发现的失效测试路径／空匹配问题均由 Main Agent 修复，独立复验通过；没有剩余阻断项。
- 验收者：`/root/review_scoped_checks`，未参与实现；只写本验收记录。
- 日期与基线：2026-11-06，`a0619fef2f954ba0bd4b82504dba849d703b385c` 加 `chore/scoped-checks` 未提交的检查脚本、CI、规则及任务文档 diff。
- 环境：macOS arm64，Node 26.12.1，Vitest 5.0.1；无应用形态、Provider 或真实 CLI。

## 验收结果

来源为 [任务验收标准](task.md#验收标准) 和 [测试分层](../../../../scripts/README.md#测试分层)。

| 场景 | 独立检查及结果 | 结论 |
|---|---|---|
| 本地和普通 CI 不自动全量 | 检查 `check-commit.mjs` → `affectedPlan` → `runPlan`；工作流完整检查、全量 Electron 与打包步骤均以 `workflow_dispatch` 为条件 | 通过 |
| 局部源码与跨进程边界 | 使用真实文件 inventory 生成 Composer、Files service、preload bridge、Adapter types 计划；Composer 只有 input 测试种子加静态依赖，Files 含服务／renderer／input／shared，Adapter 显式包含 desktop session 消费者 | 通过 |
| 删除／未知／失败 | 独立运行选择器中删除保留模块、未知路径阻断、失败返回 7 的测试，未调用真实应用命令 | 通过 |
| 部分暂存 | 阅读门禁：非纯文档提交存在未暂存／未跟踪非文档时，运行测试前退出；不会自动 stash、改暂存区或拿工作树修复认证暂存代码 | 通过 |
| 测试路径失效 | 修复后 `missingTests` 同时由 runner、CI scope 和 dry-run 检查；真实 inventory 中模拟移除 Files spec，确认运行任何子命令前阻断 | 通过 |
| 无匹配单测 | 修复后取消 `--passWithNoTests`，保留 Vitest 默认无测试失败语义；局部脚本断言通过 | 通过 |
| CLI 入口依赖 | Main 自检后抽出 `check-paths.mjs` 消除 scope 动态 import 循环；独立执行 push、manual、invalid 三个真实子进程入口场景 | 通过 |

独立执行记录（2026-11-06 16:08:36 CST）：

```sh
pnpm exec vitest run scripts/check-affected.test.mjs --config scripts/vitest.config.mjs \
  -t 'IPC|unknown|failed|automatic workflow|deleted'
```

结果：1 个脚本测试文件，5 passed、5 skipped，155ms；跳过的是本次未选择的用例，不是应用测试失败。另用 `node --input-type=module` 调用 `affectedPlan([path], inventory())` 做上述真实路径计划预览，没有执行计划中的命令。

## 缺陷与复验

1. 选中的 E2E spec 缺失可能静默漏测：Main 增加 `missingTests`，在本地／CI／计划预览入口阻断。2026-11-06 16:10 CST 独立执行新增用例 `deleted or renamed selected E2E`，1 passed；另用真实 inventory 移除 Files spec 验证返回 1 且假 runner 未被调用，通过。
2. 单测空匹配静默成功：Main 取消 `--passWithNoTests`。16:10 CST 独立执行 `empty` 相关两项脚本断言，2 passed；阅读最终命令构造确认未留放行参数。未为验证这一参数运行应用测试。
3. Main 自检发现 scope CLI 的动态导入循环风险，抽出纯共享模块 `check-paths.mjs`。独立复验只运行 `scripts/check-workflow.test.mjs -t 'CI command entry point'`，push／manual／invalid 三项通过；没有运行其余工作流或应用用例。

以上复验均针对 `a0619fe` 上当前工作树修正版；Main 后续提交门禁的最终结果由其记录。自动影响计划仍需随新增模块及跨模块关系维护，不能把静态映射视为功能验收的替代。

### 最终门禁发现的历史文档 Hook 测试修正

Main 将此前未纳入 Vitest 配置的 `.codex/scripts/agent-docs-hook.test.mjs` 纳入后，发现两处旧测试问题。本评审者独立核对两处测试修正，结论通过：

- 配置相对路径：测试位于 `.codex/scripts/`，`../hooks.json` 正确指向 `.codex/hooks.json`；原 `../.codex/hooks.json` 多了一层 `.codex`。
- 已提醒且检查成功的 Stop：`handleHook` 只有未提醒或链接失败时才请求续跑；fixture 的 PostToolUse 已设置 notified，check 返回成功，因此预期 `{}` 符合现有代码及 [Agent 文档 Hook](../../../../scripts/README.md#agent-文档-hook) 的「已提醒且链接通过直接放行」。保留调用次数断言，未削弱链接检查是否执行的验证。

2026-11-06 16:13:51 CST 独立执行：

```sh
pnpm exec vitest run .codex/scripts/agent-docs-hook.test.mjs \
  --config scripts/vitest.config.mjs -t 'SessionStart baselines|project configuration'
```

结果 2 passed、11 skipped，303ms。只修改测试定位和既有行为预期，没有修改 Hook 实现或产品行为；无需应用测试。最终完整的受影响脚本门禁仍由 Main 记录。
