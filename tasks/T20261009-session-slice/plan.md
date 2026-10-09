# 执行计划：T20261009-session-slice

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

先由 W1 起草 `specs/session/spec.md`、`specs/chat/spec.md`、`specs/input/spec.md`，汇总未决问题交人回答；Adapter 接口确定且 task 进入 ready 后再规划实现 worker。

## Workers

2026-10-09 恢复时 W2 无落盘调研结果，暂由主 Agent 接续推荐修订与接口规划；Provider 与 Project 壳层就绪后，再登记实现及独立验收 worker。接续团队仅使用 GPT-6 Astra / GPT-6.1 Sol 的 high / xhigh 配置（2026-10-09 对话确认）。

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | spec 草稿（Opus 5.5 high） | `specs/session/spec.md`、`specs/chat/spec.md`、`specs/input/spec.md` | spec 草稿与未决问题 | — | done |
| W2 | 参考应用调研与推荐修订（主 Agent 接续） | `specs/session/spec.md`、`specs/chat/spec.md`、`specs/input/spec.md`、`specs/navigation/spec.md`；本 task 的 `research.md` | 修订后的推荐（待确认） | W1 | done |
| W3 | 共享 DTO / IPC 契约与接线准备（主 Agent） | `apps/desktop/src/shared/session/**`、`apps/desktop/src/shared/ipc/session.ts`；依赖 / 构建配置；主工作区的共享登记接线（待实现合并后） | 固定后端与界面并行边界 | W2、Adapter W1 | in_progress |
| W4 | Session Manager（GPT-6 Astra xhigh，待分配槽位） | `apps/desktop/src/main/services/session/**`、`apps/desktop/src/main/ipc/session.ts`、Session 迁移文件；本 task 的 `evidence/W4-*` | 状态机、持久化、Adapter / Project 接入与测试 | W3、Project W2 接口 | todo |
| W5 | Session / Chat / Input 界面（GPT-6.1 Sol xhigh，待分配槽位） | `apps/desktop/src/renderer/src/features/{session,chat,input}/**`、`apps/desktop/e2e/session.spec.ts`；本 task 的 `evidence/W5-*` | History、Conversation、草稿、等待与错误卡片、输入区与测试 | W3、Project W2 | todo |
| W6 | 独立验收（GPT-6.1 Sol high，待分配槽位） | 本 task 的 `acceptance.md`、`evidence/W6-*` | AC-02～AC-05 验收记录 | W4、W5 | todo |

## 进度与决定

- 2026-10-09 task 卡片为 draft，等待 spec 草稿。
- 2026-10-09 W1 完成并合并。阻塞问题 S-Q1、S-Q2、I-Q2 已由人回答（S-Q1（c）未采纳推荐）。非阻塞问题由 W2 参考 Claude Desktop / ChatGPT Desktop 修订推荐，保持待确认，实现先按推荐。
- 2026-10-09 主 Agent 完成 W2 恢复调研，写入 `research.md`：使用 OpenAI / Anthropic 官方资料，未验证的竞品细节不当作事实。修正 navigation 重复点击 Session 与已确认 S-Q1 的冲突；C-Q5 对齐 Adapter A-Q1；折叠 New Chat 对齐 NAV-Q8；对齐 Provider ID、能力字段与 Stop 清理失败映射。其余建议保留待确认；无新增阻塞问题，可进入实现准备。
- 2026-10-09 先由 W3 固定共享契约，再让 W4 / W5 在独立 worktree 并行；主 Agent 统一共享注册与依赖变更，避免与 Project W2 重叠。下一批实现使用既有 Provider 契约，不等待真实 CLI 验证才开发产品状态机。
- 2026-10-09 W3 共享 DTO / IPC 已落盘并通过 `pnpm typecheck`。桌面包增加 Adapter workspace 依赖；根脚本在类型检查、测试、启动 / 打包前构建 Adapter。契约位置为 `src/shared/session/types.ts`、`src/shared/ipc/session.ts`；共享登记在 W4 / W5 合并时统一接线。序列化 DTO 不携带 Runtime 句柄；对话按 sequence 分页与稳定 ID 更新，查看上下文与 opened 为独立调用。
- 2026-10-09 W3 补充纯展示规则 `shared/session/presentation.ts`：单个状态、Project 注意力 / 计数、用户消息时间排序、本地日历分组与标题。6 项测试及类型检查通过。Session 关闭草稿与 Project §2.2.4 / PROJ-Q6 对齐为停止成功再关闭、失败保留（仍是待确认建议）。
