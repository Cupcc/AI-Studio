---
id: T20261112-squash-integration
status: done
created: 2026-11-12
---

# squash 集成 dev 与验收冻结

## 收尾

Main Agent 自检收尾。本任务是仓库流程任务，按 [Task Protocol](../../../../tasks/README.md#验收范围与独立性) 的过程任务规则自检，没有安排独立 AI 评审。基线为 dev `4dbe536`。按用户要求只做最小回归：`scripts/integrate-branch.test.mjs` 的 15 项用例通过，提交门禁只选中文档回归与该测试文件。本任务用新的集成命令集成到 dev，集成提交的 `Source-Commit` 即源提交。CONTRIBUTING 仍是草稿，本次 diff 待用户审阅。收尾日期 2026-11-12。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| main 与 dev 的历史形态 | main 保持一条线；dev 要能看出每个功能的来源（2026-11-12） |
| 人工验收方式 | AI 在各自 worktree 工作，自检通过后集成 dev；用户只体验 dev，通过后推进 main（2026-11-12） |
| 采用的方案 | 用户批准：进 dev 时 squash，main 从 dev 快进；进 dev 前完成要求的 AI 验收；体验期间冻结 dev（2026-11-12） |
| squash 提交是否再运行 pre-commit | 方案中列为待定点，随方案一并批准：用 `git commit-tree` 生成提交，只用 commitlint 检查提交信息（2026-11-12） |
| CONTRIBUTING 的写法 | 用户要求精简全文并去除 AI 腔（2026-11-12） |
| 检查范围 | 用户要求只做最小回归，不做全量检查（2026-11-12） |

## 方案与理由

比较过的方案：

- dev 用 `--no-ff` merge commit。功能边界清楚，但 main 快进后会带上 merge commit，main 不再是一条线。
- dev 保留细节，进 main 时再整理。main 的提交与验收时的 dev 提交 SHA 不同，两条历史长期分叉，需要对应关系、晋级脚本和文件树校验。
- 每个任务分支单独进 main，dev 只作试用。需要定期强推重建 dev，同一冲突要解两次，进 main 的组合也没有在 dev 上验证过。

选定进 dev 时 squash。dev 与 main 是同一批提交，用户验收的 SHA 就是进 main 的 SHA。每项交付在 dev 上是一个提交，可以整体 `git revert`，`git bisect` 也能直接定位到交付。做法参考 pstack 中 poteto 的 shipping 流程：合入时 squash、只推进从底部开始连续通过的一段、由非作者验证。代价是任务分支内部的提交拆分不进入 dev，由正文的原提交列表和拆小任务弥补。

## 交付

- [集成命令](../../../../scripts/integrate-branch.mjs)：squash 集成，`--title` 与 `--body-file`，commitlint 检查，`--freeze` 与 `--unfreeze`。
- [CONTRIBUTING](../../../../CONTRIBUTING.md) 第 2～5 节改为新流程，全文精简。删除已失效的“既有 main 的 merge commit 保留”，main 当前没有 merge commit。推进 main 改为直接推送已验收的提交，不再需要 main worktree。
- [脚本说明](../../../../scripts/README.md#任务分支集成)同步命令行为、冻结记录与回归范围。

## 文档复核

- AGENTS 的入口表仍指向 CONTRIBUTING 第 2～6 节，所有入站锚点保留。
- Task Protocol 中 worker 代码交付的链接、人工验收入口 dev、“自检、AI 验收、人工验收”的顺序，都与新流程一致，不需要修改。
- `docs/04. Technical Requirements.md` 与 `specs/agent-todos/spec.md` 中“本仓库线性历史”仍然成立，不修改。
- `tasks/T20261112-workbench-ui-polish/plan.md` 中的快进记录是历史操作，保留。
- 现有 dev 历史不重写，新规则从本任务的集成开始生效。现有的 workbench-ui-polish 与 workbench-lifecycle 等 worktree 以后按新命令集成。
