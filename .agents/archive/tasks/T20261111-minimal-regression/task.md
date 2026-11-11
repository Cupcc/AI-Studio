---
id: T20261111-minimal-regression
status: done
owner: main-agent
created: 2026-11-11
---

# 最小回归测试选择

## 目标与依据

用户于 2026-11-11 审阅测试范围问题后明确批准实施建议。收紧 [测试选择器](../../../../scripts/check-affected.mjs)，继续遵循 [测试分层](../../../../scripts/README.md#测试分层)，不降低产品验收标准。

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
- `regression_review` 已完成独立评审；共享工具样式与混合改动两项发现修复后复验关闭。独立结论及基线见 [acceptance.md](acceptance.md)。
- 文档复核覆盖 AGENTS、CONTRIBUTING、scripts/README、桌面 README、角色说明、原范围选择任务、05 验收与 06 路线图的下一步、概况、模块、阶段和验收区。测试规则由 scripts/README 负责；桌面 README 的日常全量命令提示已改为局部入口。产品行为、验收状态与路线图不受影响，历史测试结果保留原基线。
- 提交门禁 4 文件 77 项通过，链接检查 0 新问题。任务分支已提交并干净 rebase 最新 dev；自动保留集成命令映射。新集成脚本存在静态导入关系，实际清单只选自己的测试文件，无需追加工作流全套。同步后 2 文件 30 项通过，独立评审另复跑相关 2 项通过。
- `fix/minimal-regression` 的代码交付 `fb2dbf06f0153e3ffb23a9d427cd1f955601dc82` 已由集成命令快进合入 dev 并推送；集成时两边工作区均干净。远端 [CI](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/42995664502) 的文档和 macOS 定向检查均通过。
- CI 日志复核发现脚本测试会打印 `runPlan` 的模拟应用命令。测试内已静默模拟日志，生产命令输出保持；收尾局部 27 项通过。

## 收尾

2026-11-11：Main Agent 核对授权范围、最终 diff、定向门禁、独立评审与远端 CI 后关闭任务并归档。脚本规则与桌面命令说明已同步，原范围任务补充后续修复入口；历史证据保留原基线。产品需求、功能实现及人工验收状态未改变，不修改路线图或产品验收结论。
