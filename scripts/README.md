# 开发脚本与 Hooks

## 开发命令

仓库使用 pnpm workspace。Node 与 pnpm 版本由根 [package.json](../package.json) 的 `engines` 和 `packageManager` 指定；依赖构建脚本须加入 [pnpm-workspace.yaml](../pnpm-workspace.yaml) 的 `allowBuilds`。从仓库根目录执行命令，路径支持空格。

下表为常用根命令；修改根 scripts 时同步维护。按[测试分层](#测试分层)选择检查范围。

| 命令 | 用途 |
|---|---|
| `pnpm install` | 安装依赖、Electron 二进制和本地 Git hooks |
| `pnpm dev` | 启动桌面应用开发模式 |
| `pnpm build` | 构建所有 workspace 包 |
| `pnpm typecheck` | 检查所有 workspace 包的类型 |
| `pnpm test` | 运行脚本测试与各包单元测试，不调用真实 CLI 或模型 |
| `pnpm test:scripts` | 测试文档检查、Agent 文档 Hook、范围选择与任务分支集成 |
| `pnpm check:docs` | 相对 HEAD 检查本地 Markdown 链接回归，见[检查边界](#文档检查边界) |
| `pnpm check:code` | 构建 Adapter，并执行所有包类型检查和全部脚本、单元测试 |
| `pnpm check:commit` | 检查暂存文档及受影响模块；未知范围阻断，pre-commit 使用同一入口 |
| `node scripts/check-affected.mjs --dry-run` | 预览 HEAD 与工作树之间的检查范围；去掉 `--dry-run` 执行，`--ci` 追加选中的 E2E |
| `pnpm test:e2e` | 构建桌面应用并运行模拟 Session Provider 的 Electron E2E，不调用模型 |
| `node scripts/remote-ci.mjs` | 在 GitHub macOS runner 上检查已推送的分支，等待结果并下载证据，见[远端 E2E](#远端-e2e) |
| `pnpm package` | 构建未签名的 macOS arm64 应用目录 |
| `pnpm smoke:packaged` | 启动打包应用并检查原生依赖 |

桌面命令选项、输出和运行约定见[桌面开发说明](../apps/desktop/README.md#1-命令)。真实 CLI 预检会发送模型请求，见[开发前 CLI 校验](#开发前-cli-校验)，不属于应用测试。当前未配置源码 formatter、linter 或覆盖率阈值。

## 任务分支集成

分支流程由[贡献指南 §5](../CONTRIBUTING.md#5-合并与收尾)负责。源 worktree 提交完成后，在主目录 dev 执行：

```sh
node scripts/integrate-branch.mjs feat/example --title "feat(example): add the example view" --body-file <path>
git push origin dev
```

命令先做以下检查：主目录在 dev 且 dev 未冻结；源分支有独立的 worktree；两边都没有暂存或未暂存的改动及未跟踪文件；源提交包含当前 dev 且有新增提交。检查通过后，命令用 `git commit-tree` 生成一个提交，文件树取自源提交，父提交是当前 dev，然后快进 dev。提交信息依次是 `--title`、`--body-file` 的内容（可省略）、原提交列表，最后是 trailer 段。`--body-file` 末段的 trailer（例如 `Co-Authored-By`）会移到这一段，后接 `Source-Branch` 与 `Source-Commit`，因为 Git 只把最后一段识别为 trailer。命令先用 commitlint 检查这份提交信息。文件树与源分支末端相同，所以命令不运行 pre-commit。快进 dev 后，命令删除源 worktree（`git worktree remove`，不加 `--force`），再删除本地任务分支；分支只在仍指向源提交时删除。删除失败时（例如 worktree 被锁定），dev 保持已集成，命令仍以零状态退出，在 stderr 输出原因，按[贡献指南的清理](../CONTRIBUTING.md#清理)手动处理。

检查或提交失败时命令返回非零状态，不修改 dev 或源 worktree。命令不暂存、复制、rebase 或推送；分支落后时，先回源 worktree 同步并解决冲突。忽略的构建产物和依赖不计入工作区的脏状态，删除 worktree 时一并删除。

人工验收期间冻结 dev：

```sh
node scripts/integrate-branch.mjs --freeze    # 要求主目录在 dev 且干净，记录当前提交
node scripts/integrate-branch.mjs --unfreeze  # 删除记录并输出该提交
```

冻结记录保存在 Git 公共目录的 `ai-studio-acceptance` 文件中（主目录下为 `.git/ai-studio-acceptance`）。它对本机所有 worktree 生效，不随推送同步。

脚本回归使用临时 Git 仓库。它覆盖未提交文件、无新增提交、分叉、缺少或不合规的标题、冻结期间集成这几种拒绝场景，并核对正常 squash 后的文件树、父提交、提交信息、trailer 位置与 CLI 参数，以及集成后删除 worktree 与分支（含被忽略的文件），删除失败时保留集成结果并以零状态退出。它归入脚本检查，不触发桌面构建、界面测试或模型请求。

## 测试分层

范围检查的初始实现见[任务记录](../.agents/archive/tasks/T20261106-scoped-checks/task.md)，最小回归与实际选择验证见[收紧范围任务](../.agents/archive/tasks/T20261111-minimal-regression/task.md)。

| 场景 | 执行范围 |
|---|---|
| 开发迭代 | 先跑受影响文件／模块的测试；共享 IPC、数据库、Adapter 等跨模块变化扩大回归范围 |
| 纯文档提交 | 暂存快照的 Markdown 本地链接回归检查；人工或 AI 补充表格／标题预览及负责索引要求的一致性检查 |
| 代码提交 | 文档回归＋受影响 TypeScript 项目类型检查＋相关单测；本地不自动运行 E2E |
| dev / main push 及面向它们的 PR | 文档回归＋同一选择器的受影响检查＋明确选中的 E2E spec；不自动打包 |
| 空变更、设计素材、任务证据 | 不触发应用测试；文档链接检查仍适用 |
| 未映射路径／全局配置／缺失比较基线 | 阻断并提示补充影响映射或恢复比较基线；不自动退回全量 |
| 显式完整命令／手动 CI 的 full 模式 | 完整基础检查；full 另运行全量 E2E、打包与冒烟 |
| 打包输入变更／手动 CI 的 package 模式 | 只构建、打包与打包冒烟，不运行 E2E 与单测 |
| AI 需要运行 Electron E2E | 默认在远端 CI 运行，见[远端 E2E](#远端-e2e)；本机运行须用户同意 |
| 功能／里程碑 | 按 [Task Protocol](../tasks/README.md#acceptance)执行交互、独立、真实 CLI 及人工验收；局部测试不能替代这些要求 |

开发、提交、CI 均按影响范围验证。执行前说明改动、测试范围和理由，不把「准备提交／合并」当作全量测试理由。相同代码／依赖／配置／环境基线已有有效结果时引用其来源、时间和覆盖范围，不手工重复门禁将要执行的检查；发生相关变化或冲突修复后重跑受影响部分。当前门禁不缓存测试成功结果，重试提交仍会执行选中的局部检查。

选择器为 [check-affected.mjs](check-affected.mjs)。普通源码与测试文件作为 [Vitest `related`](https://vitest.dev/guide/cli.html#vitest-related) 的种子，按实际静态依赖选择单测，不按所在模块追加整套单测。IPC、共享领域类型、Adapter 构建产物的桌面消费者及删除路径仍显式补充模块覆盖。重命名按旧、新路径共同判定；仅修改测试时只选该测试，不触发 E2E。类型检查以受影响的 TS 项目为最小边界，不声称可按单个文件完整检查类型。

CSS 与 Renderer HTML 只选择对应界面 E2E，不触发后端单测或 TypeScript 检查。本地提交不自动执行 E2E，界面改动仍须完成 Task Protocol 要求的交互验收。工作台通过同一 iframe 承载预设与自定义包，两类界面由 `project-view` / `workbench` E2E 覆盖，见 [DEC-29](<../docs/07. Decisions.md#dec-29-预设与自定义工作台统一架构>)。

网页包 JS、HTML、manifest 与生成脚本绕过源码导入图，明确选择读取构建产物的 `package-runtime`、`workbench-service`、`portable-pages` 三份单测。TypeScript 配置仅新增网页包 JSON include 时也使用该范围，其他编译配置须另行映射。`electron.vite.config.ts` 或桌面 Vitest 配置仅增删既定网页包构建 import 与调用时使用该范围，Electron 构建配置另选应用启动。CSP 数组变化选择安全策略单测、工作台界面、应用启动及 `runtime-tools` 中的 Shell 和 Browser 场景；共享工具样式也覆盖这两个界面场景，不带入终端关闭流程。同批修改运行时模块或该 E2E 文件时保留完整 runtime-tools。其他构建和测试配置变化须补充映射，不能套用工作台范围。

打包输入 `apps/desktop/electron-builder.yml` 与 `apps/desktop/scripts/after-pack.cjs` 只影响打包产物。本地检查不启动 Electron，自动 CI 不打包，所以选择器对它们不运行检查，并提示集成前运行手动 package 模式（`node scripts/remote-ci.mjs --scope package`，只构建、打包与打包冒烟），run 记入任务。

所有 `related` 命令显式使用 `--no-passWithNoTests`，找不到测试时失败。删除源码后没有剩余模块测试时也阻断，须补充消费者映射。选择器回归除了断言计划，还通过 Vitest 实际依赖图核对必须包含和不得包含的测试，通过真实子进程检查空选择退出码。清单检查不执行应用测试；它先构建 Adapter 以解析桌面依赖，并由测试配置生成本地辅助产物。

影响映射不是全知依赖分析。新增模块、跨模块调用或全局依赖／构建配置变更时，先在选择器中补充有依据的映射和对应回归测试；未知路径失败时不得改为无条件豁免或全量兜底。选中的 E2E 文件缺失／改名时阻断并要求同步映射，单测选择为空也不记作通过。共享边界可能选中多个模块；选择结果须结合 diff 审阅，必要的功能／里程碑验收仍遵循 Task Protocol。

```sh
# 默认比较 HEAD 与工作树（含未跟踪文件）；只打印计划，不执行测试。
node scripts/check-affected.mjs --dry-run
# 执行受影响的类型检查／单测；--ci 才追加选中的 E2E。
node scripts/check-affected.mjs
node scripts/check-affected.mjs --base <base-commit> --head HEAD --ci
```

开发时从仓库根目录执行，例如：

```sh
# 每次 Adapter 源码或依赖变化后，先更新桌面测试依赖的构建产物。
pnpm --filter @ai-studio/agent-adapter run build
pnpm --filter @ai-studio/desktop exec vitest run src/renderer/src/features/workbench/navigation.test.tsx
pnpm --filter @ai-studio/desktop exec vitest run src/main/services/project
pnpm --filter @ai-studio/desktop run test:watch
pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex

# 局部 E2E 仍重新构建当前源码；不运行真实模型请求。
pnpm --filter @ai-studio/desktop run test:e2e project.spec.ts
```

### 文档检查边界

- [Codex 项目角色](../.codex/agents/README.md)的 `.codex/agents/*.toml` 只影响开发 Agent，按角色说明核对解析与加载，不触发应用测试；该目录的 README 纳入文档快路径。其他 Codex 配置与脚本不因此豁免。
- 文档快路径清单由 [check-paths.mjs](check-paths.mjs) 负责：根 README / AGENTS / CONTRIBUTING、已登记的包与脚本 README、React 技能 AGENTS 的文档链接、已登记的架构 HTML 文档，以及 docs / specs / tasks / design / .agents/archive 下的 `.md`（任务与规格模板分别位于 `tasks/templates/`、`specs/templates/`）。设计目录、任务 evidence、归档目录和搜索忽略配置 `.ignore` 由选择器单独识别，不触发应用测试；其他未知路径要求补充映射。重命名按旧、新路径一起判定；旧 templates 下五份 Markdown 仅在原路径已移除且所属 tasks/specs 模板存在时按迁移识别。空变更不启动应用测试。归档规则见 [Task Protocol](../tasks/README.md#archiving)。
- [check-docs.mjs](check-docs.mjs) 解析 Markdown 与 GFM 表格，检查内联／引用式链接、图片目标、Markdown 标题锚点及显式 HTML id/name。跨文档扫描可发现删除文件、改标题造成的未修改文件入链损坏；代码示例中的伪链接不检查。
- 本地 `check:docs` 默认比较 HEAD 与当前工作树（包含未忽略的未跟踪文件）；提交门禁比较 HEAD 与 Git 暂存快照，未暂存修复和未跟踪目标不能掩盖提交中的断链。
- 只阻断相对基线新增的问题，历史问题按来源路径、链接和问题类型识别，不借本任务批量清理。`pnpm check:docs --base <commit> --head <commit>` 检查两个快照；`pnpm check:docs --base ''` 对当前工作树做完整审计，可能暴露历史问题。
- 不访问外链，不检查 HTML 内 href、非 Markdown 文件锚点或文档内容语义，也不是 Markdown 排版 linter。表格／标题预览、移动后的旧路径搜索、FR/AC 一致性及确认规则仍按负责索引执行。
- 决策与状态的语义复核按 [贡献指南的文档同步与收尾复核](../CONTRIBUTING.md#文档同步与收尾复核) 执行；提交 hook 的链接检查结果不表示关联文档已同步，未提交工作也须在回复完成前复核。

## Agent 文档 Hook

文档 Hook 只提醒 Agent 复核关联文档。配置位于 [.codex/hooks.json](../.codex/hooks.json)，脚本为 [agent-docs-hook.mjs](../.codex/scripts/agent-docs-hook.mjs)。语义复核按[贡献指南](../CONTRIBUTING.md#文档同步与收尾复核)执行。

- `SessionStart` 记录已有文档改动的元数据基线，避免新会话因历史脏文档收到提醒。
- `PostToolUse` 在文档发生变化后提醒，同一会话最多一次，只列出发生变化的文件。通过 Git 状态检测 Shell 写入，不读取命令内容或文档正文。
- 不运行链接检查、应用测试或模型调用，不配置 `Stop`，不阻断会话结束。链接检查使用 `pnpm check:docs` 或提交门禁。

检测范围为未被 Git 忽略的 `.md` 及 `docs/` 下的 `.html`，覆盖新增、修改、删除和重命名。仓库外文件、被忽略文件及两次检测之间已提交且不再留有工作树变化的文件不在检测范围内；同一工作树的其他会话修改文档也可能触发提醒。

每次只查询一次 Git 状态并读取变更文档的文件元数据；Git 查询限时 1.5 秒，外层 Hook 限时 3 秒。检测或状态存储失败时提示手动复核。状态按工作树与会话隔离，保存在忽略目录 `.runtime/agent-docs-hook/`，只含元数据和提醒标记，不保存文件正文或工具输入。

配置加载与信任遵循 [Codex 官方 Hooks 要求](https://learn.chatgpt.com/docs/hooks)；定义变更后按 Codex 提示重新加载。`pnpm test:scripts` 验证基线、提醒去重、增删改名、会话隔离及配置边界。Hook 提醒不代表已完成文档复核或链接检查。

## 本地 Commit 门禁

提交约定见 [贡献指南](../CONTRIBUTING.md#3-提交规范)，门禁实现与验证见[任务记录](../tasks/T20261010-commit-gates/task.md)。

根目录执行 `pnpm install` 时，`prepare` 自动通过 Husky 安装 hooks；已有依赖时可用 `pnpm prepare` 重新安装。Git 客户端的 PATH 必须能找到根 `package.json` 要求的 Node 与 pnpm。若 GUI 客户端找不到版本管理器安装的 Node / pnpm，按 [Husky 官方说明](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis) 配置用户级初始化文件，不在仓库硬编码个人路径。

| 时机 | 检查 | 手动执行 |
|---|---|---|
| `pre-commit` | 按暂存路径执行文档和受影响检查；任一失败终止提交 | `pnpm check:commit` |
| `commit-msg` | commitlint 检查 Conventional Commits | `pnpm commitlint --edit <提交信息文件>` |

commitlint 在 `@commitlint/config-conventional` 基础上放开主题大小写，并允许只用 `!` 或只用 `BREAKING CHANGE:` footer 标记破坏性变更（[commitlint.config.cjs](../commitlint.config.cjs)）。检查不会自动修改文件或暂存区。

边界：

- 类型检查和单元测试执行当前工作树：代码提交存在未暂存／未跟踪的非文档文件时拒绝运行，要求先暂存本次内容或在隔离 worktree 提交，不自动 stash 或修改用户文件。文档检查始终读取暂存快照。构建只更新被 Git 忽略的输出。
- 纯文档／空提交不启动应用构建／测试；代码路径使用受影响选择器，需要桌面／Adapter 检查时先构建一次 Adapter。不自动执行 E2E、打包、真实 CLI 或模型请求。`pnpm check:code` 仍是显式全量命令，不再由提交 hook 调用。目前没有源码 formatter / linter。
- 本地 hooks 可被 `git commit --no-verify` 或 `HUSKY=0` 绕过，不是强制安全边界；远端 CI 见下节。
- 配置文件纳入版本控制的是 `.husky/pre-commit`、`.husky/commit-msg` 与 `commitlint.config.cjs`；Husky 生成的 `.husky/_/` 自带忽略规则，无需提交。

## GitHub Actions CI

配置：[ci.yml](../.github/workflows/ci.yml)，触发条件、runner、Node 版本、CLI 版本、超时、权限与产物保留期均以该文件为准；任务：[T20261010-github-ci](../tasks/T20261010-github-ci/task.md)。

- 仅 dev / main push、面向 dev / main 的 PR 与手动触发运行；任务分支 push 不触发 CI，需要时手动触发（见[远端 E2E](#远端-e2e)）。main 合入后的验证针对新基线，仍保留。新的 push 或 PR 运行会取消同一分支或 PR 上的旧运行；手动运行各用独立的并发组，互不取消。
- Ubuntu scope job 取完整历史，按整个 push 的 before→HEAD 或 PR 的 merge-base→合并快照生成影响计划并检查文档。只安装根工具依赖、禁用安装脚本，不下载 Electron；不再每次无条件运行脚本单测。首次创建 dev 的 push 以 origin/main 与当前提交的共同祖先为基线；其他无效／缺失基线阻断，空 diff 跳过应用。手动 affected 模式以 origin/dev 与 HEAD 的 merge-base 为基线；手动 full 与 e2e 模式的文档以 HEAD 为基线，不声称历史审计通过。
- macOS arm64 job 冻结 lockfile 安装，push、PR 与手动 affected 模式执行 `check-affected.mjs --ci`：受影响类型检查、相关单测，以及选中的 E2E spec。仅有工作流脚本改动时只执行脚本测试；无 E2E 时不构建桌面或配置显示器。需要 E2E 时构建桌面一次，无自动打包。
- 手动 e2e 模式构建桌面一次，只运行指定的 spec，不做类型检查和单测。仅手动 full 模式（界面手动触发的默认值）执行 `check:code` 与完整 E2E；`package:built` 和 `smoke:packaged` 只在手动 full 与 package 模式执行，package 模式不运行 E2E，也不配置显示器。构建产物只在本 job 的同一基线复用，不跨运行缓存输出。显式根命令保留原语义。
- CI 设置 `HUSKY=0` 显式运行检查；应用 job 保留依赖安装脚本以安装 Electron 与修复 PTY helper。
- E2E 前用 `displayplacer` 放大 runner 的虚拟屏幕：默认屏幕会把窗口高度限制到 684px，容纳不下桌面端的布局检查尺寸。此步骤只修改临时 CI runner。
- E2E 沿用模拟 Session Providers，不需要模型密钥或 CLI 登录；`runtime-tools.spec.ts` 另使用真实本地 Shell / PTY 与回环 HTTP fixture（外站跳转只验证提示，不访问外网）。打包冒烟前在 runner 临时目录安装固定版本的 Codex 与 Claude Code（取开发前校验基线），加入 Bash / Zsh login profile；只执行发现与 `--version`，不发送模型请求。应用仍从最小 PATH 启动，以验证 login-shell 路径恢复。
- 无论成功或失败都上传已产生的 E2E 截图与打包冒烟 JSON。未签名应用仅验证打包，不自动发布。
- 工作流只读仓库内容，外部 Actions 固定到 commit SHA。
- CI 不替代人工验收，未启用分支保护，也不检查历史提交信息。单人开发的远端设置约定见 [贡献指南](../CONTRIBUTING.md) 第 6 节。

Runner 架构依据：[GitHub runner images](https://github.com/actions/runner-images#available-images)；pnpm 版本读取方式依据：[pnpm/action-setup](https://github.com/pnpm/action-setup#version)。

事件与分支过滤依据：[GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。本次配置在本地验证；远端部署与运行结果见实现任务，不以配置已修改等同远端 CI 已通过。

### 远端 E2E

Electron E2E 会在桌面上打开真实窗口，部分用例还会抢占焦点。用户同时使用电脑时，浮层、拖拽等依赖焦点的用例会偶发失败，测试也会打扰用户。所以 AI 需要运行 E2E 时，默认在 GitHub Actions 的 macOS runner 上运行。本机 E2E 只在用户同意时运行，同一时间只运行一份。AI 交互验收用 agent-browser 操作本机应用，不在此列，见 [Task Protocol](../tasks/README.md#acceptance)。

在任务 worktree 中提交并推送后执行：

```sh
git push -u origin feat/example   # rebase 后用 --force-with-lease
node scripts/remote-ci.mjs        # 默认 affected 模式
node scripts/remote-ci.mjs --scope e2e --spec workbench.spec.ts --spec project.spec.ts --grep "drag"
node scripts/remote-ci.mjs --scope package
node scripts/remote-ci.mjs --scope full
```

| 模式 | 运行内容 |
|---|---|
| `affected`（默认） | 以 origin/dev 与分支的 merge-base 为基线，执行与 push 相同的文档回归和受影响检查，包括选中的 E2E |
| `e2e` | 构建桌面应用，只运行 `--spec` 指定的 `apps/desktop/e2e` 文件，可加 `--grep` |
| `package` | 构建桌面应用、打包并运行打包冒烟；不运行单测与 E2E，用于打包输入变更 |
| `full` | `check:code`、全量 E2E、打包与打包冒烟 |

- 命令先检查当前在分支上、工作区没有改动或未跟踪文件、origin 上的同名分支等于 HEAD。不满足时退出并给出推送命令；命令本身不推送。
- 运行使用分支上的 `ci.yml`，分支须包含上述模式。本功能之前创建的分支先 rebase dev。
- 命令用 `gh workflow run` 触发，每 30 秒查询一次，job 状态变化时输出一行；查询失败时下一轮重试，连续 3 次失败才退出。结束后把上传的证据下载到 `.runtime/remote-ci/<run-id>/`。失败时把完整的失败日志存为同目录的 `failed.log`，终端只打印最后 60 行。通过时退出码为 0，否则为 1。
- 只跑脚本测试约 3 分钟，构建后跑少量 spec 约 3～5 分钟，全量 10 分钟以上，排队时间另计。AI 在后台运行命令，结束后读取结果。
- runner 是独立的 macOS 虚拟机，有自己的屏幕和焦点，与用户桌面无关；E2E 使用模拟 Provider，不需要密钥。仓库公开，推送的分支所有人可见。

## GitHub Release 发布准备

发布渠道为 GitHub Releases，目标版本为 `v1.0.0`，不设固定上线日期（DEC-17、DEC-21）。发布准备仅生成和留存产物，暂不创建或上传 Release；2026-10-18 的仅文档指令已由同日后续「continue to implement」恢复实施，执行范围及历史边界见 [DEC-22](<../docs/07. Decisions.md#dec-22-发布准备范围与本轮文档边界>)。阶段打包自检不等于最终 V1 发布产物。CI 继续只检查、打包和保存产物，不自动发布。

发布前保留事项：

- Release Notes 与最终发布方式待后续安排；
- 是否必须签名、公证及附带校验和。

Claude Code 已确定不随当前 V1 发布（DEC-19）；后续真实验收和发布另行安排。真实 Codex 调用的额度、限流及限流后的停止 / 错误行为由 Codex CLI / 上游服务提供方决定，应用不设置调用次数、费用上限或自动重试护栏；验收记录以 CLI 实际结果为准。

产物生成和检查结果不表示已经发布，也不表示产物已签名或公证。

生成产物时的验证命令：

```sh
pnpm check:code
pnpm test:e2e
pnpm package
pnpm smoke:packaged
```

本仓库当前没有自动发布 workflow；最终发布方式待后续安排。

## 开发前 CLI 校验

`cli-preflight.mjs` 是验证真实本机 CLI 的开发前实验脚本，不是产品 Adapter 或 GUI 验收测试。当前 V1 的真实 CLI 验收只执行 Codex；Claude Code 命令保留为历史证据或后续独立复测。依据：FR-CHAT-001～003、FR-SESSION-001～003、FR-STATE-001～006、FR-INPUT-002；AC-02、AC-03、AC-05。

## 1. 前置条件

- 当前 Codex 验收需要已安装 Node.js，且 `codex` 可通过 PATH 找到并已登录；Claude Code 只在后续独立验收时需要。
- Claude 校验还需要在独立目录安装 `@anthropic-ai/claude-agent-sdk`。本次验证使用 SDK `0.3.293` 驱动已安装的 CLI `2.1.294`，不使用 SDK 内附的 CLI。
- 请求使用 CLI 当前配置的默认模型，产生真实模型调用；输入仅为脚本中的合成提示词。
- 输出目录必须是专用于校验的目录，脚本会创建 `project with spaces/` 与 `other project/`。不使用真实代码工程作为输出目录。

## 2. 执行方式

从项目根目录执行：

```sh
node --check scripts/cli-preflight.mjs
node scripts/cli-preflight.mjs --provider codex --out /tmp/ai-studio-codex-check

# Claude Code：历史 / 后续独立复测，不属于当前 V1 验收
npm install --prefix /tmp/ai-studio-preflight-sdk --ignore-scripts --no-audit --no-fund @anthropic-ai/claude-agent-sdk@0.3.293
node scripts/cli-preflight.mjs --provider claude \
  --sdk-dir /tmp/ai-studio-preflight-sdk/node_modules/@anthropic-ai/claude-agent-sdk \
  --out /tmp/ai-studio-claude-check
```

只运行指定项目：

```sh
node scripts/cli-preflight.mjs --provider codex --only 'question|crash' --out /tmp/ai-studio-codex-extra
```

`--only` 接受正则表达式。`--timeout` 指定单次等待上限，默认 90000ms；不提供 `--out` 时在系统临时目录新建目录。全量 Codex 为 12 项；Claude 为 10 项，但 Claude 当前不属于 V1 真实验收。原脚本保留“仅 `turn/interrupt` 即可保证子进程退出”的历史断言；该断言在 Codex 0.161.0 上不成立，不能把它直接计为 Codex 进程终止缺陷。

补充原生 Stop 复核使用证据目录中保存的实际执行脚本：

```sh
node --check tasks/T20261008-cli-preflight/evidence/codex-native-stop-check.mjs
node tasks/T20261008-cli-preflight/evidence/codex-native-stop-check.mjs \
  --out /tmp/ai-studio-codex-native-stop-check --timeout 90000
```

该脚本开启 `experimentalApi`，在同一 Runtime 中验证 Thread 清理、单命令终止、并发隔离和原 Thread 上下文继续。实际通过结果已归档；首轮探测 / 审批匹配误判也保留供审计。这是独立复核脚本，尚未并入原脚本的 12 项检查，也不是产品 Stop 实现。

## 3. 输出与边界

- `<provider>-results.json`：逐项断言及结果，失败时进程退出码为 1。
- `<provider>-events.jsonl`：经过字段筛选的事件摘要，不保存完整配置、认证状态、凭据或完整工具输入。
- 创建的测试 Session 由 CLI 原生持久化机制保存，因此测试 Session 会留在 CLI 历史中。
- 权限测试等待约 1 秒后拒绝合成写入，并核对文件没有产生；问题测试回答 Blue。异常退出测试只终止脚本创建的进程。
- Codex 使用只读沙箱和用户审批；CLI 的用户级配置 / MCP 仍可能被加载。Claude 使用空 `settingSources`、受限工具列表及严格 MCP 配置；认证沿用本机 CLI。
- 文本取消与异常退出测试生成合成长文本。工具取消测试额外执行一条合成 Python 命令，输出唯一标记后睡眠 47 秒；只为验证 Stop 是否终止子进程，不修改文件。校验失败后会清理确切匹配该标记的测试进程。
- 原生 Stop 补充复核使用两条带唯一标记、睡眠 120 秒的 Python 命令；同时检查原生后台列表和系统 Python 进程退出。进程探测限定实际 Python 可执行文件，排除包含命令文本的 Shell。`clean` / `terminate` 是实验接口，需锁定所支持 CLI 版本；具体语义与覆盖边界见校验报告第 4、5 节。
- 本脚本不验证 Electron、PTY、Browser、SQLite、文件变更归因或 GUI 提醒行为，也不代表完整 AC 已验收。
- 本次实测结果见 [CLI Integration Preflight](../tasks/T20261008-cli-preflight/report.md)。

选品模板及 `agent.execute` 变更归入工作台范围，包含 `product-selection.spec.ts`。选品 HTML/JS/manifest 额外选择直接读取业务模型的 `selection-model` 和验证真实 SessionService 接缝的 `agents` 单测；CSS 沿用仅界面回归规则。该 E2E 使用模拟 Provider，真实 Codex 验证见[选品任务](../.agents/archive/tasks/T20261111-product-selection/task.md)。
