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

Browser 首轮范围已按 2026-10-13 的 DEC-14 处理，扩展另行评估；原生 patch 覆盖、Monaco 历史显示、PTY 输出恢复和 WebContentsView 隔离仍必须验证。仅有历史 patch 时直接展示保存补丁；PTY 与屏幕状态由服务持有并可重新附着；这两项是建议中特别要求避免的数据失真和生命周期缺口。

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

本节调研时的 Browser 未决范围已于 2026-10-13 按工具规格 Q1、Q5、Q6 分别处理，当前依据见 DEC-14；历史建议不作为新的待确认入口。历史 patch、PTY 屏幕恢复与关闭接口仍待实现验证。

## 9. 开发准备审阅（2026-10-13）

只读代码基线 4de166a。用户随后回复「accept all, not dev, update all docs」，采用结论归 DEC-14、FR 与模块规格；本节保留观察和资料来源，不代表运行验证。

| 观察 | 本地依据 | 影响 |
|---|---|---|
| 文件标签尚未转交 Provider | session-service.ts 的普通发送及运行中追加只构造 text；Codex mapping.ts 有 mention 映射，Claude provider.ts 对附件前置返回 unsupported | Files / Input / Session / Adapter 必须一并贯通，不能用标签显示作为验收 |
| 轮次补丁未贯通 | Codex mapping.ts 的 fileChange 仅保留路径和类型；driver.ts 未接入 turn/diff/updated | 先准备原生事件、存储关联及缺失语义 |
| 关闭只统计 Session | project/close-flow.ts 查询 Running / Needs Input，无用户 Terminal 计数 | 补齐终端确认和独立资源清理 |
| PTY 只有基础冒烟 | main/services/pty/pty-smoke.ts | 不代表产品终端屏幕恢复、多实例或退出通过 |
| agent-browser 不在本次 PATH | 执行 skills get core 返回 command not found | 正式 UI 验收前核对安装与 PATH；本次以网页读取核对官方资料 |

核对的官方资料：

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)：turn/diff/updated 提供最新聚合 unified diff，fileChange 提供路径 / 类型 / patch；文档能力不代表锁定本地版本已验证。
- [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view) 与 [安全指南](https://www.electronjs.org/docs/latest/tutorial/security)：保持独立渲染上下文，并显式管理导航及权限；不通过关闭 webSecurity 解决预览问题。
- [Electron session](https://www.electronjs.org/docs/latest/api/session)：分区可与应用主页面分离；采用内存分区、地址另行保存的设计仍需实际验证。
- [xterm.js flow control](https://xtermjs.org/docs/guides/flowcontrol/)：需要输出流量控制及消费确认；文本缓存不能单独证明屏幕恢复正确。

本轮未修改应用、未执行真实 CLI / PTY / Browser 功能测试，未取得新的额度或模型预算。未来场景由 task.md 维护。

## 阶段 1 实现设计（Files + 项目 Diff + 文件引用链路，2026-10-14）

来源：只读规划 agent 对本仓库代码与规格的核对，由 Main Agent 整理；技术方案为 AI 决定，待实现验证，不是人工产品确认。路径相对 `apps/desktop/`，除非以 `packages/`、`specs/`、`tasks/` 开头。共享契约已在 `src/shared/tools/{files,diff}.ts` 与 `src/shared/ipc/{files,diff}.ts`，实现必须以它们为准，需要变更契约先报告主 Agent。

### 已核实的代码事实

- `Tools.tsx` 对 `files` / `diff` 仍渲染占位。每个 Project 的 `Workspace` 常驻挂载（隐藏时 `hidden`），工具面板在切换工具时卸载；所以面板必须像 Terminal 一样使用按 Project 键控的 store，并以 `active` 门控 IPC / 订阅 / Monaco。
- `shared/ipc/contracts.ts` 登记契约，`main/ipc/index.ts` `createFeatures` 登记处理器；契约没有处理器会在启动时抛错，所以登记只在集成时做。`main/ipc/index.ts` 还把 terminal / browser 组合为 `MainToolPort`。
- `main/services/project-view/project-view-service.ts` 有同步的安全读取（逐级 `lstat`、`O_NOFOLLOW`、`fstat`、有界缓冲、`fs.watch recursive` 加防抖）；Files 需要异步版本。
- 发送路径：`session-service.ts` 的 `begin()` 持久化用户消息及 `contextItems`，`start()` 以 `runtime.sendUserInput({ text })` 发送，文件引用从未交付；运行中追加 `sendWhileRunning` 同样只发 `{ text }`；`retry()` 重新调用 `send(JSON.parse(turn.message))`；`replyWithText`（Needs Input）忽略 `contextItems`，之后渲染端清空标签，是既有的静默丢弃。
- `main/ipc/session.ts` 的 `context()` 接受任意 `{type:'file', path}` 字符串（≤ 8192），未拒绝绝对路径或 `..`。Composer 中“从 Files 添加文件”为禁用项。
- Adapter：Codex 把 `file` 附件映射为 `{type:'mention', name, path}`（`packages/agent-adapter/src/codex/mapping.ts`，`mention` 语义未在仓库内文档化）；Claude 对任何附件抛 `unsupported`，且 `inputWhileRunning: 'none'`。`FakeProvider` 记录 `startTurn` / `steerTurn` 的完整输入。
- 生产 CSP：`script-src 'self'`、`style-src-elem` / `style-src-attr` 允许内联、`font-src 'self'`、`img-src 'self' data:`、`worker-src 'none'`。
- E2E 约定：`tsconfig.e2e.json` 只含 `e2e/**`、`src/shared/**`，E2E 不能引用 `src/main/**`；用桩替换 `dialog.showOpenDialog` 打开 Project，`STUDIO_E2E_PROVIDERS=1`；Terminal E2E 使用无插件、无历史的 `zsh -f`。本机 Git 为 Apple Git 2.39.2。

### 主进程服务

Files（`src/main/services/files/**`，`src/main/ipc/files.ts`；工厂 `filesFor(core)` 仿 `terminalFor`）

- `safe-path.ts`：先 `parseProjectPath`；根校验 `realpath.native(root) === canonicalPath` 否则 `project_unavailable`；逐级 `lstat`，中间符号链接即 `symlink_refused`；末级符号链接对读取 / 引用拒绝、列表中标为 `symlink`；名为 `.git` 的目录或工作树文件为 `excluded` 且不列出；以 `O_RDONLY|O_NOFOLLOW|O_NONBLOCK`（darwin 另加 `O_NOFOLLOW_ANY`，须由 SP2 验证其值与效果）打开并拼在规范根上；打开后 `fstat` 须为普通文件，再 `lstat` 比对 dev / ino，读后再次核对；`EACCES` / `EPERM` → `permission_denied`，其他 → `unreadable`。
- `list.ts`：`fs.promises.opendir`，读到 `listEntries + 1` 即停并标 `truncated`；目录在前，其后按本地化数字序；以 NFC 规范化键去重与查找；符号链接只 `readlink`，不 `stat` 目标。
- `read.ts`：`readBytes` 上限，经 fd 读取；前 8000 字节含 NUL 即 `binary`；BOM：UTF-8 BOM 去除，UTF-16 LE/BE 解码；严格 `TextDecoder('utf-8',{fatal:true})`，失败为 `unsupported_encoding`，不猜测 GBK / Latin-1；换行检测；`version = dev:ino:size:mtimeNs`，`ifVersion` 匹配返回 `unchanged`；读前读后 `fstat` 不一致重试两次后 `changed_while_reading`；超限 `too_large` 带 `size`。
- `watcher.ts`：每个有订阅的 Project 一个 `fs.watch(root,{recursive:true,persistent:false})`；回调内先过滤 `.git` 与 `node_modules/*/**`（`FILES_WATCH_IGNORED`），收集父目录集合，150 ms 尾部防抖、最长 1000 ms，超过 256 个目录 `overflow:true`，两次 overflow 至少间隔 1 s，`filename` 为空即 overflow；`error` → `watch:'degraded'`（手动刷新与窗口聚焦刷新仍可用）；订阅按 (senderId, subscriptionId) 计数，最后退订后 30 s 宽限再关闭；`detachOwner(senderId)` 清理发送方订阅，借助 `webContents.fromId` 的 `destroyed` / `render-process-gone` 实现渲染进程崩溃清理；最多 4 个活动 watcher。
- `references.ts`：实现 `FileReferenceResolver`：≤ 20 个并去重；每个必须是普通文件、非符号链接、非 `.git`、`isReferenceablePath`、可打开读取；二进制与大文件允许（引用不是内容快照）。
- 生命周期：`closeProject(projectId)` 置关闭标志、关闭 watcher、丢弃订阅并广播 `watchChanged:'stopped'`（幂等；Project 关闭取消后渲染端可重新订阅）；`closeAll()` / `dispose()` 同理。IPC 解析用 `expectRecord` + `expectOnlyKeys`，`projectId` ≤ 100，路径经 `parseProjectPath` 转为 `IpcValidationError`，`paths` 为 1..20 的数组，`ifVersion` ≤ 200。

Diff（`src/main/services/diff/**`，`src/main/ipc/diff.ts`；工厂 `diffFor(core)`）

- Git 运行器：`spawn(gitPath, args, {cwd: 项目根, stdio: ['ignore','pipe','pipe'], detached: true})`，超时 / 取消时对进程组 SIGTERM，1 s 后 SIGKILL 并等待 `close`；只用参数数组，用户路径永远在 `--` 之后并设 `GIT_LITERAL_PATHSPECS=1`；环境取登录环境，删去全部 `GIT_*`，显式设 `GIT_OPTIONAL_LOCKS=0`、`GIT_TERMINAL_PROMPT=0`、`GIT_PAGER=cat`、`PAGER=cat`、`LC_ALL=C`、`GIT_LITERAL_PATHSPECS=1`（防止外部 `GIT_DIR` / `GIT_WORK_TREE` 改道）；全局参数 `--no-optional-locks -c core.fsmonitor=false -c core.quotepath=false -c color.ui=false -c diff.external= -c core.pager=cat`；diff 参数 `--no-ext-diff --no-textconv --no-color -M`；每次调用有 `maxBytes`，超出即终止并标 `truncated`；超时 15 s（列表）/ 10 s（单文件）；每 Project 2 个、全局 4 个并发 git 进程。
- Git 查找：`findExecutable('git', loginEnv.PATH)`（`shell-env/executables.ts`）；结果为 `/usr/bin/git` 且 `xcode-select -p` 失败时在执行前返回 `git_missing`，避免触发 macOS 命令行工具安装弹窗（SP3 验证）；`ENOENT` 也是 `git_missing`；`fatal: detected dubious ownership` → `git_unsafe_directory` 并给指引，绝不自动添加 `safe.directory`。
- 快照：`rev-parse --is-inside-work-tree`（128 → `not_git`）；`rev-parse --show-prefix` 得 `repoPrefix`（Project 可是仓库子目录）；HEAD 用 `rev-parse --verify -q HEAD^{commit}`，成功则分支取 `symbolic-ref -q --short HEAD`（退出 1 为 detached）、提交取 `rev-parse --short=9 HEAD`；失败但 `symbolic-ref -q HEAD` 成功为 unborn，状态 `no_head`。正常情况三条命令（两两并行）：`diff HEAD --raw -z -M --relative --ignore-submodules=dirty -- .`、`diff HEAD --numstat -z -M --relative --ignore-submodules=dirty -- .`、`ls-files -o --exclude-standard -z --no-empty-directory`（上限 4 MiB 后 `truncated`）。raw 格式 `:old new oldsha newsha STATUS[score]\0path\0[newpath\0]`，numstat 重命名为 `add\tdel\t\0old\0new\0`（已在本仓库验证）；工作树来源的新 sha 全零。unborn：`ls-files -z --cached` 加未跟踪，全部列为 `added` + `untracked:true`，状态 `no_head` 并配横幅，**绝不显示“没有变更”**，不创建提交或仓库。模式 120000 为 `special:'symlink'`，160000 为 `special:'submodule'`。未跟踪项为 `added` + `untracked:true`。
- 稳定性：watcher 维护 `invalidation` 计数；查询期间变化则重查，最多 `settleRetries` 次，仍变化则返回最新快照并 `settled:false`；每 Project 单飞，新请求中止并杀死在途子进程，调用方得到较新结果；被取消的请求永不以错误形式到达渲染端。
- 单文件：`diff HEAD -M --patch --unified=3 -- <old?> <path>`（上限 1 MiB，`truncated`）；原始侧用 `cat-file -s <oldsha>` 后 `cat-file blob <oldsha>`，sha 取自 Git 自己的 raw 输出并校验 `/^[0-9a-f]{40,64}$/`，**绝不接受渲染端传来的 sha**；修改侧经有界安全读取（Diff worker 自带小型 `readProjectFileBounded(root, rel, cap)` 副本，不引用 Files 以保持写入范围不相交）；未跟踪 / unborn 的原始侧为 `absent`，补丁来自 `diff --no-index -- /dev/null <relpath>`，其退出码 1 表示有差异（FR-TOOL-002 第 3 项“差异退出码”规则仅适用于此），大于 1 才是失败；`special`、二进制、`too_large`、超过 `sideBytes` 的一侧只给补丁或 `omitted` 加原因；读取前后用 size + mtimeNs 指纹核对，不一致重试两次后 `changed_while_reading`。
- Watcher：独立的递归 `fs.watch`（同样忽略 `FILES_WATCH_IGNORED`），另接受 `.git/` 下 `index`、`HEAD`、`refs/**`、`packed-refs`、`MERGE_HEAD`、`ORIG_HEAD` 的事件，忽略 `.git/objects`、`.git/logs`、`.git/lfs`；查询进行中仅发生于 `.git/` 内的事件被忽略（防反馈回路）；400 ms 防抖、最长 2000 ms，仅在 Diff 面板订阅期间附着；窗口聚焦触发重查作为兜底。`closeProject` 中止并等待所有 git 子进程（SIGKILL 后至多 3 s），无法确认退出则抛错，与“关闭失败保留并可重试”一致。

集成登记（仅主 Agent，在服务落地后）：`main/ipc/index.ts` 增加 `createFilesFeature(core)` / `createDiffFeature(core)`；`MainToolPort` 的 `closeProject` / `closeAll` 同时调用 `files.*` 与 `diff.*`，采用“全部尝试后抛 `AggregateError`”语义；`filesFor(core)` 作为 `fileReferences` 选项传给 `createSessionFeature`；在 `shared/ipc/contracts.ts` 登记两个契约。

### 渲染端

- 状态：`features/tools/files/files-store.ts`（zustand，按 Project 键控，仿 `terminal-store.ts`：`epochs`、`versions`、`closed` 集合、Project 标签关闭时 `forget`）；Files store 含 `tree`、`expanded`、`selected`、`viewer`、`watch`、订阅 id；Diff store 含 `snapshot`、`selected`、单文件结果、`appliedRevision`。两者导出 `installFilesIntegration()` / `installDiffIntegration()`（返回卸载函数）处理事件、`forget` 与 `stopped` 后重新订阅。只存内存（PROJ-Q12），不跨重启持久化。
- 门控：面板接收 `{ projectId, canvas, active }`；`active=false` 时不发 IPC、不订阅、不创建 Monaco 实例（后台 Project 的 Tools 仍挂载，此门控必需）。结果仅当 `revision` 不小于同键已应用的值且 `epoch` 当前才应用；`changed` 事件把目录标脏并重新列出已加载的目录；每次（重）订阅都用 `ifVersion` 重新核对已加载目录与已打开文件。
- 布局：侧栏 320–560 px，右区至少 400，所以树与查看器上下排列：头部（刷新、监听状态徽标，降级时显示“自动刷新不可用”）、`role="tree"` 的树（roving tabindex；方向键、Home / End、Enter）、分隔条、查看器（文件名 / 大小 / 编码、主按钮“添加到对话”、关闭查看器、操作结果的 live region）。查看器各状态由原因码渲染：已删除、不是文件、符号链接未跟随、二进制文件、文件过大、非 UTF-8 编码、无权限、读取失败 / 超时、Project 目录不可用、目录条目过多仅显示前 2000 项；读取失败后绝不显示旧内容。空目录显示“空目录”。被查看的文件删除后清除选择并保留“文件已不存在”提示直到选择别的文件。**查看从不添加标签。**
- Diff：头部“项目变更 · 相对 HEAD (main @ abc1234)”、计数、刷新（范围类型现在只有 `project`，阶段 4 再扩展）；文件列表（M / A / D / R 徽标、名称、+/−、仅模式变化）；选中行在其下展开单文件 diff；状态：没有未提交变更（`clean`）、非 Git 目录（说明并指引在 Terminal 中 `git init`，明确客户端从不初始化 Git）、无首个提交（基线不可用并列出新增文件，绝不写“无变更”）、未检测到 Git、目录所有权不被 Git 信任、查询超时、文件仍在变化（`settled:false`）、二进制 / 过大 / 特殊文件仅显示补丁、列表被截断提示；文件不再有差异时显示“该文件已无变更”。
- Monaco（`features/tools/code/**`）：`self.MonacoEnvironment = { getWorker() { throw new Error('workers disabled') } }`，由 Monaco 回退到同步的 editor worker（单次警告、无 CSP 违规；SP1 必须证明）；不为 `worker-src` 申请 CSP 例外（`blob:` 允许渲染端构造的任意脚本作 worker，拒绝；`worker-src 'self'` 需要用户签署，仅在实测主线程卡顿超阈值时才申请：打开 1 MiB 文件超 1 s，或每侧 512 KiB 的 diff 阻塞输入超 300 ms）。以现有上限限制主线程成本：查看 1 MiB、diff 每侧 512 KiB、`maxComputationTime ≈ 1500`、`hideUnchangedRegions`、关闭链接 / 基于单词的建议 / minimap / 出现位置高亮，只读；语法高亮用按扩展名懒加载的 Monarch basic-languages；只用 `monaco-editor` 包本身，不用 `@monaco-editor/react`（其 CDN 加载器违反 CSP）；`import()` / `React.lazy` 懒加载；codicon 字体是 4 KiB 以上的产出资源而非 data URI，`font-src 'self'` 成立。主题 `code/monaco-theme.ts`：两套主题随 `<html data-scheme>`（`MutationObserver`），编辑器背景 `#00000000` 使毛玻璃透出，token 表的 WCAG 对比度单元测试（仿 `terminal-theme.test.ts`），字体取 `--font-mono` 并用 `createFontGate` 模式加 `monaco.editor.remeasureFonts()`。同一面板同一时刻一个编辑器实例；`active=false` 或卸载时销毁；滚动 / 选择放在按 `viewStateKey` 键控的模块级 LRU；重新读取时 `saveViewState` → `setValue` → `restoreViewState`。`useNativeViewBlocked`（遍历 body 的 `MutationObserver`）与 Monaco 持续改动 style / class 冲突，`Tools.tsx` 应只对 terminal / browser 调用它（主 Agent 在集成时处理）。若 Monaco 不可用或 SP1 失败：以已有依赖 `lowlight` 做只读查看器，并用统一补丁渲染 hunk；替换范围限于 `features/tools/code/`。
- 体积：记录构建前后的 `out/renderer/assets` 大小；Monaco 为纯 JS / CSS / 字体，留在 `app.asar`，无需 `asarUnpack`。

### 文件引用链路（Files → Input → Session → Adapter，只对模拟 Provider）

- `addFileReference({ projectId, canvas, path })`（`features/input/add-file-reference.ts`）：由 Project 的 `mainCanvas` 推出当前显示的 `DraftKey`（session → `{kind:'session', sessionId}`；draft → `{kind:'new_chat'}`；View 模式按 `ViewConversation`）；编辑前必须 `await useSessions.getState().loadDraft(key)`（否则 `updateDraft` 会用 `emptyDraft()` 覆盖已存的文字与 CLI）；await 之后重新计算当前显示的键，若与捕获时不同返回 `rejected: conversation_changed`；按路径去重，最多 20 个，追加 `{type:'file', path}`。Files 面板先调用 `files.resolveReference` 取得早期反馈，权威校验在发送时。
- Input：标签不变；`+` 菜单的“从 Files 添加文件”启用，点击（用户操作）选中 Files 工具，副文案“在 Files 中选择文件后点击「添加到对话」”；Needs Input 状态下带有文件标签时阻止发送并提示“回复 Agent 时不能附带文件引用，请先移除标签或等待本轮结束”，保留输入（消除既有的静默丢弃）。
- Session：新增 `main/services/session/file-reference.ts`（纯函数、有单元测试）：`FILE_REFERENCE_STRATEGY: Record<SessionCli,'text'|'attachments'> = { codex: 'text', 'claude-code': 'text' }`，`buildUserInput({ viewContextText?, files, text, strategy })`。`text` 策略输出（路径以 JSON 引号包裹、每行一个，控制字符此前已拒绝）：`{viewContext?}` + 空行 + `Referenced files (paths relative to the Project root; these are references, not file contents):` + `- "src/a.ts"` … + 空行 + 用户文字。`attachments` 策略映射为 `{kind:'file', path: absolutePath, name}`，已实现并测试但**不启用**（仅 Codex 适用，Claude 抛 `unsupported`）；切换需要真实 CLI 证据。`SessionServiceOptions.fileReferences?: FileReferenceResolver`；有文件项却无解析器时抛“文件引用不可用”（不静默丢弃）。`create` / `send` / `retry` 在任何状态变更前先解析：无文件项时保持同步路径不变（零回归）；有文件项时变为异步，`create` 在可用性检查之后、`entries.set` 之前解析，`send` / `retry` 在 `begin()` 与 `retire()` 之前解析，并在 await 之后重新执行同样的状态检查（`closing`、`entry.turn`、`ensureCanSubmit`）；运行中路径在 await 前置 `turn.sending = true`，`finally` 复位。失败抛出命名每个路径及原因的中文消息，渲染端 `sendComposer` 已保留草稿与标签；`retry` 会重新解析，文件已删除则阻止并说明；`sendWhileRunning` 复用同一构造器（Codex 得到带文本块的 `turn/steer`；Claude 的 `send()` 本就拒绝）。`main/ipc/session.ts` 的 `context()` 对文件项使用 `parseProjectPath`（含 `saveDraft`）。转录与 `session_turns.message` 继续保存相对 `contextItems`。
- 模拟 Provider：`FakeProvider` 记录 `startTurn` / `steerTurn` 输入，单元测试断言收到的确切文本或附件；`e2e-providers.ts`（W15 范围）让最终模拟回复列出该轮所有输入（start + steer）中解析出的引用，如“已收到文件引用：src/a.ts, docs/my file.md”，供 Playwright 从转录断言交付。
- 仍缺：没有任何真实 CLI 收到过引用；Codex / Claude 是否真的会打开文本块里的文件未知；`mention` / `@` 原生形式未验证；Claude 队列不存在。

### 测试与验收映射

- 单元：Files 服务（`parseProjectPath` 各类输入；真实临时目录上的符号链接到外部 / 目录符号链接 / 悬空 / 环 / 中间符号链接 / FIFO（不阻塞，`not_file`）/ 读后根被替换 / 读取中增长 / `chmod 000`（root 下跳过）/ 3 MiB / 稀疏 10 GiB（不分配）；二进制、UTF-8 / UTF-16 BOM、非法 UTF-8、CRLF / 混合换行；列表截断与排序；watcher 用假 `watch` 与假计时器验证合并、最长等待、overflow、忽略规则、`filename` 为 null、`error` → degraded、宽限退订、`detachOwner`、`closeProject` 幂等；另有一次真实 fs 冒烟）。Diff 服务（用真实临时 Git 仓库作夹具，`GIT_CONFIG_GLOBAL=/dev/null`、`GIT_CONFIG_SYSTEM=/dev/null`、固定作者、`-c init.defaultBranch=main -c core.autocrlf=false`；`raw` / `numstat -z` 解析的模糊测试（重命名 / 复制、模式变化、typechange、unmerged `U`、子模块、含空格 / 换行 / 制表符 / unicode / 前导 `-` / 通配符 / `:(top)` 的路径）；unborn HEAD、已暂存 / 未暂存 / 两者并存、未跟踪、`git mv` 加编辑、删除、仅模式变化、二进制、2 MiB 补丁（截断）、5000 个未跟踪文件（上限）、子目录 Project、非 Git、经注入定位器的 `git_missing`、经注入 stderr 的 dubious ownership；恶意配置夹具：`.git/config` 里 `diff.evil.textconv` 与 `core.fsmonitor` 指向会写标记文件的命令，断言标记文件永不出现；宿主环境 `GIT_DIR` 被忽略；查询期间改动工作树的 `settled` 语义与过期快照不覆盖新快照；取消与 `closeProject` 后无残留子进程）。Session / Input（构造器两种策略、`create` / `send` / 运行中 steer / `retry` 与假解析器、无文件消息保持同步、失败保留草稿、Needs Input 带标签被阻止、`context()` 解析、`addFileReference` 的身份检查（await 期间切换画布）、先加载草稿、去重、上限）。渲染端（store 的过期 revision 丢弃、epoch / `forget`、`stopped` 后重订阅、各原因码状态、键盘导航、`active=false` 不调用；Monaco 在 jsdom 中用 mock）。
- Electron E2E 由主 Agent 在集成后新增 `e2e/files-diff.spec.ts` 与 `e2e/git-fixture.ts`，覆盖 task.md 场景行；独立 AI 界面验收（agent-browser，从界面入口操作，窗口 ID 截图）与独立安全评审（IPC 模糊：绝对路径、`..`、NUL、多余键、超长、错误或他人 Project id；符号链接逃逸；经 pathspec 的参数注入含 `--output=`；恶意配置；输出 / 体积炸弹；CSP 仍含 `worker-src 'none'`；渲染端无读取绝对路径的途径）。

### 规格与代码互相矛盾之处（需更新文档）

- Session spec §5.4 写“Provider 转换由 Adapter 承接”，Adapter spec §3.13 写“后续分别核对”；本阶段把文本转换放在 Session（先例：`viewContext.text` 已在 `session-service.ts` `start()` 中前置），完成后更新措辞。
- Input spec §3 第 4 项写“尚未开始”，I-Q4 仍未答复，状态为草稿。
- FR-TOOL-001 第 4 项与任务场景要求两个 CLI 都支持运行中追加 / 排队；Claude 的 `inputWhileRunning: 'none'`，只有 Codex `steer` 可测。
- `ContextItem {type:'file', path}` 未规定相对 / 绝对，代码接受任意；Tools §4.1 要求相对。
- `specs/project/spec.md` 59、352 行仍写 Files / Diff 待实现。

### 留给人的决定（AI 的建议）

H1 本阶段对 FR-INPUT-001 与 FR-TOOL-001 第 4 项只能算部分完成（链路完整并对模拟 Provider 验证，真实 CLI 接收未验证，Claude 队列不可能）：接受并在验收记录中明写，不标 AC-07 通过。H2 真实 CLI 调用范围 / 预算：以后授予小而有界的范围，仅用于文件引用接收探测。H3 Monaco 选型沿用已确认的决定，`CodeViewer` / `CodeDiffViewer` 隔离了库，SP1 或体积不佳再复议。H4 `worker-src 'self'`：现在不申请。H5 符号链接：列出、不跟随、拒绝查看与引用（与 Project View 的 `safePath` 一致），有反馈再评估“目标在 Project 内则跟随”。H6 隐藏 `.git`。H7 Composer 的“从 Files 添加文件”启用并打开 Files 工具（仅用户点击时）。H8 unborn HEAD：说明加文件清单，绝不写“无变更”。H9 Project 位于上层仓库内：只显示其前缀并加横幅，不特判 `$HOME`。H10 引用规则：二进制与大文件可引用，含控制字符的名称不可引用，每条消息最多 20 个。H11 编码：仅 UTF-8（含 BOM）与带 BOM 的 UTF-16，GBK 等显示“非 UTF-8”，以后可加“按 GBK 打开”。H12 两个 CLI 先用文本路径清单交付，不用 `mention` / `@`，并更新 Session §5.4 与 Adapter §3.13 措辞。

### 风险（AI 管理）

递归 `fs.watch` 的事件风暴（如 `pnpm install`，靠早期过滤、合并与 overflow 缓解）与 macOS FSEvents 递归的特殊行为（靠手动刷新与聚焦刷新兜底）；大型仓库的 Git 成本（靠超时、上限、`truncated` 与取消；`.gitattributes` 过滤器如 LFS 会使工作树侧与补丁不一致，补丁为准）；Monaco 体积、主线程 diff 成本（靠每侧 512 KiB 与 `maxComputationTime`）与 `getWorker` 抛错回退的行为（SP1 前未验证）；TCC 弹窗与慢速 / 网络卷占用 libuv 线程（每请求超时，但底层调用无法中止）；`closeProject` 中无法确认 git 子进程退出会使 Project 关闭失败并可重试，与 Terminal 一致。

