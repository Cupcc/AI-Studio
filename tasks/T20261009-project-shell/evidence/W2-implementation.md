# W2 实现与验证记录

- 日期：2026-10-09。
- Worker：W2；worktree `agent-a014c55195a9e9487`，分支 `worktree-agent-a014c55195a9e9487`。
- 依据：主工作区的 project / navigation spec 草稿、task 验收标准；PROJ-Q1～Q3 的 2026-10-09 确认。其余问题按建议实现，保持待确认。
- 保留并续写接手时已有的 Project service、身份判定、共享 UI rules/types、IPC 与迁移；没有 reset 或覆盖用户修改。

## 完成范围

- 启动页 Tab、单个 `+` 启动页、最近 Project 打开 / 隐藏 / 失效说明；合法目录校验；符号链接 / 等价路径 / 设备号与 inode 身份。
- 多 Tab 顺序、切换与关闭；同名路径标签消歧、截断 / 滚动、非当前 Tab 单个注意力点。
- Project 级 Main Canvas、Session / View 独立右侧状态、共享 last tool、两类宽度；窗口级 Tab 集合 / 当前 Tab / 导航折叠持久化。
- 默认五项 Views、New Chat 位置与 CLI 菜单槽位、SESSIONS 容器；View roving tab index；模式高亮规则；折叠后的顶栏按钮与注意力点。
- Session / View 模式布局、有效宽度压缩与保存宽度分离、拖拽结束保存、键盘调整宽度、500ms 工具提示；后台注意力更新不改变布局。
- 主进程关闭确认 / 重新查询 / Stop / 失败保留；Renderer 模态、取消默认焦点、Tab 焦点限制、Esc 取消、重试。
- macOS 菜单与快捷键；关闭窗口隐藏并保留 Renderer 和后台 Session；退出前停止活动轮次与 Renderer 写入 flush 握手。
- 重启恢复集合 / 顺序 / 当前 Tab；缺失 Session 回落 Overview，缺失 View 左列 Session 改草稿；延迟恢复校验不覆盖用户的新选择。

## Session 和后续模块接入

主进程：`src/main/services/project/index.ts` 的 `projectShellFor(core)`：

- `.projects.getProject(id)?.canonicalPath` 是 CLI cwd；`.projects.getDefaultCli` / `.setDefaultCli` 供 chat。
- `.setSessionPort(port)`：`getBlockingSessionCounts(projectId) → { running, needsInput }`；`stopProjectTurns(projectId) → { stopped, failed: [{ sessionId, reason }] }`；`activeTurnCountAll() → { sessions, projects }`；`stopAllTurns()`。
- `.closeProject(projectId, confirmed)` 由 `project.closeProject` IPC 调用，始终通过可信主进程 Session 服务停止活动轮次；失败 / 超时不移除 Tab。
- 默认端口返回空活动轮次，等待 session-slice 接入。

Renderer：`features/project/integration.tsx` 的 `registerShellIntegration`，在 App 首次 render 前接入：

- `RendererSessionPort`：注意力取值 / 订阅，Project opened / closed，Session 存在性，`setViewing`、`setWindowForeground`、`userOpenedSession`、`startNewChat`。
- `setWindowForeground` 与 `userOpenedSession` 分开：前台变化不构成打开操作；重复点击当前 Session、切回 Tab、启动恢复会发打开操作；后台 / 非当前 Project 的 viewing 为 null。
- `startNewChat` 只处理 chat 所拥有的草稿内容 / Default CLI；Shell 同时切换 `mainCanvas`。端口实现不要再次调用 Shell 的 `startDraft`，避免递归。
- 内容槽位：`SessionHistory`、`Conversation`、`ConversationHeader`、`ViewConversation`、`ViewConversationHeader`、`Preview`、`Tool`、`CliMenu`。槽位收到 Project / Main Canvas / active；View 或 Tool 另收到 viewId / area。Header 由 Shell 保持 48px 容器，槽位只放内部内容。
- `features/project/store.ts` 的 `useProjectShell.getState()` 提供 `openSession`、`startDraft`、`enterView`、`setViewConversation`、`updateUiState`。后续模块通过这里集中更新和落盘。
- 已打开 Project 的 Workspace 保持挂载，非当前以 hidden 隐藏，支持各模块保留 Project 内存态。

## 验证

| 检查 | 结果 | 证据 |
|---|---|---|
| desktop typecheck（node / web / e2e） | 通过 | [日志](W2-typecheck.log) |
| desktop Vitest | 15 个文件、74 项通过 | [日志](W2-unit-tests.log) |
| Electron Playwright | 9 项通过（含 6 项既有冒烟） | [日志](W2-e2e.log) |
| View Mode 1024 / 1280 / 1440 | 导航 248、Header 48；无横向溢出；1024 为 Conversation 376 + 右侧 400 | [1024](W2-view-1024.png)、[1280](W2-view-1280.png)、[1440](W2-view-1440.png) |
| Session Mode 1024 / 1280 / 1440 | Conversation ≥ 400、右侧 ≥ 320；无横向溢出 | [1024](W2-session-1024.png)、[1280](W2-session-1280.png)、[1440](W2-session-1440.png) |

单元覆盖目录合法性 / 不可读、macOS 可用的大小写 / Unicode / Data-volume 别名、Project 独立状态重开、损坏恢复、三项目布局状态、注意力不改变布局、Stop 成功 / 失败 / 超时、重复查看与前台分离、写入过程新增改动继续落盘、退出等待 flush。

E2E 仅替换原生目录选择器的返回路径；IPC、身份校验、SQLite、布局、Tab、重开 / 重启、菜单、macOS 窗口关闭均使用实际应用。活动轮次关闭流程以可替换接口的单元 / Renderer 测试验证，没有真实 CLI 或模型调用。

## 发现与限制

- 既有 smoke 在销毁最后一个窗口后才异步写 JSON，可能被 Electron 默认退出截断。已调整为写完报告再销毁窗口，完整 e2e 通过。
- Project state 写入采用 Renderer 串行 IPC + 主进程立即写入；用 revision 保留写入期间产生的后续改动；退出前 flush，关闭 Tab 前等待队列。写入失败只记录日志，下次状态变更重试。
- 视觉 Token 和简易线框图标保持临时 / 探索状态；截图用于布局验证，不代表高保真设计确认。
- Session History、CLI 选择菜单、Conversation、Project View / Preview 和工具内容是本任务规定的占位 / 槽位，真实内容和 Session Stop 由相应后续 task 接入。
- 未执行打包验证：本 task 修改 Project 壳层，已验证 Electron build 和原生 smoke；发布打包 gate 由集成阶段执行。
- 本 Worker 没有修改 spec、task、plan、acceptance 状态；没有将任务设为 done。验收与未决问题须按仓库协议由主 Agent / 人审阅。
