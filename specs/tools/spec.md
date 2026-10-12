# Context 工程工具

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `tools` |
| 文档状态 | 草稿；下列已确认原则生效，新增规格细节及本次 diff 待审阅 |
| 覆盖需求 | FR-TOOL-001～FR-TOOL-004；文件上下文关联 FR-INPUT-001 |
| 相关验收 | AC-07；Project 状态隔离关联 AC-01 |
| 相关设计 | [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 6、9 节 |
| 来源 | [02 第 5 节](<../../docs/02. Functional Requirements.md#5-context-panel-与工程工具>)；[03 第 5 节](<../../docs/03. UX Specification.md#5-context-panel-交互模型>)；[04 第 3、5 节及事项 13](<../../docs/04. Technical Requirements.md>)；用户 2026-10-12 对话「accept above suggetions, update all related docs」 |
| 实施记录 | [工程工具任务](../../tasks/T20261009-context-tools/task.md)；本规格不表示工具内容已实现 |

## 1. 问题与决定

### 1.1 未决问题

| 编号 | 问题 | 建议与依据 | 决策方 | 阻塞范围 |
|---|---|---|---|---|
| TOOLS-Q1 | Browser 是否允许一般外站导航，登录数据是否跨启动保存，以及是否向 Agent 开放页面自动化？ | 本次确认的是本地 Web 预览及独立渲染上下文；竞品能力不能推导成新增产品范围。后续按 FR-TOOL-003 与 04 安全边界确定 | 人 | 阻塞对应扩展的规格定稿；不阻塞 localhost 预览 |

### 1.2 已确认原则

| 编号 | 决定 | 来源与确认日期 |
|---|---|---|
| TOOLS-Q2 | 保留 Monaco + Git CLI、xterm.js + node-pty、WebContentsView；文件树采用惰性加载和文件事件刷新 | 用户接受上轮实现建议（2026-10-12）；[DEC-10](<../../docs/07. Decisions.md#dec-10-工程工具实现原则>) |
| TOOLS-Q3 | 资源生命周期独立于面板挂载；切换工具或隐藏面板不销毁用户终端及输出；历史轮次补丁不能由当前工作区伪造原文 | 同 TOOLS-Q2（2026-10-12）；FR-TOOL-002、FR-TOOL-004 |
| TOOLS-Q4 | 关闭仍运行的 Terminal Tab 时面板内确认“结束并关闭 / 取消”；最后一个 Tab 关闭后显示“没有打开的终端”及新建入口 | [原型 v03 Q4、Q5](../../tasks/T20261011-prototype-v03/task.md)（2026-10-11 确认） |

## 2. 职责与边界

FR-TOOL-001～004：本模块负责右侧工具内容、文件及 Git 读取、浏览器实例、用户终端实例与工具内部状态。面板选择、宽度、模式切换由 [Project spec §5.5](../project/spec.md#55-与-project-viewtools后续-task) 负责；对话草稿及上下文标签由 [Input spec](../input/spec.md) 负责；原生 CLI 事件由 [Adapter spec](../agent-adapter/spec.md) 负责。

Project 级资源包括文件树、项目 Diff、Browser 状态、Terminal Tabs；本轮 Diff 以 Session / 原生 Thread / Turn 关联。Renderer 消费受控 IPC 的快照和事件；文件、Git、PTY 与 WebContentsView 由主进程服务管理（04 第 3 节）。

工具入口和跳转只由用户操作触发。Agent 的输出及文件事件可以更新内容，不改变当前工具、面板可见性或 Workspace 布局（02 Context Panel 操作原则）。

## 3. 行为细则

### FR-TOOL-001 Files

1. 用户打开 Files 后读取 Project 根节点；展开目录时按需读取其直接子项，不在打开面板时递归扫描整个项目（TOOLS-Q2）。文件查看使用按需加载的 Monaco；文件选择、查看与“添加到对话”分别处理，查看文件不自动附加上下文。
2. 主进程监听文件变化，合并短时间内的事件并刷新受影响节点；刷新保留仍有效的展开与选择状态。被删除或无法访问的条目显示当前状态，不将旧缓存作为最新内容（TOOLS-Q2；技术方案，待实现验证）。
3. 使用 Project ID 和相对路径请求读取；主进程确认 Project 身份、规范化路径并检查实际读取目标。目录遍历、失效路径和符号链接须单独验证，不通过通用 IPC 允许 Renderer 读取任意绝对路径（04 第 3 节；技术方案，待实现验证）。
4. “添加到对话”向当前 Project 中实际显示的 Session / 草稿添加可移除文件标签；发送前沿用 Input 的上下文通道，并核对文件仍存在。上下文提交及 CLI 能力降级由 Input / Adapter 承接，不因查看文件自动发送消息（FR-TOOL-001、FR-INPUT-001）。
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
4. 页面上下文与主应用分离，不自动继承系统浏览器登录。profile 持久化、一般外站及自动化范围由 TOOLS-Q1 负责。
5. 切换工具或 Project 时移除 / 隐藏实际嵌入视图，保存实例及已确认恢复状态；不得把隐藏页面留在当前内容上方。布局 resize、弹层遮挡、焦点返回、加载失败、服务器不可达及渲染进程退出需验证。关闭 Project / 退出应用时显式释放所属 webContents（技术方案，待实现验证）。

### FR-TOOL-004 Terminal

1. 首次用户打开时创建一个 Tab；随后用户可以新建、切换、关闭。每个实例使用独立 PTY，初始 cwd 为 Project Directory；xterm.js 处理显示与键盘输入，主进程服务处理进程、输出和 resize（FR-TOOL-004；04 第 3、5 节）。
2. PTY、实例列表和输出恢复状态由 Project 服务持有；UI 卸载、隐藏或重新挂载时可重新附着。仅将 `lastTool` 写入壳层不能恢复终端；快速切换须保证输出没有遗漏或重复（TOOLS-Q3）。
3. 输出缓存须有界，并设计附着时快照与实时流的交接及背压，防止大量输出阻塞界面。xterm 的显示模型需要持续更新或能够重建屏幕；仅保留若干文本行不能等同恢复 ANSI / 光标状态（技术方案，待实现验证）。
4. 关闭仍运行的实例先按 TOOLS-Q4 确认；取消不改变实例，确认后终止该实例并等待退出。关闭失败保留可诊断状态。最后一个 Tab 关闭后不自动创建新终端、不自动收起面板。
5. Session Stop、另一实例关闭或 Agent Runtime 故障不影响用户 PTY。Project 关闭和应用退出只清理可确认归属的资源；先有界等待退出，再按已有清理责任兜底。跨应用重启不声称恢复原 PTY 或自动重跑旧命令（04 第 5 节；Project spec PROJ-Q1）。

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

## 5. 验证与实施边界

FR-TOOL-001～004、AC-07：实现前记录正常、异常和回归场景，至少覆盖文件增删刷新及引用、特殊路径、两类 Diff 与历史不变性、CLI 缺失降级、Browser 隔离及 resize / 遮挡、多 PTY 在隐藏和重新挂载期间的输出、Session Stop 隔离、关闭取消及退出失败。Browser 的权限 / 进程隔离需要按任务协议独立技术评审，界面改动需要实际应用操作和截图。

原生轮次事件及非 Git 能力必须在锁定 CLI 版本验证；真实调用使用另行授权的范围 / 预算，模拟不替代真实结果。规格起草与本次确认不代表 AC-07 已通过；进度由 [06](<../../docs/06. Development Roadmap.md#33-工程工具>) 及工程工具任务负责。
