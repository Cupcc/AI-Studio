---
id: T20261113-codex-base-url
status: draft
next: human
waiting: 决定 Codex 自定义连接的地址不带 /v1 时应用怎样处理
paths: [apps/desktop/src/main/services/session/connection-test.ts, packages/agent-adapter/src/codex/connection-options.ts, specs/settings/spec.md]
evidence: 地址不带 /v1 时连接测试与真实 Codex 会话的结果符合所选方案，对应单测通过
risk: normal
fr: [FR-SET-001]
ac: []
specs: [specs/settings/spec.md]
created: 2026-11-13
---

# Codex 自定义连接的地址不带 /v1 时的处理

## 目标

用户按网关首页的地址填写 Codex 的 Base URL 时，连接测试失败且提示看不出原因。来源：2026-11-13 在虚拟机里做真实 CLI 验证时发现，见[验证记录](../../.agents/archive/tasks/T20261113-vm-ui-checks/task.md#真实-cli-验证2026-11-13main-agent)。

## 现状

- Codex 的连接测试请求 `<地址>/responses`。地址不带 `/v1` 时，请求落到网关的管理页面，返回 200 和 HTML，应用提示“API 请求失败、超时或响应无效，请检查地址、网络和代理”。
- Claude Code 的连接测试先去掉末尾的 `/v1` 再请求 `/v1/messages`，所以带不带都能通过。
- 行为由[设置规格的 CLI 连接配置](../../specs/settings/spec.md#cli-连接配置2026-11-08-确认)第 1、4 条负责，改动属于用户可见行为。

## 未决问题

| 问题 | 推荐答案与依据 | 决策方（人 / AI） | 是否阻塞 |
|---|---|---|---|
| 地址不带 `/v1` 时怎样处理 | 推荐自动补上：保存或使用 Codex 地址时，末尾没有 `/v1` 就补上，连接测试与真实会话一致，与 Claude Code 的做法对齐。备选是只改提示，在收到 HTML 时说明“地址可能缺少 /v1” | 人 | 是 |

## 范围

- 做：按决定修改连接测试与 Codex 会话的地址处理，更新规格。
- 不做：不改 Claude Code 的处理，不改连接表单的结构。

## 验收标准

- [ ] 地址不带 `/v1` 时，连接测试与真实 Codex 会话的结果符合所选方案。
