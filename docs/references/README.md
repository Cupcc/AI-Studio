# 参考项目

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 文档职责 | 收集对 AI Developer Studio 有帮助的项目，简述参考模块、参考点、原因和资料入口；链接各项目的详细调查 |
| 最后核对 | 2026-11-10 |
| 需求来源 | 2026-11-10 用户对话：整理 Codeg、Grok Bot、DeepSeek Harness、ZCode、Meldwork、OpenDesign、Claude Desktop、ChatGPT Desktop，并补充相关项目；随后补充 Octop，核对其与 WorkBuddy 的关系；继续要求将 Harness 插件调查落稿并更新工作台讨论 |

选择依据是本 app 的[产品定位](<../01. Product Definition.md#2-产品定位>)：本地 Project、真实 CLI Session、AI Conversation、Project Knowledge 和 Project View。优先收集能帮助组织会话、呈现执行状态、审阅结果和理解项目的做法。

除 [DeepSeek Harness 专项调查](deepseek-harness/README.md)已阅读固定版本的相关源码外，本清单只核对公开仓库与产品文档，尚未逐项读代码；所有项目均未在本轮做实机验证。参考点和调查顺序是初步建议。表中的“产品资料”表示本轮未确认完整客户端源码可用，后续可结合官方演示、解读文章和本地软件截图研究。用户所写 `opendeisn` 按现有产品文档中的 OpenDesign 整理，指向 `nexu-io/open-design`。

## 首批参考项目

| 项目与资料入口 | 可用材料 | 对应本 app 模块 | 参考点与原因 |
|---|---|---|---|
| [Codeg](https://github.com/spacering-net/codeg) · [To-dos](https://docs.codeg.app/guide/tasks) | 开源仓库、官方文档 | Project、Session、Agent To-dos、Diff | 多种 CLI 的会话聚合，以及任务排队、Worktree、审阅、跟进和交付流程。与本 app 的多会话管理和已规划 To-dos 最接近，适合优先调查。 |
| [Grok Bot](https://docs.x.ai/grok-bot/overview) | 产品资料、后续实机观察 | 会话状态、通知、产物、自动化 | 长任务的进展、需人介入的时机、文件结果与定时工作入口。可参考如何减少用户反复查看进度；其共享云电脑与本 app 的本地执行环境不同。 |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [专项调查](deepseek-harness/README.md) | 开源仓库；已阅读固定版本的相关源码，未实机验证 | 工作台扩展、Session 创建入口、设置 | 左侧入口与主面板注册、Creator 草稿及生成安装流程、包声明、加载和卸载职责。调查记录区分可参考的机制、执行边界与移植成本。 |
| [ZCode](https://github.com/zai-org/ZCode) · [产品文档](https://zcode.z.ai/en/docs/install) | 官方开源仓库、产品文档 | 桌面壳、Conversation、工程工具、CLI Adapter | Electron 桌面、共享 UI、服务端与 Agent CLI 的组织方式，以及工程操作如何进入对话。可对照本 app 的客户端与执行层职责。 |
| [Meldwork](https://github.com/Ryder-Sun/Meldwork) | 开源仓库、架构说明 | CLI Adapter、状态、权限、结果记录 | 多种本地 Agent 的接入、人工决策入口、运行记录与恢复。适合研究不同 CLI 能力如何如实呈现；其自动讨论和编排另作扩展参考。 |
| [OpenDesign](https://github.com/nexu-io/open-design) · [官方入口说明](https://open-design.ai/official/) | 开源仓库、产品演示 | Project View、自定义工作台、Preview、产物 | 对话与实时预览配合，设计系统、模板和图片等产物在同一项目中组织。与项目视图及五图工作台讨论直接相关。 |
| [Claude Desktop](https://academy.claude.com/tutorials/navigating-the-claude-desktop-app) · [Claude Code 桌面文档](https://code.claude.com/docs/en/desktop) | 产品资料、已有截图、后续实机观察 | Composer、Conversation、上下文、权限、Diff | 输入与附件分组、文件上下文、权限请求、代码审阅和预览。可研究通用对话与开发任务如何在桌面中衔接，并对照 Claude Code 原生能力。 |
| [ChatGPT Desktop](https://help.openai.com/en/articles/9703738-chatgpt-macos-app-release-notes) · [Work with Apps](https://help.openai.com/en/articles/10119604-work-with-apps-on-macos) | 产品资料、后续实机观察 | 应用布局、Conversation、Composer、上下文 | 对话层级、输入区、伴随窗口和应用上下文入口。重点观察留白、信息密度及上下文反馈，为本 app 的轻量桌面体验提供对照。 |

Codeg To-dos 的已定范围与建设顺序见[路线图 §4.1](<../06. Development Roadmap.md#41-agent-to-dos-分阶段建设规划>)；自定义工作台的确认见 [09](<../09. Workbench Discussion.md>)，详细行为见[工作台规格](../../specs/workbench/spec.md)。本清单不新增产品需求、排期或技术选型。

## 补充参考项目

### 会话管理与工程工作流

| 项目与资料入口 | 可用材料 | 对应本 app 模块 | 参考点与原因 |
|---|---|---|---|
| [Codex 桌面体验](https://learn.chatgpt.com/docs/features) · [CLI 源码](https://github.com/openai/codex) · [App Server](https://learn.chatgpt.com/docs/app-server) | 桌面产品资料；CLI 与 App Server 开源 | Session、CLI Adapter、审批、Diff | 项目与会话导航、Worktree、执行事件、审批和恢复。既是交互对照，也是现有 Codex 接入的直接依据；CLI 开源不代表完整桌面 UI 开源。 |
| [OpenCode](https://github.com/anomalyco/opencode) | 开源 CLI 与桌面客户端 | CLI Adapter、Conversation、模型与权限设置 | 同一 Agent 的终端和桌面交互、多模型配置及权限呈现。可比较桌面如何呈现执行能力，并为未来扩展 CLI 接入提供候选。 |
| [Conductor](https://www.conductor.build/docs/concepts/workflow) | 产品资料、后续实机观察 | Worktree、Diff、To-dos 交付 | 隔离工作区、运行与预览、Diff 行内评论回传 Agent、PR 检查和归档。适合研究从并行开发到人工审阅的连续操作。 |
| [cmux](https://github.com/manaflow-ai/cmux) · [通知机制](https://github.com/manaflow-ai/cmux/blob/main/docs/notifications.md) | 客户端开源；服务端部分目录另有许可 | Session 状态、通知、Terminal、Browser | 垂直工作区导航、未读提醒、通知聚合与跳回工作位置。可帮助设计多 Session 的注意力管理，减少用户来回找正在等待的 Agent。 |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) · [维护状态公告](https://www.vibekanban.com/blog/shutdown) | 开源；官方宣布公司关闭、项目转社区维护 | Agent To-dos、Worktree、Diff、Preview | 任务看板、独立工作区、行内审阅反馈和应用预览。作为任务执行与审阅的设计样本，详细调查时区分历史功能与当前可用能力。 |
| [Cursor](https://cursor.com/learn/reviewing-testing) | 产品资料、后续实机观察 | Files、Diff、上下文引用、工程工具 | 查看实时改动、将分支 Diff 作为上下文、停止并纠正 Agent。可借鉴从工程信息回到对话的局部交互，控制本 app 的默认信息密度。 |
| [Zed 与 ACP](https://zed.dev/docs/ai/external-agents) · [Zed 源码](https://github.com/zed-industries/zed) | 开源编辑器、官方接入文档 | CLI Adapter、能力发现、会话呈现 | 编辑器通过 ACP 承载外部 Agent，会话 UI 与 Agent 自身的认证、配置和运行时分工。可评估扩展接入时哪些部分能共用、哪些差异需要保留。 |

### 自定义工作台与产物交互

| 项目与资料入口 | 可用材料 | 对应本 app 模块 | 参考点与原因 |
|---|---|---|---|
| [OpenWork](https://github.com/different-ai/openwork) | 桌面与核心开源；`ee/` 为另行许可的源码可见部分 | 工作台、文件、Skills、MCP 设置 | 基于 OpenCode 的桌面工作区与能力配置，是 Claude Cowork 的第三方替代方案。可研究如何把 CLI 能力组织成面向具体工作的入口。 |
| [Octop](https://github.com/TencentCloud/Octop) · [ACP 接入](https://github.com/TencentCloud/Octop/blob/main/docs/acp.md) | 腾讯云官方开源仓库，MIT；当前 README 未声明是 WorkBuddy 的开源版本 | CLI Adapter、Project Knowledge、插件与连接器、自动化 | 双向 ACP、外部编码 Agent 委派、知识库与持久记忆、插件配置和定时任务。可研究如何组织外部执行能力与长期上下文；其自托管多用户平台以专家 Agent 为中心，Project 聚合仍列在路线图中，不能直接套用本 app 的 Project / Session 模型。 |
| [Open CoDesign](https://github.com/OpenCoworkAI/open-codesign) | 开源第三方 Claude Design 替代项目 | Conversation、Preview、产物导出 | 对话生成原型、幻灯片和 PDF 的工作流。可与 OpenDesign 对照预览和产物组织的实现，为自定义工作台寻找更小的参考单元。 |
| [MCP Apps](https://github.com/modelcontextprotocol/ext-apps) | 官方开放协议、开源 SDK 与示例 | 自定义工作台、嵌入页面、宿主通信 | 工具声明交互 UI、宿主在沙箱 iframe 中展示页面并传递数据。可帮助研究页面与 Agent 的交互边界；是否采用协议需另行评估。 |

## 建议先展开的调查

1. **Codeg**：围绕已规划的 To-dos，串起创建、执行、等待、审阅、继续修改和交付，找出各状态的入口与恢复方式。
2. **OpenDesign、DeepSeek Harness、MCP Apps**：Harness 的[首轮源码调查](deepseek-harness/README.md)已完成，后续补创建到卸载的实机观察；OpenDesign 与 MCP Apps 继续分别调查工作台操作和页面与宿主通信，服务于自定义工作台原型验证。
3. **Codex、Claude Desktop、ChatGPT Desktop、cmux**：用相同场景比较输入、运行、等待介入、完成未读和切回会话，补足当前桌面交互的参考。

其他项目按具体模块需要展开。这是调查建议，顺序可随当前工作调整。

## 后续资料如何落稿

README 保留项目摘要；详细调查按项目放在本目录的 `<project>/README.md`，有材料后再增加入口。视觉截图与操作证据沿用 [design/references](../../design/references/README.md)，由调查文档链接，避免重复保存。

- 开源项目从相关模块和架构文档入手，记录版本或 commit；复用代码前核对目标文件及依赖许可。
- 没有完整客户端源码的项目结合官方文档、演示和本地操作；解读文章、非官方复刻或替代项目单独标明来源，不能据此断言原产品的内部实现。
- 实机记录注明应用版本、系统、日期、窗口尺寸和操作步骤。除正常流程外，按模块需要观察空状态、等待输入、错误、重试与恢复；截图隐去账号和私有项目内容。
- 每份调查回答：观察到了什么、对应本 app 哪个模块、收益是什么、适用边界是什么，并区分来源事实、实机观察和我们的建议。
