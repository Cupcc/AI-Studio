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

以下保留另一工作线的同期详细调研；其中“建议”是调研时的状态，当前采用结论见上节与工具规格。

## 6. 本轮补充：桌面产品的工具组合方式（2026-10-12）

### 6.1 ChatGPT Desktop / Codex

官方资料显示，ChatGPT Desktop 把工程工具绑定到当前 Project 或 worktree，而不是绑定到某一次命令：每个 Chat 都有一个 scoped terminal，可读终端输出并用于启动开发服务器、测试和 Git 操作（[Integrated terminal](https://learn.chatgpt.com/docs/integrated-terminal)）。本地环境的 Diff pane 读取当前 checkout，支持行内评论，并提供按 chunk / 文件的 stage、revert、commit、push 和 PR 入口（[Local environments](https://learn.chatgpt.com/docs/environments/local-environment)）。

Browser 使用与用户日常浏览器分离的 profile；用户和 ChatGPT 共享页面视图，可以打开 localhost、检查 DOM、截图并添加页面标注，然后把标注带回对话（[Browser](https://learn.chatgpt.com/docs/browser)）。由此可借鉴“共享可见页面、分别控制自动化权限”的交互，但官方资料不能证明其桌面内部使用了哪种嵌入组件。

官方 MCP 文档还确认 ChatGPT Desktop、Codex CLI 和 IDE 扩展可以共享 Codex host 的 MCP 配置，支持本地 STDIO 与远端 Streamable HTTP（[MCP](https://learn.chatgpt.com/docs/extend/mcp)）。MCP 是外部能力扩展层，不应与本项目右侧的 Files / Diff / Browser / Terminal 内容面板混成一个状态对象。

### 6.2 Claude Desktop / Claude Code

Claude Code Desktop 将每个会话建模为独立 session：拥有自己的历史和 project folder，多个 session 可以并行；同一 session 内可排列 chat、diff、browser、terminal、file editor 等 pane（[Desktop application](https://code.claude.com/docs/en/desktop)）。其 session 中心组织方式与本项目 Project 级共享工具不同，不应照搬生命周期，也不能据此推断 Claude 的内部进程实现。

公开文档中的 Browser pane 具备几个值得借鉴的边界：开发服务器由项目配置（`.claude/launch.json`）描述，可从 pane 统一启动 / 停止；预览使用独立浏览器 profile，并可选择是否持久化 cookies；Agent 的自动验证包含截图、DOM 检查和交互（同一 [Desktop application](https://code.claude.com/docs/en/desktop) 文档）。Diff viewer 是“左侧文件列表 + 右侧变更内容”，支持逐行评论，评论批量回传给当前 session。

Claude 的文件编辑器在磁盘内容发生变化时先警告并允许覆盖或丢弃（同一官方文档）。本项目可借鉴文件变化反馈，但不据此新增文件编辑功能。Claude 自动启动预览和自动验证也不改变本项目“Agent 不自行展开或切换工具”的要求。

## 7. 开源实现参考

### 7.1 VS Code / Void：文件模型、树刷新与流式 Diff

VS Code 的 Explorer 不是一次性 `readdir`：`ExplorerService` 持有 `ExplorerModel`，监听文件服务事件并用 scheduler 合并变更，再按受影响的根节点刷新（[explorerService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/files/browser/explorerService.ts)）。本项目 Files 应采用同样的“惰性展开 + 受影响节点刷新”模型，而不是每次切换工具重扫整个 Project。

Void 的公开代码说明其编辑状态以 URI 对应的 text model 为中心，Diff 由 `DiffZone` / `DiffArea` 维护；Agent 流式修改期间持续刷新红绿区域，取消令牌与区域绑定（[Void Codebase Guide](https://github.com/voideditor/void/blob/main/VOID_CODEBASE_GUIDE.md)）。这属于编辑器掌控修改时的设计，不适合直接替代本项目消费外部 CLI 补丁的模式；仅参考展示层。当前仓库已归档，不作为活跃依赖选型。

### 7.2 Wave Terminal：后续源码入口

通过仓库 tree API 确认了 [终端控制器](https://github.com/wavetermdev/waveterm/tree/main/pkg/blockcontroller)、[shell 执行](https://github.com/wavetermdev/waveterm/tree/main/pkg/shellexec)、[终端封装](https://github.com/wavetermdev/waveterm/blob/main/frontend/app/view/term/termwrap.ts)和 [WebView UI](https://github.com/wavetermdev/waveterm/tree/main/frontend/app/view/webview) 的代码入口。原始文件获取超时，本轮没有完成实现核查，因此不对其 Browser 承载方式、进程隔离和输出恢复作确定性结论。

### 7.3 GitHub Desktop：项目 Diff 的具体实现

已读取 [`getWorkingDirectoryDiff`](https://github.com/desktop/desktop/blob/development/app/src/lib/git/diff.ts)：普通已跟踪文件相对 `HEAD` 比较；新增 / 未跟踪文件使用 `--no-index` 与空文件比较，并将退出码 1 视为发现差异而非错误；参数包括 `--no-ext-diff`、`--no-color` 和 `-z`。这与本项目只读项目 Diff 较接近，但不能整段照搬：其重命名分支明确注释了相对 index 比较会漏掉已暂存修改的限制，本项目必须独立满足 FR-TOOL-002 的 HEAD 基线要求。另需覆盖未创建首个提交、二进制、大文件及文件读取期间发生变化的情况。

### 7.4 Electron 承载 Browser 的选择

当前 Electron 文档建议不要继续使用 `<webview>`，优先考虑 `WebContentsView` 或避免嵌入内容（[WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)、[webview tag warning](https://www.electronjs.org/docs/latest/api/webview-tag)）。`WebContentsView` 运行在主进程，可将 `webContents` 加到窗口并单独设定 bounds；因此本项目 Browser 应由主进程持有实例，通过最小化、类型化 IPC 传递导航 / 刷新 / 尺寸 / 状态，而不是让 Renderer 直接获得嵌入页权限。

## 8. 对本项目的落地结论（建议，不改变已确认产品范围）

1. **共享 Project 资源，分离 Session 资源**：按现有 FR，Files、Project Diff、Browser 状态、Terminal Tabs 归 Project；本轮 Diff 按 Session / Turn 关联。切换 Session 不杀 Terminal，不把另一 Session 的变更归因到当前轮。Browser profile 分区方案仍需在 spec 明确，独立 dev-server 管理器不是本轮新增需求。
2. **工具均通过主进程服务实现**：Files 使用受控 `fs` + 文件事件；Diff 使用 Git CLI 只读查询和 Adapter 原生轮次补丁；Terminal 使用独立 `node-pty`；Browser 使用 `WebContentsView`。Renderer 只消费快照和事件。
3. **资源生命周期不依赖面板挂载**：界面可以卸载，PTY 及其输出仍由独立服务持有；每种工具按自身需要设计加载、错误和释放状态。右侧面板的 `lastTool` 只保存选择，不保存进程、Browser 或大型内容。
4. **Browser 先完成已要求的 localhost 预览**：独立渲染上下文、禁用 Node、不注入应用 IPC；导航、新窗口、权限和下载分别处理。外站范围、登录持久化和自动化操作如涉及产品或安全取舍，由人确认，不能以参考竞品为由默认开放或限制。
5. **Terminal 生命周期必须独立**：Tab 关闭按现有确认处理；收起面板不确认、不终止；Project 关闭 / 应用退出的清理仅针对应用可确认归属的 PTY 及进程，并遵循 04 第 5 节的责任边界。Session Stop 不得影响用户 Terminal。
6. **Diff 明确“来源”和“时间点”**：Project Diff 是工作区相对当前 Git HEAD 的差异；本轮 Diff 是保存的原生轮次补丁。来源不可用时显示不可用，不显示“0”；Codex 聚合更新按 Thread / Turn 替换，不能重复累加。Monaco 的双文本 Diff 需要完整两侧内容；只有历史 patch 时不能用当前工作区伪造历史原文，应保留 patch 展示或不可用降级。
7. **Files 先只读**：目录惰性加载、文件变化事件刷新、路径规范化和 Project 根目录边界检查先落地；“添加到对话”只传路径 / 受控摘要，不让 Renderer 自行读任意绝对路径。

以上结论是实现建议；尚未代表本项目代码已经实现，也未替代 AC-07 的应用交互验收。Claude Desktop 和 ChatGPT Desktop 的内部实现仍不可见，只引用其公开行为。

未决问题：Browser 外站范围、权限和 profile 持久化由人决定，阻塞相应行为的规格定稿，不阻塞本次调研；历史 patch 的显示方式、PTY 输出恢复与关闭清理由 AI 在既有范围内设计并验证。未启动工具实现任务、未发送真实模型请求。
