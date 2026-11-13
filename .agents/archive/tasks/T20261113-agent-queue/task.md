---
id: T20261113-agent-queue
status: done
next: none
waiting:
paths: [scripts/tasks.mjs, scripts/tasks.test.mjs, scripts/acceptance.mjs, scripts/acceptance.test.mjs, scripts/integrate-branch.mjs, scripts/check-commit.mjs, scripts/README.md, tasks/**, .agents/archive/tasks/**, AGENTS.md, CONTRIBUTING.md, docs/06. Development Roadmap.md]
evidence: node scripts/tasks.mjs 列出队列且 --check 通过；node scripts/acceptance.mjs 列出 main..dev；tasks/ 下没有 done 或旧流程遗留的任务
risk: normal
fr: []
ac: []
specs: []
created: 2026-11-13
---

# 任务队列、验收清单与旧任务清理

## 目标

让多个 Agent 并行推进时少依赖人：任务状态由头部字段表达并由命令汇总，人只在入口（给目标、答产品问题）和出口（体验 dev、推进 main）批量参与。来源：用户 2026-11-13 的对话。用户先问“tasks 怎么还存在这么多”“是不是缺少一个 DASHBOARD.md”，再问适合多 Agent 协作、减少人为干预的工作流，随后对 AI 的建议回复“approve all, implement”。

## 范围

- 做：
  - `node scripts/tasks.mjs`：从 dev 与各任务 worktree 的任务头部生成总览、排队和待人处理的清单；提交门禁检查头部；`archive` 子命令移动任务并修正链接。
  - `node scripts/acceptance.mjs`：从 `main..dev` 生成人工验收清单；集成命令要求用户可见的交付写明体验步骤。
  - Task Protocol 增加 Queue 一节（头部字段与五步流程），删除“既有任务的衔接”；AGENTS.md 增加执行中产品疑问的处理规则。
  - 逐项复核并归档 `tasks/` 下的 19 个旧任务。
  - 路线图不再转述单个交付的进行状态和待验收状态。
- 不做：
  - 决定记录不拆成一条一个文件。32 条决定里编号只撞过一次，拆分要改 31 个文件里的 87 处链接，收益不抵成本；并行分支新增决定时在 rebase 后取下一个空号。
  - 不启用 Claude Code 的 agent teams，不加合并队列。前者是实验功能且同文件编辑不适用；后者集成命令已核对 dev 没被移动，rebase 前的 CI 结果在改动相同时仍有效。
  - 界面交互检查进虚拟机并行，另见 [T20261113-vm-ui-checks](../T20261113-vm-ui-checks/task.md)。

## 依据

- 现行流程：[贡献指南 §2、§5](../../../../CONTRIBUTING.md#2-分支规范)、[Task Protocol](../../../../tasks/README.md)。
- 现状（2026-11-13 实测）：`tasks/` 下 19 个任务未关闭，其中 14 个停在旧流程的“待人工签收”；dev 领先 main 26 个提交；路线图“下一步”逐段转述各交付的状态，每个任务都要改。
- 外部依据（2026-11-13 查阅）：Anthropic 指出编码任务可并行的部分少于调研，多 Agent 的 token 用量约为对话的 15 倍，派工说明须含目标、输出格式、工具与边界（[How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)）；Claude Code 文档建议每个并行者拥有不同的文件，团队从 3～5 个开始（[agent teams](https://code.claude.com/docs/en/agent-teams.md)、[worktrees](https://code.claude.com/docs/en/worktrees.md)）。

## 验收标准

- [x] `node scripts/tasks.mjs` 在主目录之外的任一 worktree 运行，列出 dev 上的任务和其他 worktree 中进行中的任务。
- [x] 提交含 `status: done` 却留在 `tasks/` 的任务时，提交门禁拒绝。
- [x] `node scripts/tasks.mjs archive <id>` 之后 `pnpm check:docs` 没有新增问题。
- [x] `node scripts/acceptance.mjs` 列出 `main..dev` 的全部提交，并区分需要体验与无需体验。
- [x] 标题为 `feat` / `fix` / `perf` 且正文没有“体验：”行的集成被拒绝。
- [x] `tasks/` 下只剩未完成的任务。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 是否按建议开工，路线图是否改为不再转述交付状态 | 用户回复“approve all, implement”（2026-11-13） |
| v03 其余变更是否整体采用、v04 在线原型是否发布 | 不再整体采用，不再发布。AI 先按用户同日的“approve all”这样理解并落稿，随后列出该理解请用户确认，用户回复“yes”（2026-11-13） |
| 本任务的文档改动（Task Protocol、AGENTS.md、贡献指南、路线图、原型索引）是否通过审阅 | 用户回复“yes”（2026-11-13）。审阅的是 dev `084affb` 上的版本 |

## 技术决定

AI 决定，2026-11-13：

- 总览读取 dev 的任务加各分支 worktree 相对其与 dev 的合并基改动过的任务。主目录停在旧的验收提交上，只读当前目录会过时，也看不到其他 owner 已经接手的任务。
- `next` 与 `waiting` 单独成字段，不从 `status` 推导。`verifying` 与 `blocked` 既可能等 AI 也可能等人，旧任务正是因为这一点写在正文里才没人处理。
- 可并行的判断取 glob 的字面前缀做前缀比较，宁可多排队，不做完整的 glob 求交。
- 体验步骤写在集成提交的正文里，由集成命令强制，验收清单直接读提交，不另存一份。

## 收尾

- 2026-11-13，Main Agent 收尾。两个脚本由两个 worker 在各自的 worktree 实现，Main Agent 审阅 diff 后并入本分支，并补了两处：未决问题只把决策方不是 AI 的行列给人；worktree 里的任务按分支最后一次提交计算停留天数。没有需要独立评审的改动（不涉及数据迁移、权限或进程隔离）。
- 自检，基线为本分支集成前的末端提交：`pnpm test:scripts` 9 个文件、161 项通过；`pnpm check:docs` 与全量链接检查（`--base ''`）均为 0 个问题；`node scripts/tasks.mjs` 在任务 worktree 中列出本分支的任务；暂存一个留在 `tasks/` 的 `done` 任务后 `pnpm check:commit` 以状态 1 拒绝；`node scripts/acceptance.mjs` 列出 `main..dev` 的 26 个提交。
- 归档：19 个旧任务逐项写明收尾依据后用归档命令移动，命令改写了链接；`scripts/README.md` 代码块里的两处旧路径和一个指向已删除小节的锚点为手动修正。
- 命令没有加 `pnpm` 别名。提交门禁对根 `package.json` 的改动一律拦截，仓库里的 `remote-ci`、`integrate-branch` 也直接用 `node scripts/...` 调用。
- 文档复核：Task Protocol（Queue、Lifecycle、Archiving、Queries）、AGENTS.md 核心原则、贡献指南 §5 与 §7、路线图 §1、§1.1、§2、§3、§4.2、§5、§6、原型索引、架构 HTML 的剩余工作项、脚本说明。路线图模块表里其他“待人工验收”的表述仍然属实，保留；按新的更新规则不再新增这类表述。
- 未做：界面交互检查进虚拟机，见[后续任务](../T20261113-vm-ui-checks/task.md)。
