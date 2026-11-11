# 贡献指南

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 文档职责 | 统一开发协作、文档维护、分支、提交、PR、合并和 main 历史规范 |
| 相关记录 | [协作规范任务](tasks/T20261010-contributing/task.md) |

本指南适用于单人开发。文档确认规则见[第 7 节](#7-文档维护与审阅)。

## 1. 开始一项工作

- 先读 [AGENTS.md](AGENTS.md)，再读修改目录的负责索引。
- 是否需要任务记录，按 [Task Protocol](tasks/README.md) 判断；不为每次小改动增加文档流程。
- 一次提交围绕一个明确目标，避免混入无关修改；较大工作拆成可独立验证的阶段。
- 产品变化引用负责文档及 FR / AC；仓库工具与协作规则不编造产品编号，描述与来源按[第 7 节](#7-文档维护与审阅)处理。

## 2. 分支规范

| 分支 | 用途 | 约束 |
|---|---|---|
| `main` | 已通过约定检查和人工验收的稳定交付基线 | 从 dev 的已验收提交快进；禁止新增 merge commit、强推和重写已发布历史 |
| `dev` | 长期功能集成与人工体验入口 | 主 checkout 常驻；只集成已提交并完成开发自检的成果；不强推或改写已集成提交 |
| 任务分支 | 功能开发、修复或需要隔离的工作 | 从最新 dev 创建独立 worktree；使用英文小写与连字符，例如 `feat/project-view`、`fix/workbench-order` |
| `<任务分支>-<worker>` | 已安排的并行 worker | 独立 worktree，写入范围与集成方式遵循 Task Protocol |

用户在主目录运行 `pnpm dev` 体验集成版本。AI 在任务 worktree 实现、自检并提交到任务分支，再按第 5 节处理冲突并合入 dev；人工体验发现的问题通过任务或修复分支继续集成。小改动可直接提交 dev，仍须检查 diff 并通过适用门禁。main 不接收待验收的日常改动。流程来源与本轮迁移状态见 [dev 集成任务](.agents/archive/tasks/T20261111-dev-integration/task.md)。

主 checkout（仓库主目录）常驻 dev，不切换到任务分支或 main。多个 AI 会话共用 checkout 时共享 HEAD、文件和暂存区，不能同时暂存或提交；集成由单一写者串行执行。

开始工作前核对状态并同步 dev；工作区须干净，无法快进时检查差异，不强推或丢弃本地改动：

```sh
git status --short
git pull --ff-only origin dev
```

较大工作在仓库同级目录 `../AI Stduio.worktrees/` 下创建 worktree，不放在仓库内：

```sh
git worktree add "../AI Stduio.worktrees/example" -b feat/example dev
cd "../AI Stduio.worktrees/example"
pnpm install
```

- 新 worktree 须先执行 `pnpm install` 再提交：`core.hooksPath` 指向 Husky 生成的 `.husky/_/`，缺少时 Git 会跳过提交检查。
- 并行工作开始前核对写入范围；会修改同一文件的工作排成先后。
- 本机资源同一时间只给一个 worktree 使用：开发模式各 worktree 共用同一 userData 与数据库（见 [桌面端说明](apps/desktop/README.md)），`pnpm dev` 不同时运行；需要窗口焦点的 Electron E2E 同一时间只运行一份。

任务分支首次集成 dev 前使用 rebase 同步 dev，不把 dev merge 进任务分支。已经进入 dev 的提交不再重写；后续修复从当前 dev 新建分支。任务分支按需推送备份，个人分支 rebase 后须核对远端没有他人新提交，才可使用 `--force-with-lease`；禁止对 dev 或 main 强推。

## 3. 提交规范

使用 Conventional Commits：

```text
<type>[optional scope][!]: <description>
```

- 常用 type：`feat`、`fix`、`refactor`、`test`、`docs`、`chore`、`ci`；scope 指向受影响模块。
- description 简短、明确，使用动作描述，例如 `docs(contributing): define linear main history`；可使用中文主题。
- 破坏性变更使用 `!` 或 `BREAKING CHANGE:` footer。
- 标题已能说明的小改动无需重复写长正文；复杂改动在正文说明原因，引用已有任务和适用的 FR / AC。涉及人工确认的内容，引用确认记录；没有记录时在提交说明中保留对话结论与确认日期。
- 每个提交围绕同一目的，提交前检查暂存 diff；不夹带无关修改、凭据、个人配置或临时产物。
- 任务分支可保留过程提交，进入 dev 前按第 5 节整理；提交须通过现有门禁。

本地 hooks、commitlint 的具体配置、检查命令和边界见 [scripts/README.md](scripts/README.md)。不得用 `--no-verify` 或 `HUSKY=0` 跳过本地提交检查；CI 中显式运行检查的配置以脚本说明为准。

## 4. PR 与审阅

PR 可选：需要集中查看较大 diff、邀请他人审阅或协作时使用。单人日常工作不要求 PR 或独立 approval。

普通改动由维护者查看 diff 即可，不另设审批表或逐项签收。产品决策边界遵循 [AGENTS.md](AGENTS.md#authorship--review)，已确认规格的变更和文档确认遵循[第 7 节](#7-文档维护与审阅)及负责目录的审阅规则。

已有 task 由 Main Agent 按 [Task Protocol](tasks/README.md#lifecycle) 核对完成条件并收尾。任务关闭、PR approval、合并均不代表人工接受功能交付；所需独立 AI 评审与人工功能验收见该协议，不额外要求每个 task 人工签收。

功能或修复 PR 的目标为 dev，标题遵循第 3 节格式；描述简要说明目的、验证结果、已有任务及适用 FR / AC。界面变化附截图，有未决问题则明确列出。

提交与日常 CI 按[脚本说明](scripts/README.md#测试分层)检查受影响范围，不默认全量运行。提交或合并本身不是全量回归理由；同一基线的有效检查结果无需手工重复，根据改动补充必要验证。推送 dev、main 或更新 PR 后检查 CI 结果，失败时修复；使用 PR 时须等最新版本 CI 通过再合并。无 PR 的任务分支推送仅作备份，手动 CI 明确表示选择完整自动化；本地合入仍须完成第 5 节必要验证。

## 5. 合并与收尾

### 集成到 dev

集成来源必须是任务分支上的提交。不得把未提交 worktree 的文件、补丁或目录复制到 dev 后代为提交。源 worktree 有改动时先回到该目录提交，不能只检查分支 HEAD 就认定源码已交付。

1. 在任务 worktree 检查全部改动，将本轮交付提交到自己的任务分支。提交须通过现有门禁；记录提交 SHA，并确认暂存区、工作区及未跟踪文件均已处理。
2. 在干净的主 checkout 同步 dev，再回到干净的任务 worktree 执行 `git rebase dev`。冲突只在任务 worktree 解决，完成 `git rebase --continue`，不把冲突处理留成未提交文件。整理同一目标的过程提交，按变化复验受影响部分。
3. 核对源 worktree 干净并记录最终 SHA。回到干净的主 checkout，通过[集成命令](scripts/README.md#任务分支集成)快进合入该提交，再普通推送 dev。命令失败时修复提示的问题，不改用文件复制、自动 stash 或普通 merge。
4. 记录源分支、最终源提交、dev 提交及两边工作区状态，提供主目录的测试入口。只在用户接受对应版本后推进 main，不能把提交完成写成人工验收通过。

```sh
# 在任务 worktree 完成提交后执行。
git rebase dev
git status --short
git log -1 --oneline

# 在主 checkout（dev）执行。
node scripts/integrate-branch.mjs feat/example
git push origin dev
```

集成命令要求 dev 与源 worktree 均干净、源分支有新提交且包含当前 dev。它合入固定的源提交，不会替源目录提交、复制文件、stash、rebase、推送或删除 worktree。

若选择 PR，源分支同样先在自己的 worktree 完成提交并推送；功能 PR 使用 **Squash and merge** 到 dev，禁止 **Create a merge commit**。主 checkout 随后用 `git pull --ff-only origin dev` 同步。已经 squash 集成的任务分支不再复用，反馈修复从最新 dev 开始。

### 将验收版本推进到 main

人工在 dev 验收完整功能或一批版本，记录接受范围与具体提交。dev 同时包含尚未接受的功能时，先修复或撤回相关改动并验证剩余组合，再选择晋级提交；不能把未验收内容随 dev 分支头一起带入 main。

在独立的 main worktree 中同步 main，然后快进到记录的已验收提交并普通推送。主目录始终保留在 dev；dev 到 main 不 squash，避免丢失已验收提交身份与祖先关系。

```sh
git pull --ff-only origin main
git merge --ff-only <已验收的-dev-commit>
git push origin main
```

快进失败时检查分叉来源，不强推或重写 dev、main；整合后的内容发生变化则重新验证。提交、AI 检查与合并不代替人工产品验收，记录要求见 [Task Protocol](tasks/README.md#人工功能验收)。

### 清理

对应交付进入 main 后，核对任务 worktree 没有未提交改动且无人使用，再删除 worktree 与已合入分支。默认不使用 `--force`；用户明确要求删除旧脏 worktree 时，只按授权的目录和范围处理，不把该授权沿用到后续任务。dev 长期保留，继续承接下一轮功能。任务文档与历史证据按 Task Protocol 保留。

既有 main 的 merge commit 保留。整理旧历史须另建任务，列出保留内容、备份与协作影响，并取得人工明确授权。

## 6. 远端设置

单人开发阶段暂不要求启用分支保护、强制 PR 或必需 approval。以后需要远端强制约束或引入协作者时再配置。CI 的执行内容与已部署状态由 [scripts/README.md](scripts/README.md) 负责记录。

## 7. 文档维护与审阅

本节负责通用的文档写作、来源与审阅规则。人类与 AI 的决策边界见 [AGENTS.md](AGENTS.md#authorship--review)。

### 落稿与确认

文档由 AI 起草与维护，人类在对话中作出决定并审阅变更。各目录的命名、元数据、状态和审阅要求见其负责索引。

- 正文直接描述现行规则与行为；修改时间和经过通过 Git 历史追溯，不逐条附加对话日期或“本次修改”说明。
- 每项事实只维护一处，其他位置链接负责文档。产品需求引用上游章节、FR / AC 或决定记录；协作与工具规则无需逐条标注对话来源。
- 重要取舍保留理由。人工确认与验收的结论、日期在负责记录中集中维护，正文引用该记录；提交日期不能代替确认日期。
- 对话决定写入负责文档且人类审阅 diff 后生效。草稿与待审阅状态集中标注，无需每节重复“diff 待审阅”。
- 未经明确确认，不得标注文档已确认或产品已验收；AI 假设和技术决定不得写成人工确认。已确认内容的变更提供 diff 与摘要，草稿可直接修订。
- 不明确的事项列入“未决问题”，注明负责人及是否阻塞。AI 解决授权内的技术问题，产品问题交由人类决定。
- 任务完成与归档由 Main Agent 按 [Task Protocol](tasks/README.md#lifecycle) 处理，不等于文档确认或人工产品验收。

### 文档同步与收尾复核

- 触发时机：对话决定落稿、实现或验证结果改变现有事实时，检查文档影响；提交前和回复工作完成前，复核最终 diff。没有提交的工作也必须完成复核。
- 按决定或事实追踪影响，不只按修改文件检查。先明确本次改变了什么、哪些条件仍未解决，再核对负责文档、决定记录、路线图、验收要求和相关任务；按主题、编号、引用与同义表述搜索，不能只搜索原句。
- 路线图须同时核对“下一步、整体概况、模块状态、阶段计划、验收进度”；相关记录须检查下一步、负责人、阻塞条件、完成条件和状态摘要。已决定事项不得继续写成待人决定，同一文件不同章节也须一致。
- 保持事实的唯一负责文档，其他位置优先引用；历史验证记录保留原基线和结论，当前总结链接新决定。范围确认、代码实现、验证通过和人工验收分别记录，不互相代替。
- 链接、格式或语法检查通过不代表语义一致。复核发现的遗漏应在本轮修正；无法修正的列明原因和影响，不报告为全部同步完成。
- 收尾在已有任务记录中简述已核对的文档及章节、更新项和保留项理由；无需任务记录的小改动在最终回复中简述。检查没有影响的文档不必制造修改。
- Agent 修改文档后的自动提醒、检测边界与启用方式见 [Agent 文档 Hook](scripts/README.md#agent-文档-hook)；hook 不代替上述语义复核或链接检查。

### 文档检查

- 预览修改后的 Markdown 表格与标题，检查本地链接；命令与自动检查边界见[脚本说明](scripts/README.md#文档检查边界)。
- 移动文件或修改标题后，搜索旧路径与锚点，修复所有引用。
- 已删除文件的引用按删除意图清理；不得为通过链接检查擅自恢复已删除的文件。
- 执行负责索引要求的检查；涉及产品文档时，按[文档索引](<docs/00. Documentation Index.md#文档规则>)核对跨文档一致性。
- 定位需求及其验收、规格引用可用 `rg 'FR-PROJ-001|AC-01' docs specs`；任务查询及证据搜索边界见 [Task Protocol](tasks/README.md#queries)。读取含空格的路径时加引号。
