# D20261009 Project View Context 注入两种 CLI

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 日期 | 2026-10-09 |
| 关联 | FR-VIEW-006、FR-VIEW-007、FR-VIEW-008；UX 第 6 节“Project View 打开”、P-A；Shell Spec v01 第 6 节；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 3、5 节与第 7 节第 10 项；[06. CLI Integration Preflight](<../06. CLI Integration Preflight.md>) 第 6 节；[T20261009-project-view](../../tasks/T20261009-project-view/task.md) |
| 取代 | — |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。本草稿未经人确认，不得作为实现依据。

## 背景

FR-VIEW-007：从 Project View 创建 New Chat 时，先进入草稿，用户发送第一条消息才创建普通 CLI Session；自动引用当前 Project，并把当前 Project View 作为相关上下文；可按用户选择使用 CLI 原生 Skill / Agent / Instructions；Session 记录创建时所在的 View（`origin_view_id`）。FR-VIEW-006 禁止特殊的 Project Chat 或隐藏聊天系统。Shell Spec v01 第 6 节规定输入区的上下文标签包含“当前 View”，可单独移除。原则 19、20 与 04 第 3 节要求优先复用 CLI 原生能力。06 第 6 节把“Context 注入与 Project Knowledge 更新”列为 Project View 开发前必须完成的校验。

“View 上下文”要让 Agent 知道三件事：用户从哪个 View 发起对话；该 View 的 Knowledge 与 View Definition 文件在哪里、遵循什么 Schema；更新时事实与展示如何分开（FR-VIEW-004）。文件位置见 [D20261009-project-knowledge-storage](D20261009-project-knowledge-storage.md)。

本机核对的协议事实（[research.md](../../tasks/T20261009-project-view/research.md) 第 2 节）：

- Codex 0.161.0 的 `turn/start.input` 为 `UserInput[]`：`text`、`image`、`localImage`、`audio`、`localAudio`、`skill`、`mention`。没有“文件引用”或“上下文块”类型；`mention` 只指向 `app://` 或 `plugin://`；`skill` 只会匹配已进入 Skill 目录的项。`userMessage.content` 同为 `UserInput[]`，一条用户消息可含多个输入项。
- Codex `thread/start` 接受 `developerInstructions`，并返回 `instructionSources`。`skills/extraRoots/set` 能让应用内置的 Skill 目录被发现，不写用户目录，无需 `experimentalApi`。
- Claude Agent SDK 0.3.293：用户消息 `content` 可为多个文本块；`systemPrompt.append` 默认被快照，之后传入不同内容不会生效；`plugins`（本地目录）能加载内置 Skill；hooks 的 `additionalContext` 可每轮附加上下文（仅类型核对）；`additionalDirectories` 只授予文件访问并会加载该目录的 Skill / 命令 / 子 Agent。

## 决定

1. **注入内容（View Context）**：由客户端在用户发送第一条消息时生成，只含指针和规则，不内联 Knowledge 内容（避免过期副本与重复事实）：
   - 发起对话的 View（id 与标题）；
   - Knowledge、View Definition 文件的项目内相对路径及“存在 / 缺失”状态（发送时快照）；
   - 编写指南与 Schema 的路径（`.ai-studio/README.md`、`.ai-studio/schema/`）及 `schemaVersion`；
   - 五条以内的规则：这是普通对话，仅在用户要求时改代码；事实写 Knowledge、视觉写 View Definition；编辑前重读文件并优先小改动；保持文件符合 Schema；不改 `.ai-studio/` 下其他文件。

   示意（英文，面向模型；最终措辞随 spec）：

   ```text
   <ai-studio-view-context version="1">
   The user started this conversation from the "Architecture" Project View (id: architecture) of this project.
   Project Knowledge (facts): .ai-studio/knowledge/architecture.json (missing)
   View Definition (presentation, optional): .ai-studio/views/architecture.view.json (missing)
   Authoring guide and JSON Schemas: .ai-studio/README.md, .ai-studio/schema/ (schemaVersion 1)
   - This is an ordinary conversation. Change project code only when the user asks.
   - Facts go to the knowledge file, visual changes to the view file. Read the guide before writing either.
   - Re-read a file right before editing it and prefer small edits; other sessions may edit it too.
   - Keep files valid against the schema. Do not edit other files under .ai-studio/.
   </ai-studio-view-context>
   ```
2. **传递方式**：作为第一条用户消息里**独立的文本块**，排在用户原文之前，用户原文保持逐字不变。Codex：`turn/start.input = [ {type:"text", text:<View Context>, text_elements:[…]}, {type:"text", text:<用户文本>, text_elements:[…]} ]`，可用 `text_elements` 标出上下文块范围，使历史与恢复时仍能还原标记；Claude：`SDKUserMessage.message.content` 为两个文本块。两种 CLI 用同一份文本。只在第一条消息附带；后续轮次不重复，Agent 需要时自行重读文件。
3. **与界面的对应**：输入区的“当前 View”标签（Shell Spec v01 第 6 节）决定是否附带。移除标签后不注入，但 `origin_view_id` 仍记录（FR-VIEW-007 要求记录创建时所在 View，与是否附带上下文无关）。Session 需额外记录“第一条消息是否附带了 View Context”（建议字段 `view_context_attached`），Conversation 把带 `<ai-studio-view-context>` 标记的文本块折叠显示为上下文标签，而不是原文。
4. **客户端自有文件的写入时机**：发送前由客户端幂等地确保 `.ai-studio/README.md`、`schema/`、`.gitignore` 为当前版本，不触碰 `knowledge/`、`views/`。进入 View 或打开草稿本身不写文件、不建 Session（FR-VIEW-007）。
5. **“生成 <View>”入口的分工**（UX 第 6 节）：填入输入框的可编辑文本只说明“要生成什么”，路径与规则由 View Context 提供，避免两处重复。具体文案属后续 spec。
6. **原生 Skill / Agent / Instructions 的选择**（FR-VIEW-007 第 4 点）：与 View Context 相互独立，沿用各 CLI 的原生输入方式（Codex 的 `skill` 输入项，Claude 的斜杠命令 / Skill）。候选清单可分别取自 Codex `skills/list` 与 Claude `initializationResult().commands`（均已在本机验证）。由 Adapter 与输入区 task 实现。
7. **V1 不采用**的原生机制：写入 AGENTS.md / CLAUDE.md、`developerInstructions` / `systemPrompt.append`、`thread/inject_items`、打包 Skill、Claude hooks。理由见备选方案；其中打包 Skill 与 Claude hooks 保留为后续优化。

## 备选方案

| 方案 | 放弃原因 |
|---|---|
| 把 View Context 拼进用户文本同一个字符串 | 改写了用户原文，历史回读和 Conversation 展示无法可靠区分，也无法为 Codex 单独标记 |
| 内联当前 Knowledge 内容 | 增加 token，第二个 Session 读到的是旧快照；事实被复制进对话，违背“事实只存一处”；Agent 自己读文件即可 |
| 客户端向 AGENTS.md / CLAUDE.md 写入说明 | 修改用户跟踪的文件，违背“不静默改动用户内容”；Codex 的指令链有 32 KiB 合并上限；Claude 需要配置源包含 `project` 才加载（06 校验为隔离使用空来源），Adapter 的配置加载边界尚未确定。优点是在应用外运行 CLI 也生效，但这要新增需求，V1 放弃 |
| `thread/start.developerInstructions`（Codex）/ `systemPrompt.append`（Claude） | 用户看不到也无法移除，与“上下文标签可单独移除”和透明性冲突；Claude 的 append 被快照，之后无法随 View 变化；Codex 在 `thread/resume` 后是否保留未验证。保留为后续优化 |
| `thread/inject_items`（Codex） | 追加原始 Responses 项，属于低层接口，绕过普通输入管线，版本敏感 |
| Codex `mention` 输入项 | 只支持 `app://`、`plugin://` 目标，不能引用文件（协议注释） |
| 打包 Skill：Codex 用 `skills/extraRoots/set`，Claude 用 SDK `plugins` | 两条加载路径均已在本机验证可行，且不写用户目录，也复用了原生 Skill。V1 不采用是因为需要模型决定调用或额外的显式调用输入，两条路径实现各异；先用文本块 + 项目内指南跑通闭环，待 Adapter 稳定后评估把长指南迁入 Skill，View Context 缩成短指针 |
| Claude hooks（`UserPromptSubmit` / `SessionStart` / `PostToolUse` 的 `additionalContext`） | 能在每轮动态附加上下文，也能在 Agent 写完文件后立即回传校验错误，是有价值的 Claude 专属增强；但 Codex 没有已验证的等价物，两种 CLI 行为不一致，且未运行验证。列为后续增强 |
| 通过 additional directories 或额外可写根暴露知识目录 | 知识在项目内，不需要；还会扩大用户 Session 的权限 |
| 自研 MCP 工具提供 Knowledge 读写 | 属于自研 Agent 工具层，违背原则 19、20 |

## 影响

- T20261009-agent-adapter：首条消息支持多个文本块；Claude 用户消息需标注 `origin: {kind:'human'}`（SDK 注释要求宿主包装人工输入时显式标注，缺省会在严格的人类信任检查处失败）；不需要追加可写目录。
- T20261009-session-slice / project-view：Session 保存 `origin_view_id` 与建议新增的 `view_context_attached`（若采纳需由主 Agent 在 04 第 5 节登记，经人确认）；Conversation 折叠显示上下文标签。
- 未验证、需要在 Adapter 联调时确认：多个 `text` 输入项是否合并为同一条用户消息、历史读回的形态（需要模型调用，本轮不做）。
- 每个带 View Context 的新对话多约 200 token；不影响后续轮次。
- 在 CLI 终端中恢复该 Session 的用户会看到这段文本，这是透明性的一部分。

## 未决问题

| 问题 | 推荐 |
|---|---|
| View Context 文本使用英文还是中文 | 英文：面向模型的指令，与 CLI 自身的系统提示语言一致；界面上折叠为标签，不影响用户 |
| 在会话中后续轮次（含从别的 View 继续该对话）是否重新附带 | 不重新附带；FR-VIEW-008 与 P-A 只在对应 View 列出由其创建的对话，Session 的 View 上下文固定为 `origin_view_id` |
| 打包 Skill 与 Claude hooks 何时评估 | Adapter 稳定、`specs/agent-adapter` 确定配置加载边界后；触发条件为指南文本过长或需要“写完即校验”的反馈 |
| 用户移除“当前 View”标签后，Preview 仍照常自动刷新是否合适 | 合适：刷新由文件变化触发，与是否附带上下文无关 |

## 依据

- 需求与界面：FR-VIEW-006、FR-VIEW-007、FR-VIEW-008；[03. UX Specification](<../03. UX Specification.md>) 第 6 节、P-A；[Shell Spec v01](../../design/components/shell-spec-v01.md) 第 6、7 节；[01. Product Definition](<../01. Product Definition.md>) 第 8 节原则 16、19、20；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 3、5 节；[06. CLI Integration Preflight](<../06. CLI Integration Preflight.md>) 第 3、6 节。
- 本机协议核对：[W1-view-probes-results.json](../../tasks/T20261009-project-view/evidence/W1-view-probes-results.json)；`codex app-server generate-ts`（0.161.0）的 `v2/TurnStartParams.ts`、`v2/UserInput.ts`、`v2/ThreadStartParams.ts`、`v2/SkillsExtraRootsSetParams.ts`；Claude Agent SDK 0.3.293 的 `sdk.d.ts`。详见 [research.md](../../tasks/T20261009-project-view/research.md) 第 2、3.3 节。
- 官方资料：[Codex App Server](https://learn.chatgpt.com/docs/app-server)；[Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)；[Claude Code permissions：Working directories](https://code.claude.com/docs/en/permissions#working-directories)；Codex 协议源码注释（tag `rust-v0.161.0`，`codex-rs/protocol/src/user_input.rs`）。
