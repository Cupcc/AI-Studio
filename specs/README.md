# Module Specs

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿（模块划分待确认） |
| 文档职责 | 说明 `specs/` 的用途和规则，维护模块与 FR 编号的对应关系。 |
| 模板 | [templates/spec.md](../templates/spec.md) |

## 1. 未决问题

| 问题 | 回答（确认日期） |
|---|---|
| [第 5 节的模块划分](#5-模块划分)是否采用？FR-STATE 是否从 `session/` 中单独拆为 `session-state/`？ |  |

## 2. 用途

每个模块一份 `specs/<module>/spec.md`，模块目录名用小写 kebab-case。spec 长期维护，描述该模块当前应有的详细行为：状态机、边界情况、错误处理、数据字段、模块之间的接口和 UI 细节。

## 3. 与 Functional Requirements 的分工

- [02. Functional Requirements](<../docs/02. Functional Requirements.md>) 维护 FR 编号、需求陈述、优先级和 AC 追踪关系。
- spec 承接细节，每一节以 FR 编号开头，只引用编号，不复制 02 的原文。
- spec 与 `docs/` 冲突时按[文档索引](<../docs/00. Documentation Index.md>)的冲突优先级处理，并把冲突记入 spec 的未决问题。
- 来源简称：01～07 指 `docs/` 下同编号文档；Shell 指 [Shell Spec v01](../design/components/shell-spec-v01.md)。
- 标注：无标注的规则直接来自所引来源。“建议”或 **（提案）** 表示来源未规定、为让实现不必猜测而提出的行为，须经人确认，真正存在分歧的列入未决问题；**（技术方案，待实现确认）** 表示不影响产品行为的实现选择，实现时可调整，不需要产品确认。
- 决策边界按 [AGENTS.md](../AGENTS.md) 的 Authorship & Review 判断。AI 可决定授权范围内的接口形态、代码组织等实现细节并记录依据；影响用户行为、验收标准或重大成本、兼容性、数据安全的取舍须提交人类。整理审阅材料时突出这些差异，不要求人逐项批准技术细节（2026-10-11 确认，治理规则 diff 待审阅）。

## 4. 修改规则

- 新建的 spec 为 `草稿`，人在对话中确认后改为 `已确认（YYYY-MM-DD）`。
- 用户明确确认全部需求与未决项后，同步规格状态，不另设全文复核或重复签收。已有实现授权且无阻塞产品问题时，按确认内容推进；新增或变更的产品取舍单独提交人确认。规格任务完成本身不扩大工作授权。
- 已确认的 spec 只在 task 中修改，改动与对应代码放在同一分支，一起审阅。
- 问题编号为 `<模块缩写>-Q<n>`（如 `S-Q1`、`NAV-Q1`）。人在对话中回答后，问题从“未决问题”移到“已确认”，写明回答和确认日期，编号不变。授权范围内的技术问题由 AI 决定后移到“技术决定”，记录依据、决策者及日期，不标成人工确认。

## 5. 模块划分

各 spec 的确认状态见其自身的 `文档状态`。

| 模块目录 | 覆盖需求 | spec |
|---|---|---|
| `project/` | FR-PROJ-001～FR-PROJ-003 | [spec.md](project/spec.md) |
| `navigation/` | FR-NAV-001～FR-NAV-003 | [spec.md](navigation/spec.md) |
| `chat/` | FR-CHAT-001～FR-CHAT-003 | [spec.md](chat/spec.md) |
| `session/` | FR-SESSION-001～FR-SESSION-003、FR-STATE-001～FR-STATE-007 | [spec.md](session/spec.md) |
| `input/` | FR-INPUT-001～FR-INPUT-002 | [spec.md](input/spec.md) |
| `project-view/` | FR-VIEW-001～FR-VIEW-008 | [spec.md](project-view/spec.md) |
| `tools/` | FR-TOOL-001～FR-TOOL-004 | [spec.md](tools/spec.md) |
| `settings/` | FR-SET-001～FR-SET-002 | [spec.md](settings/spec.md) |
| `agent-adapter/` | 无 FR 前缀；承接 [04. Technical Requirements](<../docs/04. Technical Requirements.md>) 第 4、5 节与 [CLI Integration Preflight](../tasks/T20261008-cli-preflight/report.md) | [spec.md](agent-adapter/spec.md) |
