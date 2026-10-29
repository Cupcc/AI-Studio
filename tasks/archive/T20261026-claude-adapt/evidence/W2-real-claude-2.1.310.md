# W2 Claude Code 2.1.310 真实 Adapter 回合

日期：2026-10-26。执行者：Main Agent（开发者自检，非独立验收）。用户同日确认开始真实回合（对话回答「现在跑」）。

## 环境

- macOS 15（Darwin 24.6.0），arm64；Claude Code `2.1.310`，claude.ai 登录（`auth status` 仅取 `loggedIn` / `authMethod` / `apiProvider`，未记录账号信息）。
- Adapter 基线：工作树未提交 diff（本任务 effort / 版本分类改动；工作树另有 CLI 默认与 Codex 检测修复的未提交改动）；SDK `@anthropic-ai/claude-agent-sdk` 0.3.293。
- 用例：`packages/agent-adapter/test/claude/provider.integration.test.ts`，`AI_STUDIO_REAL_CLI=1`，临时项目（目录含空格、位于仓库外），模型 `haiku` / `sonnet`，每例设 `maxTurns` 与 `maxBudgetUsd`（0.3～0.8）。没有触发配额 / 限流错误。

## 运行记录

| # | 用例 | 结果 | 说明 |
|---|---|---|---|
| 1 | 目录 + 项目 Rule / Skill + 流式 + 恢复 + 模型切换 | 通过 | 默认 `settingSources`：项目 `CLAUDE.md` 与 `.claude/skills` 的标记均被回答；出现文字增量；按原生 ID 恢复后能复述上下文；`setModel` 后实际模型变化；目录读取前后 transcript 集合不变 |
| 1 | 命令授权 + Stop + 续聊 | 失败（用例断言） | `expected 23890 to be 23889`：pid 文件（命令进程）与首个命令行含标记的后代相差 1。用例原先假设首个含标记的后代即命令进程 |
| 2 | 同上，修正用例后重跑 | 通过 | 追踪「pid 文件进程 + 所有含标记后代」共 2 个进程：一次 `allow` 授权；Stop 后 `cleanup: confirmed`，两进程均退出；未重启 Runtime；原生 ID 不变并能继续下一轮 |
| 3 | 新增：`CLAUDE_EFFORT`（Bash 内可见）依次为选择的档位 | 通过 | `setReasoningEffort('low')` → `low`；`'max'` → `max`；`null` → `medium`（`haiku`、空 `settingSources` 下的原生默认） |

## 判断与边界

- 第 1 次的 Stop 失败归因于用例对进程结构的假设：2.1.310 的 Bash 工具经包装 shell 执行，使命令行含标记的后代不止一个（修正后实际追踪到 2 个）。该归因来自修正后用例的观察，未保留失败当时的进程列表。产品断言（Stop 后全部新增后代退出、同一原生会话继续）未放宽，只是把被观察对象从「首个匹配」改为「命令进程 + 所有匹配」。
- 本记录是 Adapter 层真实证据。未覆盖：桌面端 Electron 内的 Claude 流程与 effort 菜单、AC-03 真实并发、`AskUserQuestion` 与多请求答复、同轮文字拒绝（I-Q2 的 Claude 真实语义）、Running 中追加 / 排队、结构化附件、user / local 设置来源加载、脱离后代与外部 MCP 进程、宿主崩溃清理、SDK 0.3.310。
- 证据只含枚举结果、档位名和 pid 差异，不含认证响应或账号信息。
