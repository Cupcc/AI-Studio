---
id: T20261109-main-integration
status: verifying
fr: []
ac: []
specs: []
created: 2026-11-09
---

# 全部工作区线性集成与清理

## 授权与范围

用户 2026-11-09 请求“commit all and clean and linear main, push”，并明确选择“全部整合，并清理所有 worktree/本地任务分支”。按贡献指南完成普通提交、快进合入和普通推送；保留已发布历史，不新增 merge commit。此次为 Git 集成，不新增产品范围，不将待验功能标为已验收。

覆盖主 checkout、task/1、feat/cli-install、feat/composer-inline、feat/files-input-integration 及已无独有提交的 chore/scoped-checks。Main Agent 负责，无并行 worker。

## 进度与证据

- 基线 main / origin/main 为 `9846eea`。各工作区 patch、index patch、变更文件与清单已备份到主目录 `.runtime/git-consolidation-20261109/`；提交日志也在同目录，仅为本机恢复输出。
- 在独立 chore/main-integration worktree 安装冻结依赖及 hooks；按目标保留 Browser 测试等待、Files 查看列、附件、设置文案、Todos 规划和 CLI 安装 / 连接配置。
- Files `9675e64`：Renderer 类型检查与 42 文件 613 项测试通过。
- 附件 `075f524`：受影响类型检查、Adapter 19 文件 287 项、桌面 23 文件 371 项通过；纳入 Files worktree 独有的 7 份 Electron E2E 适配。
- 设置 `bc8a67f`：受影响类型检查与 6 文件 47 项测试通过。
- CLI `ce94716`：受影响类型检查、Adapter 19 文件 287 项与桌面 23 文件 305 项通过。合并同时保留附件 IPC / 缓存生命周期与设置文案减法。
- 原生 fs.watch 探针已恢复；旧 EMFILE / DNS 记录保留原日期。未重复全量测试，未绕过 hook。一次 Files commit-msg 因正文超长拒绝后，缩短说明并通过正常门禁。
- 待完成：最终文档链接 / 语义复核、main 快进与推送、该版本 CI，以及已保留改动的 worktree / 本地任务分支清理。

## 文档同步复核

已按主题、编号及引用核对 UX、路线图的下一步 / 整体 / 模块 / 阶段 / 验收、决定记录、技术要求、Adapter / Settings / Chat spec、桌面 README 与相关任务。保留 Todos 的 DEC-26，将较新的 CLI 决定改为 DEC-27；保留工程工具 §3.13，将连接覆盖改为 §3.14，更新对应引用。当前双 CLI Provider 注册与历史发布排除分别记录；旧包、旧验收与研究时点的证据不改写。

Files 仍缺 AI 交互检查，CLI 安装 / 连接仍缺 GUI、真实网关和打包等验证，附件人工验收仍待完成；各负责记录保持原状态。Todo 仅规划交付，不启动实现。新提交不代表这些功能已全部验收。
