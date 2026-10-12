# 工程工具参考与验证边界

调研日期：2026-10-10；四项工具补充调研于 2026-10-12。对应 FR-TOOL-001～004、04 第 1 节第 13 项。产品与技术选择以 [DEC-08～10](<../../docs/07. Decisions.md>) 及负责需求为准；本文记录公开资料，不代表本项目实现验证通过。

## 1. ChatGPT Desktop 公开行为

| 主题 | 官方资料确认的内容 | 来源 |
|---|---|---|
| 审阅范围 | Git 审阅包含用户及其他工具产生的修改；提供独立的 Last turn 范围 | [Code review](https://learn.chatgpt.com/docs/code-review) |
| 非 Git 项目 | 审阅面板要求项目位于 Git 仓库，非 Git 时提示创建仓库 | 同上 |
| Terminal 入口 | 每个 Chat 的终端绑定当前 Project 或 worktree，从 New tab → Terminal 打开 | [Integrated terminal](https://learn.chatgpt.com/docs/integrated-terminal) |
| Terminal 展示 | 可配置 Terminal Tabs 的默认打开位置 | [Developer settings](https://learn.chatgpt.com/docs/developer-settings) |

这些文档没有给出桌面端 Last turn 的完整内部算法、同一 Chat 的终端实例上限或完整进程生命周期。我们选择 Project 归属的多终端，是结合本产品工具面板作出的设计取舍，不能写成 ChatGPT Desktop 内部实现事实。

## 2. 原生接口依据

[Codex App Server](https://learn.chatgpt.com/docs/app-server) 的 Events 章节公开了：

- `turn/diff/updated`：携带 `threadId`、`turnId`、本轮最新聚合 unified diff。
- `fileChange`：携带文件路径、类型、Diff 和状态；完成事件可区分成功、失败与拒绝。

因此本项目有优先复用原生轮次数据的接口依据，而非只能比较轮前、轮后的 Git 状态。本次仓库搜索未找到 `turn/diff/updated` 的现有接入，不能把在线文档的能力等同于锁定版本已经支持或本地 Adapter 已经实现。

## 3. 实现前验证

以下项目由 04 第 1 节第 13 项负责登记，在工具实现时补充证据：

- 锁定版本的事件是否实际提供数据；多次聚合更新、完成状态与 Thread / Turn 关联是否正确。
- Shell 脚本、外部工具修改是否被原生记录覆盖；无记录不能推断成没有修改。
- Claude Code 是否提供同等粒度的数据；本次未验证其接口，不能承诺与 Codex 相同。
- 非 Git 目录是否仍可取得和展示原生轮次补丁；此项与项目级 Git 基线分开验证。
- 保存的轮次补丁能否在重启后恢复，以及后续工作区修改是否不影响历史查看。

无可用原生数据时使用 FR-TOOL-002 的降级行为；不借用 Project Diff 伪造本轮结果。本次未调用真实模型、未执行应用测试。

## 4. 四项工具补充调研（2026-10-12）

### 4.1 ChatGPT Desktop 与 Claude Desktop

ChatGPT 的 [Browser 官方文档](https://learn.chatgpt.com/docs/browser) 说明用户与 Agent 可以共享本地网页视图，并通过页面标注回到对话；内嵌 Browser 的 profile 与日常浏览器分离。[本地环境文档](https://learn.chatgpt.com/docs/environments/local-environment) 描述当前 checkout 的 Diff 和行内评论、Git 操作。与本项目有关的实现启发是“共享页面、单独控制权限”和“明确 Diff 所属工作区”，内部嵌入组件与历史 Diff 算法仍未公开。

[Claude Desktop Code 文档](https://code.claude.com/docs/en/desktop) 公开了会话中的文件、Diff、Browser 和多终端面板；Diff 使用文件列表和单文件内容，可批量提交逐行评论；Browser 可通过 `.claude/launch.json` 配置开发服务器并自动验证页面。文件编辑器在磁盘内容变化时提供冲突反馈。其工具按 Session 组织、自动打开预览等行为与本项目 Project 级资源及用户主动控制不同，不能照搬。

### 4.2 开源源码与组件

| 参考 | 本轮确认的实现方式 | 本项目采用 / 验证边界 |
|---|---|---|
| [VS Code ExplorerService](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/explorerService.ts) | ExplorerModel 持有树状态；文件事件通过 scheduler 合并后刷新受影响内容，聚焦补扫 | 采用惰性加载与事件刷新；展开 / 选择状态独立于刷新 |
| [GitHub Desktop diff.ts](https://github.com/desktop/desktop/blob/development/app/src/lib/git/diff.ts) | 已跟踪文件比较 HEAD；新增 / 未跟踪文件使用 `--no-index` 与空文件比较，差异退出码 1 可为成功；关闭外部 diff 和颜色，使用机器格式 | 项目 Diff 必须另行发现未跟踪文件。该实现重命名分支有 index 基线限制，不能整段照搬；本项目仍须遵守 HEAD 最终差异 |
| [Void 代码指南](https://github.com/voideditor/void/blob/main/VOID_CODEBASE_GUIDE.md) | URI 对应 text model；DiffZone / DiffArea 支持编辑期间刷新和取消 | 可参考显示模型；本项目外部 CLI 原生 patch 不等同客户端自己掌握完整编辑历史。仓库已归档，作为历史参考 |
| [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)、[webview 提示](https://www.electronjs.org/docs/latest/api/webview-tag) | 主进程持有独立 webContents / bounds；官方建议新实现考虑 WebContentsView 等替代 `<webview>` | 保留已选 WebContentsView；实例、权限和布局由主进程管理 |
| [Wave Terminal](https://github.com/wavetermdev/waveterm) | tree API 确认终端封装、controller、shell 执行和 WebView 的代码入口 | 原始文件抓取超时，未完成实现核查；不作为进程 / 输出恢复正确性的证据 |

开源项目代码复用仍需逐项核对许可证。上表描述源码 / 文档线索，不表示依赖已接入或本地能力已通过验证。

## 5. 本项目采用与确认

用户于 2026-10-12 回复「accept above suggetions, update all related docs」，接受保留工具技术栈、文件树惰性加载与文件刷新、资源独立于面板、历史 Diff 不使用当前文件伪造原文等建议。采用原则由 [DEC-10](<../../docs/07. Decisions.md#dec-10-工程工具实现原则>) 记录，具体行为归 [工具规格](../../specs/tools/spec.md)，不在调研记录重复维护需求。

规格定稿仍需处理 Browser 扩展范围；原生 patch 覆盖、Monaco 历史显示、PTY 输出恢复和 WebContentsView 隔离必须验证。仅有历史 patch 时直接展示保存补丁；PTY 与屏幕状态由服务持有并可重新附着；这两项是本轮建议特别要求避免的数据失真和生命周期缺口。
