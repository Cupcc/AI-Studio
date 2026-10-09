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
| W3 | 共享 DTO / IPC 契约与主接线（主 Agent） | `apps/desktop/src/shared/session/**`、`apps/desktop/src/shared/ipc/session.ts`；依赖 / 构建配置；共享登记、主进程生命周期、App 安装、Project 接口的默认 CLI 初始化、草稿 flush、关闭释放接线及相关测试；W5 暂停期间接管 store mutation 竞态修复，提交后归还 | 固定并行边界并集成后端与界面 | W2、Adapter W1 | in_progress |
| W4 | Session Manager（GPT-6 Astra xhigh） | `apps/desktop/src/main/services/session/**`、`apps/desktop/src/main/ipc/session.ts`、Session 迁移文件；本 task 的 `evidence/W4-*` | 状态机、持久化、Adapter / Project 接入与测试 | W3、Project W2 接口 | in_progress |
| W5 | Session / Chat / Input 界面（GPT-6.1 Sol xhigh） | `apps/desktop/src/renderer/src/features/{session,chat,input}/**`、`apps/desktop/e2e/session.spec.ts`；本 task 的 `evidence/W5-*` | History、Conversation、草稿、等待与错误卡片、输入区与测试 | W3、Project W2 | in_progress |
| W6 | 独立验收（GPT-6.1 Sol high） | 本 task 的 `acceptance.md`、`evidence/W6-*` | AC-02～AC-05 验收记录 | W4、W5 | in_progress |

## 进度与决定

- 2026-10-09 task 卡片为 draft，等待 spec 草稿。
- 2026-10-09 W1 完成并合并。阻塞问题 S-Q1、S-Q2、I-Q2 已由人回答（S-Q1（c）未采纳推荐）。非阻塞问题由 W2 参考 Claude Desktop / ChatGPT Desktop 修订推荐，保持待确认，实现先按推荐。
- 2026-10-09 主 Agent 完成 W2 恢复调研，写入 `research.md`：使用 OpenAI / Anthropic 官方资料，未验证的竞品细节不当作事实。修正 navigation 重复点击 Session 与已确认 S-Q1 的冲突；C-Q5 对齐 Adapter A-Q1；折叠 New Chat 对齐 NAV-Q8；对齐 Provider ID、能力字段与 Stop 清理失败映射。其余建议保留待确认；无新增阻塞问题，可进入实现准备。
- 2026-10-09 先由 W3 固定共享契约，再让 W4 / W5 在独立 worktree 并行；主 Agent 统一共享注册与依赖变更，避免与 Project W2 重叠。下一批实现使用既有 Provider 契约，不等待真实 CLI 验证才开发产品状态机。
- 2026-10-09 W3 共享 DTO / IPC 已落盘并通过 `pnpm typecheck`。桌面包增加 Adapter workspace 依赖；根脚本在类型检查、测试、启动 / 打包前构建 Adapter。契约位置为 `src/shared/session/types.ts`、`src/shared/ipc/session.ts`；共享登记在 W4 / W5 合并时统一接线。序列化 DTO 不携带 Runtime 句柄；对话按 sequence 分页与稳定 ID 更新，查看上下文与 opened 为独立调用。
- 2026-10-09 W3 补充纯展示规则 `shared/session/presentation.ts`：单个状态、Project 注意力 / 计数、用户消息时间排序、本地日历分组与标题。6 项测试及类型检查通过。Session 关闭草稿与 Project §2.2.4 / PROJ-Q6 对齐为停止成功再关闭、失败保留（仍是待确认建议）。
- 2026-10-09 用户继续执行；Provider 与壳层已集成至 `4ddc59e`。W4 在 `.claude/worktrees/session-runtime-resume`（`codex/session-runtime`）实现后端；W5 在 `.claude/worktrees/session-ui-resume`（`codex/session-ui`）实现界面；两个范围不重叠，共享契约与登记变更由主 Agent 接线。W4 提供可注入 Provider 的测试工厂；W5 的模拟 E2E 在最终接线后运行。
- 2026-10-09 W4 / W5 接口确定：`createSessionFeature(core, {providers?, isForeground?})`、`createE2eProviders()`、`installSessionIntegration()`；主 Agent 仅在开发环境显式测试开关注入 fixture。Project 创建时初始化默认 CLI 快照；关闭 / 退出前 flush 包括草稿写入。退出不使用骨架的 5 秒强制截断，在 Runtime 释放完成后关闭数据库，重复退出不能绕过清理。
- 2026-10-09 W4 主体 `fe63821`、W5 主体 `2641d72` 已合并。W3 完成 Session IPC 注册、迁移注册、开发 E2E Provider 注入、Renderer 在 createRoot 前一次安装；注册测试注入无真实 CLI 的 Provider，重复 E2E 截图默认落 `.runtime/`。集成后全 workspace typecheck 通过，Adapter 181 / desktop 118 单测通过。W4 继续处理答复失败保草稿边界，W5 继续 Electron E2E；W6 在 `.claude/worktrees/foundation-verification` 接续独立验收，只写本 task 的 acceptance 与 W6 证据，不覆盖实现 worker 证据。
- 2026-10-09 已合入 W4 `004703e`（答复失败保留草稿、同步终态顺序）与 W5 `41cf674`（7 项模拟 Provider Electron 场景）。W6 `588e032` 的独立 SQLite 验证通过，并复现 create / Rename 旧 IPC 返回覆盖新完成状态。W5 遇模型容量错误后，主 Agent 接管 `store.ts` / `session.test.tsx` 补版本保护，并补 Project 主进程可信关闭成功后的 Runtime 释放；针对性 20 项单测、typecheck、diff 检查通过。
- 2026-10-09 接续使用已安装 Vitest、React best practices、agent-browser skills。W3 提交上述修复后归还界面写入范围给 W5；W5 完成 Electron 场景与实际交互缺陷修复，W6 独立运行最终门禁及最小化 / 隐藏窗口、2,000 条 History 检查，W4 只读复查关闭重开与 Runtime 生命周期并在自己的 W4 证据中报告。真实模型调用继续暂停，不扩大此前已耗尽或受配额阻塞的验证范围。
- 2026-10-09 W5 Sol xhigh 再次容量失败，由 Astra high 接替同一 worktree 与写入范围（`session_ui_finish`）。W6 复测两项 create / Rename 竞态均通过。W4 复现关闭超时后迟到 Stop 成功仍残留 closing、秘密卡片答复迟到导致数据库关闭后写入两项问题；授权 W4 在原后端范围修复并补回归。主 Agent 负责 spec / report 回写；所有需要原生窗口前台的 Electron 验证串行，避免不同 worker 抢焦点影响结果。
- 2026-10-09 W6 Electron 启动日志定位到 Adapter 仅提供 import export condition，electron-vite 主进程 CJS 产物 require Provider 子路径时报 ERR_PACKAGE_PATH_NOT_EXPORTED。主 Agent 接管 Adapter package.json 导出条件补 default fallback，保留 ESM 源与 Node >=22.12 基线；以真实 Node require 四个导出入口及 Electron 门禁复核。
- 2026-10-09 W5 `89f033e` 已交付并合并：10 项 Session Electron / 14 项 UI 单测通过，Tab 返回保留上滚位置、History 显式点击回最新；主 Agent 将 Project 草稿滚动表述与 Session §2.2 对齐，推荐仍待确认。W4 `a2dd106` 合并，关闭超时和迟到秘密答复正式回归通过，W6 原独立探针也通过；最终全 workspace typecheck、Adapter 181 / desktop 127 单测通过。主 Agent 用 agent-browser 完成秘密问题卡片、附件禁用与 1024×640 展示检查，W3 截图留证。
- 2026-10-09 W6 真实最小化检查发现窗口已恢复前台但迟到 minimize/hide 通知将 Renderer foreground 覆盖为 false，导致显式打开仍不能清提醒；主 Agent 接管 `main/window/**` 与 `main/index.ts` 的窗口状态通知，改为按实际窗口快照合并发布并补回归。W6 在修复后独立复验。2,000 条真实 Renderer History 已验证虚拟 DOM 有界、Rename 保留锚点。
