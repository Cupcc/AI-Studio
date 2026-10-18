# 结论：T20261009-project-shell

## 当前收尾（2026-10-19）

Main Agent 已逐项核对本任务完成条件并整体归档，当前范围与保留项见[任务收尾](task.md#当前收尾2026-10-19)及[最终总报告](../T20261009-v1-foundation-slice/report.md)。当前 Codex 独立技术复核、完整 Electron 49/49、基础门禁和最终包 / open 冒烟已通过；以下早期“verifying / 待补验”按其历史基线解读，不改变 Claude 后续、新增体验人工验收或草稿审阅状态。

## 需要回写的内容

| 目标文档 | 内容 | 状态 |
|---|---|---|
| [Project spec](../../../specs/project/spec.md) §4.4、§5 | SQLite 表、串行状态保存、Main / Renderer SessionPort、默认 CLI 初始化及关闭 Runtime 释放 | 已回写草稿，待审阅 |
| Project spec §3.3.1 / PROJ-Q11～12 | 草稿归 chat 独立存储；Tab 返回的滚动规则引用 Session §3.2，消除原草稿冲突 | 已回写推荐，未改为确认 |
| [desktop README](../../../apps/desktop/README.md) | 模块接线、开发 / E2E 命令、退出顺序 | 已回写 |

## 遗留问题

- Project View Preview、View Conversation 与 Files / Diff / Browser / Terminal 的内容实现属于后续任务。
- PROJ / NAV 非阻塞推荐与临时视觉 Token 仍待确认；本次截图验证不构成设计签收。
- 当前运行平台为 macOS；其他平台、目录运行中卸载 / 移动、异常宿主退出、TCC 隐私弹窗不在本次证据内。

## 结论

Project 壳层已集成至 `dev/v1`：目录身份与最近列表、多 Tab、Project / 窗口状态保存恢复、导航 / 边栏容器、可信关闭与退出流程可用。独立验收与六种窗口布局截图见 [acceptance.md](acceptance.md)。现有功能人工体验已于 2026-10-18 验收通过，范围见[总体验收](../T20261009-v1-foundation-slice/acceptance.md#人工功能验收)；任务保持 `verifying`，待 AI 核对技术收尾条件。

历史壳层验收的 9 项 Electron 场景使用 Session 接口替身；随后 Session 切片接入真实 IPC / SQLite 与模拟 Provider，补充关闭 Running / idle Project 后重开、原生会话 ID 与草稿保留、并行 Stop 和注意力验证，结果见 [Session 验收](../T20261009-session-slice/acceptance.md)。两阶段证据分别保留，不把旧占位验证表述为真实 Provider 验证。
