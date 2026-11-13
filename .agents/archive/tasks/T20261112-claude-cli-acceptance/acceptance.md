# 验收：T20261112-claude-cli-acceptance

## 未覆盖与待决事项

- 打包应用：未执行。本轮只覆盖开发构建（`electron-vite build` 产物）。复测条件：`pnpm package` 后使用打包应用重跑 AC-02 / Stop / 恢复。
- 应用自定义连接（URL / Key）下的 Claude 远端调用：未执行，本轮使用本机 claude.ai 登录（"本机"模式）。复测条件：取得可用的 Claude API Key 或网关。2026-11-13 已用用户提供的网关实测，见 [CLI 安装任务 W3](../../../../tasks/T20261108-cli-install/acceptance.md#2026-11-13-claude-自定义连接实测w3)。
- 一键安装的真实网络流程：未执行（本机已安装 Claude Code）。
- Reasoning Effort 切换对 Claude 的实际作用：未单独验证；本轮只核实了模型选择。
- AC-06 Project View、工具面板与 Claude 的组合：未覆盖。
- 审批的 "Allow and apply suggested permissions" 选项：未操作。
- 人工决定（2026-11-12）：用户回复“没测的不需要你测了”，以上各项不作为本轮验收的前置条件。这不表示这些项已通过，后续如需要再单独安排。

## 人工功能验收

- 状态：已验收。
- 范围与版本：Claude Code Session 核心链路，即下方“验收结果”所列场景；`dev` @ `0404448` 的开发构建；未覆盖项见上节，未列入接受范围。
- 人工记录：2026-11-12 用户在对话中回复“测试通过”，并要求并入。

## AI 结论与运行环境

- 总体结论：**部分通过**。本轮范围内的场景全部通过，未发现阻塞缺陷；打包、自定义连接与安装等项未覆盖，用户已决定不作为本轮前置。
- 验收者：Main Agent（Claude Code 会话）；未参与 Claude Provider 实现，本轮未改产品代码。
- 日期与代码基线：2026-11-12；`0404448fbeaf26016356b70710d08d1c2871402c`（worktree `test/claude-cli-acceptance`，无代码 diff）。
- 平台与应用形态：macOS 26.6，Apple Silicon arm64；Electron 开发构建，隔离 userData，CDP 供 agent-browser 0.41.2 操作。
- Provider 与 CLI：真实。Claude Code 2.1.322（claude.ai 登录，Team 订阅；`claude auth status` 显示已登录，凭据未记录），Claude Agent SDK 0.3.293；对照的 Codex CLI 0.167.2。
- 测试数据：`/tmp/ai-studio-claude-live/project`（合成 git 仓库，含 `README.md`、`math.js`）。

## 验收结果

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| CLI 可见与模型目录 | 设置 → CLI；New Chat 下拉选 Claude Code；打开模型选择 | Claude Code 可用；原生模型目录 | 设置显示"可用"；新对话标记 CC、提示在项目目录执行；目录含 Default (recommended)、Opus / Sonnet / Haiku 各版本 | agent-browser，真实 | 通过 | [新对话](evidence/W1-01-claude-new-chat.jpg) |
| AC-02 创建 Session 与流式 | 发送"读取 math.js 并写 300 字说明" | 列表出现、Running、工具记录、流式、完成 | 列表出现并转圈；Read 工具记录、推理摘要；Markdown 结果；"Worked for 10s · Done"。另一会话以 0.5 秒间隔采样，文本长度从 61 逐步增至 1168 | agent-browser，真实 | 通过 | [执行中](evidence/W1-02-running-tool.jpg)、[完成](evidence/W1-03-first-turn-done.jpg)、[采样](evidence/W1-stream-samples.txt) |
| AC-03 Claude + Codex 并发 | Claude 写 3000 字长文期间新建 Codex 会话并发送，再切回 Claude | 同时运行，切换不打断 | 两项同时显示 Running；切回 Claude 时文本 996→1079→1143 持续增长；均正常完成 | agent-browser，真实 | 通过 | [并发](evidence/W1-04-claude-codex-concurrent.jpg) |
| AC-03 两个 Claude 并发 | 两个 Claude 会话先后发送长文 | 同时运行 | 两项同时 Running，均完成 | agent-browser，真实 | 通过 | [两个 Claude](evidence/W1-15-two-claude-concurrent.jpg) |
| AC-04 后台完成提醒 | 正在查看会话 A 时，Claude 长文在后台完成 | 后台会话出现绿点 | 状态由 Running 变为 Completed Unread | agent-browser，真实 | 通过 | [后台完成](evidence/W1-05-background-completed-unread.jpg) |
| FR-STATE-005 点击清除 | 窗口置于前台后点击带绿点的会话 | 绿点清除 | 被点击会话的 Completed Unread 消失，其他会话不变 | agent-browser + 主进程聚焦窗口，真实 | 通过 | [清除](evidence/W1-16-focused-click-clears.jpg) |
| S-Q1(c) 未聚焦时查看 | 窗口未聚焦，在正在显示的会话发送并完成 | 仍产生绿点 | 产生 Completed Unread（主进程 `isFocused()=false`） | agent-browser + 主进程只读检查 | 通过 | 本记录 |
| AC-05 问答型 Needs Input | 要求 Agent 调用 AskUserQuestion，选择 multiply 并提交 | 橙色 Needs Input、显示问题；回答回传 | 列表橙点；"等待你的回答"卡片含两个选项与自由输入；提交后显示"已答复：multiply"，Agent 回复"你选择了给 math.js 新增 multiply"，未改文件 | agent-browser，真实 | 通过 | [问题](evidence/W1-08-needs-input-question.jpg)、[回答](evidence/W1-09-question-answered.jpg) |
| AC-05 审批型 Needs Input | 测试项目设 `defaultMode: default`；要求 Write notes.txt；先 Deny，再在同一会话重试并 Allow once | Deny 时不写入；Allow 时写入 | 卡片列出 Write 与目标路径；Deny 后文件不存在，Agent 回复"写入被拒绝"；Allow once 后 `notes.txt` 内容为 `hello from claude` | agent-browser + 文件检查，真实 | 通过 | [审批卡片](evidence/W1-10-needs-input-approval.jpg)、[拒绝后允许](evidence/W1-11-deny-then-allow.jpg) |
| Stop | 长文输出约 400 字时点击 Stop | 本轮结束，"已停止"，无 Error / 绿点，不再增长 | 1 秒内显示"Worked for 19s · 已停止"；3 秒后长度不变；该会话无状态点；Runtime 保持空闲（规格允许） | agent-browser + 进程检查，真实 | 通过 | [已停止](evidence/W1-06-stopped.jpg) |
| Stop 后继续 | 同一会话追问被中断文章的主题 | 保留上下文 | 回答"铁路的历史"，复用同一 Runtime，3 秒完成 | agent-browser，真实 | 通过 | [继续](evidence/W1-07-continue-after-stop.jpg) |
| 正常退出清理 | 无运行中回合时退出应用 | Runtime 全部释放 | 退出前 11 个 Claude / Codex Runtime，退出后全部结束 | 主进程 `app.quit()` + 进程检查 | 通过 | 本记录 |
| 重启后恢复 | 重启应用，打开退出前已完成的 Claude 会话并追问 | 按原 CLI session ID 恢复，保留上下文 | Project 与 8 个会话恢复；Runtime 以 `--resume=<原 ID>` 启动；回答"10 段，第一段《海边的'呼吸'》"，与原文标题一致 | agent-browser + 进程参数，真实 | 通过 | [恢复](evidence/W1-13-resume-after-restart.jpg) |
| 异常退出恢复（S-Q7） | Claude 输出中对应用主进程 kill -9，再重启 | 中断轮显示 Error 文案与重试；残留进程被清理 | kill 后空闲 Runtime 自行退出，运行中的 Claude 进程成为孤儿（ppid=1）；重启后该进程已结束，归属登记目录清空；会话显示"应用退出时本轮未完成 / 重试"；重试重新流式输出，再次 Stop 正常 | agent-browser + 进程检查，真实 | 通过 | [崩溃恢复](evidence/W1-14-crash-recovery.jpg) |
| 显式模型选择 | 两个新会话分别选 Sonnet 5.5、Haiku 5.5 | CLI 使用所选模型 | 原生会话记录中 assistant 的 model 分别为 `claude-sonnet-5-5` 与 `claude-haiku-5-5`；默认会话为本机默认 `claude-opus-5-5` | 只读检查 `~/.claude/projects/` 中对应测试项目的记录 | 通过 | 本记录 |
| FR-TOOL-002 本轮 Diff | Allow once 写入后点击"查看本轮变更"，再切到项目变更 | Claude 无原生补丁时明确降级 | 显示"本轮补丁不可用：此 CLI 尚未提供可用的原生轮次补丁"，与 tools spec 一致；项目变更列出 `notes.txt`（未跟踪） | agent-browser，真实 | 通过（已知能力边界） | [Diff](evidence/W1-12-turn-diff-unavailable.jpg) |

## 发现与观察

| 编号 | 级别 | 内容 | 处理 |
|---|---|---|---|
| O1 | P3 体验 | 审批卡片重复显示工具名："Write"作为标题出现一次，在路径列表下又出现一次。 | 不阻塞；建议在审批卡片整理时合并 |
| O2 | 观察 | 项目变更中未跟踪文件的统计显示 `+0 -0`，与 Claude 无关。 | 未展开；是否属于预期由 tools spec 负责人判断 |
| O3 | 观察，未复现 | 测试中有一次正在显示的会话在窗口未聚焦时完成却没有绿点，另有几个绿点在没有点击的情况下消失。之后做了确定性复测（窗口未聚焦，主进程确认 `isFocused()=false`），结果符合 S-Q1(c)。推测当时窗口曾被前台操作聚焦过，但无法证实。 | 记录；人工验收时可在前台 / 后台切换下留意 |

## 执行说明

- 除替换原生打开目录对话框、通过 `app.quit()` 正常退出、聚焦窗口一次以及只读的主进程检查外，所有操作都从可见入口执行，没有注入会话状态。
- 首次尝试用系统按键操作原生对话框时，按键落到了其他前台窗口，没有影响测试应用；随后改为上述对话框替换。
