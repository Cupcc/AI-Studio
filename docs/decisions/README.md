# Decisions

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档职责 | 说明决定记录的用途、命名和状态规则。 |
| 模板 | [templates/decision.md](../../templates/decision.md) |

## 1. 用途

记录已经作出的产品取舍和技术决定：选了什么、为什么、放弃了哪些方案、依据是什么。Agent 在提出方案前先查这里，避免重复提出已被否决的方案。

以下情况需要新建决定记录：

- [04. Technical Requirements](<../04. Technical Requirements.md>) 第 7 节的待决事项落定。
- task 中作出影响其他模块的技术选择。
- 人在对话中确认的产品取舍。

## 2. 规则

- 文件名：`D<YYYYMMDD>-<slug>.md`，例如 `D20261008-claude-via-agent-sdk.md`。
- 文档状态：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。
- 决定被推翻时不改原记录正文，新建一条记录，并把原记录标记为已废弃。
- 查询：`rg '文档状态' docs/decisions`。

## 3. 当前记录

暂无。
