# 结论：T20261009-v1-foundation-slice

## 当前 V1 推进口径（2026-10-18）

路线图所列现有功能的人工体验验收已全部通过，接受范围与确认原文见[总体验收](acceptance.md#人工功能验收)。后续工作集中于 V1 内的剩余实现、Codex 真实技术验收与打包验证；Claude Code 真实验收暂缓且不随当前 V1 发布，历史结论保留。目标版本见 DEC-21；发布准备范围及签名策略见 DEC-22。本轮依据用户最新指令只更新文档，不推进实现、真实 CLI、打包、产物生成或发布。

## 本轮文档同步复核（2026-10-18）

已核对路线图的下一步、整体概况、模块状态、阶段计划和验收进度；技术要求的实现 / 真实验证 / 发布事项；验收标准的当前 CLI 边界、FR ↔ AC 矩阵与原生能力专项；DEC-16～22；系统架构快照；脚本发布说明；Adapter / Tools / Settings 规格；设计资料；以及相关进行中任务和 Task Protocol。已同步 Codex 真实验收范围、CLI / 上游服务的额度与限流责任、Claude Code 暂缓、W5-F13 和 SET-Q6 / Q7 的确认、取消排期、V1 与扩展范围边界，以及目标版本和暂不发布的决定。历史验证基线及未覆盖项保留；任务状态不因文档同步改变。人工体验结论已依据用户同日明确的“都通过了”更新，移除现有功能的待人体验门禁，并同步总体验收、清单、工具、设置及基础 / Project / Session / Adapter 的当前入口；原有 AI 技术部分通过结论、规格 diff 审阅与发布前待定事项保留。工程工具计划与调研中的旧预算前提已加上当前决定入口；本轮仅文档，应用包版本仍为 `0.0.0`。

`pnpm check:docs`、`git diff --check`、架构 HTML 内嵌脚本 `node --check` 均通过；文档检查报告 0 个新增问题，4 个基线问题保持不变。未执行真实 CLI 调用或 GitHub Release 发布。

提交前复核（2026-10-18）：同步脚本发布准备说明中遗留的人工体验待定入口，改为引用本次已验收记录；发布前的签名 / 公证 / 校验和、Release Notes 与发布方式仍保留待定。其余历史技术记录及未覆盖项维持原基线。

## 需要回写的内容

| 目标 | 结果 | 状态 |
|---|---|---|
| `specs/agent-adapter` | 正式 Provider / Stop / 输入语义与真实边界 | 已回写草稿 |
| `specs/project`、`specs/session`、`specs/chat`、`specs/input` | 实际 DTO、IPC、SQLite、默认 CLI、草稿、关闭 / 查看 / 滚动职责 | 已回写草稿 |
| `apps/desktop/README.md` 与各 task plan / report | 接线、启动与门禁、恢复记录、证据、遗留项 | 已回写 |
| 编号规格、确认决定与设计状态 | DEC-16～22 及相关决定已写入负责文档；其他待决问题仍归原文档 | 待人工审阅 |

## 历史技术报告（2026-10-09）

以下保留当时的遗留问题、分支状态与验证结论；人工体验的当前结论见本文顶部。

### 遗留问题

1. 真实 CLI UI AC-02～AC-05 本轮均未运行。Claude 真实成功流式 / Resume / 模型切换 / Stop 受配额阻断；Codex 修正版精确 Stop 与本机升级后 `0.162.0` 尚未真实复测。六回合历史证据与失败记录均保留，后续真实调用按 Codex CLI 实际结果记录。
2. 宿主崩溃、未观察到的脱离后代、外部 MCP 进程树与 Runtime dispose 的 OS 退出证明仍有边界，见 Adapter / Session 报告。
3. Project View 实现、Context 工具、打包发布 / 签名公证不在本轮范围。已有骨架打包冒烟不代表本轮最终 Session 产物已打包验证。
4. 非阻塞产品推荐、Project View 决定草稿与 acceptance 均未人工签收。分支未推送、未合入 `main`；用户新增的 skills / Claude 配置未包含在本轮提交中。

### 结论

Claude 工作区中的本轮任务已接续并集成到 `dev/v1`：Electron 地基、Project 壳层、CLI Adapter、Session 对话切片已实现；Project View 维持本轮调研范围，Context 工具留待后续。接续团队使用用户指定的 GPT-6 Astra / GPT-6.1 Sol high / xhigh 配置，容量中断时保留原 worktree 并恢复工作。

所有实现任务处于 `verifying`，未写入人工确认或 `done`。独立结果见 [总体验收](acceptance.md) 及以下子任务记录；真实 CLI 验证仍为部分通过，不能宣称 AC-02～AC-05 完整签收。

| 交付 | 内容 | 详细记录 |
|---|---|---|
| 应用地基 | Electron / React、可信 IPC、SQLite 迁移、PTY 与 GUI 登录 Shell 环境、测试框架 | [骨架报告](../T20261009-app-skeleton/report.md) |
| Project | 目录身份 / 最近列表、Tab、导航 / 边栏、状态恢复与可信关闭 | [Project 报告](../T20261009-project-shell/report.md) |
| Adapter | Codex App Server、Claude Agent SDK、统一事件 / 等待 / Stop / Runtime 接口 | [Adapter 报告](../T20261009-agent-adapter/report.md) |
| Session | 创建 / 续聊、流式 / 工具、Needs Input / Error / 未读、草稿 / 模型 / Rename、历史分页与窗口状态 | [Session 报告](../T20261009-session-slice/report.md) |
| Project View 调研 | Knowledge 存储、渲染、上下文、刷新四份决定草稿；待决问题已登记 | [调研任务](../archive/T20261009-project-view/task.md)、[决定索引](<../../docs/07. Decisions.md>) |

## 验证与运行

从仓库根目录执行 `pnpm dev` 启动应用。开发、测试与真实 CLI 调用边界见 [AGENTS.md](../../AGENTS.md)、[desktop README](../../apps/desktop/README.md) 和 [scripts README](../../scripts/README.md)。

- 独立 workspace 类型检查通过；单测 Adapter 181、desktop 130 项，共 **311 项通过**。
- Session 的 10 项模拟 Provider Electron 场景覆盖首条创建、双 CLI 并行、Stop 隔离、未读 / 等待 / Error、重启恢复、Project 关闭重开及滚动。
- W6 的 **3 项补充 Electron 场景通过**：真实窗口最小化 / 隐藏、2,000 History 的有界 DOM 与滚动锚、跨 Project 注意力 / 关闭计数 / Stop 隔离；另有 **5 项独立窄测通过**，覆盖真实 SQLite 重开 2,000 摘要 / 1,202 消息、IPC 竞态、关闭超时及迟到秘密答复。主 Agent 用 agent-browser 查看秘密卡片和 1024×640 小窗布局。
- 完整 Electron 门禁 **19 / 19 通过**；各次缺陷的修前 / 修后日志保留在 [Session 验收](../T20261009-session-slice/acceptance.md)。测试均使用模拟 Provider，不消耗模型额度；原生 SQLite / PTY / 环境冒烟仍执行真实本机能力。
