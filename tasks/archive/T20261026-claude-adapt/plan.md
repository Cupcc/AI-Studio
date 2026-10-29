# Claude 适配续推计划

依据 [task](task.md) 与用户 2026-10-27「没完成的worktrees 继续推进」。保留开发开关与 DEC-19 发布边界，继续已授权的实现及验证；不定义 Running 追加的新产品行为。

| Agent | 职责 | 写入范围 | 状态 |
|---|---|---|---|
| Main | 实现修复、文档同步、任务收尾 | 本 worktree 源码 / 规格 / task / plan；不写独立 acceptance | 完成 |
| W4 repo_status | 独立技术评审、隔离真实授权卡 / 混合并发、默认关闭与打包边界验证 | 仅本任务 acceptance.md 与 evidence/W4-*；源码只读；原生操作须等待 Main 窗口时段 | 已完成本轮检查；I-Q2 失败交 W5 调查，缺漏界面记录由 W6 核对补齐 |

## 进度

- 2026-10-28：W5 claude_diagnose 接手 I-Q2 全量套件不稳定调查，写入范围限定 Claude integration 用例、必要的 Claude 实现修正及 evidence/W5-*；不操作原生窗口，不写 task / plan / acceptance。Main 核对既有界面证据并同步当前缺口；实现有变更时另交独立验收。
- 2026-10-28：W6 cli_verify 补做独立证据复核，写入范围为本任务 acceptance.md 与 evidence/W6-*，源码只读；先核对 W4 最终截图、报告与保留 fixture 中的审批 / 混合并发结果，之后在 CLI 管理窗口复验结束后补打包 Provider 菜单边界。
- 2026-10-28：W6 在完成证据 / 测试独立复核后因模型容量错误中断；W7 tools_verify 接手打包开关菜单与未打包 effort 目录选择 / 复位的独立交互（不发送模型消息），仅写 acceptance.md、evidence/W7-*，源码只读；先完成 CLI 管理剩余 UI 再操作本分支。

- 2026-10-27：从干净 e85d64f 恢复；CLI 管理依赖为 53baac0。优先完成独立审查与已有场景的证据缺口，发现缺陷交 Main 修复；本轮不合入 main。
- 2026-10-28：W5 完成 I-Q2 合成测试修正与诊断，未改生产代码；固定 2.1.311 完整套件 6/6、最终增强精确命令后的 I-Q2 定向 1/1，通过基线分别保留。W6 独立复核测试语义与日志、W4 UI / SQLite 后补入 acceptance。原两次超时未唯一归因，当前 2.1.312 未测；打包 Provider 菜单仍待串行窗口。
- 2026-10-28：W7 独立完成打包双入口边界与开发态 effort 目录 / 选择 / 复位，测试应用均退出；本轮技术结论通过。Main 核对全部批准交付、独立证据、文档五状态面并归档，不合入 main；人工体验与 DEC-19 发布边界保留。

- 2026-10-29：Main 将分支从旧 CLI 依赖 `53baac0` rebase 到已技术收尾的 `9c678a6`，仅路线图出现冲突；保留 CLI 与 Claude 各自的当前状态、人工验收入口和发布边界。同步前提交 `757baad` 已通过正常 hooks（脚本 36 / Adapter 286 / Desktop 1200 及类型检查）。W8 `claude_diagnose` 负责同步后的只读源码等同性、归档链接与五状态面复核，写入范围为空；发现问题交 Main 修正。
- 2026-10-29：W8 只读复核通过源码等同性与路线图五状态面，CLI / Claude 归档 Markdown 的本地目标 23 / 73 个均存在，无旧活动路径。发现 Claude 6 个证据脚本的 7 处仓库根路径未随归档加深，Main 已统一修正；6 份 `node --check` 与 7 个路径目标静态核对通过。同步后 `apps` tree 为 `fc7fa29d050c3f00c3cac5bb7d3822385b85e673`，`packages` tree 为 `07e437c9c562b369524274c3c9261872cf0b0ff5`，均与同步前一致；文档检查 0 新问题、4 个历史基线问题未增加，`git diff --check` 通过。

- 2026-10-29：用户明确「验收通过，合入main」；Main 在 acceptance 记录原始 `4eea8ab` 开发范围的人工接受，保留 DEC-19 和未测边界。CLI 已整理为 `c40b2e2`，仅重放旧 `9c678a6` 之后的 Claude 提交；`apps/` / `packages/` 与原始 tip 完全相同。路线图当前状态已同步，准备 squash 后快进合入。

- 2026-10-29：本任务已随整理提交快进合入本地 main；三分支的最终源码等同性、组合回归及打包边界由[主线组合验证](../T20261026-tools-vscode-parity/plan.md#2026-10-29-main-组合验证)统一记录。
