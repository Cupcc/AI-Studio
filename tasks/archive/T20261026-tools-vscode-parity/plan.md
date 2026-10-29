# 工程工具续推计划

依据 [task](task.md) 与用户 2026-10-27「没完成的worktrees 继续推进」。从 997bce7 恢复，不合入 main。

| Agent | 职责 | 写入范围 | 状态 |
|---|---|---|---|
| Main | Git 状态无障碍名称、审查缺陷修复、§5.4 与相关文档同步、收尾 | 本 worktree 源码 / 规格 / task / plan；不写独立 acceptance | 完成 |
| W5 code_todos | 独立代码 / 安全审查、交互验收与回归 | 仅本任务 acceptance.md 与 evidence/W5-*；源码只读；串行窗口操作 | 首轮检查及缺陷报告完成，最终复验由 W7 接续 |
| W8 claude_diagnose | 最终文档语义交叉复核 | 本 worktree 文档只读，结论回传 Main | 完成；三处摘要遗漏由 Main / W7 修正 |

## 进度

- 2026-10-28：继续原 worktree。W7 tools_verify 接手独立最终验收（源码只读，写 acceptance.md 与 evidence/W7-*），优先完成最终包冒烟、Terminal 交互、受影响 Electron 回归及六项缺陷复验；Main 负责文档和收尾。W7 独占本轮原生窗口操作。

- 2026-10-27：确认既有第 1～3 步代码已提交；补 Git 状态无障碍名称后进行独立验收。原生菜单使用可用原生自动化补充，无法执行则明确未覆盖。

- 2026-10-27：Main 完成 W5 五类缺陷修复，补原子排他文件发布与固定目录身份的 ripgrep launcher；全量基础检查 36 / 257 / 1288 通过。W5 已完成初轮 Files / Search / Diff / Browser 与原生菜单走查、183 项最终相关测试和最终包构建；等待串行窗口完成 Terminal / 回归 / 包冒烟。
- 2026-10-28：W7 完成独立最终复验（126 单测 / 15 Electron / 当前包 smoke）、Terminal 路径交互、外部打开 / 外站与原生废纸篓验证，六项缺陷均关闭。Main 完成文档语义复核与任务收尾，归档但不合入 main；人工功能验收仍待进行。

- 2026-10-29：用户明确「验收通过，合入main」。Main 记录原始 `e5cc05d` 的人工接受，按 CLI → Claude → Tools 顺序整理；仅 docs/05 / docs/06 文本冲突，保留 Search 与 CLI 的 FR/AC 映射、三项人工结论及 DEC-19。Main 执行最终基础门禁、完整模拟 Electron、重建 arm64 包 / 冒烟并检查 main CI；W8 `claude_diagnose` 做合入内容与最终文档只读复核，写入范围为空，不操作应用。

## 2026-10-29 main 组合验证

- 三个目标分别压成 `c40b2e2`（CLI）、`4bb62b6`（Claude）、`c39fa1b`（Tools），已按该顺序快进合入本地 main；未产生 merge commit。人工确认由各自 acceptance 负责，原始远端任务分支保留历史证据基线。
- W8 只读核对 679 个非 README 的 apps / packages 文件，最终 mode / blob 与旧 Claude（含 CLI）及 Tools 相对 `28a3e8a` 的叠加完全一致，0 遗漏；lockfile 与原 Tools tip 一致。仅 AC / 路线图有文本冲突，合并结果已核对；桌面 README 同时保留开发开关与原生 helper 构建说明。
- 组合后的正常提交门禁：类型检查、脚本 36 / Adapter 286 / Desktop 1311 项通过。主 checkout 冻结 lockfile 安装后 build 成功，完整 Electron 初轮为 64 / 66，见[原始运行](evidence/W0-main-merge-e2e.log)。
- 初轮安全隔离测试仅因精确 preload namespace 清单遗漏新 `menu` / `search` 失败；Main 补上这两个已授权的 typed namespace，保留 Node / require / raw IPC / CSP 与完整键清单断言，生产代码不改。另一项 Composer reset 点击时工作区切到新 launcher 而超时，原因未归因；相同测试源码原样定向复跑成功，不将一次通过写成已找到根因。两项最终定向 2 / 2 通过，见[复验](evidence/W0-main-merge-e2e-recheck.log)；不把此结果记为本机完整套件 66 / 66。
- 同一生产构建重新生成未签名 arm64 包；带 `STUDIO_ENABLE_CLAUDE_CODE=1` 的打包 smoke PASS，包含 ripgrep、filesRename、SQLite、PTY、Renderer 与 preload；见[报告](evidence/W0-main-merge-packaged-smoke.json)。smoke 使用空 Provider 集，不代替打包菜单 UI；该入口的既有 W7 独立 UI 与最终未变的打包门槛源码仍为依据，不重复模型调用。
- 最终文档复核：三份 task / acceptance / plan、路线图下一步 / 整体 / 模块 / 阶段 / AC、AC-07 Search 与 AC-08 CLI 映射、README 的开发和包装说明均保留；只更新三任务本次人工接受，其他历史 UI / 本轮 Diff / 附件待验与发布边界沿用原记录。远端 main CI 将在推送后独立执行完整组合门禁。
