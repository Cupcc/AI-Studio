---
id: T20261111-minimal-regression
status: verifying
owner: main-agent
created: 2026-11-11
---

# 最小回归测试选择

## 目标与依据

用户于 2026-11-11 审阅测试范围问题后明确批准实施建议。收紧 [测试选择器](../../scripts/check-affected.mjs)，继续遵循 [测试分层](../../scripts/README.md#测试分层)，不降低产品验收标准。

## 范围与验收

- 普通源码按静态依赖选择单测，IPC、删除路径与动态资源保留有依据的补充覆盖。
- 样式改动只选择对应界面回归，不加入后端单测或无关类型检查。
- 工作台包构建入口变动不触发 Terminal；CSP 变化保留相应运行时验证，未映射配置阻断。
- 空单测选择以非零退出，选择器测试检查实际 Vitest 清单与进程退出码。
- 只验证脚本、提交与 CI 入口、实际测试清单和文档链接，不运行应用全量测试、Electron 或真实 CLI。

## 实施与验证安排

在 `fix/minimal-regression` 独立 worktree 修改。Main Agent 负责脚本、测试及规则文档。本轮影响提交与 CI 门禁的覆盖范围，按 Task Protocol 由未参与实现的 Review Agent 独立复核，写入 `acceptance.md`；评审只读实现，可运行局部脚本与清单检查。

## 进度

- 基线 `bc75bae`，已同步 dev。
- 评审已复现：workbench CSS 选中 14 个单测文件；标题辅助函数选中 17 个（静态依赖仅 3 个）；工作台构建入口触发整份 runtime-tools E2E；空 related 选择退出 0。
- Main 自检：`node scripts/check-affected.mjs` 选中 4 份脚本测试，75 项通过；应用单测未执行。清单验证证明标题辅助函数只选 3 个消费者，包资源选 3 个直接消费者，CSS 无单测。真实子进程的空选择退出 1，CSP E2E 清单只列 2 个相关场景。
- 独立评审已交由 `regression_review`，只写 `acceptance.md`，主 Agent 不写其结论。
- 文档复核覆盖 AGENTS、CONTRIBUTING、scripts/README、桌面 README、角色说明、原范围选择任务、05 验收与 06 路线图的下一步、概况、模块、阶段和验收区。测试规则由 scripts/README 负责；桌面 README 的日常全量命令提示已改为局部入口。产品行为、验收状态与路线图不受影响，历史测试结果保留原基线。
- 待完成：独立评审、链接检查与最终 diff 复核。
