# 实施与评审

## Workers

| Worker | 工作 | 写入范围 | 集成方式 |
|---|---|---|---|
| Main Agent | 范围选择器、门禁、CI、测试与规则文档 | 除 acceptance.md 外的本次文件 | 独立 worktree；保留原功能修改 |
| Review Agent | 按 Task Protocol 复杂改动要求独立评审；检查误选、漏选、暂存边界与 CI | 只写本任务 acceptance.md；不得修改实现 | 发现问题交回 Main；复验修复 |

## 进展

- 2026-11-06：完成首版选择器、门禁和 CI 分支；两份工作流测试文件 48 项通过，仅运行脚本测试，无应用测试。准备独立评审。
- 评审限定本 worktree，不操作主目录、其他 worktree 或真实应用。可运行局部脚本测试／dry-run，禁止全量应用测试与真实模型请求。
