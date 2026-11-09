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
- `8be4dbd` 已快进到主 checkout 并普通推送；已清理 5 个额外 worktree 和 6 个本地任务分支，仅保留 main，远端也仅 main，无 stash。备份清单核对确认待删 worktree 在备份后未发生新改动，再恢复 / 移除其已保留的文件；未强制删除脏 worktree。
- 首轮 [CI](https://github.com/Cupcc/AI-Studio/actions/runs/42557516895) 文档检查、Adapter 287 项、桌面 50 文件 764 项通过；Electron 48 / 53 通过，5 项失败。本轮不将该 CI 报为通过。
- 待完成：焦点与测试接缝修复的正式提交、推送及该版本 CI，然后关闭本次 Git 集成记录。

## 文档同步复核

已按主题、编号及引用核对 UX、路线图的下一步 / 整体 / 模块 / 阶段 / 验收、决定记录、技术要求、Adapter / Settings / Chat spec、桌面 README 与相关任务。保留 Todos 的 DEC-26，将较新的 CLI 决定改为 DEC-27；保留工程工具 §3.13，将连接覆盖改为 §3.14，更新对应引用。当前双 CLI Provider 注册与历史发布排除分别记录；旧包、旧验收与研究时点的证据不改写。

Files 仍缺 AI 交互检查，CLI 安装 / 连接仍缺 GUI、真实网关和打包等验证，附件人工验收仍待完成；各负责记录保持原状态。Todo 仅规划交付，不启动实现。新提交不代表这些功能已全部验收。

## CI 失败修复与界面复核

主 Agent 根据首轮 CI 的失败调用与页面快照定位：Conversation 的起步示例和回到最新仍查找旧 textarea，导致焦点未恢复；改为查找当前共享编辑器。另两项 CLI 测试仍断言已经删除的常驻反馈和 textarea 的 placeholder 属性，改为核对可用行的选中态与当前编辑器的 data-placeholder；文件候选测试先用 End 明确把光标放到现有原子引用后，再追加第二个查询，保留两引用与实际发送断言。

- 5 项失败场景本机定向复测全部通过，见[日志](evidence/W0-failed-scenarios-retest.log)。最终焦点选择器同时覆盖 textbox / combobox 形态；重建后再次运行两主题起步示例和回到最新，3 项通过，见[最终焦点日志](evidence/W0-final-focus-retest.log)。现有失败 E2E 是修复前证据，未放宽焦点要求。
- Main Agent 使用 agent-browser 操作最终构建的实际 Electron 应用，隔离临时 userData / Project、模拟 Provider，仅替换原生目录选择器。打开 Project → New Chat → 了解项目，正文填入且消息编辑器获得焦点；接着从 @ 选择 src/app.ts、用 End 追加 @source、进入带空格目录并选择第二文件，两个标签完整；设置 → CLI → Claude Code 后选中态正确。查看了[焦点截图](evidence/W0-starter-focus.png)、[双引用截图](evidence/W0-two-references.png)和[CLI 选中截图](evidence/W0-cli-selection.png)。没有调用模型，也不据此补记 CLI 安装、网关、文件查看列或其他功能的完整验收。
- 文档影响仅为本任务的实际 Git / 验证状态；Input、Session、UX 对既有焦点行为的要求未改变。负责规格、路线图与人工验收状态保持原边界。
