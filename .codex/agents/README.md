# 项目 Subagents

本目录配置用于开发 AI Developer Studio 的 Codex 子 Agent，采用 [Codex 原生自定义 Agent 格式](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents)。

## 角色入口

| 配置 | 分工 |
|---|---|
| [architect.toml](architect.toml) | 实现前的架构与接口分析 |
| [runtime_engineer.toml](runtime_engineer.toml) | 主进程、CLI Adapter 与运行时实现 |
| [ui_engineer.toml](ui_engineer.toml) | React 界面、交互与实现者自检 |
| [reviewer.toml](reviewer.toml) | 独立代码评审 |
| [verifier.toml](verifier.toml) | 独立执行验证与记录验收证据 |

各角色的适用条件与行为由对应 TOML 的 `description` 和 `developer_instructions` 负责。主会话承担协调、共享文件集成和最终收尾。常规查代码可使用 Codex 内置 `explorer`。专项安全、性能或文档工作按任务分配给现有角色。

## 技能配置

每个角色的 TOML 用 `[[skills.config]]` 按名称显式启用适合的现有技能，`developer_instructions` 指定使用条件。清单不是独占白名单，未列出的技能继续按父会话配置继承。启用不代表每次调用，角色在任务需要时读取对应 `SKILL.md`。字段与匹配规则见 [Codex 配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)。

设计、React、Vitest 和浏览器技能来自[项目技能目录](../../.agents/skills/README.md)，安装版本和工具依赖由该目录负责。`pstack:*` 来自父会话已安装的 pstack 插件，`openai-docs` 来自 Codex 系统技能；角色配置按名称匹配，避免绑定本机用户名或插件缓存版本路径。

这些配置引用已安装技能，不安装插件或复制技能文件。更换环境后，以当前技能目录为准；缺失时说明缺少的技能及其影响，不宣称已加载。技能不能扩大角色的写入范围、替代独立验收或改变产品决策边界。技能要求的额外 worker 由主 Agent 统一安排。

## 协作与配置边界

主 Agent 按任务需要选择角色，不要求每次启动全部角色。并行写入范围、worktree、单一写者和交付报告遵循 [Task Protocol](../../tasks/README.md#parallel-workers)，本机共享资源按[贡献指南](../../CONTRIBUTING.md#2-分支规范)串行使用。评审与验收的独立性按[验收要求](../../tasks/README.md#acceptance)判断，角色名称本身不构成独立证据。

每个 TOML 定义一个角色。当前省略模型与推理强度字段，由 Codex 根据调用参数、用户配置和父会话解析。权限、Provider 与 MCP 沿用父会话；指令中的“只读”是职责限制，不是独立沙箱。加载和覆盖规则以[官方 Subagents 文档](https://learn.chatgpt.com/docs/agent-configuration/subagents)为准。

本目录没有配置固定并发数，不修改用户的全局 Codex 设置。需要调整并发时使用 `.codex/config.toml` 中 `[agents]` 的 `max_concurrent_threads_per_session`，该值不含主会话。

仓库[全局规则](../../AGENTS.md)继续生效。应用内 Agent Team 工作台的展示契约仍由 [Project View spec](../../specs/project-view/spec.md#默认-view-的内容边界)负责。

## 验证边界

配置变更检查 TOML 解析、必需字段、技能名称是否存在，以及当前本机 Codex 的角色发现和技能选择器解析结果。角色行为仍需在实际委派任务中观察；配置被发现不代表各角色已完成端到端运行验证。文档本地链接按[脚本说明](../../scripts/README.md#文档检查边界)检查。

2026-11-11 本机 Codex 0.167.1 的 `codex debug prompt-input` 已在角色目录中列出上述五个角色。五份 TOML 解析与必需字段检查通过，检查范围选择及文档门禁的 60 项脚本测试通过。此轮未发送模型任务，不记录角色端到端执行通过。
