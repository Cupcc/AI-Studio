# 验收：T20261009-agent-adapter

## 2026-10-18 当前 V1 范围更新

本记录的历史验收基线与“部分通过”结论不改写。当前 V1 真实 CLI 验收只覆盖 Codex；Claude Code 的实现、模拟结果和历史真实证据保留，真实链路暂缓，且不随当前 V1 发布（DEC-19）。Codex 的额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定；应用不设置调用次数、费用上限或自动重试护栏，真实复测按 CLI 实际结果记录。

### W25 当前 Codex 专项补验（2026-10-18）

W25 是 Main Agent 在 `88bbe2c` 基线上的真实技术复验，不改写下方 W4 的独立验收结论，也不把本轮结果记作完整 AC-02 / AC-03 / AC-05。实际 CLI 为 `codex-cli 0.163.0`，生成协议类型仍为 `0.161.0`；证据与运行命令见 [W25 记录](../T20261011-native-cli-parity/evidence/W25-codex-native.md) 和 [结构化结果](../T20261011-native-cli-parity/evidence/W25-codex-native.json)。

- Adapter 六回合套件与两回合 Stop 套件通过：流式、跨 Runtime 原 ID 恢复、同轮拒绝后续写入、当前命令退出、此前后台服务保留、同一 Runtime 和合成进程退出均有真实结果，Stop 清理为 `confirmed`。
- Adapter 同一 Session 的第二模型切换通过：模型目录 8 项，默认 `gpt-6.1-sol`，下一轮切换到 `gpt-6-astra`，终态报告实际模型且 native Session 未变化。
- 原生预检的两个 Thread / Project 并发隔离、中断后续聊和 Runtime 崩溃恢复通过。
- 这组结果只覆盖已执行的 Codex 方法子集；未观察即脱离的后代、外部 MCP 进程树、宿主异常崩溃清理、未执行协议方法和 Claude Code 真实链路仍未通过。本轮一次默认 integration 命令触发的 Claude Code 调用因 `auth_required / oauth_org_not_allowed` 阻断，按 DEC-16 不计入当前 V1。

> 技术报告写入者：W4（GPT-6.1 Sol high），未参与 Provider / 核心实现。日期：2026-10-09；原有部分通过结论与技术边界保留。当前人工体验结论见下节。

## 签收

- 人工体验：路线图现有功能已于 2026-10-18 全部验收通过，接受范围、确认原文与基线见[总体验收](../T20261009-v1-foundation-slice/acceptance.md#人工功能验收)。
- 技术边界：Codex 真实结果仍需由 AI 按 CLI 行为补验记录；Claude Code 真实验收按 DEC-16 暂缓且不随当前 V1 发布。本次体验确认不新增真实兼容性测试结果，任务收尾仍按 Lifecycle 核对。

## 结论

**部分通过：实现与本地自动化验收通过，真实 CLI 验收存在明确未覆盖。** 本次没有模型调用，也没有重跑真实推理集成套件；不能宣称 AC-02 / AC-03 / AC-05 完整通过。

独立复核发现一项等待输入竞态，已由主 Agent 修复并复测通过。已知的 JSON-RPC 原生撤回记录释放问题也已复核关闭。没有剩余已复现的本地自动化阻断；真实边界见下表与“未覆盖”。

## 环境、版本与过程

- 独立 `foundation-verification` worktree，初始基线 `8774bc1`；顺序合入主 Agent 的 `4e21581`（dismissIncoming）、`4c66414`（spec 回写）、`e75f41f`（在途答复原生撤回竞态）。W4 仅写 acceptance 与 W4 证据，没有改实现 / spec / task / plan。
- 独立 frozen-lockfile 安装、全 workspace 类型检查与单测：desktop 80、Adapter 175 通过。两次修复后 Adapter 全量分别 177、181 通过；最终 Adapter build / typecheck 通过。相关记录：[安装](../T20261009-project-shell/evidence/W3-install.log)、[全 workspace 类型检查](../T20261009-project-shell/evidence/W3-typecheck.log)、[初始单测](evidence/W4-unit.log)、[最终单测](evidence/W4-final-unit.log)、[最终类型检查](evidence/W4-final-typecheck.log)、[build](evidence/W4-final-build.log)。
- 单测不使用真实 CLI。独立运行未开启 `AI_STUDIO_REAL_CLI` 的 integration 命令，4 个文件 / 6 项全部跳过，确认显式开关边界：[W4-integration-opt-in.log](evidence/W4-integration-opt-in.log)。
- 独立审查 Provider、SessionController、Runtime、输入 / 文本映射与 Stop 路径，并执行三个额外探针：实际 OS 进程 + 模拟 App Server / SDK 的隔离与 Stop、原生撤回记录释放、在途文字答复失败与原生撤回竞态。探针均不启动安装的 CLI，不调用模型。
- 只读独立 CLI 版本 / 登录检测未读取模型目录或发送消息，输出仅保留枚举与版本，不留认证原文：[W4-availability.json](evidence/W4-availability.json)。本机 Codex 已为 `0.162.0`（与历史实测 / 锁定协议 `0.161.0` 不同）、Claude `2.1.295` 均分别报告 executable / version / login 成功，模型检查为 skipped。
- 检查 206 份 Codex 协议类型，反向移除机械 `.js` 导入后全部匹配保留的原始源 SHA-256：[W4-protocol-integrity.json](evidence/W4-protocol-integrity.json)。这证明锁定文件与 manifest 一致，没有重新生成当前 CLI 协议。

## 按标准验收

| 验收标准 | 来源 | 结论 | 证据与边界 |
|---|---|---|---|
| 两 Provider 同一接口创建、流式、Runtime 重启后原 ID 恢复 / 保留上下文；恢复失败不新建 | task 标准1；06 §4/5；04 §5.7 | 部分通过 | `provider-contract` / 两 Provider 单测与[最终单测](evidence/W4-final-unit.log)通过；W2 真实 Codex 原 ID / 上下文观察通过；Claude 真实成功流式 / 恢复受配额阻断，不能以模拟补齐 |
| 提交即 Running，首片段前发出事件 | task 标准2；FR-STATE-001 | 通过（Adapter 事件规则） | SessionController 的同步 `turn.started`；两 Provider 与 core 在 CLI 未确认前断言 Running，见[最终单测](evidence/W4-final-unit.log) |
| 增量与完整消息分开，正文不重复 | task 标准3；06 §5 | 通过（模拟协议 / SDK） | core / Codex / Claude partial+full、UUID 去重测试；审查 item ID 及全文替换映射。真实 Claude 仍未覆盖 |
| 授权 / 问题统一等待事件、ID / 原生选项、独立多请求答复 / 解除 | task 标准4；FR-STATE-002；06 §6 | 通过（模拟；已修复两项撤回问题） | [W4-input-retirement.json](evidence/W4-input-retirement.json)、[W4-input-race.json](evidence/W4-input-race.json)、两 Provider / core 单测；真实 Claude 授权 / AskUserQuestion 未覆盖 |
| completed / interrupted / failed 与耗时；取消不误报 Error | task 标准5；FR-STATE-003/007；06 §5 | 通过（模拟及 OS fixture） | [最终单测](evidence/W4-final-unit.log)覆盖 success+is_error、取消原生 error、终态竞态和耗时；[W4-runtime-isolation.json](evidence/W4-runtime-isolation.json)中 Claude Stop 为 interrupted，续聊成功；真实 Claude 成功终态未覆盖 |
| Codex 精确 Stop，系统退出证据、有限等待、独立 Runtime 兜底原 ID 恢复、重复 / 迟到守卫 | task 标准6；04 §5.1～5.7 | 部分通过 | W4 历史独立 OS fixture结论保留；W25 在 Codex 0.163.0 真实 Adapter 套件确认当前命令退出、此前服务保留及 `cleanup=confirmed`。完整协议兼容和宿主异常边界仍未覆盖 |
| Claude interrupt 后本轮子进程退出，同 Session 可继续 | task 标准7；06 §4 | 部分通过 | Claude 模拟单测覆盖新后代退出、原 ID 重启、同 Runtime 续聊；独立 OS Runtime / SDK fixture 续聊通过。真实工具命令未启动，真实子进程 Stop 退出未验证 |
| 一个 Session 的 Stop / 崩溃 / 兜底不影响其他；两 Provider 并发 | task 标准8；FR-SESSION-003；AC-03 Adapter 部分 | 部分通过 | W4 历史隔离结论保留；W25 原生预检确认两个 Codex Thread / Project 并发、单 Runtime 崩溃后另一 Runtime 健康及原 ID 恢复。两个 Provider 的真实并发和宿主异常边界仍未覆盖；Claude Code 按 DEC-16 暂缓 |
| 模型目录与同 Session 下一轮模型切换 | task 标准9；FR-INPUT-002；06 §6 | 部分通过 | W4 模拟 / fixture 结论保留；W25 Adapter 真实复验确认 8 项目录和 `gpt-6.1-sol` → `gpt-6-astra` 下一轮切换。其他版本、模型能力和完整原生配置仍未覆盖 |
| 未安装 / 未登录 / 可用及原因分别报告 | task 标准10；UX §6 New Chat.4 | 通过 | [W4-availability.json](evidence/W4-availability.json)独立本机可用；两 Provider availability 单测覆盖未安装 / 未登录 / 版本 / 模型失败分别报告并剔除身份信息；[最终单测](evidence/W4-final-unit.log) |
| 状态映射 / Stop 分支单测；真实证据筛选保存，不留认证或完整配置 | task 标准11；tasks/AGENTS Evidence | 通过（证据如实保留未通过） | [最终单测](evidence/W4-final-unit.log)181项；[W2-codex-results.json](evidence/W2-codex-results.json)、[W3-claude-results.json](evidence/W3-claude-results.json)明确失败 / 配额。检查本次输出仅含测试摘要、枚举、合成路径 / 文本、fixture与必要错误 |
| spec 草稿含接口、事件、状态映射、Stop 与边界 | task 标准12 | 通过（草稿） | `4c66414` 的 [spec](../../specs/agent-adapter/spec.md) §3.11/3.12已完整描述实现与真实限制；§3.6 / 4.2 / 5描述核心流程与接口；A-Q问题保持待确认 |

## 缺陷与复核

### D1：JSON-RPC 原生撤回记录积存（已关闭）

Provider 原本只清 UI 等待，peer 内 incoming 保留。主 Agent `4e21581` 增加 `dismissIncoming(id)` 并接入 `serverRequest/resolved`。W4 独立[探针](evidence/W4-input-retirement.mjs)验证：numeric/string ID 分开；撤回不写响应；旧回调不能答复；其他并发请求可答；原 ID 可复用；其他 Thread 撤回不影响当前卡片。[结果](evidence/W4-input-retirement.json)全部通过。

### D2：在途文字答复失败后留下已撤回卡片（已关闭）

W4 在 `4c66414` 复现：`replyWithText → turn/steer` 在途，原生撤回审批，随后 steer 失败。core 因 `answering` 忽略原生撤回，复原后的卡片仍 pending，但 native ref 已 dismissed，后续回答必 `invalid_state`。影响 FR-STATE-002 多请求竞态。

- [修前结果](evidence/W4-input-race-before-fix.json)：pending=1，native_resolved=0，后续答复 invalid_state；[失败断言](evidence/W4-input-race-before-fix.log)。
- 主 Agent `e75f41f` 改为原生撤回即清 pending，失败只恢复仍登记的请求；另补 direct / composer × 成功 / 失败四种回归。
- W4 同一独立[探针](evidence/W4-input-race.mjs)复跑：[修后结果](evidence/W4-input-race.json) pending=0、native_resolved 恰好1，通过。全部 Adapter 181项通过，D1探针再跑也通过。

## 未覆盖与边界

1. **Claude 真实推理**：历史实测 `rate_limit / quota_exceeded`，流式成功、原生 Rule / Skill / Context、恢复、模型切换、工具命令 Stop 与续聊未通过。当前登录可用不表示模型配额可用。本次未发模型调用验证配额。
2. **Codex 修正版精确 Stop**：W2 已完成六个真实回合。修后仅真实 Node / OS fixture + 模拟协议证据；实际旧版本原生场景走 Runtime 兜底，先前后台服务未保留。精确清理仍需真实复测，不能把该历史套件改记通过。
3. 本次只读发现本机 Codex 已升为 `0.162.0`，协议仍锁定 `0.161.0`；按 A-Q1 推荐可报告 untested，但没有 `0.162.0` 推理 / 精确 Stop / 实验接口兼容证据。历史六回合结果不能迁移为新版本通过。真实第二模型切换、真实两 CLI 同时推理 / 故障注入未覆盖；认证 / 网络等故障以模拟协议验证。
4. 采样前即完全脱离父链 / 进程组的命令、外部 MCP 自有进程树、宿主异常崩溃清理未验证。正常 dispose / shutdown 与 Stop 的范围不等于宿主崩溃保障（A-Q3）。
5. Claude 无 `user_message_uuid` 的新异步帧只能归当前回合，任意旧生产者乱序无法完整识别；恢复原生 ID 的最终校验可能延后到下一次输入。
6. A-Q1 / A-Q2 / A-Q3 / A-Q5 尚未人工确认。两个 Provider `inputWhileRunning=none`；Claude 结构化附件前置 unsupported；这些边界已在草稿中明示。
7. 此 task 不验 UI Session 状态机、SQLite / IPC 持久化、Completed Unread / 查看清除或真实 Project 关闭；完整 AC 需 session-slice 联合验收。

### 2026-10-11 原生能力对齐更新

本记录以上述独立验收基线为准：当时两个 Provider 的 `inputWhileRunning=none` 是代码基线事实，不是产品结论。随后按用户确认的原生 CLI 对齐原则，Codex Adapter 已接入原生 `turn/steer` 并将能力报告为 `steer`；该修改尚未经过新的独立验收与真实 `0.162.0` 兼容验证。Claude 原生排队、UI / IPC 路径及其他对话能力仍待实现和补验，不能据本段把 AC-02 / AC-03 / AC-05 记为通过。见 [对齐任务](../T20261011-native-cli-parity/task.md)。

## 证据复跑

从仓库根先运行 `pnpm --filter @ai-studio/agent-adapter run build`，再用 Node 运行：

- [W4-runtime-isolation.mjs](evidence/W4-runtime-isolation.mjs)：真实 OS 进程，模拟 App Server / SDK；finally 验证记录的进程身份均退出。
- [W4-input-retirement.mjs](evidence/W4-input-retirement.mjs)：模拟传输原生撤回。
- [W4-input-race.mjs](evidence/W4-input-race.mjs)：模拟异步文字答复失败 / 原生撤回竞态。
- [W4-availability.mjs](evidence/W4-availability.mjs)：只读本机版本 / 登录，不读模型目录，不发消息。
