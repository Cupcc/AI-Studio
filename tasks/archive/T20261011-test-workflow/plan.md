# 执行计划

## Workers

本任务调整提交与 CI 检查门禁，按 Task Protocol 的复杂／高风险改动要求安排独立检查。

| Worker | 角色与范围 | 写入范围 | 集成 |
|---|---|---|---|
| Main | 实现脚本、配置、测试及负责文档；核对基线与验证结果 | 除 acceptance.md 外的本任务文件 | 独立 worktree chore/test-workflow |
| W1 / review | 未参与实现，审查快路径是否漏检、Git 基线／部分暂存、CI 去重与产物复用；独立运行相关测试 | 仅本任务 acceptance.md（现随任务归档） | 同一 worktree；不改代码，不运行有焦点冲突的 Electron 测试 |

## 进度

- 2026-10-11：基于 810d230 创建独立 worktree；完成路径分流、Markdown 链接回归、CI 配置及文档草稿。
- 2026-10-11：30 项脚本测试、actionlint、文档回归检查、diff whitespace 检查通过；全量基础检查进行中。发现其他会话正在运行 Electron E2E，暂不并行启动窗口测试。
- 2026-10-11：W1 发现 Git hook 环境污染 fixture index，Main 修复，W1 外部 index 复验通过；最终 36 项流程测试及 329 项应用单测通过。
- 2026-10-11：构建、复用产物打包、打包冒烟通过；E2E 首轮 23/26、原样复跑失败项 3/3，保留并发窗口测试干扰的可能性。独立门禁评审通过；Main 按 task.md 收尾并归档，未合入／推送。
