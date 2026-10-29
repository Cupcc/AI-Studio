# Context 工程工具

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `tools` |
| 文档状态 | 已确认（2026-10-13） |
| 确认范围 | 用户接受本轮审阅建议「accept all, not dev, update all docs」；技术契约为 AI 细化，本次实施 diff 待审阅；不代表开发授权或功能验收；§5.1～§5.4 为运行时、Files / 项目 Diff、本轮 Diff 与 VS Code 对齐 的 AI 技术决定和实施记录，不是新增人工产品确认；开发授权见 §5 及负责任务 |
| 覆盖需求 | FR-TOOL-001～FR-TOOL-005；文件上下文关联 FR-INPUT-001 |
| 相关验收 | AC-07；Project 状态隔离关联 AC-01 |
| 相关设计 | [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 6、9 节 |
| 来源 | [02 第 5 节](<../../docs/02. Functional Requirements.md#5-context-panel-与工程工具>)；[03 第 5 节](<../../docs/03. UX Specification.md#5-context-panel-交互模型>)；[04 第 3、5 节及事项 13](<../../docs/04. Technical Requirements.md>)；用户 2026-10-12 对话「accept above suggetions, update all related docs」 |
| 实施记录 | [工程工具任务](../../tasks/archive/T20261009-context-tools/task.md)、[运行时执行计划](../../tasks/archive/T20261009-context-tools/plan.md)及[验收记录](../../tasks/archive/T20261009-context-tools/acceptance.md)；VS Code 对齐见[本轮任务](../../tasks/archive/T20261026-tools-vscode-parity/task.md)；实现与验收状态以任务为准 |

## 1. 问题与决定

### 1.1 未决问题

当前已授权范围无阻塞产品未决项。首轮 TOOLS-Q1 / Q5 的本地导航与内存分区已由 2026-10-26 的 TOOLS-Q9 / Q10 取代；页面自动化仍按 TOOLS-Q6 后续评估。真实 CLI 能力及 CLI / 上游服务返回结果见第 5 节，不作为已解决的实现问题。

### 1.2 已确认原则

| 编号 | 决定 | 来源与确认日期 |
|---|---|---|
| TOOLS-Q2 | 保留 Monaco + Git CLI、xterm.js + node-pty、WebContentsView；文件树采用惰性加载和文件事件刷新 | 用户接受上轮实现建议（2026-10-12）；[DEC-10](<../../docs/07. Decisions.md#dec-10-工程工具实现原则>) |
| TOOLS-Q3 | 资源生命周期独立于面板挂载；切换工具或隐藏面板不销毁用户终端及输出；历史轮次补丁不能由当前工作区伪造原文 | 同 TOOLS-Q2（2026-10-12）；FR-TOOL-002、FR-TOOL-004 |
| TOOLS-Q4 | 关闭仍运行的 Terminal Tab 时面板内确认“结束并关闭 / 取消”；最后一个 Tab 关闭后显示“没有打开的终端”及新建入口 | [原型 v03 Q4、Q5](../../tasks/T20261011-prototype-v03/task.md)（2026-10-11 确认） |
| TOOLS-Q1 | Browser 首轮完成 localhost / 回环地址预览；一般外站内嵌另行评估；外站跳转提示用户选择是否用系统浏览器打开 | 用户「accept all, not dev, update all docs」（2026-10-13 确认）；[DEC-14](<../../docs/07. Decisions.md#dec-14-工程工具开发准备>) |
| TOOLS-Q5 | 每个 Project 使用独立浏览器分区；首轮默认不跨应用重启保存登录数据，上次地址仍保存；可选持久化后续评估 | 从原 TOOLS-Q1 拆出；同上（2026-10-13 确认） |
| TOOLS-Q6 | 客户端新增的 Agent 页面自动化另行评估；不改变原生 CLI 已有能力的接入要求，不将内嵌 OAuth / 跨站预览列为首轮交付承诺 | 从原 TOOLS-Q1 拆出；同上（2026-10-13 确认） |
| TOOLS-Q7 | Project 关闭 / 应用退出纳入所有未退出的用户终端，合并一次确认，列出受影响 Session 与 Terminal；包括仅停在 Shell 提示符的实例；失败保留诊断与重试 | 同上（2026-10-13 确认）；确认流程归 [Project spec §3.2.4](../project/spec.md#324-关闭-tab-与确认) |
| TOOLS-Q8 | 四个工具对齐 VS Code 基本操作并新增 Search 工具；范围见 FR-TOOL-001～005 的 2026-10-26 段落 | 用户 2026-10-26 对话；[DEC-25](<../../docs/07. Decisions.md#dec-25-工程工具对齐-vs-code-基本功能>) |
| TOOLS-Q9 | Browser 可打开任意 http / https 网址，取代 TOOLS-Q1 的首轮本地限制；其他协议仍经用户选择交给系统应用 | 同上（2026-10-26 确认） |
| TOOLS-Q10 | Browser 浏览数据所有 Project 共享并跨重启保存，提供清除入口，取代 TOOLS-Q5 的按 Project 内存分区 | 用户选择「所有 Project 共享保存」（2026-10-26 确认） |
| TOOLS-Q11 | Files 支持文件管理（新建、重命名、移动、复制、删除到废纸篓），不提供内容编辑；用 VS Code / 默认应用打开代替 | 用户选择「不做，提供外部编辑器打开」（2026-10-26 确认） |
| TOOLS-Q12 | Diff 保持只读，不新增 Git 写操作；只补充视图控制 | 用户选择「保持只读」（2026-10-26 确认） |

## 2. 职责与边界

FR-TOOL-001～005：本模块负责右侧工具内容、文件管理及只读查看、Git 读取、全文搜索、浏览器实例、用户终端实例与工具内部状态。面板选择、宽度、模式切换由 [Project spec §5.5](../project/spec.md#55-与-project-viewtools后续-task) 负责；对话草稿及上下文标签由 [Input spec](../input/spec.md) 负责；原生 CLI 事件由 [Adapter spec](../agent-adapter/spec.md) 负责。

Project 级资源包括文件树、搜索、项目 Diff、Browser 状态、Terminal Tabs；本轮 Diff 以 Session / 原生 Thread / Turn 关联。Renderer 消费受控 IPC 的快照和事件；文件、Git、PTY 与 WebContentsView 由主进程服务管理（04 第 3 节）。

工具入口和跳转只由用户操作触发。Agent 的输出及文件事件可以更新内容，不改变当前工具、面板可见性或 Workspace 布局（02 Context Panel 操作原则）。

## 3. 行为细则

### FR-TOOL-001 Files

1. 用户打开 Files 后读取 Project 根节点；展开目录时按需读取其直接子项，不在打开面板时递归扫描整个项目（TOOLS-Q2）。文件查看使用按需加载的 Monaco；文件选择、查看与“添加到对话”分别处理，查看文件不自动附加上下文。
2. 主进程监听文件变化，合并短时间内的事件并刷新受影响节点；刷新保留仍有效的展开与选择状态。被删除或无法访问的条目显示当前状态，不将旧缓存作为最新内容（TOOLS-Q2；技术实现与验证见 §5 及任务验收）。
3. 使用 Project ID 和相对路径请求读取；主进程确认 Project 身份、规范化路径并检查实际读取目标。目录遍历、失效路径和符号链接须单独验证，不通过通用 IPC 允许 Renderer 读取任意绝对路径（04 第 3 节；技术实现与验证见 §5 及任务验收）。
4. “添加到对话”向当前 Project 中实际显示的 Session / 草稿添加可移除文件标签；发送前沿用 Input 的上下文通道，并核对文件仍存在。Files → Input → Session → Adapter 属于同一交付链路，普通发送及原生支持的运行中追加 / 排队都须传递文件引用，不能只保存标签或静默丢弃附件；两种 CLI 分别验证实际接收。具体转换见 §4.1（FR-TOOL-001、FR-INPUT-001；2026-10-13 确认）。
5. 不可读目录、文件被删除、二进制及超出读取 / 显示限制的文件应给出对应状态；读取和显示限额由 AI 在实现时结合性能证据确定，不宣称支持完整 IDE 的文件编辑能力（技术实现与验证见 §5 及任务验收）。

### FR-TOOL-002 Diff

1. 从工具入口进入项目变更；从 Conversation 完成行进入该 Session / Turn 的本轮变更，标题清楚标识来源和关联轮次。范围规则以 FR-TOOL-002 为唯一产品依据。
2. 项目变更通过 Git CLI 查询当前工作区相对 HEAD 的最终差异；文件列表包含已暂存、未暂存、未跟踪内容。未跟踪文件须单独发现并与空内容比较，不能仅执行一次 `git diff HEAD` 就宣称覆盖完整（TOOLS-Q2；技术方案）。
3. Git 命令使用参数数组和路径分隔符；禁止外部 diff 程序、关闭颜色输出、解析支持特殊文件名的机器格式。以差异退出码表示“有变化”的命令不当作运行失败；重命名、二进制、大文件、无首个提交和查询期间文件变化均纳入验证（技术方案）。无 HEAD 时不能报告“没有变更”，须解释基线不可用；不自动创建提交或仓库。
4. 本轮聚合补丁按原生 Thread / Turn 替换更新，不将多次通知重复累加；文件完成状态由原生完成事件确定。最终补丁随历史保存，后续工作区修改不重算旧轮次（04 事项 13）。不承诺 Shell / 外部工具修改具有相同原生覆盖范围。
5. Monaco 双文本 Diff 只在具备对应历史两侧内容时使用。原生只提供 unified patch 时，直接展示保存的 patch；当前工作区内容不能充当历史原文。无法展示的内容按原因说明，整体原生记录缺失按 FR-TOOL-002 降级（TOOLS-Q3）。
6. 文件数未知保持未知；原生记录明确为空才可显示 0。多个 Session 共享目录时项目变更不能归属于当前 Session；查看本轮变更不得混入另一 Session / Turn。

### FR-TOOL-003 Browser

1. 用户输入 Web 地址并导航（当前地址范围按 TOOLS-Q9）；支持刷新与恢复上次地址，保留 Project 级状态。开发服务器可由用户 Terminal 运行；当前范围不要求新增自动启动预览、服务器管理器或 Agent 页面自动化（FR-TOOL-003；工程工具任务）。
2. 主进程持有独立 WebContentsView，网页禁用 Node，开启隔离和 sandbox，不加载应用 Preload、不暴露 `window.studio`。localhost 的脚本同样不能获得应用权限（04 第 3 节；TOOLS-Q2）。
3. Renderer 通过限定命令传递导航、刷新、布局尺寸及可见性；主进程校验请求与尺寸。网页导航、新窗口、权限请求、下载和系统浏览器打开按各自处理器管理，不能复用主应用的可信 Renderer 身份（技术实现与验证见 §5 及任务验收）。
4. 页面上下文与主应用分离，不自动继承系统浏览器登录。导航范围、共享浏览数据和跨重启行为按 TOOLS-Q9、Q10，页面自动化边界按 TOOLS-Q6；普通外站导航、重定向和新窗口请求不能绕过相同入口策略，也不自动打开系统浏览器。网络子资源与顶层导航分别处理，不将本地导航范围误写为禁止页面正常加载外部资源。
5. 切换工具或 Project 时移除 / 隐藏实际嵌入视图，保存实例及已确认恢复状态；不得把隐藏页面留在当前内容上方。布局 resize、弹层遮挡、焦点返回、加载失败、服务器不可达及渲染进程退出需验证。关闭 Project / 退出应用时显式释放所属 webContents（技术实现与验证见 §5 及任务验收）。

### FR-TOOL-004 Terminal

1. 首次用户打开时创建一个 Tab；随后用户可以新建、切换、关闭。每个实例使用独立 PTY，初始 cwd 为 Project Directory；xterm.js 处理显示与键盘输入，主进程服务处理进程、输出和 resize（FR-TOOL-004；04 第 3、5 节）。
2. PTY、实例列表和输出恢复状态由 Project 服务持有；UI 卸载、隐藏或重新挂载时可重新附着。仅将 `lastTool` 写入壳层不能恢复终端；快速切换须保证输出没有遗漏或重复（TOOLS-Q3）。
3. 输出缓存须有界，并设计附着时快照与实时流的交接及背压，防止大量输出阻塞界面。xterm 的显示模型需要持续更新或能够重建屏幕；仅保留若干文本行不能等同恢复 ANSI / 光标状态（技术实现与验证见 §5 及任务验收）。
4. 关闭仍运行的实例先按 TOOLS-Q4 确认；取消不改变实例，确认后终止该实例并等待退出。关闭失败保留可诊断状态。最后一个 Tab 关闭后不自动创建新终端、不自动收起面板。
5. Session Stop、另一实例关闭或 Agent Runtime 故障不影响用户 PTY。Project 关闭和应用退出只清理可确认归属的资源；先有界等待退出，再按已有清理责任兜底。跨应用重启不声称恢复原 PTY 或自动重跑旧命令（04 第 5 节；Project spec PROJ-Q1）。
6. Project 关闭 / 应用退出按 TOOLS-Q7 由 Project 统一确认；终端服务报告未退出实例并负责准确清理，不逐个叠加 Tab 关闭弹窗。确认取消不改变实例；关闭窗口但未退出应用沿用既有后台运行规则。

## 4. 状态与接口

FR-TOOL-001～005：以下为已登记的技术接口，实施与验证结果见 §5 及任务验收；接口必须登记在现有类型化 IPC，不提供通用 shell / fs / execute 接口。

| 状态 / 资源 | 归属与保存 | 接缝 |
|---|---|---|
| 工具选择、可见性、宽度 | Project 壳层既有 `ui_state` | `updateUiState`；不复制存储 |
| 文件树、文件查看 | Project；展开、选择及缓存独立于 UI 挂载 | 有界 list/read、变化订阅、定位和添加上下文动作 |
| 项目 Diff | Project；根据当前 Git 状态刷新 | 文件列表 / 单文件只读 diff；刷新请求的过期结果不可覆盖新结果 |
| 本轮补丁 | Session / Thread / Turn；客户端历史持久化 | Adapter 原生记录 → Session 关联与保存 → Tools 显示；实现前确定 schema 与缺失语义 |
| Browser 实例 | Project；地址、可见性与实例生命周期分离 | 限定 navigate/reload/bounds/visibility、加载与错误事件 |
| Terminal 实例 | Project + Terminal ID；PTY / 显示缓存只在本次应用生命周期存活 | create/attach/input/resize/close、输出及 exit；操作校验 Project 归属 |

Project 删除、关闭与应用退出通过可信主进程生命周期释放资源；面板组件的 cleanup 只退订显示事件。资源释放失败不能静默宣称已关闭，也不清理无法确认归属的外部服务（04 第 5 节）。

### 4.1 文件引用契约

FR-TOOL-001、FR-INPUT-001：以下由 AI 于 2026-10-13 细化；当前实施与验证见 §5.2 / §5.3。Files 添加动作绑定 Project 与当前显示的草稿 / Session 身份；异步读取结束不能把结果添加到后来切换的其他对话。Input 保存可移除的文件引用，Session 在发送时经主进程重新校验 Project、相对路径、实际目标与可访问性，构造 Provider 输入；文件查看缓存不作为已发送内容。

优先使用 CLI 原生文件引用；Provider 无对应结构化输入时核对其原生文本引用方式，明确转换及覆盖边界，不伪称已提交结构化附件。引用不等于文件内容快照，不自动内联全文或覆盖用户权限。校验 / 提交失败向输入区返回原因并保留未接受的输入；原生权限拒绝按原生结果呈现。现有附件类型及发送链路差异见 [Adapter](../agent-adapter/spec.md#313-工程工具接缝) 与 [Input](../input/spec.md#context--attachment-入口与上下文标签)。

### 4.2 轮次补丁契约

FR-TOOL-002：AI 技术方案（2026-10-13；2026-10-18 实施见 §5.3）；Adapter 提供原生数据与能力证据，Session 保存关联，Tools 只读展示。逻辑字段如下，具体 TypeScript / SQL 命名见 §5.3：

| 字段 | 语义 |
|---|---|
| 身份 | Project、App Session、App Turn、Provider、原生 Thread / Session 与 Turn；原生缺少某级 ID 时保留关联依据，不伪造原生 ID |
| 来源 | CLI / SDK 版本、原生事件类型及覆盖说明；Shell / 外部工具覆盖不能由文件数推断 |
| 可用状态 | unknown（未取得可信记录）、available（有记录）、empty（原生明确为空）、unavailable（接口不提供）、failed（接收 / 读取失败）；附原因 |
| 原始数据 | 原生 unified patch 与文件条目、原生完成状态；缺历史完整文本不生成虚构两侧内容 |
| 修订 | 同轮递增 revision、接收时间及是否终态；聚合 patch 替换更新，不累加；过期事件不能覆盖新 revision |

原生事件同时校验运行时代次及轮次归属；重启读取已保存记录，不按当前工作区重算。旧历史无记录保持 unknown / unavailable，不回填零变更。回合失败 / 中断可保留已收到的 patch 和实际状态，不能将收到补丁视为写入成功。终态之后的迟到事件依据锁定协议验证处理，不挪入下一轮。持久化与迁移需纳入独立评审。

### 4.3 Terminal 与 Browser 接口准备

FR-TOOL-003、004：AI 技术方案（2026-10-13）；当前实现与验证见 §5.1 及任务验收。

- Terminal 的 create / attach / input / resize / close 均校验 Project、Terminal ID 与实例代次；attach 返回可重建屏幕的快照和流序号，再衔接增量，避免遗漏或重复。服务维护有界屏幕 / 回滚状态与流量控制；关闭期间拒绝新输入，退出事件与清理结果分开表达。实现时确定缓存阈值，以 ANSI 光标、resize、大量输出及重新附着场景验证，不把无限日志或纯文本尾部作为屏幕恢复方案。
- Browser 的 navigate / reload / bounds / visibility 命令与加载 / 错误事件绑定 Project 和实例代次；网页实例按 Project 管理，浏览数据按 TOOLS-Q10 共享持久化，地址单独保存。主进程解析 URL，按 TOOLS-Q9 核对 http / https 协议；顶层导航、重定向和新窗口使用一致策略。系统浏览器打开须经用户选择并校验 URL，不接受任意协议执行。
- 权限请求、权限检查、下载各设显式处理器；未授权能力不自动放行，不关闭 webSecurity 解决预览问题。按网站权限与下载前询问已纳入 DEC-25，具体实现见 §5.4；未授权能力仍不自动放行。
- 工具 / Project 切换、窗口 resize 与应用弹层都驱动嵌入视图显隐及 bounds；弹层期间不允许网页覆盖应用控件，结束后恢复焦点。Project 关闭失败不得先移除 Tab 再丢失错误入口。

参考：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[session 分区](https://www.electronjs.org/docs/latest/api/session)、[xterm.js 流量控制](https://xtermjs.org/docs/guides/flowcontrol/)。官方接口说明不替代本项目验证。

## 5. 验证与实施边界

FR-TOOL-001～004、AC-07：实现前记录正常、异常和回归场景，至少覆盖文件增删刷新及引用、特殊路径、两类 Diff 与历史不变性、CLI 缺失降级、Browser 隔离及 resize / 遮挡、多 PTY 在隐藏和重新挂载期间的输出、Session Stop 隔离、关闭取消及退出失败。Browser 的权限 / 进程隔离需要按任务协议独立技术评审，界面改动需要实际应用操作和截图。

原生轮次事件及非 Git 能力必须在锁定 CLI 版本验证；当前 V1 真实调用只安排 Codex，模拟不替代真实结果，Claude Code 真实能力暂缓。Codex 的额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定，应用不设置调用次数、费用上限或自动重试护栏。规格起草与本次确认不代表 AC-07 已通过；进度由 [06](<../../docs/06. Development Roadmap.md#33-工程工具>) 及工程工具任务负责。

此前文档准备仅更新文档（2026-10-13 指令）；后续用户「推进运行时工具的开发。agents并发」授权 Terminal / Browser 及其生命周期接缝实施，2026-10-14「accept above, apply, continue implementing」继续阶段 1（Files / 项目 Diff / 文件引用）。Claude Code 真实验收按 DEC-16 暂缓，且不随当前 V1 发布（DEC-19）。阶段与当前验证由 [工程工具任务](../../tasks/archive/T20261009-context-tools/task.md) 维护，不将阶段通过等同四工具 AC-07 完成。

### 5.1 运行时实现细化

FR-TOOL-003 / 004、FR-PROJ-002：以下为主 Agent 在上述开发授权内的技术决定（2026-10-13），不是新增人工产品确认。

- Terminal：主进程 `@xterm/headless` + SerializeAddon 持有屏幕，1000 行回滚；UI 按需加载 xterm。输出分 16 KiB chunk，256 / 64 KiB 水位控制 PTY 暂停 / 恢复；attach 返回屏幕与流序号，快照写入完的首个 ACK 启动增量，迟到的 attachment 不能退订新的显示。屏幕解析背压与 Renderer ACK 背压独立；隐藏或 Renderer 崩溃解除显示订阅，主进程屏幕继续更新。实例上限为 16 / Project、32 / 应用，超限明确反馈；不自动重跑跨重启的命令。屏幕检查点（emulator state schema 1）绑定锁定的 `@xterm/*` 版本（xterm 6.0.0 的私有结构），升级须重跑 ANSI 差分验证（含逐单元格属性 / 链接与将来 VT 状态）。xterm 在运行时注入 `<style>`，生产 CSP 因此对 `style-src-elem` 放宽（DEC-02 例外，用户 2026-10-13 确认），并因 24 位色与 `minimumContrastRatio` 经 `style` 属性写入而对 `style-src-attr` 放宽（用户 2026-10-14 确认），E2E 断言这些样式在构建后的应用里真实生效。配色（AI 技术决定；W5-F13 的视觉取舍由用户于 2026-10-18 确认，见 DEC-20）：每种外观方案（浅 / 深）使用显式 xterm 调色板，不依赖 xterm 默认值；ANSI 0–15 对该方案的名义背景及毛玻璃实测最差背景均 ≥ 4.5:1，默认文字 ≥ 7:1，选区文字 ≥ 4.5:1，光标与反色可读；毛玻璃下视口保持透明。代价：浅色方案的 ANSI 色比常见终端更深，“白 / 黑”在浅 / 深方案中分别是深灰 / 浅灰，经典的前景 / 背景配对对比度偏低；毛玻璃下选区与背景的区分度低于 3:1。xterm 的 `minimumContrastRatio` 取 5.5，使 ANSI / 24 位色背景上及程序自带颜色的文字按单元格调整到可读（xterm 按不透明名义背景计算，毛玻璃浅色的真实像素更暗，取 4.5 时实测仅 3.7–4.3:1，W5-F12）；已确认的视觉代价：反显文字实测约 5.4–6.1:1，低于调色板默认的 14–19:1，块颜色保留（W5-F13、DEC-20）；固定比值不能覆盖壁纸比实测更暗的毛玻璃（亮度 0.65 约需 6.75）；具体取值与测算见 `terminal-theme.ts` 及其测试，真实窗口的实测结果见[验收记录](../../tasks/archive/T20261009-context-tools/acceptance.md)。
- Browser（首轮历史实现；导航与分区已由 §5.4 取代）：每个 Project / 实例代次独立内存分区，导航只接受 HTTP / HTTPS localhost、127/8 或 `::1`；页面的普通网络子资源不受顶层回环限制。地址单独保存在 `app_meta`，无登录状态持久化；窗口恢复时未被选中的后台 Project 不创建 view、不加载已保存地址，首次选中并显示 Browser 后才创建实例并恢复上次地址。应用公共导航 guards 只用于应用窗口，预览 view 自己处理导航、新窗口、权限及下载；Shell 切换及窗口事件先校验显隐，DOM 弹层和原生退出提示均遮挡 / 移除 view。
- 生命周期：Session Stop 与 Tools 端口分开；Project / 退出合并列出 Session 与 Terminal。确认后等待准确归属清理，失败 / 超时不批准关闭或退出；保留底层实际清理锁，拒绝新 Session / PTY / Browser 操作，直至清理 settled。退出批准前依次停止回合、清理工具，再可逆地释放全部空闲 / 已退役 Session Runtime，任一失败拒绝退出、应用保持打开并可重试；退出失败取消后可继续使用保留的 Project；不把退出通知等同受管资源已清理。

接口登记在 `shared/ipc/browser.ts`、`shared/ipc/terminal.ts`；Project 关闭通过 `MainToolPort` 组合，不提供通用 fs / shell / execute IPC。具体验证与已知边界由验收记录维护。

### 5.2 Files / 项目 Diff 实现细化

FR-TOOL-001 / 002、FR-INPUT-001：以下为阶段 1 授权内的 AI 技术决定（2026-10-16），依据上文行为契约与[先行验证](../../tasks/archive/T20261009-context-tools/research.md)，diff 待人工审阅；不标记为新增人工产品确认。自动化与独立验收结论由[任务验收](../../tasks/archive/T20261009-context-tools/acceptance.md)负责。

- Files：Project 相对 POSIX 路径最多 1024 UTF-8 字节，单名称最多 1020 字节（兼容 APFS 的 255 字符）。惰性列出直接子项，目录优先、名称自然排序；超过 2000 项只返回排序后的前 2000 项并提示截断。`.git`（忽略大小写）不显示。超过相对路径或操作系统绝对路径上限的子项不返回未验证名称，保留其它可读项并显示省略原因，提示将更近目录单独打开为 Project。符号链接仅显示原始目标和徽标，不跟随、不展开、不查看或引用；发送与读取均重新验证路径与 Project 身份。名称中的控制字符和双向格式字符用可见标记显示，所有文件操作仍使用原名。
- 文件查看：只读、最多 1 MiB，识别 UTF-8、带 BOM 的 UTF-16 LE / BE；二进制、超限、权限不足、编码不支持及读取期间变化均给出原因。文件事件合并刷新受影响节点；事件溢出或监听降级时补扫并提供手动刷新。展开、选择、查看器状态在本次应用内按 Project 保留，关闭 Project 时释放，不承诺跨重启恢复整棵树。
- 目录读取隔离：macOS 先以 `O_NOFOLLOW_ANY` 打开目录并固定 dev / ino，再用 [Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process) 的独立 cwd 读取；子进程首先核对 cwd 身份，只对直接子项执行相对路径操作。读取结束再次检查目录身份；不匹配则重试一次后明确失败。目录被并发替换为外部符号链接不能重定向枚举；保留普通权限受限文件与符号链接的列出能力。每次读取受 5 秒期限、输出限额与关闭取消控制；等待子进程退出再释放目录句柄。不放宽打包应用的 `runAsNode: false` fuse。
- 项目 Diff：展示 HEAD 到当前工作区的最终差异，包含已暂存、未暂存及非忽略的未跟踪文件；冲突以冲突徽标展示工作区相对 HEAD，重命名显示两条路径。Project 在仓库子目录时只列该目录内变更；无 HEAD、非 Git、Git 缺失、不安全目录及查询超时分别说明，不自动初始化或写提交。列表最多 2000 文件，单文件 patch 最多 1 MiB，两侧文本各最多 512 KiB；二进制、符号链接、子模块及内容不可读时使用有说明的 patch 回退，截断明确可见。只在面板活动时查询，文件事件、手动刷新及窗口重新聚焦触发更新，旧 revision 不覆盖新结果。
- Git 只读边界：使用隔离环境、字面路径参数、无交互 / 无颜色输出，关闭外部 diff、textconv、fsmonitor 与 hooks；Git 的 index 内容刷新限制在保留原时间语义的临时副本中，真实 `index` 内容与 mtime 不变；split-index 仓库中，Git 读取仍会刷新 `sharedindex.*` 的过期时间戳，文件内容不变（[Git 官方配置说明](https://git-scm.com/docs/git-config/2.44.3)，独立兼容测试见任务验收）。不回写旧 mtime，避免与用户并发 Git 操作竞争。仓库本地 `filter.*.clean` 配置仍可能执行命令；当前沿用用户打开本地 Project 即信任其目录的边界，不宣称在恶意仓库内隔离执行 Git。主进程有查询超时、输出限额及进程清理。
- Monaco 0.57.0 按需加载，保留生产 `worker-src 'none'`，使用主线程回退；禁用需要语言服务的功能。两侧 Diff 计算预算 250 ms，复杂变更可能以近似结果显示；512 KiB 全量不同两侧的先行测量约占主线程 230–530 ms。该取舍限于只读查看器，不提供文件编辑或 IDE 语言服务。
- 文件引用：最多 20 个普通文件，标签可移除，添加绑定当前草稿 / Session；普通发送、恢复 / 重试及原生支持的运行中输入在发送前重新校验。2026-10-18 验证后，Codex 使用 Adapter 的 file → native mention，绝对路径只在主进程转换，转录仍保存原始相对引用；Claude 保留明确标识“路径引用、不是内容”的 JSON 引号相对路径清单（结构化附件仍为 unsupported）。两者均不内联文件全文、不承诺内容快照。含 C0、DEL、NEL、LS 或 PS 的名称可查看但不能引用，避免伪造路径清单行。真实普通发送、Adapter steer 及应用 UI 同轮追加引用见 §5.3；Needs Input 文件答复、Claude 运行中追加 / 排队及 Claude Code 真实接收暂缓。

- 引用别名校验（AI 技术决定，2026-10-17）：Session 仅对完全相同的路径字符串预去重；Files 逐一安全解析后，按实际 realpath 合并别名，保留区分大小写或 Unicode 拼写的文件系统中的不同文件。main-only aliases 明确关联每个已校验的原始请求；Session 核对请求集合被精确覆盖，拒绝遗漏、替换或重复覆盖。别名元数据和绝对路径不经过 Renderer / 转录。硬链接的不同路径分别保留。

### 5.3 本轮 Diff 实现与原生能力证据

FR-TOOL-002、FR-STATE-007、FR-INPUT-001；依据 §4.1 / §4.2、04 第 1 节事项 13 及用户 2026-10-18「continue to implement」。以下为 Main Agent 的实施记录与技术选择，不代表新功能人工验收。

- Adapter 以 `turn.diff.updated` 输出已绑定的原生 Thread / Turn、实际 CLI 版本、协议版本、来源及可用状态。绑定时先发 `client:native-turn-bound` 的 unknown 记录；`turn/diff/updated` 替换聚合快照，完成的 `fileChange` 按 item ID 替换其文件记录，并保留补丁、变更类型、移动路径及原生完成状态。实际 patch 来源只记录收到的通知。Runtime 代次、Thread / Turn 与活动轮次共同过滤重复、迟到及错投事件；完成后冻结。
- Session 以 `turn_diffs` 迁移（`2026101801`）按 App Turn 保存 JSON，事件 seq 作为修订，校验 Project / Session / App Turn 与原生身份。终态与补丁 final / outcome 在同一事务落盘；旧修订及已终结记录不可覆写。读取只接受该 Project / Session 的 Turn，旧历史没有记录时保持 unknown，不读当前工作区回填。Claude 未实现同等数据时返回 unavailable。
- 聚合 patch 限 512 KiB；全部单文件 patch 合计另限 512 KiB；最多 2000 条文件记录，单路径限 8192 UTF-8 字节。裁切不拆 Unicode，分别记录聚合、文件及列表截断。先仅对 patch / 路径 / 原因脱敏，再重新施加限额；结构身份和枚举不作文本脱敏。UI 复用只读 PatchView 的 4000 行显示限额，HTML 作为文本展示。
- Conversation 的完成 / 停止行与失败卡片提供“查看本轮变更”；只由用户点击打开，显示 Session / Turn、outcome、来源与覆盖提示，可选择聚合 / 原生文件记录。unknown、CLI 明确 empty、unavailable、failed 分别展示，不将未知文件数显示成 0；文件补丁不证明写入成功。点击工具栏 Diff 或“项目变更”返回共享工作区范围。
- 真实环境：macOS 15.6 arm64、Codex 0.163.0，协议类型仍锁定 0.161.0。Git / 非 Git 的原生 `apply_patch` 均收到聚合与完成文件补丁；对应 Shell 写文件均未收到这两类事件。因此该视图只保证展示收到的原生记录，不覆盖所有工作区修改，不宣称整个 0.163.0 协议已兼容。原生 mention 已在 Adapter、应用 UI 及独立特殊路径 fixture 中读出 prompt 未提供的 token；最新 Adapter 与应用 UI 均在命令运行中追加 mention，并在同一 Codex Turn 完成后读出随机 token。CLI 版本 / 场景 / 证据与独立结论见[本轮验收](../../tasks/archive/T20261009-context-tools/acceptance.md#2026-10-18-本轮-diff-独立评审w23)，应用 UI W24 主 Agent 复验见[W24](../../tasks/archive/T20261009-context-tools/evidence/W24-review.md)，实现者回归见[自检记录](../../tasks/archive/T20261009-context-tools/evidence/W0-turn-diff-report.md)。

Claude Code 真实能力仍暂缓且不随当前 V1 发布；以上应用 UI 结果是 Main Agent 技术复验，不扩大完整 AC-07、Codex 原生 Stop 或其他协议专项的通过范围。

### 5.4 VS Code 对齐（2026-10-26）

FR-TOOL-001～005、TOOLS-Q8～Q12、DEC-25：以下为已授权范围内的 AI 实现选择（2026-10-27），diff 待审阅。阶段、验证、当前缺陷与人工验收由[本轮任务](../../tasks/archive/T20261026-tools-vscode-parity/task.md)负责；此前 §5.1 的首轮导航 / 分区描述保留历史基线，不作为现行约束。

- Files 管理：原生上下文菜单只接受类型化项目 / 相对路径与限定动作；每批最多 500 项，逐项返回已完成路径及首个失败原因。创建使用排他打开，删除调用系统废纸篓；复制保留符号链接本身，不读取链接目标。Project 内变更进入串行队列，关闭使旧排队请求失效并等待已开始的变更完成。
- 不覆盖：macOS 辅助程序打开父目录时使用 `O_NOFOLLOW_ANY`，以 `renameatx_np(RENAME_EXCL)` 发布重命名 / 移动，目标被外部 CLI 或编辑器抢先创建时返回冲突，不回退到可覆盖的 `rename`。复制先写入目标目录下的私有临时目录，再以同一排他重命名发布；失败清理临时目录，避免复制过程中与外部新目录合并。系统不支持排他重命名时明确失败。原语依据：[Apple 对 RENAME_EXCL 的说明](https://developer.apple.com/documentation/foundation/urlresourcevalues/volumesupportsexclusiverenaming)；这不构成对恶意同用户进程持续替换整个目录树的隔离承诺。
- 辅助程序构建：Vite / Vitest 配置按两个辅助程序源码与编译脚本的摘要缓存调用系统 clang，最低 macOS 13；产物位于忽略的 `out/native/`，打包放入 `Resources/files/`。用户运行产物无需编译器。打包后校验文件存在及执行位，冒烟实际执行移动和拒绝覆盖；既有 fuse 不放宽。
- 文件树 / 查看：Git 状态复用项目 Diff 快照，被忽略项另行查询；文件、包含变更的目录及被忽略项的可访问名称携带状态。文件类型图标、预览 / 固定 Tab、跳转行、折叠、换行、Markdown 和有界图片查看复用现有只读查看链路，不加入保存接口。
- Quick Open：内置 ripgrep 列出非忽略文件，禁用用户 ripgrep 配置，输出 NUL 分隔并重新校验 Project 相对路径；Search / 索引共同使用 `project-ripgrep` 启动器，以 `O_NOFOLLOW_ANY` 固定根目录、核对预先校验的 dev / ino 后 `fchdir` 再执行内置 ripgrep；返回前再校验根目录身份，避免目录替换泄露外部结果；最多 200,000 项 / 64 MiB / 15 秒。关闭项目取消正在运行或尚在等待二进制解析的索引；截断 / 超时明确反馈。
- Search：独立 `search:run` / `search:cancel`，同窗口同项目新查询取消旧查询；ripgrep 支持字面 / 正则、大小写、整词、包含 / 排除，遵守 ignore 文件，不提供替换。最多 10,000 匹配 / 2,000 文件，跳过大于 5 MiB 的文件，20 秒超时，预览每行最多 240 字符；JSON 单记录最多 2 MiB、总输出最多 16 MiB，先截断每行子匹配到剩余预算，再以单次扫描转换 UTF-8 / UTF-16 偏移，避免 minified 文件的无界记录和重复前缀解码；达到任一上限即停止 ripgrep，结果为空时也显示截断提示，不伪装为没有匹配。结果按文件和行分组、UTF-16 范围高亮，点击走 Files 定位入口。
- Diff：项目差异加入列表 / 树、并排 / 行内、上一处 / 下一处、折叠未变更区域和打开文件；历史原生 patch 继续保持 §5.3 的来源及覆盖边界，任何视图控制都不新增 Git 写操作。
- Terminal：搜索插件、清屏同步主进程屏幕 / 序号，Tab 可重命名并呈现前台进程；分组保存于本次运行，窄面板上下排列、宽面板左右排列。拖入 Files 路径经 POSIX 引号插入，不自动执行；链接的 UTF-16 文本索引映射到 xterm 单元格，保留中文、引号 / 转义空格和带位置的绝对路径。文件必须经主进程确认属于 Project 且存在才提供点击入口，本地 HTTP 链接转 Browser、其他 HTTP 链接转系统浏览器。
- Browser：网页实例 / Tab 仍归 Project，浏览数据统一使用 `persist:studio-browser` 并跨重启共享；新增 Tab 最多 12 个 / Project。地址补全、导航历史、收藏、页面缩放、停止 / 后退 / 前进、DevTools 和系统浏览器入口均由限定命令驱动；历史 / 收藏按应用持久化。权限按网站询问并保存决定，下载使用系统保存对话框，清除入口删除共享浏览数据；保持 sandbox / contextIsolation / 无 Node 与无应用 Preload。浏览数据共享取代首轮项目分区，不等同网页获得应用或文件权限。
