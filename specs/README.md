# Module Specs

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿（模块划分待确认） |
| 文档职责 | 说明 `specs/` 的用途和规则，维护模块与 FR 编号的对应关系。 |
| 模板 | [templates/spec.md](../templates/spec.md) |

## 1. 用途

每个模块一份 `specs/<module>/spec.md`，长期维护，描述该模块当前应有的详细行为：状态机、边界情况、错误处理、数据字段、模块之间的接口和 UI 细节。

## 2. 与 Functional Requirements 的分工

- [02. Functional Requirements](<../docs/02. Functional Requirements.md>) 维护 FR 编号、需求陈述、优先级和 AC 追踪关系。
- spec 承接细节，每一节以 FR 编号开头，只引用编号，不复制 02 的原文。
- spec 与已确认的 02 冲突时，以 02 为准，并把冲突记入 spec 的未决问题。

## 3. 修改规则

- 新建的 spec 为 `草稿`，人在对话中确认后改为 `已确认（YYYY-MM-DD）`。
- 已确认的 spec 只在 task 中修改，改动与对应代码放在同一分支，一起审阅。

## 4. 模块划分

| 模块目录 | 覆盖需求 | spec |
|---|---|---|
| `project/` | FR-PROJ-001～FR-PROJ-003 | [草稿](project/spec.md) |
| `navigation/` | FR-NAV-001～FR-NAV-003 | [草稿](navigation/spec.md) |
| `chat/` | FR-CHAT-001～FR-CHAT-003 | [草稿](chat/spec.md) |
| `session/` | FR-SESSION-001～FR-SESSION-003、FR-STATE-001～FR-STATE-007 | [草稿](session/spec.md) |
| `input/` | FR-INPUT-001～FR-INPUT-002 | [草稿](input/spec.md) |
| `project-view/` | FR-VIEW-001～FR-VIEW-008 | 未创建 |
| `tools/` | FR-TOOL-001～FR-TOOL-004 | 未创建 |
| `agent-adapter/` | 无 FR 前缀；承接 [04. Technical Requirements](<../docs/04. Technical Requirements.md>) 第 3、4 节与 [06. CLI Integration Preflight](<../docs/06. CLI Integration Preflight.md>) | 未创建 |

## 5. 未决问题

| 问题 | 回答（确认日期） |
|---|---|
| 以上模块划分是否采用？FR-STATE 是否从 `session/` 中单独拆为 `session-state/`？ |  |
