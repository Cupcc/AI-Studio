---
id: T20261010-conversation-layout
status: verifying
fr: [FR-SESSION-001]
ac: [AC-02]
specs: [specs/session/spec.md]
created: 2026-10-10
---

# Conversation 从顶部开始排列

## 目标

2026-10-10 在对话中确认：Conversation 与 ChatGPT / Claude 桌面端保持一致，首条消息位于顶部，而不是贴在输入区上方。原型 v01 的 `.feed-in` 使用 `justify-content: flex-end`，桌面端按原型对齐时照搬为 `margin: auto auto 0`，导致内容不足一屏时整段对话贴底、上方留大片空白（对照 [T20261009-prototype-alignment 截图](../T20261009-prototype-alignment/evidence/W3-session-sidebar-1280.png)）。

其他向 ChatGPT / Claude 对齐的候选调整见 [research.md](research.md)，逐项确认后另行建任务。

## 范围

- 做：
  - Session Mode Conversation：内容不足一屏时从顶部排列；超过一屏时的行为不变。
  - Shell Spec v01 第 5 节写入该规则；原型说明登记 v01 与 spec 的差异（原型文件不改，行为以 spec 为准）。
  - e2e：短对话首条用户消息位于滚动区顶部。
- 不做：
  - 打开 Session 定位到底部、流式跟随、“回到最新”（FR-SESSION-001；session spec 2.2 第 1～4 条），保持不变。
  - Project View Mode 的 Conversation 列：尚未实现（[T20261009-project-view](../T20261009-project-view/task.md)），实现时沿用同一规则。
  - [research.md](research.md) 中的其他候选调整。

## 依据

- FR-SESSION-001“保持类似 ChatGPT 的阅读体验”；只要求打开时显示最底部，未要求短对话贴底。
- Shell Spec v01 第 5 节；session spec 2.2。
- 2026-10-10 对话确认：首条消息在顶部，与 ChatGPT / Claude 桌面端一致。

## 验收标准

- [x] 内容不足一屏时，首条用户消息距滚动区顶部不超过 32px（Shell Spec 第 5 节）：`e2e/session.spec.ts` AC-02 用例。
- [x] 打开 Session 仍定位到底部，向上滚动暂停跟随、“回到最新”可用（FR-SESSION-001；AC-02、AC-04）：`e2e/session.spec.ts` FR-SESSION-001 与 AC-04 用例。
- [x] 1024 / 1280 / 1440 宽度布局不变量通过（Shell Spec 第 1 节）：`e2e/alignment.spec.ts`。

证据：[W1-e2e-session-alignment.log](evidence/W1-e2e-session-alignment.log)（15/15 通过）；[W1-session-top-anchored-1280.png](evidence/W1-session-top-anchored-1280.png)；[W1-needs-input-top-anchored-1280.png](evidence/W1-needs-input-top-anchored-1280.png)。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 短对话贴底还是从顶部开始？ | 从顶部开始，与 ChatGPT / Claude 桌面端一致（2026-10-10） |

## 未决问题

无。

## 提交归位记录

- 2026-10-10 用户要求“提交归位，需要我验收的地方停下”；本任务的代码、规格补充、原型差异说明与证据归入 `task/conversation-layout`，基于 `task/github-ci`。
- 保持 `verifying`，等待人工审阅布局与 Shell Spec 差异并签收；本次提交整理不代表验收通过。
