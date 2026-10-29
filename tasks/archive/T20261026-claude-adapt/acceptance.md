# Claude 适配独立验收

## 未覆盖与待决事项

- 打包 Provider 菜单缺口已由 W7 补齐；I-Q2 新测试基线的完整套件与最终定向复验已通过，但历史两次超时未唯一归因，最终增强断言后的完整套件没有重跑。未完成的场景不视为通过。
- Running 中追加 / 排队、结构化附件没有新增产品行为授权，不纳入本轮交付。
- macOS 13 实机、user 来源规则 / Skill、多请求并存、外部共享 MCP 与未观察后代的退出证明未覆盖；不扩张既有证据。
- Claude Code 仍按 DEC-19 不随当前 V1 发布；本轮技术验证不改变 AC / V1 发布及人工功能验收结论。人工入口沿用 [task](task.md)。
- **人工功能验收：已验收（2026-10-29）**，范围与依据见[人工功能验收](#人工功能验收)。

## AI 结论与运行环境

- 总体技术结论：通过本轮已授权的开发验证范围；已完成静态评审、针对性单元检查、应用内授权卡 / 拒绝、等待授权期间的 Codex 混合并发、默认关闭与打包开关边界，并独立复验开发态 effort 选择 / 复位。I-Q2 后续测试语义修正的完整套件 6/6、最终定向 1/1 通过，历史两次超时仍未唯一归因；最终增强断言后的完整套件未重跑。不能把 2.1.310 / 2.1.311 的真实回合结论外推到其他版本，也不据此宣称全部上游时序稳定。
- 验收者：W4 `repo_status`；未参与本分支功能实现，源码只读。发现的问题交 Main 修复。
- 证据复核者：W6 `cli_verify`，未参与功能实现；2026-10-28 独立查看 W4 五张截图、启动 fixture、保留 SQLite 与 marker 文件状态，补齐已执行但未落稿的 W4 界面结果；本次复核未重新发送真实模型请求。
- 最终界面复验者：W7 `/root/tools_verify`，未参与 Claude 功能实现；2026-10-28 独立操作打包与未打包真实 Provider 界面，源码只读，不发送用户消息或模型请求，见文末最终复核。
- 日期与基线：2026-10-27，`e85d64f420ba14c322995321a81c98112fc3c0bf`；Claude 专项 diff 相对依赖 `53baac0`；构建前 `apps/` / `packages/` 无未提交修改，见 [baseline](evidence/W4-baseline.json)。
- 环境：macOS 15.6 arm64，Node 26.10.0；本分支构建与未签名 arm64 包；Claude Code 2.1.311、Codex 0.164.0、SDK 0.3.293。
- 隔离：仅使用仓库外临时 Project 和独立 userData；不改用户配置、不记录身份或凭据。真实调用沿用 task 所载「现在跑」「approve , implement」及 2026-10-27 续推授权。

## 验收结果

各行保留其运行基线；W4 的 I-Q2 历史失败结论由紧随其后的 W5 / W6 行补充当前结果，不改写原始证据。

| 场景与来源 | 操作与预期 | 实际结果 | 方法 | 结论 | 证据 |
|---|---|---|---|---|---|
| task 本轮实现、Adapter §3.12 | 独立核对 native 目录 / 默认标记、effort 设置与复位、Runtime 恢复、开发开关和所有新增集成用例 | Claude 专项源差异已审查，未发现阻塞缺陷；支持范围与已知限制保留 | 代码及需求交叉复核 | 通过（静态范围） | `git diff fix/cli-management...e85d64f` |
| FR-INPUT-001、Adapter §3.12 | Claude 模拟目录、非法档位、下一轮设置、复位及恢复 | 48 / 48 通过 | 独立 Vitest | 通过 | [Claude unit](evidence/W4-unit-claude.log) |
| FR-CHAT-002、FR-INPUT-001、AC-05 | 受影响 Session 服务与 Renderer 回归 | 124 / 124 通过 | 独立 Vitest | 通过 | [desktop unit](evidence/W4-unit-desktop.log) |
| Adapter 类型、打包准备 | Adapter typecheck；从同一基线重新生成 arm64 包 | 命令均成功；产物 `apps/desktop/dist/mac-arm64/AI Developer Studio.app`；尚未宣称包运行通过 | 类型检查 / electron-builder | 通过（构建范围） | [typecheck](evidence/W4-typecheck-adapter.log)、[package](evidence/W4-package.log) |
| AC-05、应用内授权卡与拒绝 | 隔离项目为 `default` + `Bash(*)` ask；在真实 Claude Session 请求 `touch w4-approval-ran.txt`，卡片中填写原因后点击 Deny | W4 截图显示真实 Bash 审批卡；保留数据库记录 `answered / deny / W4 decline reason`，同回合 completed，Agent 正文明确命令被拒；目标 marker 当前不存在 | W4 agent-browser 真实 UI；W6 截图 / SQLite / 文件独立复核 | 通过（卡片拒绝；不外推 I-Q2 文字拒绝全量稳定性） | [审批卡](evidence/W4-approval-card.png)、[独立证据核对](evidence/W6-preserved-evidence-review.json) |
| AC-03、混合并发隔离 | Claude 等待 Bash 审批时新建 Codex Session，发送只需回答固定标记的消息 | Codex 显示 `CODEX_MIXED_DONE` 和 Done，Claude 仍有橙色等待点；数据库显示 Codex 完成时间位于 Claude 回合起止之间。Claude 的 `sleep 90` 首次被 harness 拒绝，背景重试待审批后也被拒，本证据仅证明等待授权不阻塞 Codex | W4 agent-browser 真实 UI；W6 截图 / SQLite 独立复核 | 通过（等待授权期间的混合并发） | [Claude 等待](evidence/W4-mixed-claude-waiting.png)、[Codex 完成](evidence/W4-mixed-codex-done.png)、[时间核对](evidence/W6-preserved-evidence-review.json) |
| DEC-19、未打包默认关闭 | 关闭开发开关启动，打开新建对话 CLI 菜单 | W4 截图及正文快照只列 Codex CLI 和 CLI 设置，无 Claude | W4 agent-browser 真实 UI；W6 独立查看截图和文本 | 通过（默认关闭路径） | [菜单](evidence/W4-default-off-cli-menu.png)、[文本](evidence/W4-default-off-cli-menu.txt) |
| 打包应用边界、DEC-19 | 以 `pnpm smoke:packaged` 启动隔离 arm64 包，并复核 `!app.isPackaged` 开关门槛 | 原生依赖 / Renderer / Preload / CLI 探测冒烟通过；源码门槛保证打包环境忽略 `STUDIO_ENABLE_CLAUDE_CODE`。打包 UI Provider 菜单因 launcher 超时未覆盖 | 打包 smoke + 静态源码复核 | 部分通过（UI 菜单未覆盖） | [packaged boundary](evidence/W4-packaged-switch.md)、[smoke](evidence/W4-packaged-smoke.log) |
| 打包应用边界补验、DEC-19 | W7 用真实 arm64 包、隔离 profile 和 `STUDIO_ENABLE_CLAUDE_CODE=1`，打开 New Chat CLI 菜单与 Settings CLI 两组 | New Chat 只有 Codex CLI；已添加只有默认 Codex，未添加为空，无 Claude 注册入口；包 hash 与 W6 一致 | W7 agent-browser 独立真实 UI；逐张查看截图 | 通过（打包忽略开发开关） | [菜单](evidence/W7-packaged-cli-menu.png)、[设置两组](evidence/W7-packaged-cli-settings.png)、[启动](evidence/W7-packaged-launch.json) |
| 开发入口与 effort 独立补验、FR-INPUT-001 | W7 未打包真实 Provider、开关开启，从 New Chat 选择 Claude；未手选模型，打开目录、选 low、恢复 CLI 默认后重开 | Claude 可选；真实目录为 low / medium / high / xhigh / max；low 出现勾选及恢复入口；恢复后勾选与恢复入口消失。消息为空、Send 禁用，隔离数据库 Session 为 0 | W7 agent-browser 独立真实 UI，无模型消息 | 通过（目录与草稿选择 / 复位；不外推下一轮模型效果） | [入口](evidence/W7-development-cli-menu.png)、[目录](evidence/W7-development-effort-menu.png)、[low](evidence/W7-development-effort-low.png)、[复位](evidence/W7-development-effort-reset.png)、[零回合核对](evidence/W7-development-ui-review.json) |
| AC-05、I-Q2、Adapter §3.12 | 在 CLI 2.1.311、空 `settingSources`、临时 Project 中拒绝待审批 Bash，并等待同一回合完成 | 全量套件两次均为 5 个真实场景通过、I-Q2 场景约 93 秒后等待 `turn.completed` 超时并退出码 1（见 [full rerun](evidence/W4-real-claude-2.1.311-full-rerun.log)）。随后同一场景单独复跑通过（10.88 秒）；事件追踪再复跑确认审批在 4.08 秒被 `declined_with_text` 解决，未出现第二个请求，约 13.03 秒收到 `turn.completed: completed`，约 14.84 秒 Runtime 正常退出。因此全量失败与单独成功之间的差异尚未归因（可能受套件顺序或 CLI / 模型时序影响，属待复验推断），当前实现路径有可复现成功证据；全量门禁仍需稳定复跑后再记为通过；无凭据或原始响应写入证据 | `AI_STUDIO_REAL_CLI=1`，Vitest integration，真实 CLI | 未稳定通过（全量套件需复跑） | [real 2.1.311](evidence/W4-real-claude-2.1.311.log) |
| I-Q2 后续测试语义修正与复验 | W5 将首条人类消息改为预先要求报告拒绝原因，`replyWithText` 提供唯一原因数据；保留拒绝 / marker / 终态 / 文件不存在断言，新增精确命令检查与 pending 诊断 | 固定 2.1.311 的修正完整套件 6/6 通过；随后增加精确命令断言和命令独立行，最终 I-Q2 定向 1/1 通过、5 跳过。W6 独立逐行复核 diff 与三份日志，未发现放宽断言掩盖失败；生产代码未变 | W5 真实 CLI；W6 独立源码 / 日志复核，不重复模型请求 | 通过（列明的运行与测试修正）；历史超时保留 | [W5 调查](evidence/W5-iq2-investigation.md)、[W6 独立复核](evidence/W6-test-review.md) |

## 验证准备与依据

真实授权卡用 [W4 launcher](evidence/W4-launch.mjs) 仅准备目录选择器 fixture；测试行为由 agent-browser 从可见入口执行。项目本地权限设为 `default`，增加 `Bash(*)` ask 规则，禁用该临时项目中的 hook；启动前只断言合并结果的模式枚举与 ask 布尔值，不输出其他配置。用户配置不改写。

依据：[官方设置优先级](https://code.claude.com/docs/en/settings)说明项目本地设置的优先级高于用户设置；[SDK 权限求值](https://code.claude.com/docs/en/agent-sdk/permissions)说明 ask 规则先于自动批准，并经 `canUseTool` 请求确认。安装 SDK 的 `resolveSettings()` 只读取配置，不发模型请求；其结果属于原始配置合并，实际授权卡仍须由真实应用验证。

## 缺陷与复验

- **W4-01（真实全量复跑待稳定）**：在 CLI 2.1.311 上，`packages/agent-adapter/test/claude/provider.integration.test.ts` 的两次全量套件均在 I-Q2 场景通过 `replyWithText()` 返回 `declined` 后，未收到该回合的 `turn.completed`，直到测试的 90 秒等待超时；同一场景单独复跑与事件追踪均成功，追踪显示单一审批请求在 4.08 秒解析为 `declined_with_text`，随后无第二个请求，13.03 秒收到 `turn.completed: completed`。相同套件的目录 / Rule / Skill / 恢复 / 模型、Stop / effort、AskUserQuestion、并发与 Stop 隔离共 5 项通过；历史 2.1.310 证据不能覆盖此版本。两次全量与复跑输出见 [W4 real 2.1.311](evidence/W4-real-claude-2.1.311.log) 与 [I-Q2 repeat](evidence/W4-real-claude-2.1.311-iq2-repeat.log) 与 [I-Q2 trace](evidence/W4-iq2-trace.json)；主代理需在全量复验稳定前保留未稳定标记；事件证据暂未指向协议映射缺陷。

- **W4-01 后续（2026-10-28）**：W5 原场景诊断未重现超时，而是在同回合正常结束后失败于 marker 断言；模型正文说明已经读到工具拒绝说明。测试改为由首条人类消息预先要求报告拒绝原因，完整套件 6/6 与最终定向 I-Q2 通过，W6 独立复核通过。前一完整运行后只增加精确命令断言与命令独立行，最终完整套件未重跑；历史两次超时的唯一原因仍未知。当前本机默认链接已到 2.1.312，本轮真实运行固定 2.1.311，不把新版本列为 tested；详见上表与 [独立复核](evidence/W6-test-review.md)。

## 2026-10-28 W7 最终界面复核与技术收尾

- 生产源码仍为 W4 的 `e85d64f420ba14c322995321a81c98112fc3c0bf` 基线；当前未提交集成测试修正不进入包。独立计算打包 `app.asar` SHA-256 为 `edbd9dd3ff45d6c611d0bf1fb48a544f5f4001b065d7cbfff006881e24e8ae41`，与 [W6 基线](evidence/W6-packaged-baseline.json) 一致；复用原打包冒烟，不重复测试或模型请求。
- 打包复验使用 W6 仅含测试 Project / window 的隔离 SQLite fixture；无预种植的启用偏好。实际从 New Chat 与 Settings 的已添加 / 未添加两组核对 Provider，排除禁用偏好遮蔽 Claude 的可能；[菜单快照](evidence/W7-packaged-cli-menu.txt)、[设置快照](evidence/W7-packaged-cli-settings.txt)与上表截图一致。
- 未打包 [W7 launcher](evidence/W7-ui-launch.mjs) 只覆盖目录选择器与窗口尺寸；真实 Provider 读取原生模型目录，测试动作从可见 UI 执行。[目录](evidence/W7-development-effort-menu.txt)、[选择](evidence/W7-development-effort-low.txt)、[复位](evidence/W7-development-effort-reset.txt)快照及截图已逐项独立检查。新建草稿未创建 Session，未发送用户消息；本机 Claude 为 2.1.312，仅做目录与草稿 UI 复核，**2.1.312 的真实回合仍未测，不加入 testedVersions**。
- 当前已授权开发验证可技术收尾：W4 / W6 授权卡与混合等待证据、W5 / W6 列明基线的真实测试、W7 打包边界与 effort 交互均无剩余阻塞缺口。历史 I-Q2 两次超时、最终增强断言后未重跑完整套件及本文件列明的未覆盖范围保留，人工验收与 DEC-19 发布决定不变。
- 文档复核范围：本文件的未覆盖、总体结论、结果表与缺陷后续已按本轮事实同步；任务 / 计划、负责规格与路线图由 Main 汇总，历史记录保留运行基线。
- 收尾检查：`pnpm check:docs` 为 0 新问题、4 个历史基线问题未增加；`git diff --check` 通过。打包与未打包隔离应用均已确认退出，原生窗口时段已释放。

## 人工功能验收

- 状态：**已验收（2026-10-29）**。
- 依据：用户在三个 worktree 技术收尾报告后明确回复「验收通过，合入main」。
- 接受范围与基线：`4eea8ab` 的本轮 Claude 开发入口、原生 effort 与既有 Needs Input 交互；沿用本文件技术证据与未覆盖项。
- 本次确认授权合入 main；DEC-19 不随 V1 发布、历史 I-Q2 超时及 2.1.312 真实回合未测等边界保留，Running 排队与结构化附件不纳入交付。
