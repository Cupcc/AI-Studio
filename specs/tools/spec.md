# Context 工程工具

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `tools` |
| 文档状态 | 已确认（2026-10-13） |
| 确认范围 | 用户接受本轮审阅建议「accept all, not dev, update all docs」；技术契约为 AI 细化、待实现验证，本次 diff 待审阅；不代表开发授权或功能验收；§5.1 为运行时开发阶段的 AI 技术决定（2026-10-13），不是人工产品确认，diff 待审阅；运行时开发授权见 §5 |
| 覆盖需求 | FR-TOOL-001～FR-TOOL-004；文件上下文关联 FR-INPUT-001 |
| 相关验收 | AC-07；Project 状态隔离关联 AC-01 |
| 相关设计 | [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 6、9 节 |
| 来源 | [02 第 5 节](<../../docs/02. Functional Requirements.md#5-context-panel-与工程工具>)；[03 第 5 节](<../../docs/03. UX Specification.md#5-context-panel-交互模型>)；[04 第 3、5 节及事项 13](<../../docs/04. Technical Requirements.md>)；用户 2026-10-12 对话「accept above suggetions, update all related docs」 |
| 实施记录 | [工程工具任务](../../tasks/T20261009-context-tools/task.md)、[运行时执行计划](../../tasks/T20261009-context-tools/plan.md)及[验收记录](../../tasks/T20261009-context-tools/acceptance.md)；实现与验收状态以任务为准 |

## 1. 问题与决定

### 1.1 未决问题

首轮范围无阻塞产品未决项。TOOLS-Q1 已拆为下节 Q1、Q5、Q6 并确认；一般外站、可选持久化和页面自动化若后续纳入，需另行产品决定，不阻塞首轮本地预览。真实 CLI 能力及预算见第 5 节，不作为已解决的实现问题。

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

## 2. 职责与边界

FR-TOOL-001～004：本模块负责右侧工具内容、文件及 Git 读取、浏览器实例、用户终端实例与工具内部状态。面板选择、宽度、模式切换由 [Project spec §5.5](../project/spec.md#55-与-project-viewtools后续-task) 负责；对话草稿及上下文标签由 [Input spec](../input/spec.md) 负责；原生 CLI 事件由 [Adapter spec](../agent-adapter/spec.md) 负责。

Project 级资源包括文件树、项目 Diff、Browser 状态、Terminal Tabs；本轮 Diff 以 Session / 原生 Thread / Turn 关联。Renderer 消费受控 IPC 的快照和事件；文件、Git、PTY 与 WebContentsView 由主进程服务管理（04 第 3 节）。

工具入口和跳转只由用户操作触发。Agent 的输出及文件事件可以更新内容，不改变当前工具、面板可见性或 Workspace 布局（02 Context Panel 操作原则）。

## 3. 行为细则

### FR-TOOL-001 Files

1. 用户打开 Files 后读取 Project 根节点；展开目录时按需读取其直接子项，不在打开面板时递归扫描整个项目（TOOLS-Q2）。文件查看使用按需加载的 Monaco；文件选择、查看与“添加到对话”分别处理，查看文件不自动附加上下文。
2. 主进程监听文件变化，合并短时间内的事件并刷新受影响节点；刷新保留仍有效的展开与选择状态。被删除或无法访问的条目显示当前状态，不将旧缓存作为最新内容（TOOLS-Q2；技术方案，待实现验证）。
3. 使用 Project ID 和相对路径请求读取；主进程确认 Project 身份、规范化路径并检查实际读取目标。目录遍历、失效路径和符号链接须单独验证，不通过通用 IPC 允许 Renderer 读取任意绝对路径（04 第 3 节；技术方案，待实现验证）。
4. “添加到对话”向当前 Project 中实际显示的 Session / 草稿添加可移除文件标签；发送前沿用 Input 的上下文通道，并核对文件仍存在。Files → Input → Session → Adapter 属于同一交付链路，普通发送及原生支持的运行中追加 / 排队都须传递文件引用，不能只保存标签或静默丢弃附件；两种 CLI 分别验证实际接收。具体转换见 §4.1（FR-TOOL-001、FR-INPUT-001；2026-10-13 确认）。
5. 不可读目录、文件被删除、二进制及超出读取 / 显示限制的文件应给出对应状态；读取和显示限额由 AI 在实现时结合性能证据确定，不宣称支持完整 IDE 的文件编辑能力（技术方案，待实现验证）。

### FR-TOOL-002 Diff

1. 从工具入口进入项目变更；从 Conversation 完成行进入该 Session / Turn 的本轮变更，标题清楚标识来源和关联轮次。范围规则以 FR-TOOL-002 为唯一产品依据。
2. 项目变更通过 Git CLI 查询当前工作区相对 HEAD 的最终差异；文件列表包含已暂存、未暂存、未跟踪内容。未跟踪文件须单独发现并与空内容比较，不能仅执行一次 `git diff HEAD` 就宣称覆盖完整（TOOLS-Q2；技术方案）。
3. Git 命令使用参数数组和路径分隔符；禁止外部 diff 程序、关闭颜色输出、解析支持特殊文件名的机器格式。以差异退出码表示“有变化”的命令不当作运行失败；重命名、二进制、大文件、无首个提交和查询期间文件变化均纳入验证（技术方案）。无 HEAD 时不能报告“没有变更”，须解释基线不可用；不自动创建提交或仓库。
4. 本轮聚合补丁按原生 Thread / Turn 替换更新，不将多次通知重复累加；文件完成状态由原生完成事件确定。最终补丁随历史保存，后续工作区修改不重算旧轮次（04 事项 13）。不承诺 Shell / 外部工具修改具有相同原生覆盖范围。
5. Monaco 双文本 Diff 只在具备对应历史两侧内容时使用。原生只提供 unified patch 时，直接展示保存的 patch；当前工作区内容不能充当历史原文。无法展示的内容按原因说明，整体原生记录缺失按 FR-TOOL-002 降级（TOOLS-Q3）。
6. 文件数未知保持未知；原生记录明确为空才可显示 0。多个 Session 共享目录时项目变更不能归属于当前 Session；查看本轮变更不得混入另一 Session / Turn。

### FR-TOOL-003 Browser

1. 用户输入本地 Web 地址并导航；支持刷新与恢复上次地址，保留 Project 级状态。开发服务器可由用户 Terminal 运行；当前范围不要求新增自动启动预览、服务器管理器或 Agent 页面自动化（FR-TOOL-003；工程工具任务）。
2. 主进程持有独立 WebContentsView，网页禁用 Node，开启隔离和 sandbox，不加载应用 Preload、不暴露 `window.studio`。localhost 的脚本同样不能获得应用权限（04 第 3 节；TOOLS-Q2）。
3. Renderer 通过限定命令传递导航、刷新、布局尺寸及可见性；主进程校验请求与尺寸。网页导航、新窗口、权限请求、下载和系统浏览器打开按各自处理器管理，不能复用主应用的可信 Renderer 身份（技术方案，待实现验证）。
4. 页面上下文与主应用分离，不自动继承系统浏览器登录。导航范围、Project 分区和跨重启行为按 TOOLS-Q1、Q5、Q6；普通外站导航、重定向和新窗口请求不能绕过相同入口策略，也不自动打开系统浏览器。网络子资源与顶层导航分别处理，不将本地导航范围误写为禁止页面正常加载外部资源。
5. 切换工具或 Project 时移除 / 隐藏实际嵌入视图，保存实例及已确认恢复状态；不得把隐藏页面留在当前内容上方。布局 resize、弹层遮挡、焦点返回、加载失败、服务器不可达及渲染进程退出需验证。关闭 Project / 退出应用时显式释放所属 webContents（技术方案，待实现验证）。

### FR-TOOL-004 Terminal

1. 首次用户打开时创建一个 Tab；随后用户可以新建、切换、关闭。每个实例使用独立 PTY，初始 cwd 为 Project Directory；xterm.js 处理显示与键盘输入，主进程服务处理进程、输出和 resize（FR-TOOL-004；04 第 3、5 节）。
2. PTY、实例列表和输出恢复状态由 Project 服务持有；UI 卸载、隐藏或重新挂载时可重新附着。仅将 `lastTool` 写入壳层不能恢复终端；快速切换须保证输出没有遗漏或重复（TOOLS-Q3）。
3. 输出缓存须有界，并设计附着时快照与实时流的交接及背压，防止大量输出阻塞界面。xterm 的显示模型需要持续更新或能够重建屏幕；仅保留若干文本行不能等同恢复 ANSI / 光标状态（技术方案，待实现验证）。
4. 关闭仍运行的实例先按 TOOLS-Q4 确认；取消不改变实例，确认后终止该实例并等待退出。关闭失败保留可诊断状态。最后一个 Tab 关闭后不自动创建新终端、不自动收起面板。
5. Session Stop、另一实例关闭或 Agent Runtime 故障不影响用户 PTY。Project 关闭和应用退出只清理可确认归属的资源；先有界等待退出，再按已有清理责任兜底。跨应用重启不声称恢复原 PTY 或自动重跑旧命令（04 第 5 节；Project spec PROJ-Q1）。
6. Project 关闭 / 应用退出按 TOOLS-Q7 由 Project 统一确认；终端服务报告未退出实例并负责准确清理，不逐个叠加 Tab 关闭弹窗。确认取消不改变实例；关闭窗口但未退出应用沿用既有后台运行规则。

## 4. 状态与接口

FR-TOOL-001～004：以下为技术方案，待实现时验证；接口必须登记在现有类型化 IPC，不提供通用 shell / fs / execute 接口。

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

FR-TOOL-001、FR-INPUT-001：以下由 AI 于 2026-10-13 细化，待实现验证。Files 添加动作绑定 Project 与当前显示的草稿 / Session 身份；异步读取结束不能把结果添加到后来切换的其他对话。Input 保存可移除的文件引用，Session 在发送时经主进程重新校验 Project、相对路径、实际目标与可访问性，构造 Provider 输入；文件查看缓存不作为已发送内容。

优先使用 CLI 原生文件引用；Provider 无对应结构化输入时核对其原生文本引用方式，明确转换及覆盖边界，不伪称已提交结构化附件。引用不等于文件内容快照，不自动内联全文或覆盖用户权限。校验 / 提交失败向输入区返回原因并保留未接受的输入；原生权限拒绝按原生结果呈现。现有附件类型及发送链路差异见 [Adapter](../agent-adapter/spec.md#313-工程工具接缝) 与 [Input](../input/spec.md#context--attachment-入口与上下文标签)。

### 4.2 轮次补丁契约

FR-TOOL-002：AI 技术方案（2026-10-13，待实现验证）；Adapter 提供原生数据与能力证据，Session 保存关联，Tools 只读展示。逻辑字段如下，具体 TypeScript / SQL 命名在实现时确定：

| 字段 | 语义 |
|---|---|
| 身份 | Project、App Session、App Turn、Provider、原生 Thread / Session 与 Turn；原生缺少某级 ID 时保留关联依据，不伪造原生 ID |
| 来源 | CLI / SDK 版本、原生事件类型及覆盖说明；Shell / 外部工具覆盖不能由文件数推断 |
| 可用状态 | unknown（未取得可信记录）、available（有记录）、empty（原生明确为空）、unavailable（接口不提供）、failed（接收 / 读取失败）；附原因 |
| 原始数据 | 原生 unified patch 与文件条目、原生完成状态；缺历史完整文本不生成虚构两侧内容 |
| 修订 | 同轮递增 revision、接收时间及是否终态；聚合 patch 替换更新，不累加；过期事件不能覆盖新 revision |

原生事件同时校验运行时代次及轮次归属；重启读取已保存记录，不按当前工作区重算。旧历史无记录保持 unknown / unavailable，不回填零变更。回合失败 / 中断可保留已收到的 patch 和实际状态，不能将收到补丁视为写入成功。终态之后的迟到事件依据锁定协议验证处理，不挪入下一轮。持久化与迁移需纳入独立评审。

### 4.3 Terminal 与 Browser 接口准备

FR-TOOL-003、004：AI 技术方案（2026-10-13，待实现验证）。

- Terminal 的 create / attach / input / resize / close 均校验 Project、Terminal ID 与实例代次；attach 返回可重建屏幕的快照和流序号，再衔接增量，避免遗漏或重复。服务维护有界屏幕 / 回滚状态与流量控制；关闭期间拒绝新输入，退出事件与清理结果分开表达。实现时确定缓存阈值，以 ANSI 光标、resize、大量输出及重新附着场景验证，不把无限日志或纯文本尾部作为屏幕恢复方案。
- Browser 的 navigate / reload / bounds / visibility 命令与加载 / 错误事件绑定 Project 和实例代次；独立内存 session 分区，地址单独持久化。主进程解析 URL，核对协议与回环目标；顶层导航、重定向和新窗口使用一致策略。系统浏览器打开须经用户选择并校验 URL，不接受任意协议执行。
- 权限请求、权限检查、下载各设显式处理器；未授权能力不自动放行，不关闭 webSecurity 解决预览问题。若后续需要新增权限交互或下载产品能力，记录有归属的产品问题，不在实现中擅自扩大范围。
- 工具 / Project 切换、窗口 resize 与应用弹层都驱动嵌入视图显隐及 bounds；弹层期间不允许网页覆盖应用控件，结束后恢复焦点。Project 关闭失败不得先移除 Tab 再丢失错误入口。

参考：[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)、[session 分区](https://www.electronjs.org/docs/latest/api/session)、[xterm.js 流量控制](https://xtermjs.org/docs/guides/flowcontrol/)。官方接口说明不替代本项目验证。

## 5. 验证与实施边界

FR-TOOL-001～004、AC-07：实现前记录正常、异常和回归场景，至少覆盖文件增删刷新及引用、特殊路径、两类 Diff 与历史不变性、CLI 缺失降级、Browser 隔离及 resize / 遮挡、多 PTY 在隐藏和重新挂载期间的输出、Session Stop 隔离、关闭取消及退出失败。Browser 的权限 / 进程隔离需要按任务协议独立技术评审，界面改动需要实际应用操作和截图。

原生轮次事件及非 Git 能力必须在锁定 CLI 版本验证；真实调用使用另行授权的范围 / 预算，模拟不替代真实结果。规格起草与本次确认不代表 AC-07 已通过；进度由 [06](<../../docs/06. Development Roadmap.md#33-工程工具>) 及工程工具任务负责。

此前文档准备仅更新文档（2026-10-13 指令）；后续用户「推进运行时工具的开发。agents并发」授权 Terminal / Browser 及其生命周期接缝实施。真实模型调用范围 / 预算仍未确定。阶段与当前验证由 [工程工具任务](../../tasks/T20261009-context-tools/task.md) 维护，不将运行时阶段通过等同四工具 AC-07 完成。

### 5.1 运行时实现细化

FR-TOOL-003 / 004、FR-PROJ-002：以下为主 Agent 在上述开发授权内的技术决定（2026-10-13），不是新增人工产品确认。

- Terminal：主进程 `@xterm/headless` + SerializeAddon 持有屏幕，1000 行回滚；UI 按需加载 xterm。输出分 16 KiB chunk，256 / 64 KiB 水位控制 PTY 暂停 / 恢复；attach 返回屏幕与流序号，快照写入完的首个 ACK 启动增量，迟到的 attachment 不能退订新的显示。屏幕解析背压与 Renderer ACK 背压独立；隐藏或 Renderer 崩溃解除显示订阅，主进程屏幕继续更新。实例上限为 16 / Project、32 / 应用，超限明确反馈；不自动重跑跨重启的命令。屏幕检查点（emulator state schema 1）绑定锁定的 `@xterm/*` 版本（xterm 6.0.0 的私有结构），升级须重跑 ANSI 差分验证（含逐单元格属性 / 链接与将来 VT 状态）。xterm 在运行时注入 `<style>`，生产 CSP 因此对 `style-src-elem` 放宽（DEC-02 例外，用户 2026-10-13 确认），并因 24 位色与 `minimumContrastRatio` 经 `style` 属性写入而对 `style-src-attr` 放宽（用户 2026-10-14 确认），E2E 断言这些样式在构建后的应用里真实生效。配色（AI 技术决定，2026-10-13，待人工审阅）：每种外观方案（浅 / 深）使用显式 xterm 调色板，不依赖 xterm 默认值；ANSI 0–15 对该方案的名义背景及毛玻璃实测最差背景均 ≥ 4.5:1，默认文字 ≥ 7:1，选区文字 ≥ 4.5:1，光标与反色可读；毛玻璃下视口保持透明。代价：浅色方案的 ANSI 色比常见终端更深，“白 / 黑”在浅 / 深方案中分别是深灰 / 浅灰，经典的前景 / 背景配对对比度偏低；毛玻璃下选区与背景的区分度低于 3:1。xterm 的 `minimumContrastRatio` 取 5.5，使 ANSI / 24 位色背景上及程序自带颜色的文字按单元格调整到可读（xterm 按不透明名义背景计算，毛玻璃浅色的真实像素更暗，取 4.5 时实测仅 3.7–4.3:1，W5-F12）；已知代价：反显文字实测约 5.4–6.1:1，低于调色板默认的 14–19:1，块颜色保留（W5-F13，已记录）；固定比值不能覆盖壁纸比实测更暗的毛玻璃（亮度 0.65 约需 6.75）；具体取值与测算见 `terminal-theme.ts` 及其测试，真实窗口的实测结果见[验收记录](../../tasks/T20261009-context-tools/acceptance.md)。
- Browser：每个 Project / 实例代次独立内存分区，导航只接受 HTTP / HTTPS localhost、127/8 或 `::1`；页面的普通网络子资源不受顶层回环限制。地址单独保存在 `app_meta`，无登录状态持久化；窗口恢复时未被选中的后台 Project 不创建 view、不加载已保存地址，首次选中并显示 Browser 后才创建实例并恢复上次地址。应用公共导航 guards 只用于应用窗口，预览 view 自己处理导航、新窗口、权限及下载；Shell 切换及窗口事件先校验显隐，DOM 弹层和原生退出提示均遮挡 / 移除 view。
- 生命周期：Session Stop 与 Tools 端口分开；Project / 退出合并列出 Session 与 Terminal。确认后等待准确归属清理，失败 / 超时不批准关闭或退出；保留底层实际清理锁，拒绝新 Session / PTY / Browser 操作，直至清理 settled。退出批准前依次停止回合、清理工具，再可逆地释放全部空闲 / 已退役 Session Runtime，任一失败拒绝退出、应用保持打开并可重试；退出失败取消后可继续使用保留的 Project；不把退出通知等同受管资源已清理。

接口登记在 `shared/ipc/browser.ts`、`shared/ipc/terminal.ts`；Project 关闭通过 `MainToolPort` 组合，不提供通用 fs / shell / execute IPC。具体验证与已知边界由验收记录维护。
