# 贡献指南

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 文档职责 | 开发协作、文档维护、分支、提交、PR、合并与 main 历史的规范 |
| 相关记录 | [协作规范任务](tasks/T20261010-contributing/task.md)、[squash 集成与验收冻结](.agents/archive/tasks/T20261112-squash-integration/task.md) |

本指南适用于单人开发。文档确认规则见[第 7 节](#7-文档维护与审阅)。

## 1. 开始一项工作

- 先读 [AGENTS.md](AGENTS.md)，再读要修改目录的负责索引。
- 按 [Task Protocol](tasks/README.md) 判断是否需要任务记录。小改动不额外增加文档流程。
- 一次提交只做一件事，不混入无关修改。较大的工作拆成能单独验证的阶段。
- 产品变化引用负责文档及 FR / AC。仓库工具与协作规则不编造产品编号，描述与来源按[第 7 节](#7-文档维护与审阅)处理。

## 2. 分支规范

| 分支 | 用途 | 约束 |
|---|---|---|
| `main` | 稳定基线，只含人工验收通过的版本 | 只从 dev 快进；不直接提交，不强推，不重写已发布历史 |
| `dev` | 集成与人工体验分支 | 每个任务分支集成为一个 squash 提交；不强推，不改写已集成的提交 |
| 任务分支 | 一项能单独验收的功能、修复或其他工作 | 从最新 dev 创建，在独立 worktree 中开发；名称用英文小写加连字符，例如 `feat/project-view`、`fix/workbench-order` |
| `<任务分支>-<worker>` | 已安排的并行 worker | 独立 worktree；写入范围与集成方式见 [Task Protocol](tasks/README.md#parallel-workers) |

dev 和 main 都是一条线，main 始终是 dev 的前缀。`git log --oneline main..dev` 列出待验收的提交，每行是一个任务分支或一个直接提交。集成命令会删除已集成的 worktree，所以 `git worktree list` 只列出尚未集成的工作。

一项工作按以下顺序进行。AI 在任务 worktree 中实现、自检和提交，再按[第 5 节](#5-合并与收尾)集成到 dev。用户在主目录体验 dev，验收通过后，main 快进到该版本。体验中发现的问题由新的修复分支处理，同样集成到 dev。

小改动可以直接提交到 dev，但仍须检查 diff 并通过适用的门禁。在主目录改完即提交：主目录留有未提交的改动时，所有集成都会被拒绝。main 不接收待验收的改动。

### 主目录与 worktree

主目录指仓库根目录。它常驻 dev，不切换到任务分支或 main。多个 AI 会话共用主目录时，也共用 HEAD、文件和暂存区，所以同一时间只能有一个会话在主目录暂存、提交或集成。

开始工作前，确认主目录干净并同步 dev。无法快进时先检查差异，不强推，也不丢弃本地改动：

```sh
git status --short
git pull --ff-only origin dev
```

较大的工作在仓库同级目录 `../AI Stduio.worktrees/` 下创建 worktree，不放在仓库内：

```sh
git worktree add "../AI Stduio.worktrees/example" -b feat/example dev
cd "../AI Stduio.worktrees/example"
pnpm install
```

- 新 worktree 先运行 `pnpm install` 再提交。`core.hooksPath` 指向 Husky 生成的 `.husky/_/`，这个目录缺失时 Git 会跳过提交检查。
- 并行工作开始前核对写入范围。会修改同一文件的工作按先后顺序进行。
- 本机资源同一时间只给一个 worktree 用。开发模式下各 worktree 共用同一份 userData 与数据库（见[桌面端说明](apps/desktop/README.md)），所以 `pnpm dev` 不能同时运行。需要窗口焦点的 Electron E2E 同一时间也只能运行一份；AI 默认把 E2E 放到远端 CI 运行，不占用本机桌面，见[远端 E2E](scripts/README.md#远端-e2e)。

任务分支用 rebase 同步 dev，不把 dev merge 进任务分支。任务分支可以按需推送，用于备份或远端 CI。个人分支 rebase 后，先确认远端没有他人的新提交，再使用 `--force-with-lease`。禁止对 dev 或 main 强推。

## 3. 提交规范

提交信息使用 Conventional Commits：

```text
<type>[optional scope][!]: <description>
```

- 常用 type 有 `feat`、`fix`、`refactor`、`test`、`docs`、`chore`、`ci`。scope 写受影响的模块。
- description 用动作描述，简短明确，例如 `docs(contributing): define linear main history`。可以用中文。
- 破坏性变更使用 `!` 或 `BREAKING CHANGE:` footer。
- 标题已能说明的小改动不写长正文。复杂改动在正文写原因，引用相关任务和适用的 FR / AC。涉及人工确认的内容引用确认记录；没有记录时，在提交说明中写下对话结论与确认日期。
- 每个提交只有一个目的。提交前检查暂存的 diff，不夹带无关修改、凭据、个人配置或临时产物。
- 任务分支可以保留过程提交。集成时整个分支合成 dev 上的一个提交，标题由集成命令的 `--title` 提供，见[集成到 dev](#集成到-dev)。

本地 hooks、commitlint 配置、检查命令及其边界见[脚本说明](scripts/README.md)。不得用 `--no-verify` 或 `HUSKY=0` 跳过本地提交检查。CI 中显式运行哪些检查，以脚本说明为准。

## 4. PR 与审阅

PR 可选。需要集中查看较大的 diff、邀请他人审阅或协作时再用。单人日常工作不要求 PR 或独立 approval。

维护者查看 diff 即可审阅普通改动，不另设审批表或逐项签收。产品决策边界见 [AGENTS.md](AGENTS.md#authorship--review)。已确认规格的变更和文档确认按[第 7 节](#7-文档维护与审阅)及负责目录的审阅规则处理。

已有任务由 Main Agent 按 [Task Protocol](tasks/README.md#lifecycle) 核对完成条件并收尾。任务关闭、PR approval 和合并都不代表人工接受了功能交付。独立 AI 评审与人工功能验收的要求见该协议，不要求每个任务另行人工签收。

功能或修复 PR 以 dev 为目标，标题遵循[第 3 节](#3-提交规范)的格式。描述写明目的、验证结果、相关任务及适用的 FR / AC。界面变化附截图，未决问题逐条列出。

提交与日常 CI 只检查受影响的范围，见[测试分层](scripts/README.md#测试分层)。提交或合并本身不是全量回归的理由。同一基线已有有效的检查结果时，不手工重复，只按改动补充必要的验证。推送 dev、main 或更新 PR 后检查 CI 结果，失败时修复。使用 PR 时，等最新版本的 CI 通过再合并。任务分支推送不触发 CI；需要远端检查时手动触发，模式见[远端 E2E](scripts/README.md#远端-e2e)。本地集成仍须完成第 5 节的必要验证。

## 5. 合并与收尾

### 集成到 dev

只集成任务分支上已提交的内容。不得把未提交 worktree 中的文件、补丁或目录复制到 dev 再代为提交。源 worktree 有改动时，先回到该目录提交。只看分支 HEAD 不能证明源码已经交付。

1. 在任务 worktree 检查全部改动，把本轮交付提交到任务分支。确认暂存区、工作区和未跟踪文件都已处理。
2. 在主目录同步 dev，再回到任务 worktree 执行 `git rebase dev`。冲突只在任务 worktree 中解决，并完成 `git rebase --continue`，不留下未提交的冲突处理。rebase 后按变化复验受影响的部分。
3. 完成 [Task Protocol](tasks/README.md#acceptance) 要求的 AI 评审与验收。功能交付由未参与实现的 AI 验收，界面改动还须做交互验收。这一步放在集成之前，因为坏的改动进入 dev 后，会挡住它后面的所有改动推进 main。
4. 确认源 worktree 干净，然后在主目录运行[集成命令](scripts/README.md#任务分支集成)，再普通推送 dev。命令失败时修复它提示的问题，不改用文件复制、自动 stash 或普通 merge。集成成功后命令删除源 worktree 与本地任务分支，见[清理](#清理)，所以运行前先停止该 worktree 中的会话与 `pnpm dev` 等进程，之后的命令都在主目录执行。推送过的远端任务分支在推送 dev 后删除。
5. 集成提交已记录源分支与源提交。向用户报告 dev 提交、主目录状态与清理结果、dev 上新增了什么以及怎样体验。提交完成不等于人工验收通过。

```sh
# 在任务 worktree 中，提交完成后执行。
git rebase dev
git status --short

# 在主目录（dev）中执行。
node scripts/integrate-branch.mjs feat/example --title "feat(example): add the example view" --body-file <验证摘要文件>
git push origin dev
git push origin --delete feat/example   # 仅当推送过任务分支
```

集成命令把任务分支合成 dev 上的一个提交：

- `--title` 是这个提交的标题，也是这项交付将来在 main 上的那一行。`--body-file` 写验证结果。命令在正文后附上原提交列表、源分支和源提交。
- 命令要求 dev 是源分支的祖先，所以新提交的文件树与任务分支末端完全相同。命令只用 commitlint 检查提交信息，不再运行 pre-commit，内容的检查已在任务分支上完成。
- 先完成的分支先集成。dev 前进后，其他分支要重新 rebase 才能集成。
- 任务分支集成后即删除，不再复用。反馈修复从最新的 dev 新建分支。

使用 PR 时，源分支同样先在自己的 worktree 提交并推送。PR 用 **Squash and merge** 合入 dev，PR 标题即 squash 提交的标题；禁止使用 **Create a merge commit**。合并后，主目录用 `git pull --ff-only origin dev` 同步，再按[清理](#清理)手动删除 worktree 与分支；GitHub 生成的 squash 提交没有 `Source-Commit`，以 `gh pr view <任务分支> --json state` 显示 `MERGED` 为准。

### 人工验收与推进 main

用户验收的是 dev 上的一个具体提交。开始体验前冻结 dev，以免新的集成改变正在运行的应用：

```sh
node scripts/integrate-branch.mjs --freeze    # 记录当前 dev 提交，暂停集成
node scripts/integrate-branch.mjs --unfreeze  # 体验结束后解除冻结，并输出该提交
```

冻结期间，集成命令拒绝执行。此时也不向 dev 直接提交或合并 PR，原本要直接改 dev 的小改动也放到任务 worktree，不在主目录留下未提交的改动。其他任务照常在自己的 worktree 中开发，解除冻结后再集成。

- 通过：按 [Task Protocol](tasks/README.md#人工功能验收) 记录接受范围与提交，再把 main 快进到该提交并推送。
- 不通过：从 dev 新建修复分支，按上一节集成，然后重新冻结并体验。短期内修不好时，在 dev 上 `git revert` 对应的提交，验证剩余的组合后再推进。以后重新集成时，修复分支先 `git revert` 这个撤回提交，恢复原改动，再加修复。
- main 只能拿到 dev 从旧到新连续的一段。要推进后面的提交，前面未通过的提交须先修复或撤回。dev 领先 main 的提交越少，这类等待就越少。

推进 main 不需要切换主目录：

```sh
git fetch origin
git push origin <已验收的 dev 提交>:refs/heads/main
git fetch origin main:main
```

不加 `--force` 的推送只接受快进。推送被拒绝时，说明 main 不是该提交的祖先，这时检查分叉来源，不强推，也不重写 dev 或 main。dev 到 main 不再 squash，以保留已验收提交的 SHA。提交、AI 检查与合并都不代替人工产品验收，记录要求见 [Task Protocol](tasks/README.md#人工功能验收)。

### 清理

集成命令快进 dev 后会删除源 worktree 与本地任务分支。squash 提交已包含分支末端的全部内容，修复和回退都针对 dev 上的提交，所以不保留旧分支。删除失败时（例如 worktree 被锁定，或集成期间分支又有新提交），命令仍保留集成结果并输出原因，按下列命令手动清理；worktree 被锁定时，确认无人使用后先 `git worktree unlock`。squash 后任务分支不是 dev 的祖先，`git branch -d` 会拒绝删除；先确认分支末端已集成到 dev，再用 `git branch -D` 删除：

```sh
git log -1 --oneline --grep "Source-Commit: $(git rev-parse feat/example)" dev
git worktree remove "../AI Stduio.worktrees/example"
git branch -D feat/example
```

第一条命令没有输出时，说明分支末端没有集成到 dev，不删除。删除 worktree 默认不使用 `--force`。用户明确要求删除旧的脏 worktree 时，只处理授权的目录和范围，这项授权不延续到后续任务。dev 长期保留。任务文档与历史证据按 Task Protocol 保留。

改写已发布的历史须另建任务，列出保留的内容、备份与协作影响，并取得人工的明确授权。

## 6. 远端设置

单人开发阶段暂不要求启用分支保护、强制 PR 或必需 approval。引入协作者或需要远端强制约束时再配置。CI 的执行内容与部署状态见 [scripts/README.md](scripts/README.md)。

## 7. 文档维护与审阅

本节是通用的文档写作、来源与审阅规则。人类与 AI 的决策边界见 [AGENTS.md](AGENTS.md#authorship--review)。

### 落稿与确认

AI 起草并维护文档，人类在对话中作决定并审阅变更。各目录的命名、元数据、状态和审阅要求见其负责索引。

- 正文直接写现行规则与行为。修改时间和经过由 Git 历史追溯，不逐条附加对话日期或“本次修改”说明。
- 每项事实只在一处维护，其他位置链接负责文档。产品需求引用上游章节、FR / AC 或决定记录。协作与工具规则不必逐条标注对话来源。
- 重要取舍保留理由。人工确认与验收的结论和日期集中记在负责记录中，正文引用该记录。提交日期不能代替确认日期。
- 对话决定写入负责文档，人类审阅 diff 后生效。草稿与待审阅状态集中标注，不在每节重复“diff 待审阅”。
- 未经明确确认，不得把文档标为已确认，也不得把产品标为已验收。AI 的假设和技术决定不得写成人工确认。已确认内容的变更须提供 diff 与摘要；草稿可以直接修订。
- 不明确的事项列入“未决问题”，注明负责人以及是否阻塞。AI 解决授权内的技术问题，产品问题由人类决定。
- Main Agent 按 [Task Protocol](tasks/README.md#lifecycle) 完成与归档任务。这不等于文档确认，也不等于人工产品验收。

### 文档同步与收尾复核

- 对话决定落稿，或实现、验证结果改变了现有事实时，检查文档影响。提交前和回复工作完成前，复核最终的 diff。没有提交的工作也要复核。
- 按决定或事实追踪影响，不只看改过的文件。先写清本次改变了什么、哪些条件仍未解决，再核对负责文档、决定记录、路线图、验收要求和相关任务。按主题、编号、引用和同义表述搜索，不能只搜原句。
- 路线图须同时核对“下一步、整体概况、模块状态、阶段计划、验收进度”。相关记录须核对下一步、负责人、阻塞条件、完成条件和状态摘要。已决定的事项不得继续写成待人决定，同一文件的不同章节也要一致。
- 每项事实只有一个负责文档，其他位置优先引用。历史验证记录保留原基线和结论，当前总结链接新的决定。范围确认、代码实现、验证通过和人工验收分开记录，互不代替。
- 链接、格式或语法检查通过不代表语义一致。复核发现的遗漏在本轮修正；无法修正的写明原因和影响，不报告为全部同步完成。
- 收尾时在已有的任务记录中简述核对过的文档及章节、更新项和保留项的理由。不需要任务记录的小改动，在最终回复中简述。没有受影响的文档不必修改。
- Agent 修改文档后的自动提醒、检测边界与启用方式见 [Agent 文档 Hook](scripts/README.md#agent-文档-hook)。hook 不代替上述语义复核或链接检查。

### 文档检查

- 预览修改后的 Markdown 表格与标题，检查本地链接。命令与自动检查的边界见[脚本说明](scripts/README.md#文档检查边界)。
- 移动文件或修改标题后，搜索旧路径与锚点，修复所有引用。
- 删除文件后，按删除意图清理对它的引用。不得为通过链接检查擅自恢复已删除的文件。
- 执行负责索引要求的检查。涉及产品文档时，按[文档索引](<docs/00. Documentation Index.md#文档规则>)核对跨文档一致性。
- 用 `rg 'FR-PROJ-001|AC-01' docs specs` 定位需求及其验收与规格引用。任务查询及证据搜索边界见 [Task Protocol](tasks/README.md#queries)。读取含空格的路径时加引号。
