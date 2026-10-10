# 开发脚本与 Commit 门禁

## 本地 Commit 门禁

依据：[仓库指南](../AGENTS.md) 的开发命令与提交约定；任务记录：[T20261010-commit-gates](../tasks/T20261010-commit-gates/task.md)。

根目录执行 `pnpm install` 时，`prepare` 自动通过 Husky 安装 hooks；已有依赖时可用 `pnpm prepare` 重新安装。需要 Node >= 24、pnpm 12，Git 客户端的 PATH 也必须能找到它们。若 GUI 客户端找不到版本管理器安装的 Node / pnpm，按 [Husky 官方说明](https://typicode.github.io/husky/how-to.html#node-version-managers-and-guis) 配置用户级初始化文件，不在仓库硬编码个人路径。

| 时机 | 检查 | 手动执行 |
|---|---|---|
| `pre-commit` | 全 workspace 类型检查，然后运行单元测试；任一失败终止提交 | `pnpm check:commit` |
| `commit-msg` | commitlint 检查 Conventional Commits | `pnpm commitlint --edit <提交信息文件>` |

提交信息示例：`fix(session): preserve stop state`、`feat!: change session API`、`docs(tasks): 更新验收记录`。使用 `@commitlint/config-conventional` 的标准规则，放开主题大小写，并允许按仓库约定仅使用 `!` 或 `BREAKING CHANGE:` footer 标记破坏性变更。检查不会自动修改文件或暂存区。

边界：

- 类型检查和单元测试检查当前工作树，不是暂存区快照；部分暂存时应确保未暂存改动没有掩盖问题。检查沿用现有构建流程，会更新被 Git 忽略的构建输出。
- 每次提交（含纯文档提交）都运行检查；不自动执行 E2E、打包、真实 CLI 或模型请求。目前没有源码 formatter / linter，因此不引入 lint-staged。
- 本地 hooks 可被 `git commit --no-verify` 或 `HUSKY=0` 绕过，不是强制安全边界；远端 CI 见下节，尚未配置远端分支保护。
- 配置文件纳入版本控制的是 `.husky/pre-commit`、`.husky/commit-msg` 与 `commitlint.config.cjs`；Husky 生成的 `.husky/_/` 自带忽略规则，无需提交。

## GitHub Actions CI

配置：[ci.yml](../.github/workflows/ci.yml)；任务：[T20261010-github-ci](../tasks/T20261010-github-ci/task.md)。所有分支 push、pull_request 和手动触发运行 `macOS arm64 checks`。

- 环境：`macos-15`（arm64）、Node 24、根 `package.json` 的 `packageManager` 指定 pnpm；缓存 pnpm store，以 `pnpm-lock.yaml` 为 key。
- 依次执行 `pnpm install --frozen-lockfile`、`pnpm check:commit`、`pnpm test:e2e`、`pnpm package`、`pnpm smoke:packaged`。CI 设置 `HUSKY=0`，显式运行检查，保留依赖安装脚本以安装 Electron 与修复 PTY helper。
- E2E 沿用模拟 Session Providers；原生检查覆盖 SQLite、PTY、login shell 和打包应用启动，不需要模型密钥或 CLI 登录。
- 无论成功或失败，上传已产生的 `.runtime/desktop-e2e/` 与打包冒烟 JSON，保留 14 天。未签名应用仅验证打包，不自动发布。
- 工作流只有 `contents: read` 权限，30 分钟超时，同一分支 / PR 的新运行取消旧运行；外部 Actions 固定 commit SHA。
- CI 不替代人工验收，未启用分支保护，也不检查历史提交信息。

Runner 架构依据：[GitHub runner images](https://github.com/actions/runner-images#available-images)；pnpm 版本读取方式依据：[pnpm/action-setup](https://github.com/pnpm/action-setup#version)。

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
