# 开发前 CLI 校验

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
- 本次实测结果见 [CLI Integration Preflight](<../docs/06. CLI Integration Preflight.md>)。
