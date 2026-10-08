# 调研记录：Project View 待决技术事项（W1）

> 作者：W1（Sonnet 5.5）。日期：2026-10-09。范围：[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 7 节第 1、2、3、10、11 项。本文是过程记录，不是决定；结论与推荐见 `docs/decisions/` 下的四份草稿。没有进行任何真实模型调用。

## 1. 产出与分工

| 待决项（04 第 7 节） | 决定草稿 |
|---|---|
| 第 1 项 Knowledge 存储格式；第 2 项是否放在 Project 内隐藏目录 | [D20261009-project-knowledge-storage](../../docs/decisions/D20261009-project-knowledge-storage.md) |
| 第 3 项 AI Generated View 渲染与安全沙箱 | [D20261009-project-view-rendering](../../docs/decisions/D20261009-project-view-rendering.md) |
| 第 10 项 Project View Context 注入两种 CLI | [D20261009-project-view-context](../../docs/decisions/D20261009-project-view-context.md) |
| 第 11 项 数据刷新时机与权限边界 | [D20261009-project-view-refresh](../../docs/decisions/D20261009-project-view-refresh.md) |

任务卡建议第 10、11 项合写一份；这里拆成两份，因为注入方式（发送时发生一次）与刷新、权限（持续发生）可以分别确认，互不阻塞。

## 2. 本机已验证的事实

环境：macOS 15.6 / arm64；Codex CLI 0.161.0；Claude Code CLI 2.1.295（06 记录的是 2.1.294，已随本机更新）；Claude Agent SDK 0.3.293（装在临时目录）；Node 26.10.0。验证脚本 [W1-view-probes.mjs](evidence/W1-view-probes.mjs)，结果 [W1-view-probes-results.json](evidence/W1-view-probes-results.json)。脚本在新的临时目录中建立夹具，不发送任何用户消息或 `turn/start`；`skills/list` 的结果会包含用户自己安装的 Skill，输出只保留夹具名称，不记录其余内容。

| # | 事实 | 验证方式 | 影响的决定 |
|---|---|---|---|
| V1 | Codex `:workspace`（workspace-write）下，项目根的 `.git`、`.codex`、`.agents` 不可写；`.claude`、`.ai-studio` 可写；项目目录之外（用户主目录）不可写。`:read-only` 下项目内全部不可写 | `codex sandbox --permission-profile`（macOS Seatbelt），无模型调用 | 存储位置、目录命名 |
| V2 | 同一行为与官方文档一致：`.git` 以及 `.agents`、`.codex`（目录存在时）递归只读 | [Codex Agent approvals & security](https://learn.chatgpt.com/docs/agent-approvals-security) 引述 | 目录命名 |
| V3 | Claude Code 受保护路径包括 `.git`、`.claude`、`.vscode`、`.idea`、`.husky` 等；default / acceptEdits 模式下写入需逐次确认，`permissions.allow` 不能预先批准 | [Claude Code permission modes: Protected paths](https://code.claude.com/docs/en/permission-modes#protected-paths)；未在本机运行验证（需模型调用） | 目录命名 |
| V4 | Claude 在工作目录与 additional directories 之外读取需要确认；additional directories 只授予文件访问，SDK 的 `additionalDirectories` 等同 `--add-dir`，同时会从该目录加载 skills / commands / subagents | [Claude Code permissions: Working directories](https://code.claude.com/docs/en/permissions#working-directories)；SDK `sdk.d.ts` 注释 | 应用数据目录存储方案的代价 |
| V5 | Codex `turn/start.input` 是 `UserInput[]`，类型为 `text`（含 `text_elements`）、`image`、`localImage`、`audio`、`localAudio`、`skill{name,path}`、`mention{name,path}`；`userMessage.content` 同为 `UserInput[]`，另有 `clientUserMessageId` | `codex app-server generate-ts`（0.161.0）读取生成类型 | 注入方式 |
| V6 | `mention` 的 `path` 指向 `app://…` 或 `plugin://…`，不是文件；`skill` 的 `path` 是 SKILL.md，且只会匹配已在 Skill 目录（catalog）中的启用项，不会读取任意路径 | 协议源码注释（`codex-rs/protocol/src/user_input.rs`，tag `rust-v0.161.0`）；`ext/skills/src/selection.rs` 的阅读摘要（未执行） | 注入方式 |
| V7 | `skills/extraRoots/set` 注册额外 Skill 根目录后，`skills/list` 立即出现该目录里的 Skill（scope 为 `user`），无需 `experimentalApi`，不写用户目录 | 本机协议调用 | 打包 Skill 的可行性 |
| V8 | `thread/start` 接受 `developerInstructions`、`baseInstructions`，返回 `instructionSources`（已加载的 AGENTS.md 路径）；`TurnStartParams.sandboxPolicy.workspaceWrite.writableRoots` 可为单轮追加可写根 | 本机协议调用（thread/start 为 ephemeral，无回合）；生成类型 | 注入方式、应用数据目录方案 |
| V9 | Codex 的 AGENTS.md 指令链每次运行重建，默认合并上限 32 KiB，离 cwd 越近越靠后 | [AGENTS.md 官方说明](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | 为何不依赖 AGENTS.md |
| V10 | Claude SDK `Options.plugins`（`type:'local'`）配合 `settingSources: []` 与 `pluginDelivery:'initialize'`，`initializationResult()` 显示 `plugins_applied: true`，插件内 Skill 以 `studio:project-view` 出现在命令清单中 | 本机 SDK 调用（未发送用户消息） | 打包 Skill 的可行性 |
| V11 | Claude SDK `systemPrompt.append` 默认被快照：首个请求渲染后记录，之后 `resume` 与再次启动传入不同的 append 会被忽略，直到压缩或新会话 | `sdk.d.ts` 注释 | 注入方式 |
| V12 | Claude SDK hooks（`UserPromptSubmit`、`SessionStart`、`PostToolUse` 等）的返回值支持 `additionalContext`；`FileChanged`、`InstructionsLoaded` 等事件存在 | `sdk.d.ts` 类型；未运行验证 | 注入方式、校验反馈 |
| V13 | Claude `SDKUserMessage.message` 是 Messages API 的 `MessageParam`，`content` 可为多个文本块；`origin` 字段：宿主包装人工输入时必须显式标注 `{kind:'human'}`，缺省按“未归属”处理，会在严格的人类信任检查处失败 | `sdk.d.ts` 注释 | 注入方式；Adapter 实现注意事项 |
| V14 | `skills/list`（Codex）与 `initializationResult().commands`（Claude）都能列出原生 Skill，可作为输入区“使用原生 Skill”选择器的数据源 | 本机调用 | FR-VIEW-007 第 4 点 |

未验证（需要模型调用或 Electron 原型）：多个 `text` 输入项合并为同一条用户消息的实际形态；`developerInstructions` 在 `thread/resume` 后是否保留；Claude hooks 的运行行为；iframe、自定义协议与 CSP 在 Electron 中的实际表现；WebContentsView 与 DOM 浮层的叠放关系；`fs.watch` 在 macOS 睡眠恢复后的丢事件情况。这些在决定草稿中以“待原型验证”标出。

## 3. 比较与取舍的补充材料

决定草稿的“备选方案”表给出放弃原因；这里记录没有放进草稿的细节。

### 3.1 存储

- 原型 `render.js` 用每个 View 一个 JSON 对象（`summary`、`layers`、`milestones`、`steps` 等）并由固定代码渲染，是示意；对应的结构化划分与本方案的“一个 View 一份 Knowledge 文件”一致，但原型把层级、分组写在数据里，正式 Schema 应把这类版面信息放到 View Definition。
- “事实 / 展示”的判据：去掉所有样式、位置、图表类型后仍然成立的是事实（模块名称、依赖关系、里程碑状态、Agent 职责、业务步骤与代码映射）；与怎么摆、画成什么有关的是展示（分组方式、排序、方向、图表种类、强调色变体、折叠状态）。
- Agent Team 的 Knowledge 只能是对 CLI 原生配置的描述与引用（路径指向 `AGENTS.md`、`.claude/agents/*` 等），不能成为新的 Agent Profile 标准（FR 第 3 节 Agent Team；原则 19）。实测 `thread/start` 返回的 `instructionSources` 可作为 Codex 已加载指令文件的权威来源，后续 Agent Team 的生成指令可以让 Agent 参考。
- 文件锁：Agent 的文件工具（Codex 的补丁、Claude 的 Write / Edit）不经过客户端，客户端无法加锁；只能靠“一个 View 一个文件”缩小冲突面，靠指南要求“编辑前重读、局部修改”，靠 04 第 7 节第 7 项的总体冲突检测兜底。
- 符号链接：Agent 可以创建符号链接，客户端读取 `.ai-studio/` 时必须用 realpath 校验仍在项目内，否则可能把项目外文件当作 Knowledge 读入。

### 3.2 渲染

- 为什么声明式更贴合 FR-VIEW-004：HTML 同时承载内容和呈现，Agent 倾向把事实直接写进 HTML，规格无法强制分离；声明式 View Definition 只能通过绑定引用 Knowledge，事实必须写在 Knowledge 里。
- 关系图的版式质量：让 Agent 手写 SVG 坐标容易出现重叠与溢出；声明式只给节点和边，由渲染器自动布局，结果稳定。这是工程经验判断，未做对比实验。
- 先例：Google A2UI（Agent 只在宿主发布的受信组件目录里选择组件，目录外的请求被忽略）；MCP Apps 与 Claude Artifacts 则选择沙箱 iframe + CSP + postMessage。两类做法都有人采用，区别在于是否信任 Agent 输出可执行代码。来源：[A2UI 发布说明](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)、[MCP Apps 概览](https://modelcontextprotocol.io/extensions/apps/overview)、[Simon Willison：Anthropic 如何实现 Artifacts](https://simonwillison.net/2024/Aug/28/how-anthropic-built-artifacts)。Artifacts 的跨域隔离细节来自第三方分析，未见官方安全文档。
- iframe 沙箱要点（[MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)）：`sandbox` 为空即全部限制；不带 `allow-same-origin` 时内容被当作永不同源的特殊来源；同源时同时给 `allow-scripts` 与 `allow-same-origin` 会让内容摘掉沙箱。`srcdoc` 内容的相对 URL 按父页面解析，也继承父页面的策略环境，因此推荐改用自定义协议并由响应头下发 CSP；Willison 在 2026-04 的测试显示 `<meta>` CSP 放在 iframe 内容最前面时，后续脚本无法移除其效果（[测试记录](https://simonwillison.net/2026/Apr/3/test-csp-iframe-escape/)，第三方测试，需在 Electron 中复验）。
- Electron 检查清单（[Security](https://www.electronjs.org/docs/latest/tutorial/security)）里与本题相关的条目：#2 不对远程内容启用 Node 集成、#3 上下文隔离、#4 进程沙箱、#7 定义 CSP、#13/#14 限制导航与新窗口、#17 校验所有 IPC 的 `sender`、#18 优先自定义协议而非 `file://`、#20 不向不受信内容暴露 Electron API。`nodeIntegrationInSubFrames` 为实验选项，文档写明开启后“所有 preload 会加载到每个 iframe”（文档未写默认值，按未开启处理）；本方案要求保持关闭，使沙箱 iframe 里没有 preload 暴露的 API。
- Mermaid 等直接解析 Agent 文本的库有过多起注入类漏洞公告（升级修复，或改用其 `sandbox` 安全级别把渲染放进 iframe），不适合放在持有 preload 的主 Renderer 里；来源为第三方公告汇总，需要时再核对官方说明。
- WebContentsView 与 DOM 叠放：Electron 文档只说明用 `contentView.addChildView` 添加、`setBounds` 定位，没有描述与窗口主 WebContents 的叠放；按原生子视图的一般行为，DOM 里的菜单、对话框和提示无法盖在它上面。这是推断，需要在应用骨架里用真实窗口确认。

### 3.3 注入

- Codex 的结构化输入里没有“文件引用”或“上下文块”类型。要给 Agent 一个 View 上下文，只有文本、`skill` 输入项、`thread/start` 的 `developerInstructions` 和低层的 `thread/inject_items`（追加原始 Responses 项，持久化并参与后续请求，属于低层接口）。
- `text_elements` 的设计目的是让客户端在历史与恢复时还原“特殊元素”标记而不改变文字内容（源码注释）；可考虑为 View Context 文本块标出整段范围，使 Codex 历史自带标记。它是 Codex 专有，Claude 没有等价物，所以客户端仍须自己保存“这条消息附带了 View Context”。
- Claude 的 hooks 可以每轮动态附加 `additionalContext`，适合“校验失败反馈”之类的动态内容；因为 Codex 没有已验证的等价物，没有作为主路径。
- CLAUDE.md 只有在 `settingSources` 含 `project` 时才会加载，而 06 的校验为隔离而使用了空来源；这说明依赖原生指令文件还需要 Adapter 先确定配置加载边界（06 第 6 节“原生 Skill / Rule / Context 加载”）。

### 3.4 刷新与权限

- 变更来源：Agent 通过 CLI 文件工具写入；用户也可能直接编辑文件；`git checkout` / `git clean` 等会在项目内批量改动目录，因此需要“启动扫描 + 监视 + 回合结束补扫 + 窗口重新获得焦点补扫”，不能只依赖监视事件。
- 部分写入：文件工具并非原子写入，监视器可能读到半个 JSON，所以读取失败后要等待文件稳定再判错；多步更新中 Knowledge 与 View Definition 可能暂时不一致，也不应立刻报错。
- 校验信任锚：校验永远使用应用内置 Schema；项目内 `schema/` 副本仅供 Agent 阅读，避免 Agent 改写 Schema 来“通过”校验。
- Overview 的 Recent Sessions、Needs Input、Recently Completed 属客户端数据（UX 第 6 节），含 Session 标题，可能带敏感信息，不交给由 Agent 控制的渲染层；这也是第二层 HTML 方案不得获得客户端 Session 数据的原因。

## 4. 对其他 task 的影响

| task | 需要知道的事 |
|---|---|
| T20261009-agent-adapter | 首条消息需要支持多个文本块；Claude 用户消息要标注 `origin: {kind:'human'}`（V13）；记录 `developerInstructions` / `append` 为可选参数但 V1 不用；`skills/extraRoots/set` 与 SDK `plugins` 已验证可用，留作后续 |
| T20261009-session-slice | Session 需保存 `origin_view_id` 以及“是否附带 View Context”；Conversation 把 View Context 文本块折叠为上下文标签 |
| T20261009-app-skeleton | 需要为 Preview 预留自定义协议与 CSP 配置、主进程 IPC 的 `senderFrame` 校验、SQLite 里的 View 缓存表 |
| T20261009-project-shell | 右侧区域的 Preview 容器；更新时不切换右侧内容（P-B） |
| T20261009-context-tools | Files 树是否显示隐藏目录；Diff 在 `.ai-studio/` 默认忽略时不受影响 |

## 5. 未决问题汇总

每项的推荐答案与理由见对应草稿的“未决问题”。主 Agent 汇总给人的清单在 W1 最终报告中。

## 6. 复现

```sh
npm install --prefix /tmp/ai-studio-w1-sdk --ignore-scripts --no-audit --no-fund @anthropic-ai/claude-agent-sdk@0.3.293
node tasks/T20261009-project-view/evidence/W1-view-probes.mjs \
  --sdk-dir /tmp/ai-studio-w1-sdk/node_modules/@anthropic-ai/claude-agent-sdk \
  --out /tmp/ai-studio-w1-results.json
codex app-server generate-ts --out /tmp/ai-studio-w1-codex-ts   # 读取 v2/TurnStartParams.ts、v2/UserInput.ts 等
```

注意：脚本里 Codex 沙箱探测的夹具位于系统临时目录，该目录本身是默认可写根，所以“项目根可写”这一项没有信息量；有信息量的是受保护目录与项目外写入被拒绝的对比。
