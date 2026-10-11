# 贡献指南

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 文档职责 | 统一分支、提交、PR、合并和 main 历史规范 |
| 最后更新 | 2026-10-10 |
| 需求来源 | 用户 2026-10-10 对话请求；[任务记录](tasks/T20261010-contributing/task.md)；较大工作使用独立 worktree、分支名不强制 `task/` 前缀（2026-10-10 确认） |

本指南按单人开发组织流程，依据用户 2026-10-10 对话中说明的开发方式与后续「update doc」指令修订；完整 diff 仍待审阅。文档确认规则见 [AGENTS.md](AGENTS.md)。

## 1. 开始一项工作

- 先读 [AGENTS.md](AGENTS.md)，再读修改目录的负责索引。
- 是否需要任务记录，按 [Task Protocol](tasks/README.md) 判断；不为每次小改动增加文档流程。
- 一次提交围绕一个明确目标，避免混入无关修改；较大工作拆成可独立验证的阶段。
- 产品变化引用负责文档及 FR / AC；仓库工具或纯协作规则注明依据，不编造产品编号。

## 2. 分支规范

| 分支 | 用途 | 约束 |
|---|---|---|
| `main` | 日常开发与交付基线 | 文档、小修复可直接提交；禁止新增 merge commit、强推和重写已发布历史 |
| 任务分支 | 较大改动、试验或需要隔离的工作 | 从同步后的 main 创建，在独立 worktree 工作；名称由执行的 Agent 按工作内容决定，使用英文小写与连字符，例如 `task/contributing`、`feat/project-view`，不强制前缀 |
| `<任务分支>-<worker>` | 已安排的并行 worker | 在独立 worktree 工作；写入范围与集成方式遵循 Task Protocol |

小改动的日常流程为：修改 → 检查 diff → 提交 → 推送。较大工作使用短期任务分支，默认不设长期集成分支；已有其他命名的分支保留。

主 checkout（仓库主目录）始终停在 main，只做小改动和第 5 节的合入，不切换到任务分支。可能有多个 AI 会话同时推进不同工作，它们共用同一个 checkout 时会共享 HEAD、工作区和暂存区：一个会话切换分支会改掉另一个会话正在编辑的文件，暂存的改动可能被别人的提交带走，提交门禁也会检查到他人未完成的修改（2026-10-10 确认）。

开始工作前同步 main；工作区须干净，无法快进时先检查本地与远端差异，不强推或丢弃本地改动：

```sh
git status --short
git switch main
git pull --ff-only origin main
```

较大工作在仓库同级目录 `../AI Stduio.worktrees/` 下创建 worktree，不放在仓库内，避免被搜索、编辑器和测试扫描到：

```sh
git worktree add "../AI Stduio.worktrees/example" -b task/example main
cd "../AI Stduio.worktrees/example"
pnpm install
```

- 新 worktree 须先执行 `pnpm install` 再提交：`core.hooksPath` 指向 Husky 生成的 `.husky/_/`，该目录未纳入版本控制；缺少时 Git 不报错，直接跳过提交检查。
- 并行工作开始前核对写入范围；会修改同一文件的工作排成先后，否则冲突只会推迟到 rebase 时出现。
- 本机资源同一时间只给一个 worktree 使用：开发模式各 worktree 共用同一 userData 与数据库（见 [桌面端说明](apps/desktop/README.md)），`pnpm dev` 不同时运行；需要窗口焦点的 Electron E2E 同一时间只运行一份。

任务分支同步 main 使用 rebase，禁止把 main merge 进任务分支。共享分支改写前先协调所有使用者。

任务分支按需推送备份。已发布的个人任务分支因 rebase 改写历史时，核对远端没有他人新提交后才可使用 `--force-with-lease`；禁止使用 `--force`，禁止对 main 强推。

## 3. 提交规范

使用 Conventional Commits：

```text
<type>[optional scope][!]: <description>
```

- 常用 type：`feat`、`fix`、`refactor`、`test`、`docs`、`chore`、`ci`；scope 指向受影响模块。
- description 简短、明确，使用动作描述，例如 `docs(contributing): define linear main history`；可使用中文主题。
- 破坏性变更使用 `!` 或 `BREAKING CHANGE:` footer。
- 标题已能说明的小改动无需重复写长正文；复杂改动在正文说明原因，引用已有任务和适用的 FR / AC。涉及人工确认的内容，注明确认日期与对话结论。
- 每个提交围绕同一目的，提交前检查暂存 diff；不夹带无关修改、凭据、个人配置或临时产物。
- 任务分支可保留过程提交，进入 main 前按第 5 节整理；提交须通过现有门禁。

本地 hooks、commitlint 的具体配置、检查命令和边界见 [scripts/README.md](scripts/README.md)。不得用 `--no-verify` 或 `HUSKY=0` 跳过本地提交检查；CI 中显式运行检查的配置以脚本说明为准。

## 4. PR 与审阅

PR 可选：需要集中查看较大 diff、邀请他人审阅或协作时使用。单人日常工作不要求 PR 或独立 approval。

普通改动由维护者查看 diff 即可，不另设审批表或逐项签收。产品决策、已确认规格的变更和文档确认仍遵循 [AGENTS.md](AGENTS.md) 及负责目录的审阅规则；已有 task 的完成状态遵循 Task Protocol。

使用 PR 时，目标为 main，标题遵循第 3 节格式；描述简要说明目的、验证结果、已有任务及适用 FR / AC。界面变化附截图，有未决问题则明确列出。

提交与 CI 按[脚本说明](scripts/README.md)分层执行（测试流程优化方向，2026-10-11 对话「accept」确认；实现 diff 待审阅）。本地 hooks 已检查的同一版本无需再手动重复运行同一命令；根据改动补充必要验证。推送 main 或更新 PR 后检查 CI 结果，失败时修复；使用 PR 时须等最新版本 CI 通过再合并。无 PR 的任务分支推送仅作备份，可手动触发 CI；本地合入仍须完成第 5 节必要验证。

## 5. 合并与收尾

任务分支默认在本地合并：

1. 在主 checkout 同步 main，再在任务 worktree 中执行 `git rebase main`，确保包含本地 main 上尚未推送的提交。
2. 将同一目标的过程提交压成一个有意义的提交；不同目标先拆分。保留改动原因、已有任务、适用 FR / AC 和必要的人工确认记录。
3. 检查最终 diff 并完成必要验证；若冲突处理改变内容，重新验证受影响部分。
4. 回到主 checkout，只用 `--ff-only` 合入并普通推送。快进失败时回到分支同步步骤，不改用普通 merge。

```sh
git merge --ff-only task/example   # 在主 checkout（main）执行
git push origin main
git worktree remove "../AI Stduio.worktrees/example"
```

若选择 PR，则使用 **Squash and merge**，一个 PR 对应一个提交，核对最终提交信息；禁止 **Create a merge commit**。合并后本地 main 用 `git pull --ff-only origin main` 同步。

合入后删除对应 worktree；有未提交改动时 `git worktree remove` 会拒绝，先检查，不加 `--force`。确认交付后可删除已合并且无人使用的分支，保留任务文档与证据。已经 squash 合并的分支不再复用，后续工作从最新 main 开始。

此规范约束后续合入的提交。既有 main 的 merge commit 仍保留；若需要整理旧历史，另建任务，列出保留内容、备份与协作影响，经人工明确授权后执行。

## 6. 远端设置

单人开发阶段暂不要求启用分支保护、强制 PR 或必需 approval；本次不修改 GitHub 设置。以后需要远端强制约束或引入协作者时再配置。CI 的执行内容与已部署状态由 [scripts/README.md](scripts/README.md) 负责记录。
