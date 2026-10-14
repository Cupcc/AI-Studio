# 开发脚本与 Commit 门禁

## 测试分层

依据：用户在 2026-10-11 测试流程分析后回复「accept」，确认分层检查与去重方向；[实现任务](../tasks/archive/T20261011-test-workflow/task.md)。实现 diff 待审阅，未改变产品验收标准。

| 场景 | 执行范围 |
|---|---|
| 开发迭代 | 先跑受影响文件／模块的测试；共享 IPC、数据库、Adapter 等跨模块变化扩大回归范围 |
| 纯文档提交 | 暂存快照的 Markdown 本地链接回归检查；人工或 AI 补充表格／标题预览及负责索引要求的一致性检查 |
| 代码、配置、未知路径提交 | 文档回归检查＋全 workspace 类型检查、脚本测试与单元测试 |
| main push / 面向 main 的 PR | 文档与脚本检查；有代码、配置或未知路径变化时，补全量基础检查、E2E、打包及打包冒烟 |
| 手动 CI | 强制完整自动化，不使用文档豁免 |
| 功能／里程碑 | 按 [Task Protocol](../tasks/README.md#acceptance)执行交互、独立、真实 CLI 及人工验收；局部测试不能替代这些要求 |

同一代码／依赖／配置基线的有效结果可引用；改动后重跑受影响检查。局部测试只用于开发反馈，不改变提交门禁。不要依赖 `--changed` 自动发现所有跨包、IPC 或动态加载关系。

开发时从仓库根目录执行，例如：

```sh
# 每次 Adapter 源码或依赖变化后，先更新桌面测试依赖的构建产物。
pnpm --filter @ai-studio/agent-adapter run build
pnpm --filter @ai-studio/desktop exec vitest run --project renderer
pnpm --filter @ai-studio/desktop exec vitest run src/main/services/project
pnpm --filter @ai-studio/desktop run test:watch
pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex

# 局部 E2E 仍重新构建当前源码；不运行真实模型请求。
pnpm --filter @ai-studio/desktop run test:e2e project.spec.ts
```

### 文档检查边界

- 文档快路径清单由 [check-scope.mjs](check-scope.mjs) 负责：根 README / AGENTS / CONTRIBUTING、已登记的包与脚本 README，以及 docs / specs / tasks / templates / design 下的 `.md`。不全局豁免 `.md`；图片、HTML 原型、证据脚本等未知路径仍走完整基础检查。重命名按旧路径和新路径一起判定，空变更也不豁免。
- [check-docs.mjs](check-docs.mjs) 解析 Markdown 与 GFM 表格，检查内联／引用式链接、图片目标、Markdown 标题锚点及显式 HTML id/name。跨文档扫描可发现删除文件、改标题造成的未修改文件入链损坏；代码示例中的伪链接不检查。
- 本地 `check:docs` 默认比较 HEAD 与当前工作树（包含未忽略的未跟踪文件）；提交门禁比较 HEAD 与 Git 暂存快照，未暂存修复和未跟踪目标不能掩盖提交中的断链。
- 只阻断相对基线新增的问题，历史问题按来源路径、链接和问题类型识别，不借本任务批量清理。`pnpm check:docs --base <commit> --head <commit>` 检查两个快照；`pnpm check:docs --base ''` 对当前工作树做完整审计，可能暴露历史问题。
- 不访问外链，不检查 HTML 内 href、非 Markdown 文件锚点或文档内容语义，也不是 Markdown 排版 linter。表格／标题预览、移动后的旧路径搜索、FR/AC 一致性及确认规则仍按负责索引执行。

## 本地 Commit 门禁

依据：[仓库指南](../AGENTS.md) 的开发命令与 [贡献指南](../CONTRIBUTING.md) 第 3 节的提交约定；任务记录：[T20261010-commit-gates](../tasks/T20261010-commit-gates/task.md)。

根目录执行 `pnpm install` 时，`prepare` 自动通过 Husky 安装 hooks；已有依赖时可用 `pnpm prepare` 重新安装。Git 客户端的 PATH 必须能找到根 `package.json` 要求的 Node 与 pnpm。若 GUI 客户端找不到版本管理器安装的 Node / pnpm，按 [Husky 官方说明](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis) 配置用户级初始化文件，不在仓库硬编码个人路径。

| 时机 | 检查 | 手动执行 |
|---|---|---|
| `pre-commit` | 按暂存路径执行上述文档或完整基础检查；任一失败终止提交 | `pnpm check:commit` |
| `commit-msg` | commitlint 检查 Conventional Commits | `pnpm commitlint --edit <提交信息文件>` |

commitlint 在 `@commitlint/config-conventional` 基础上放开主题大小写，并允许只用 `!` 或只用 `BREAKING CHANGE:` footer 标记破坏性变更（[commitlint.config.cjs](../commitlint.config.cjs)）。检查不会自动修改文件或暂存区。

边界：

- 类型检查和单元测试检查当前工作树，不是暂存区快照；部分暂存时应确保未暂存改动没有掩盖问题。检查沿用现有构建流程，会更新被 Git 忽略的构建输出。
- 每次提交都经过门禁，纯文档不启动应用构建／测试；代码路径通过 `check:code` 只构建一次 Adapter 后执行全量基础检查。不自动执行 E2E、打包、真实 CLI 或模型请求。目前没有源码 formatter / linter，因此不引入 lint-staged。
- 本地 hooks 可被 `git commit --no-verify` 或 `HUSKY=0` 绕过，不是强制安全边界；远端 CI 见下节。
- 配置文件纳入版本控制的是 `.husky/pre-commit`、`.husky/commit-msg` 与 `commitlint.config.cjs`；Husky 生成的 `.husky/_/` 自带忽略规则，无需提交。

## GitHub Actions CI

配置：[ci.yml](../.github/workflows/ci.yml)，触发条件、runner、Node 版本、CLI 版本、超时、权限与产物保留期均以该文件为准；任务：[T20261010-github-ci](../tasks/T20261010-github-ci/task.md)。

- 仅 main push、面向 main 的 PR 与手动触发运行；任务分支备份 push 不再与 PR 重复。main 合入后的验证针对新基线，仍保留。
- Ubuntu 的 scope job 取完整历史，按整个 push 的 before→HEAD 或 PR 的 merge-base→合并快照判定，运行脚本测试与文档回归检查。这里只安装根工具依赖并禁用安装脚本，不下载 Electron。缺失／无效比较基线、空 diff 和手动触发均强制应用检查；无基线时文档以 HEAD 为基线，不声称完成历史文档审计。
- 应用 job 在 macOS arm64 runner 冻结 lockfile 安装并执行 `check:code`，然后桌面构建一次，依次执行包内 `test:e2e:built`、`package:built` 及根 `smoke:packaged`。Adapter 在基础检查时构建一次，桌面产物仅在本 job、同一代码基线内复用，不跨运行缓存构建输出。独立根命令继续自动构建。
- CI 设置 `HUSKY=0` 显式运行检查；应用 job 保留依赖安装脚本以安装 Electron 与修复 PTY helper。
- E2E 前用 `displayplacer` 放大 runner 的虚拟屏幕：默认屏幕会把窗口高度限制到 684px，容纳不下桌面端的布局检查尺寸。此步骤只修改临时 CI runner。
- E2E 沿用模拟 Session Providers，不需要模型密钥或 CLI 登录；`runtime-tools.spec.ts` 另使用真实本地 Shell / PTY 与回环 HTTP fixture（外站跳转只验证提示，不访问外网）。打包冒烟前在 runner 临时目录安装固定版本的 Codex 与 Claude Code（取开发前校验基线），加入 Bash / Zsh login profile；只执行发现与 `--version`，不发送模型请求。应用仍从最小 PATH 启动，以验证 login-shell 路径恢复。
- 无论成功或失败都上传已产生的 E2E 截图与打包冒烟 JSON。未签名应用仅验证打包，不自动发布。
- 工作流只读仓库内容，外部 Actions 固定到 commit SHA。
- CI 不替代人工验收，未启用分支保护，也不检查历史提交信息。单人开发的远端设置约定见 [贡献指南](../CONTRIBUTING.md) 第 6 节。

Runner 架构依据：[GitHub runner images](https://github.com/actions/runner-images#available-images)；pnpm 版本读取方式依据：[pnpm/action-setup](https://github.com/pnpm/action-setup#version)。

事件与分支过滤依据：[GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)。本次配置在本地验证；远端部署与运行结果见实现任务，不以配置已修改等同远端 CI 已通过。

## 开发前 CLI 校验

`cli-preflight.mjs` 是验证真实本机 CLI 的开发前实验脚本，不是产品 Adapter 或 GUI 验收测试。依据：FR-CHAT-001～003、FR-SESSION-001～003、FR-STATE-001～006、FR-INPUT-002；AC-02、AC-03、AC-05。

## 1. 前置条件

- 已安装 Node.js，且 `codex` / `claude` 可通过 PATH 找到；各 CLI 已登录。
- Claude 校验还需要在独立目录安装 `@anthropic-ai/claude-agent-sdk`。本次验证使用 SDK `0.3.293` 驱动已安装的 CLI `2.1.294`，不使用 SDK 内附的 CLI。
- 请求使用 CLI 当前配置的默认模型，产生真实模型调用；输入仅为脚本中的合成提示词。
- 输出目录必须是专用于校验的目录，脚本会创建 `project with spaces/` 与 `other project/`。不使用真实代码工程作为输出目录。

## 2. 执行方式

从项目根目录执行：

```sh
node --check scripts/cli-preflight.mjs
node scripts/cli-preflight.mjs --provider codex --out /tmp/ai-studio-codex-check

npm install --prefix /tmp/ai-studio-preflight-sdk --ignore-scripts --no-audit --no-fund @anthropic-ai/claude-agent-sdk@0.3.293
node scripts/cli-preflight.mjs --provider claude \
  --sdk-dir /tmp/ai-studio-preflight-sdk/node_modules/@anthropic-ai/claude-agent-sdk \
  --out /tmp/ai-studio-claude-check
```

只运行指定项目：

```sh
node scripts/cli-preflight.mjs --provider codex --only 'question|crash' --out /tmp/ai-studio-codex-extra
```

`--only` 接受正则表达式。`--timeout` 指定单次等待上限，默认 90000ms；不提供 `--out` 时在系统临时目录新建目录。全量 Codex 为 12 项，Claude 为 10 项。原脚本保留“仅 `turn/interrupt` 即可保证子进程退出”的历史断言；该断言在 Codex 0.161.0 上不成立，不能把它直接计为 Codex 进程终止缺陷。

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
