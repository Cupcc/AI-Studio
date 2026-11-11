# 最小回归选择独立评审

## 边界与未覆盖

本记录只评审测试选择器及提交、CI 调用链，不代表产品功能或人工验收。未运行应用单测、Electron 界面、打包或真实 CLI。清单检查读取真实 Vitest 依赖图，必要时构建 Adapter 与测试辅助产物，不执行应用测试用例。

本轮基线尚未包含主目录后续 dev 集成脚本；rebase 后需要复核该脚本的子进程测试映射，不重复未受影响检查。

## 独立结论

- 结论：本轮选择器改动通过独立技术评审，两项已复现发现均由实现者修复并通过独立复验，无当前范围内未关闭发现。
- 评审者：`regression_review`，未参与实现，只编写本记录与 `W1-*` 探针及证据。
- 日期与基线：2026-11-11，`bc75bae50e85f3cb5b1060a8126a0964d29ca41b` 加本工作树的选择器及测试 diff。最终选择器 SHA-256 由 [探针日志](evidence/W1-scope-probe.log) 固定。
- 环境：macOS arm64，Node 26.13.0、Vitest 5.0.1；Provider 与 CLI 不适用。
- 依据：[本任务范围](task.md)、[测试分层](../../scripts/README.md#测试分层)及用户批准的最小回归目标。

## 验证结果

| 场景 | 独立操作与实际结果 | 证据 |
|---|---|---|
| 原有门禁与真实选择 | 独立运行 `check-affected`、`check-selection`、`check-workflow`，初轮 3 文件 74 项通过。覆盖真实空选择退出 1、只运行合成依赖测试、真实 desktop 清单与 Playwright 列表。后续修复未改变 `check-selection` 或 `check-workflow`，保留该基线结果 | 本轮工具执行记录，实际清单断言位于 `scripts/check-selection.test.mjs` |
| 修复后的选择器 | 独立复跑选择器 26 项通过，包含配置快照、删除、CSS、混合输入、缺失消费者与提交前阻断 | [选择器日志](evidence/W1-selector-tests.log) |
| CSS 对应界面 | Workbench CSS 无单测且不选 runtime-tools；共享 tools.css 无单测但保留 Terminal / Browser 两个界面场景 | [可重跑探针](evidence/W1-scope-probe.mjs)、[结果](evidence/W1-scope-probe.log) |
| CSP 与混合改动 | 临时 Git tree 生成实际 CSP diff。叠加 CSS、Terminal 单测、Diff 单测或 Diff 源码保持两个场景；叠加 Terminal 源码或 runtime-tools spec 编辑恢复完整场景 | 同上 |
| 动态网页资源 | 真实依赖图核对包资源的三份直接消费者；删除 portable-pages 测试后在执行命令前阻断 | 同上及初轮真实清单检查 |
| 删除后的空候选 | 删除 Desktop 领域源码、Adapter provider 源码、脚本或共享 renderer lib 且无候选测试时均阻断；同域两个删除共享有效候选时不误阻断 | 同上 |
| IPC 与数据边界 | 阅读提交及 CI 入口，并用实际依赖图核对 workbench IPC、SDK、模板、manifest schema 与数据库迁移的消费者；未发现本轮新增静默漏选 | 本轮工具执行记录 |

## 发现与关闭

1. **P2：共享工具 CSS 丢失 Terminal / Browser 界面回归。** 首轮 `check-affected.mjs` 的 CSS 提前返回只选 app、alignment，实际 `tools.css` 的 Terminal 和 Browser 样式不再由 runtime-tools 场景覆盖。实现者增加对应两个界面场景，独立探针确认 workbench CSS 不受该扩展影响，关闭。
2. **P2：混合改动无依据扩大 runtime-tools。** 首轮以整个 tools 路径判断是否取消 grep，CSP 加仅 Terminal 单测或 Diff 单测就恢复终端关闭流程。实现者改为合并实际场景需求，独立临时 Git tree 探针确认测试与无关模块不扩大，而真实运行时改动仍恢复完整场景，关闭。

另独立复验了实现者补充的删除源码空候选旁路。该问题属于原有边界，本轮明确阻断并保留有测试候选的合法删除场景。
