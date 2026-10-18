---
id: T20261011-native-cli-parity
status: in_progress
fr: [FR-SESSION-001, FR-SESSION-002, FR-SESSION-003, FR-INPUT-001, FR-INPUT-002, FR-STATE-002]
ac: [AC-02, AC-03, AC-05]
specs: [specs/agent-adapter/spec.md, specs/input/spec.md, specs/session/spec.md, specs/chat/spec.md]
created: 2026-10-11
---

# 原生 CLI 能力对齐与遗留问题处理

## 目标与依据

用户于 2026-10-11 明确：「对话等功能不要限制，要直接和原生cli的功能一致。意思我们该实现的实现，不该实现、不该约束的产品不要约束。」随后要求「解决遗留问题，update docs」。负责原则见 [01 第 8 节](<../../docs/01. Product Definition.md#8-已确认的产品原则>)，决定入口见 [DEC-13](<../../docs/07. Decisions.md#dec-13-原生-cli-能力对齐>)。本次文档 diff 待人工审阅。

## 范围与交付

本轮交付为遗留问题的决策、要求与实施／补验清单回写，纠正把未实现写成产品不支持的规格。代码与真实补验继续由 [Adapter](../T20261009-agent-adapter/task.md) 和 [Session](../T20261009-session-slice/task.md) 任务跟踪；本记录完成不等于这些功能完成。

## 2026-10-18 当前 V1 范围

按 [DEC-16](<../../docs/07. Decisions.md#dec-16-v1-真实-cli-验收范围>)，本轮真实补验和自动化收口先针对 Codex；Claude Code 的实现与原生能力清单保留为后续独立工作，不以模拟结果或历史证据记为当前 V1 真实通过。扩展范围不插入本任务。

## 验收标准

- [ ] 原则写入 01，02～05 和受影响 spec 对齐，保留 FR / AC 编号（来源：上述对话；文档索引一致性规则）。
- [ ] A-Q1 / A-Q2 / A-Q3 / A-Q5、I-Q3 的产品要求与技术决定分开记录，不能把原生能力未接入解释为产品禁止（来源：上述对话；AGENTS.md Authorship & Review）。
- [ ] 真实 CLI 和进程验证缺口保留，注明复测条件；历史验收不改记通过（来源：05 第 4 节；tasks/README.md Acceptance）。
- [ ] 本地链接检查及表格、标题、跨文档一致性自检通过（来源：docs/00、specs/README.md）。

## 后续实施与验证

2026-10-13 工具准备依赖澄清（DEC-14）：文件引用、原生轮次补丁与 Project / Terminal 关闭接口由 [工程工具任务](../T20261009-context-tools/task.md) 统筹贯通，修改 Adapter / Session 时与本清单协调，避免重复工作；其余遗留项继续在原负责范围跟踪，不全部阻塞工具开发。该次仅文档更新；2026-10-18 后续「continue to implement」已启动工具原生接缝实施，Codex 0.163.0 普通原生引用、聚合 / 完成文件补丁及其真实边界见[新增独立评审](../T20261009-context-tools/acceptance.md#2026-10-18-本轮-diff-独立评审w23)。工程工具任务的 W24 已补充应用 UI 同轮引用与四工具综合 Main Agent 复验；W25 又补齐当前 V1 Codex 的 Stop、第二模型、并发、Runtime 崩溃恢复和进程清理实证，见 [W25 记录](evidence/W25-codex-native.md)。完整协议兼容性、宿主异常边界和 Claude Code 真实链路仍不以本轮结果记为通过。

| 遗留项 | 实施与验证要求 | 负责 / 完成条件 |
|---|---|---|
| 运行中发送 | Codex 当前回合追加已接入 Adapter，并已由工程工具任务在应用 UI 真实复验同轮文件引用；当前 V1 仍需核对消息归属、终态、Stop 后队列与续聊；Claude 原生排队保留后续 | Adapter / Session；Codex 继续补原生专项，Claude Code 暂不发起真实验收 |
| 原生功能覆盖 | 核对原生可见输出、模型与推理控制、权限、附件、Rule / Skill / Context、命令与会话操作；区分已接入、待接入、原生接口未开放及版本不支持，记录具体证据 | Adapter / Session；逐项能力表与缺口实现，协议不可用不能记为产品永久不支持 |
| Codex 版本与精确 Stop | 记录复测时的可执行文件、实际版本、代码、协议与模型；核对协议差异，分别验证精确停止和 Runtime 兜底；精确路径须保留先前服务且不影响其他 Session | Adapter；W25 已在 0.163.0 验证当前方法子集，仍不外推到未执行的方法或其他版本 |
| Claude 与模型 / 并发 | Codex 第二模型、真实 Codex 并发与单方停止隔离列入当前 V1；Claude 真实流式、Rule / Skill、原 ID Resume、模型切换、命令 Stop / 续聊和并发暂缓 | Adapter / Session；Codex 真实请求与结果、UI 和系统进程证据；Claude 后续独立安排 |
| 崩溃与进程归属 | 按 A-Q3 实施归属登记、宿主失效识别及启动清理；构造活动命令、脱离后代与隔离 MCP fixture；不得扫描同名进程后批量终止 | Adapter；身份复用、多个应用实例、共享 MCP 和用户终端不误杀；清理失败如实报告 |
| 既有 Stop 与原生语义 | 对照 04 第 5 节、原生中断和后台任务行为，检查 Stop 是否额外取消原生保留任务；记录差异及其来源，按原则修订受影响规格与实现，不用增加禁发规则回避队列问题 | Adapter / Session；新旧行为差异可审阅，原验收证据保留 |

### 2026-10-18 W25 Codex 原生专项复验

W25 由 Main Agent 在 `88bbe2c` 基线上执行，实际 Codex 为 `0.163.0`，协议类型仍为 `0.161.0`。Adapter 六回合综合套件、两回合精确 Stop 套件、同 Session 第二模型切换均通过；原生预检的并发隔离、中断后续聊和 Runtime 崩溃恢复也通过。结果与命令见 [W25-codex-native.md](evidence/W25-codex-native.md) 和 [结构化结果](evidence/W25-codex-native.json)。

本轮将下列事实从“待真实复验”更新为“已有 Codex 子集证据”：`turn/interrupt` 后当前命令的系统进程退出、此前后台服务保留、`setModel` 下一轮生效、两个 Thread / Project 并发隔离、单 Runtime 崩溃不影响其他 Runtime，以及原 Thread ID 恢复。`osPid:null` 时仍按 Runtime 后代快照超集核对，清理结果为 `confirmed`。

本轮不把 0.163.0 结果外推为完整 0.161.0 协议兼容；未观察即脱离的后代、外部 MCP 进程树、宿主异常崩溃后的清理、未执行的原生方法和 Claude Code 真实链路继续保留。一次默认 integration 命令触发的 Claude Code 调用因 `auth_required / oauth_org_not_allowed` 阻断，按 DEC-16 不计入当前 V1，未重试。

## 复测条件与未覆盖

- Codex 真实调用按 CLI / 上游服务提供方的额度、限流及限流后的停止 / 错误结果记录；应用不设置调用次数、费用上限或自动重试护栏，遇 `rate_limit` / `quota_exceeded` 按 Adapter 错误映射如实记录。Claude Code 不安排当前 V1 的真实验收且不随当前 V1 发布（DEC-19）；W25 一次默认 integration 命令的意外触发因账号策略阻断，已记录为未覆盖，不计入通过。
- `dispose()` 返回不证明零残留；已观察进程的退出证明不能推广到未观察的脱离后代或外部共享 MCP。
- A-Q1 / A-Q2 / A-Q5 的处理不确认其他无关推荐；A-Q3 的技术选择不标作人工确认全部异常清理能力。

## 收尾

主 Agent：Codex；文档基线 `0c86b4e` 加本任务 diff。原有 Project View / 路线图工作区修改保留。纯规格与过程回写可由主 Agent 自检；后续代码变更按任务协议执行独立技术与交互验收。
