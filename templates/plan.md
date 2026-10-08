# 执行计划：<task id>

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

## Workers

<!-- 单 Agent 完成的任务可以删除本节。不同 Worker 的写入范围不能重叠；必须重叠的设为依赖、串行执行。 -->

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 |  |  |  | — | todo |

状态：`todo` | `in_progress` | `done` | `blocked`

## 进度与决定

<!-- 每到一个节点追加一条，最新的在最下面。Session 中断后，新的主 Agent 读 task.md 和本节即可接续。 -->

- YYYY-MM-DD HH:MM 
