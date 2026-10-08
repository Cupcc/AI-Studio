# 执行计划：T20261009-session-slice

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

先由 W1 起草 `specs/session/spec.md`、`specs/chat/spec.md`、`specs/input/spec.md`，汇总未决问题交人回答；Adapter 接口确定且 task 进入 ready 后再规划实现 worker。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | spec 草稿（Opus 5.5 high） | `specs/session/spec.md`、`specs/chat/spec.md`、`specs/input/spec.md` | spec 草稿与未决问题 | — | done |
| W2 | 参考应用调研与推荐修订（Sonnet 5.5 xhigh） | `specs/session/spec.md`、`specs/chat/spec.md`、`specs/input/spec.md`、`specs/navigation/spec.md`；本 task 的 `research.md` | 修订后的推荐（待确认） | W1 | in_progress |

## 进度与决定

- 2026-10-09 task 卡片为 draft，等待 spec 草稿。
- 2026-10-09 W1 完成并合并。阻塞问题 S-Q1、S-Q2、I-Q2 已由人回答（S-Q1（c）未采纳推荐）。非阻塞问题由 W2 参考 Claude Desktop / ChatGPT Desktop 修订推荐，保持待确认，实现先按推荐。
