---
id: T20261011-test-workflow
status: done
fr: []
ac: []
specs: []
created: 2026-10-11
---

# 测试流程分层与去重

## 依据与范围

用户在 2026-10-11 测试流程分析后回复「accept」，确认开发中局部验证、提交基础兜底（文档豁免）、代码进入 main 完整自动化、功能／里程碑集中验收的方向。实现 diff 待审阅。不调整产品 FR / AC，不运行真实模型请求，不变更功能验收要求。

负责规则：[脚本说明](../../../scripts/README.md)、[贡献指南](../../../CONTRIBUTING.md)、[任务协议](../../README.md)。主目录有其他会话改动，基于与 origin/main 同步的 `810d230` 在独立 worktree `test-workflow` / `chore/test-workflow` 实现，不混入主目录未提交治理变更。

## 验收标准

以下均源自本次对话确认：

- [x] 纯文档提交走文档检查；代码、配置、未知路径及空变更保守执行全量基础检查。
- [x] 检查新增断链、删除／移动目标造成的入链损坏；测试覆盖空格、中文路径与部分暂存。
- [x] main push、面向 main 的 PR 和手动触发保留 CI；分支 push 不与 PR 重复。手动触发强制完整验证。
- [x] 基础检查只构建 Adapter 一次；CI 桌面构建同时用于 E2E 与打包；独立命令仍自动构建。
- [x] 更新开发迭代的局部测试命令与验证边界；不把局部通过等同完整验收。
- [x] 脚本测试、全量基础检查及适用的构建／打包验证通过，CI 配置与快路径经独立评审。

## 技术决定

- 主 Agent，2026-10-11：文档快路径使用显式清单；不依据提交标题、扩展名全局豁免或测试依赖图决定提交门禁。
- 主 Agent，2026-10-11：文档检查对比基线，仅阻断新产生的问题；不借本任务批量修改历史文档。无有效基线时不豁免应用检查。

## 验证记录

基线：`810d230` + 本 worktree 未提交 diff；macOS arm64，Node 26.10.0 / pnpm 12.10.1。无界面行为或真实 CLI 协议变更，无模型请求。

| 检查 | 结果 |
|---|---|
| `pnpm check:code` | 类型检查通过；Adapter 181、Desktop 148 项单测通过；Adapter 只构建一次 |
| `pnpm check:commit` | 最终代码下以空 index 验证保守兜底；文档检查、类型检查、36+181+148 项测试通过；实际 index 无变化 |
| `pnpm test:scripts` | 最终 36 项通过；路径分类、快照、链接、改名、CI 基线、实际 gate 入口和失败传播 |
| Git hook 环境独立复验 | W1 发现 fixtures 继承 GIT_INDEX_FILE 可误写外部 index；修复为测试 beforeEach 清除所有 GIT_*、afterEach 恢复。36 项在外部 index 环境通过且 index 哈希不变，见[独立验收](acceptance.md) |
| `actionlint` / `git diff --check` | 通过 |
| `pnpm check:docs` | 0 新问题；4 项基线遗留问题，不在本次范围 |
| 局部 Vitest 示例 | `vitest list … --filesOnly` 确认 project 服务 2 个测试文件、Codex 3 个单测文件；无真实 integration 测试 |
| `pnpm --filter @ai-studio/desktop run build` | 通过 |
| `pnpm --filter @ai-studio/desktop run package:built` | 复用上述产物，未签名 macOS arm64 打包通过；未触发源码重建 |
| `pnpm --filter @ai-studio/desktop run test:e2e:built` | 首轮 23/26，通过的包括布局与原生依赖冒烟；失败为 Project tab、前台完成未读状态、输入文本末尾意外出现 ha |
| `… test:e2e:built --last-failed` | 不改代码／产物复跑，3/3 通过；期间检测到另一会话启动窗口测试，因此记录可能的焦点／输入干扰，不将首轮失败抹去或声称已定位产品缺陷 |
| `pnpm smoke:packaged` | 等待其他测试结束后执行，通过。SQLite、PTY、登录 Shell、CLI 发现与 Renderer 均正常；本机 Codex 0.162.1、Claude 2.1.296，仅发现／版本检查，无模型请求。运行报告位于 `.runtime/desktop/packaged-smoke.json`（本地临时证据） |

上述验收完成时，CI YAML 已通过本地检查，尚未合入／推送，也未在 GitHub runner 执行；不宣称远端 CI 已通过。主目录其他会话改动保持原样。

## 收尾

Main Agent 于 2026-10-11 核对本地实现、测试、负责文档与 W1 [独立验收](acceptance.md)，确认脚本／流程优化交付完成；随本次变更归档。W1-01 已修复且由原评审者独立复验，无未解决阻塞。未提交 diff 的精确代码摘要见 acceptance；此后仅更新任务记录和归档相对链接，不变更评审代码。新文档依照本轮注入的 Task Protocol 执行 AI 收尾，不将方向确认或任务 done 视作人工接受实现 diff。

2026-10-11 用户随后指令「提交合并」，授权提交本任务并合入 main。集成前 main 与 origin/main 同为 `85c6f8a`；新增原型提交不修改本任务代码。主目录仍有其他会话未提交内容，包括本次合入同样涉及的 AGENTS.md、CONTRIBUTING.md；这些内容不纳入本任务提交，不擅自暂存、覆盖或丢弃。任务分支先提交并 rebase main，合入受 Git 的本地改动保护约束；合并／推送结果以实际 Git 状态和本轮交接为准。
