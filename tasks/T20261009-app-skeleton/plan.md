# 执行计划：T20261009-app-skeleton

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

单个实现 worker 建立骨架并完成 06 第 6 节两项骨架阶段校验；完成后由不同 worker 验收。技术选择写成决定草稿。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 骨架实现（Opus 5.5 high） | 根目录配置文件；`apps/desktop/**`；`docs/decisions/D20261009-desktop-*.md`（新建）；本 task 的 `research.md`、`evidence/W1-*` | 可启动应用、测试框架、决定草稿、命令清单 | — | in_progress |
| W2 | 验收（Sonnet 5.5 xhigh） | 本 task 的 `acceptance.md`、`evidence/W2-*` | 验收记录 | W1 | todo |

## 进度与决定

- 2026-10-09 task 卡片就绪，状态 ready。
