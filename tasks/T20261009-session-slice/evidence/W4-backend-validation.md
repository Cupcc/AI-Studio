# W4 Session 后端实现验证

- 日期：2026-10-09
- Worker：W4（Session Manager）
- 基线：`8774bc1`；分支：`codex/session-runtime`
- 范围：FR-CHAT-001～003、FR-SESSION-001～003、FR-STATE-001～007、FR-INPUT-001～002、FR-NAV-003；AC-02～AC-05 的模拟验证。
- 状态：实现与模拟验证记录，非人工验收。

## 入口与接线

- `src/main/services/database/migrations/2026100903_session_core.ts` 导出 `sessionCore`；主 Agent 登记迁移。
- `src/main/ipc/session.ts` 导出 `createSessionFeature(core, { providers?, isForeground? })`；返回完整 `sessionContract` handlers / dispose，自行调用 `projectShellFor(core).setSessionPort(service)`。
- Project 新建回调可调用 port 的 `initializeProject(projectId)`：快照应用最近默认 CLI，检测失败不阻止打开 Project。
- 默认 foreground 查询使用发送 IPC 的 BrowserWindow：存在、未销毁、focused、visible、未最小化；每次完成/出错重新查验。renderer 的 foreground 只是一项附加条件。
- `dispose()` 先停止全部轮（包括 Runtime 初始化中的轮），等待 Runtime / Provider 释放和目录检测结束，再完成 SQLite 检查点；主进程应等待它完成后再关闭数据库。

## 模拟 Provider

`src/main/services/session/e2e-providers.ts` 导出 `createE2eProviders()`。仅由主入口在 `STUDIO_E2E_PROVIDERS=1 && !app.isPackaged` 时显式注入；生产错误不切换到模拟 Provider。

| 消息包含 | 模拟行为 |
|---|---|
| 无标记 | 80ms 开始 stream，500ms 完成 |
| `[e2e:delay]` | 1800ms 后完成，用于后台 unread |
| `[e2e:slow]` | 持续 Running，用户 Stop 才结束 |
| `[e2e:approval]` | 单审批，允许/拒绝后完成 |
| `[e2e:question]` | 单问题，支持卡片或输入框文字答复 |
| `[e2e:multi]` | 两个并行请求，可逐个答复或 I-Q2 输入框拒绝并解释 |
| `[e2e:secret]` | 秘密问题，答案不落盘 |
| `[e2e:error]` | 首轮失败；重试相同文本成功 |

模拟 Provider 的原生 ID 在应用重启后仍可恢复，用于验证 App Session 1:1 和本地持久化；不证明真实 CLI 的原生恢复。

## 已执行

| 命令 | 结果 |
|---|---|
| `pnpm install --frozen-lockfile` | 通过，独立 worktree 安装，无锁文件变更 |
| `pnpm typecheck` | 通过（Adapter + Electron main/preload/shared/renderer/e2e 类型） |
| `pnpm --filter @ai-studio/desktop exec vitest run src/main/services/session` | 2 文件，24 项通过 |
| `pnpm test` | Adapter 175 项通过；desktop 104 项通过 |

测试覆盖：即时 Running；瞬间完成先于 send Promise；流式校正与稳定 ID；focus/opened 分离；前台 Error；多请求与互斥答复；I-Q2；秘密答案/草稿/错误/分段回显；Runtime 创建期间 Stop；重复 Stop；清理失败去重；Stop/成功竞态；Project 隔离关闭；crash、idle exit；native ID 不可变与懒恢复；无 ID 首轮失败；异常重启恢复；Rename 优先级；最近用户消息排序；模型下一轮；默认 CLI 快照；草稿存储；分页；IPC 深层校验与主进程窗口检查。

## 边界

- 无真实模型调用；Claude quota 阻塞由主 Agent 记录，不能用模拟通过替代真实 AC 验收。
- ContextItem 随用户消息持久化；View 注入与文件附件交付属于后续任务，本轮不向 CLI 注入。
- 秘密问题答复后，该 Runtime 的流式正文等完整快照后才写入/广播，避免分段回显在字符串匹配前泄漏。
- 迁移登记、共享 IPC 允许列表、Renderer 安装、Project 新建默认值接线与退出顺序由主 Agent 统一完成。
