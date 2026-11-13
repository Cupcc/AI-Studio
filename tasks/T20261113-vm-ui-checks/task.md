---
id: T20261113-vm-ui-checks
status: draft
next: ai
waiting: 先验证 agent-browser 能否在虚拟机内驱动 Electron，再定方案并标为 ready
paths: [scripts/vm-ci.mjs, scripts/vm-ci.test.mjs, scripts/README.md]
evidence: 两台虚拟机同时各完成一个界面交互场景并各保存一张截图，本机桌面没有弹出窗口
risk: normal
fr: []
ac: []
specs: []
created: 2026-11-13
---

# 界面交互检查进虚拟机并行

## 目标

AI 的界面交互验收现在用 agent-browser 操作本机的 Electron 应用。开发模式下各 worktree 共用同一份 userData，同一时间只能有一个 owner 做界面检查，这是多个 Agent 并行时剩下的串行点。目标是让界面交互检查在虚拟机内进行，几个 owner 可以同时做。来源：用户 2026-11-13 对多 Agent 工作流建议回复“approve all, implement”，见[队列任务](../../.agents/archive/tasks/T20261113-agent-queue/task.md)。

## 范围

- 做：验证 agent-browser 能否在 tart 虚拟机内驱动 Electron；可行时给虚拟机 CI 增加一个“交互检查”入口，并更新 [Task Protocol 的验收分层](../README.md#验收准备与分层)。
- 不做：不改 E2E 的运行方式，不改人工验收的入口。

## 依据

- 本机资源的限制见[贡献指南 §2](../../CONTRIBUTING.md#主目录与-worktree)。
- 虚拟机 CI 已集成 dev（`ca51006`），命令与名额限制见[脚本说明](../../scripts/README.md#本机-vm-ci)：每台主机最多同时运行两台虚拟机。

## 未决问题

| 问题 | 推荐答案与依据 | 决策方（人 / AI） | 是否阻塞 |
|---|---|---|---|
| agent-browser 在虚拟机内是否可用 | 先做一次最小验证再定方案；不可用时关闭本任务并记录原因 | AI | 是 |

## 验收标准

- [ ] 两台虚拟机同时各完成一个界面交互场景，截图可读，本机桌面没有弹出窗口。
- [ ] Task Protocol 写明界面交互检查的并行方式与限制。
