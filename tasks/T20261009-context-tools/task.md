---
id: T20261009-context-tools
status: in_progress
fr: [FR-TOOL-001, FR-TOOL-002, FR-TOOL-003, FR-TOOL-004, FR-INPUT-001, FR-PROJ-002]
ac: [AC-07, AC-01]
specs: [specs/tools/spec.md, specs/input/spec.md, specs/session/spec.md, specs/agent-adapter/spec.md, specs/project/spec.md]
created: 2026-10-09
---

# Context 工具：Files、Diff、Browser、Terminal

## 本轮授权与状态

2026-10-13 用户新指令「推进运行时工具的开发。agents并发」授权启动 Terminal / Browser 及其 Project 关闭、应用退出接缝的开发。按下文阶段 2 / 3 并发实施，正常的本地 PTY / HTTP fixture 调用纳入验证；当时未安排真实模型场景，Files、两类 Diff 与完整 AC-07 仍由本任务跟踪，不将运行时工具阶段等同四工具交付。执行与 worker 分工见 [plan.md](plan.md)。

2026-10-14 用户回复「放宽安全限制，先实现功能为主。accept above, apply, continue implementing」：放宽 `style-src-attr`（DEC-02 例外），采纳上一轮汇报中的建议，并要求继续实现后续功能。Main Agent 的理解（用户可更正）：继续范围为阶段 1（Files + 项目 Diff）及其文件引用链路（Files → Input → Session → Adapter），文件引用只对模拟 Provider 验证；当时需要真实 Codex / Claude CLI 或模型调用的内容（文件引用的真实接收、原生轮次补丁、本轮 Diff）未获安排，因此保留。阶段 1 的计划、worker 与写入范围见 [plan.md](plan.md) 的「阶段 1」。

2026-10-17 用户指令「对尽快可以完成的worktrees 进行收尾，合并到main，clear worktrees」授权阶段收尾、合入 main 与清理附加 worktree。主 Agent 按既有阶段范围补齐最终验证，不扩大真实 CLI / 模型调用授权，不将合并视为人工产品验收；本轮继续本地合并、不推送的既有边界。

此前文档准备：用户于 2026-10-13 接受开发准备审阅建议，明确「accept all, not dev, update all docs」。当时仅更新文档，任务保持 ready；后续开发已由本节新指令启动。确认不扩及其他草稿中的无关未决项，文档 diff 待审阅。四工具 AC-07 仍未整体通过；真实 Codex 结果按 CLI 实际行为记录，应用不设置调用护栏。

2026-10-18 当前 V1 范围更新：真实 CLI 验收只执行 Codex；Claude Code 的实现、模拟验证和历史真实证据保留，不新增真实验收，也不随当前 V1 发布（DEC-19）。Codex 的模型、额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定，应用不设置调用次数、费用上限或自动重试护栏。后续工作保留 V1 内的 Files、项目 / 本轮 Diff、文件引用、原生补丁、Terminal / Browser 接缝和验证；扩展范围不插入 V1。固定上线排期取消；目标版本、发布准备范围和签名策略见 DEC-21、DEC-22。

同日最新指令“不要自动推荐，只更新文档即可”“不要推进，只更新文档即可”：本轮只同步文档，后续实现、真实 CLI 验证、打包、产物生成和发布均不执行；保留任务状态及已有验收结论，详见 [DEC-22](<../../docs/07. Decisions.md#dec-22-发布准备范围与本轮文档边界>)。

同日人工体验确认：用户明确路线图中人体验收的项目全部通过；本任务现有 Files / 项目 Diff / 文件引用、Terminal / Browser 与关闭 / 退出交互已验收，见[验收记录](acceptance.md#当前范围与人工功能验收)。未实现范围与真实 CLI 技术证据继续跟踪，不再等待现有功能的人工体验签收。

## 目标

在右侧边栏容器（[T20261009-project-shell](../T20261009-project-shell/task.md)）中实现四类工程工具（FR-TOOL-001～004；AC-07）。不在本轮（[T20261009-v1-foundation-slice](../T20261009-v1-foundation-slice/task.md)）范围内，先登记以保证拆分无遗漏。

## 范围

- 做：Files 目录树与“添加到对话”；Diff 的项目 / 本轮范围及不可用降级（FR-TOOL-002）；Browser（WebContentsView、地址栏、刷新、记忆上次地址）；Project 内轻量 Terminal Tabs（FR-TOOL-004）；轮次原生补丁的持久化与 Conversation 入口（04 第 1 节第 13 项）。
- 不做：完整 Source Control 工作台（[01. Product Definition](<../../docs/01. Product Definition.md>) 第 4 节非目标）。

## 依据

- 功能：[02. Functional Requirements](<../../docs/02. Functional Requirements.md>) 第 5 节。
- 界面：[03. UX Specification](<../../docs/03. UX Specification.md>) 第 5 节、D-08、D-13、P-B、P-C；[Shell Spec v02](../../design/components/shell-spec-v02.md) 第 6、9 节（已确认，2026-10-11，见其文档信息）。
- 技术：[04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 3 节（xterm.js、node-pty、Monaco、Git CLI、WebContentsView）、第 5 节、第 1 节第 13 项。
- 验收：[05. Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) AC-07。
- 决定：[DEC-08、DEC-09](<../../docs/07. Decisions.md>)；2026-10-10 用户在参考 ChatGPT Desktop 的建议后回复“agree your advice, update doc”。[调研记录](research.md) 区分官方公开行为和待验证能力。
- 本轮实现原则：[DEC-10](<../../docs/07. Decisions.md#dec-10-工程工具实现原则>)；用户 2026-10-12 对话「accept above suggetions, update all related docs」。[工具规格](../../specs/tools/spec.md) 承接原则与技术细节，当前确认范围见其文档信息。
- 开发准备：[DEC-14](<../../docs/07. Decisions.md#dec-14-工程工具开发准备>)；用户 2026-10-13 上述指令，确认 Browser 三项取舍、合并关闭确认及未来实施顺序；文件引用跨模块交付关联 FR-INPUT-001，关闭隔离关联 FR-PROJ-002 / AC-01。

## 验收标准

- [ ] 用户可以分别打开 Files、Diff、Browser、Terminal；关闭后 Main Canvas 恢复空间；Agent 不自行打开这些工具（AC-07）。
- [ ] 按 AC-07 的补充标准验证项目 / 本轮 Diff 的范围、原生补丁保存、并行轮次隔离及不可用降级。
- [ ] 按 AC-07 的补充标准验证多 Terminal 实例运行、新建 / 切换 / 关闭、隐藏面板及 Session Stop 隔离。
- [ ] 按 AC-07 的 2026-10-12 补充标准验证 Files 按需加载、文件刷新 / 上下文分离、Browser 本地页面和隔离、历史 patch 显示、终端重新附着与输出恢复；场景见 [工具规格 §5](../../specs/tools/spec.md#5-验证与实施边界)。
- [ ] 按 AC-07 的 2026-10-13 补充标准验证 Codex 实际收到文件引用、Browser 首轮边界和终端合并关闭 / 退出确认；Claude Code 的真实文件引用暂缓；下表为场景计划，尚无通过结论。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| Git Staged / Unstaged 等高级能力是否进入 MVP | 按 FR-TOOL-002 的基础只读范围执行，取舍见 DEC-08（2026-10-10 确认） |
| 每轮修改文件的识别方式；非 Git 目录是否需要 Diff 基线 | 按 FR-TOOL-002 和 04 第 1 节第 13 项采用原生轮次记录；非 Git 不自建项目基线，能力验证见下节（2026-10-10 确认） |
| Terminal 是否支持多实例 | 按 FR-TOOL-004 采用 Project 内轻量 Terminal Tabs，取舍见 DEC-09（2026-10-10 确认） |
| 关闭仍在运行进程的 Terminal Tab 时是否确认？ | 按 [工具规格 TOOLS-Q4](../../specs/tools/spec.md#12-已确认原则)；依据原型 v03 Q4（2026-10-11 确认） |
| 关闭最后一个 Terminal Tab 后显示什么？ | 按 [工具规格 TOOLS-Q4](../../specs/tools/spec.md#12-已确认原则)；依据原型 v03 Q5（2026-10-11 确认） |
| 本轮调研建议是否采用？ | 按 DEC-10 与工具规格 TOOLS-Q2、Q3；用户回复「accept above suggetions, update all related docs」（2026-10-12 确认） |
| 生产 CSP 是否放宽以让 xterm 运行时样式生效（W5-F3）？ | 仅为 `style-src-elem` 增加 `'unsafe-inline'`；用户在三个方案的取舍说明后回复「我选1」（2026-10-13 确认），记录见 [DEC-02](<../../docs/07. Decisions.md>) 的例外，提交 `c02f7a6` |
| 是否再放宽 `style-src-attr`，使 24 位色与 `minimumContrastRatio` 生效（W5-F6、W5-F9）？ | 放宽；用户回复「放宽安全限制，先实现功能为主」（2026-10-14 确认），同回复还采纳了上一轮汇报中的建议：接受调色板与毛玻璃浅色选区对比度取舍，光标保持常亮，重开 Project 自动创建终端保持现状，先定 CSP 再压缩提交并本地快进合入 main（不推送），并要求继续实现后续功能 |
| W5-F13、SET-Q6 / SET-Q7 的当前视觉取舍是否接受？ | 接受 W5-F13 的反显文字约 5.4–6.1:1 取舍；确认“纯色”名称与深色方案取值（2026-10-18，DEC-20）。现有功能人工体验的后续确认见[验收记录](acceptance.md#当前范围与人工功能验收) |

## 文档准备与未来阶段

依据 DEC-14，沿用本任务分阶段，不为四个面板建立重复记录。阶段 2 / 3 已按本节顶部的新指令启动；其无依赖的服务、界面和测试在独立 worktree 并发，主 Agent 顺序集成与原生窗口验证。阶段 0 的真实模型能力验证按 Codex CLI / 上游服务实际结果执行；应用不设置调用次数、费用上限或自动重试护栏。

| 阶段 | 交付 / 开始条件 | 完成条件 |
|---|---|---|
| 0 契约与能力验证 | 文档契约见 Tools §4；锁定应用、Codex CLI / 协议版本；按 Codex CLI 实际结果验证，Claude Code 暂缓且不随当前 V1 发布 | Codex 文件输入和原生补丁能力表，逐项写明支持、缺失、覆盖、证据；Claude Code 保留后续入口；确定存储迁移及关闭接口，模拟 / 真实结果分列 |
| 1 Files + 项目 Diff | 复用路径校验、文件读取和按需 Monaco；与阶段 0 的原生验证可分别推进 | 文件浏览 / 引用与 HEAD 项目 Diff 闭环；非 Git、未跟踪、特殊路径与失败反馈通过 |
| 2 Terminal | Project 关闭接口与输出恢复方案明确 | 多实例、屏幕 / 输出恢复、压力与清理验证通过；可用于启动本地服务 |
| 3 Browser | 首轮边界已确认，终端 / 测试服务可用 | 真实本地页面、Project 分区、导航提示、布局 / 焦点及生命周期验证通过 |
| 4 本轮 Diff 与综合验收 | 使用阶段 0 的能力证据与持久化契约 | 保存、历史恢复、Conversation 入口及降级通过；独立 AC-07 和受影响 AC-01 / 输入回归，提交人工功能验收 |

只将直接相关的文件输入、轮次补丁、关闭与隔离接缝纳入本任务；原生对齐其他遗留项仍由其负责任务跟踪，不等待全部收口。不以阶段完成替代四工具整体验收；正式交付仍按任务协议补充最终应用打包检查。

## 验收场景准备

下表是场景计划，执行结论及当前未覆盖范围见 [acceptance.md](acceptance.md)。运行环境：macOS arm64 实际 Electron 应用；自动化使用隔离 fixture / 模拟 Provider，Terminal 使用真实本地 PTY、Browser 使用真实本地 HTTP 页面；AI 交互从 UI 入口操作并截图。标注真实 CLI 的场景记录实际 CLI / SDK / 应用版本及 CLI 返回结果；应用不设置调用次数、费用上限或自动重试护栏。来源是 05 AC-07 的各次补充、FR-PROJ-002、FR-INPUT-001 及 Tools §3～5。

| 场景 / 来源 | 前置条件 | 用户操作 / 故障注入 | 预期 | 验证及证据 |
|---|---|---|---|---|
| Files 正常 / AC-07 | 含嵌套目录的隔离项目 | 展开、查看、增删文件、切换工具再返回 | 惰性加载，变化刷新，有效选择保留，查看不添加标签 | UI 截图、受控读取 / 文件事件测试 |
| 文件引用 / FR-INPUT-001 | Codex 草稿、已有 Session、View 对话及运行回合 | 添加 / 移除文件后普通发送或 Codex 原生追加 | Codex 正确接收引用，移除不提交，原生语义不变；Claude Code 真实接收暂缓 | Codex 真实接收证据、输入 / 记录回归；不能仅验标签 |
| 文件失败 / Tools §4.1 | 特殊路径、符号链接、删除 / 不可读 / 大文件 fixture | 添加后删文件，提交失败，读取中切换 Project | 无越界读取或错投，明确失败 / 降级，保留未接受输入 | 单测与 UI 错误截图 |
| 项目 Diff / FR-TOOL-002 | 已暂存、未暂存、未跟踪与重命名 fixture | 打开列表与单文件，查询中再修改 | HEAD 最终差异，包含未跟踪；不归因到 Session，旧响应不覆盖新响应 | Git fixture 断言、UI 截图 |
| Diff 边界 / AC-07 | 非 Git、无 HEAD、二进制、大文件及特殊文件名 | 打开项目 Diff | 内容可显示或明确说明原因；不误报无变更、不创建仓库 | fixture 检查、UI 截图 |
| 原生补丁 / 04 事项 13 | Codex 锁定版本；Git 与非 Git fixture | Codex 原生文件工具及 Shell 修改、多 Session / 多轮更新 | 按原生身份保存，覆盖差异有证据；不可用不假装 0；Claude Code 真实补丁暂缓 | 授权后的真实事件摘要、来源 / 能力表 |
| 历史与异常 / Tools §4.2 | 已保存补丁及旧历史，模拟重复 / 迟到事件 | 修改工作区、重启、查看旧轮次；模拟失败 / 中断 | 原 patch 不变，不串轮；未知 / 空 / 不可用 / 失败区分 | 数据库 / 迁移测试、UI 历史截图 |
| Terminal 恢复 / FR-TOOL-004 | 两终端分别运行服务与输出命令 | 隐藏 / 卸载面板，切换 Session / Project、resize、返回 | PTY 存活；ANSI / 光标与输出连续；大量输出不阻塞输入 | UI 截图、流序号 / 压力与进程证据 |
| Terminal 关闭 / TOOLS-Q4 | 多实例及最后一个实例 | Tab 关闭取消 / 确认，Session Stop | 取消保留；只结束目标；最后一个为空状态；Stop 不影响 PTY | UI 操作、进程退出 / 隔离证据 |
| Project / 退出 / FR-PROJ-002 | 仅终端、仅活动 Session、两者并存；另有其他 Project | 关闭 / ⌘Q、取消、确认；模拟清理失败再重试 | 合并一次确认，提示符 Shell 也计入；不误清理；失败可诊断，不自动重跑 | UI 截图、原生进程和失败注入测试 |
| Browser 导航 / FR-TOOL-003 | 本地服务及回环地址，外站跳转 fixture | 导航、刷新、重定向、新窗口；取消 / 选择系统浏览器 | 本地可用；外站提示，不自动外部打开，取消保留页面 | UI 截图、导航处理器测试 |
| Browser 分区与隔离 / AC-07 | 两 Project 的测试登录状态 | 同源访问、重启、访问 Node / IPC、权限请求 | Project 登录不混用，重启默认不恢复登录但恢复地址，网页无应用权限 | 独立安全检查、UI 与隔离证据 |
| Browser 布局 / AC-07 | 页面已加载 | 切工具 / Project、resize、开弹层；停服务 / 模拟网页崩溃 | 无覆盖应用控件，焦点恢复，错误可见，关闭 Project 释放实例 | UI 关键截图、webContents 生命周期检查 |
| 综合 / AC-01、AC-07 | 四工具集成且真实 CLI 条件满足 | 从 UI 浏览并引用文件、发消息、审阅两类 Diff、终端启动服务并预览 | 用户主动控制布局，跨 Project 不混淆，历史与运行资源正确 | 独立 AI 验收记录；人工功能验收另记 |

## 待验证与启动条件

- 按 04 第 1 节第 13 项先验证 Codex CLI 事件、覆盖范围、非 Git 原生补丁与历史恢复；Claude Code 同等数据保留后续入口；资料见 [research.md](research.md)。Codex 真实调用按 CLI 实际结果记录；本阶段未调用真实模型。
- 工具规格的本轮范围已确认；Terminal / Browser 与 Files / 项目 Diff / 文件引用代码已实现；阶段 1 的独立安全与界面复验已通过，适用基线、自动化门禁与未覆盖项见 [acceptance.md](acceptance.md)。本轮 Diff、轮次补丁存储与 Adapter 原生补丁接口仍待实现和验证。Browser 首轮问题已按 Q1、Q5、Q6 解决，未来扩展另行评估；现有 Adapter 任务不因此视为覆盖本轮 Diff。
- 2026-10-13 开发环境的 PATH 仍无全局 agent-browser，使用 `npx --yes agent-browser`，先读取其已安装版本的 core / electron 工作流，再操作隔离 Electron 应用。
- 未决执行条件：原生文件引用接收、补丁接口 / 迁移与版本能力验证（负责人：AI；按 Codex CLI 实际结果记录）。Claude Code 真实验收由 DEC-16 暂缓且不随当前 V1 发布（DEC-19）；运行时工具开发授权已解决，不再阻塞阶段 2 / 3。
- 交互原型 v01 / v02 尚未覆盖本次工具行为；[v03](../../design/prototypes/README.md#studio-灰度交互原型-v03)（探索中，[T20261011-prototype-v03](../T20261011-prototype-v03/task.md)）已做出项目 / 本轮 Diff 与 Terminal Tabs 供评审。Shell Spec v02 已确认（2026-10-11），v01 保留作历史依据。

## 执行记录

- 2026-10-18（人工体验结果同步，Main Agent）：用户确认路线图中人体验收的项目全部通过；更新本任务和验收记录的当前人工结论，现有功能不再列为待人体验。历史技术基线、未实现的本轮 Diff、真实引用及完整 AC-07 缺口保留；本轮只更新文档。

- 2026-10-18（V1 范围同步，Main Agent）：按 DEC-16～20 更新本任务的当前推进边界：Codex 是本轮唯一真实 CLI 验收对象，Claude Code 暂缓且不随当前 V1 发布；Codex 额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定，应用不设置调用护栏；W5-F13 与 SET-Q6 / SET-Q7 已由用户确认，见 DEC-20；扩展范围不插入 V1；固定上线日期取消，发布准备改为 GitHub Releases。发布物要求仍需人于发布前决定；人工体验的后续确认见上一条。历史验证基线不改写。

- 2026-10-17（阶段收尾，Main Agent）：独立 W21 安全终验与 W22 实际 Electron / 打包界面复验通过，证据与适用范围见 [acceptance.md](acceptance.md)。代码复核额外发现大小写 / Unicode 路径预折叠会漏传不同文件，已交实现 agent 修复，并由 W21 独立复验；Files 按实际 realpath 证明别名，Session 精确核对原始请求覆盖，未放宽路径安全校验。实现回写与人工产品验收状态保持分开；任务仍为 `in_progress`，本轮 Diff、原生补丁、真实引用与完整 AC-07 尚待后续。分支等价核对、残留备份及 worktree 清理记录见 [plan.md](plan.md#2026-10-17-worktree-收尾)。

- 2026-10-16（阶段 1 / all worktrees 继续，Main Agent）：六个 Files / Diff worker 的代码已完整导入 `feat/files-diff`；聚合分支为唯一集成候选，主 checkout 保持 main。W16 安全评审发现 Git hook / index 写入、目录竞态泄漏、错误详情脱敏与 macOS 引用别名问题，已交回实现者；W17 界面发现控制字符显示、截断顺序问题，由主 Agent 修复并新增回归。W18 / W19 接续独立复验，具体基线、结果与未覆盖项写入 [acceptance.md](acceptance.md)。同步 Tools / Input / Session / Adapter / Project 规格、桌面开发说明、路线图及架构工具节点，均为实现回写，diff 待人工审阅。旧 `runtime-tools-ui` 的未提交依赖与契约残留已核对：main 含相同依赖和更完整契约，无新功能待导入；保留原工作区，不覆盖或丢弃。任务仍为 `in_progress`，未将阶段实现记为真实 CLI 或完整 AC-07 通过。

- 2026-10-14（Runtime 工具阶段历史状态，Main Agent 记录）：Terminal、Browser 及 Project 关闭 / 应用退出接缝已实现并集成在 `feat/runtime-tools`，代码基线 `2223dad`；独立评审与验收结论、基线及未覆盖范围见 [acceptance.md](acceptance.md)（AI 结论：部分通过；人工功能验收：待人工验收）。本阶段不是四工具交付：Files、项目 / 本轮 Diff、文件引用与原生补丁尚未实现，无真实 Codex / Claude CLI 与模型调用，任务保持 `in_progress`。实现者自检（不计入独立结论）：`pnpm check:code` 通过（脚本 36、Adapter 241、桌面端 357）；Electron E2E 40 / 40；`pnpm package` + `pnpm smoke:packaged` PASS（含 Terminal 屏幕模型）。过程中的取舍与确认：生产 CSP 只放宽 `style-src-elem`（用户 2026-10-13「我选1」，DEC-02 例外，`c02f7a6`）；Adapter `dispose()` 由“不抛错”改为“清理未确认则拒绝并可重试”并新增 `releaseRuntimes(cwd?)`（AI 技术决定，规格草稿，diff 待审阅）。当时待人决定：是否追加 `style-src-attr 'unsafe-inline'`（W5-F6 真彩色丢失、W5-F9 ANSI 彩色背景上文字不可读）；毛玻璃浅色选区对比度 2.79–2.95:1 的“可读优先”取舍与浅 / 深调色板取舍；光标是否闪烁（W5-F7）；真实 CLI 场景尚未执行；何时把本阶段合入 main。后续决策见 DEC-16～20；W5-F13、SET-Q6 / Q7 已由用户确认；发布物要求留待发布前决定；现有功能人工体验的后续确认见本节 2026-10-18 记录。过程记录见 [plan.md](plan.md)。

- 2026-10-13：用户「accept all, not dev, update all docs」确认本轮建议并限定仅文档。Main Agent 在基线 4de166a 的 docs/tools-preparation worktree 更新 17 份相关文档：DEC-14、FR / UX / 技术要求 / AC、五个相关模块规格、工具规格、路线图、架构工具节点、设计说明与任务 / 调研。工具规格确认范围已同步；没有将其他旧提案一并确认，没有启动开发、能力探针或真实模型调用。完整工具任务保持 ready，未归档、未标记功能验收通过。
- 本轮文档自检（Main Agent，2026-10-13）：检查跨文档 FR / AC、Browser 分项决定、文件引用、轮次身份 / 存储、终端关闭与启动授权的一致性；清理旧的首轮 Browser 未决与 Session-only 关闭表述，保留历史原型与历史证据。16 份 Markdown 的 380 个标题、102 张表格结构检查通过；架构 HTML 脚本语法及 47 个静态 / 数据引用目标有效；本地链接回归检查 0 新增问题（4 个基线问题未增加），git diff --check 通过。检查复用主 checkout 的文档检查器及依赖，未安装应用依赖、未执行应用测试；未进行 HTML 浏览器视觉复验。文档更新已完成，diff 待人审阅；开发与验证仍按上文条件另行启动。

- 2026-10-12：依据本轮确认补充四工具调研、起草工具规格，更新 FR / UX / 技术要求 / AC / 决策 / 路线图 / 架构入口及模块依赖。仅执行文档更新，任务保持 `ready`；工具内容未实现，AC-07 未通过。新规格整体仍为草稿，确认原则与未决问题分别登记，本次 diff 待审阅。
- 本轮文档自查（Main Agent，2026-10-12）：在 `docs/context-tools` worktree、基线 `0c86b4e` 上检查 18 份 Markdown 的 384 个标题与 101 张表格，表格列数一致；架构 HTML 脚本语法及 26 组依据链接目标有效；`git diff --check` 与 `pnpm check:docs` 通过（0 新增、4 个基线问题保持原状）。通过 agent-browser 实际打开 HTML、点击 Diff / Browser / Terminal 节点，检查规格入口和未实现状态，并查看 Diff 详情截图；无页面脚本错误。这是文档自查，不是独立评审或应用功能验收；没有修改应用源码或发送模型请求。
- 提交门禁：HTML 文档按现有 scope 规则触发完整基础检查；Adapter 构建、全 workspace 类型检查及 395 项脚本 / 单元测试通过（36 + 181 + 178）。这些回归结果不替代未实施的工具功能验收。

- 2026-10-10：依据本次对话确认更新 02～07、Session 的 Diff 依赖和设计索引；新增 Shell Spec v02，保留 v01。任务转为 `ready` 表示三项范围问题已答复，不代表已开始代码实现或通过验收。本次文档 diff 待人工审阅。
- 文档自查：检查本次 13 份文档的标题与表格，170 个本地链接（含锚点）和 55 张 Markdown 表格结构检查通过，`git diff --check` 通过；复核 FR-TOOL-002 / 004、AC-07 与进度引用的一致性。旧的单实例说明仅保留在历史 Shell Spec v01，原型仍明确标注未实现。未运行应用测试，未改动应用代码；这不是独立验收。
