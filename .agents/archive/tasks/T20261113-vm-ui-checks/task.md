---
id: T20261113-vm-ui-checks
status: done
next: none
waiting:
paths: [scripts/vm-ui.mjs, scripts/vm-ui.test.mjs, scripts/vm-ci.mjs, scripts/check-affected.mjs, scripts/check-affected.test.mjs, scripts/README.md, tasks/README.md, CONTRIBUTING.md]
evidence: 两台虚拟机同时各完成一个界面交互场景并各保存一张截图，本机桌面没有弹出窗口
risk: normal
fr: []
ac: []
specs: []
created: 2026-11-13
---

# 界面交互检查进虚拟机并行

## 目标

AI 的界面交互验收现在用 agent-browser 操作本机的 Electron 应用。开发模式下各 worktree 共用同一份 userData，同一时间只能有一个 owner 做界面检查，这是多个 Agent 并行时剩下的串行点。目标是让界面交互检查在虚拟机内进行，几个 owner 可以同时做。来源：用户 2026-11-13 对多 Agent 工作流建议回复“approve all, implement”，见[队列任务](../T20261113-agent-queue/task.md)。

## 范围

- 做：验证 agent-browser 能否在 tart 虚拟机内驱动 Electron；可行时给虚拟机 CI 增加一个“交互检查”入口，并更新 [Task Protocol 的验收分层](../../../../tasks/README.md#验收准备与分层)。
- 不做：不改 E2E 的运行方式，不改人工验收的入口。

## 依据

- 本机资源的限制见[贡献指南 §2](../../../../CONTRIBUTING.md#主目录与-worktree)。
- 虚拟机 CI 已集成 dev（`ca51006`），命令与名额限制见[脚本说明](../../../../scripts/README.md#本机-vm-ci)：每台主机最多同时运行两台虚拟机。

## 可行性验证（2026-11-13，Main Agent）

结论：可行。用户 2026-11-13 要求“界面检查验证虚拟机里能否驱动 electron 去验证”。

- 做法：占用一个虚拟机名额，克隆 `ai-studio-ci` 镜像并以 `--no-graphics` 启动；在虚拟机内检出被测提交、构建、安装 agent-browser 0.38.2，用模拟 Provider 启动 Electron（`--remote-debugging-port=9341 --inspect=9342`）；之后每条 agent-browser 命令经 `tart exec` 在虚拟机内执行，截图写到共享目录。探针脚本见 [W1-probe.mjs](evidence/W1-probe.mjs)。
- 单台结果：虚拟机启动 37 秒，到应用可操作共 58 秒。经主进程 inspector 替换目录选择框后，从“打开本地目录”进入项目，输入并发送消息，模拟回复渲染完成，见[截图](evidence/W1-single-vm-project-chat.png)。
- 两台并行：两台虚拟机同时各跑一遍同一场景（[脚本](evidence/W1-scenario-a.zsh)），都在 11 秒内完成并保存截图，见 [a](evidence/W1-parallel-a.png)、[b](evidence/W1-parallel-b.png) 与日志 [a](evidence/W1-parallel-a.log)、[b](evidence/W1-parallel-b.log)。Electron 只在虚拟机内运行，本机没有启动应用窗口。
- 发现的坑：共享目录里的文件被“写新文件再改名”替换后，虚拟机仍指向旧文件并报找不到，所以往共享目录只写新文件名；`pkill -f` 区分大小写，结束旧的 Electron 要用 `-if`，否则调试端口被占用。
- 边界：每台主机最多两台虚拟机，与虚拟机 CI 共用名额。探针只用了模拟 Provider，真实 CLI 见下节。

## 真实 CLI 验证（2026-11-13，Main Agent）

用户 2026-11-13 提供中转站的地址和两把 Key，要求“写入到项目的本地配置文件中”并在虚拟机里使用。值存于主目录未跟踪的 `apps/desktop/.env.local`，不写入仓库和本记录。

- 做法：`start --real` 在虚拟机里安装 `ci.yml` 固定的 Codex 0.161.0 与 Claude Code 2.1.294，以真实 Provider 启动应用。两个 CLI 起初显示“未登录”。从界面进入“设置 → CLI → 配置”，选“自定义连接”，用 `{{名称}}` 占位符填入地址和 Key 并保存，界面显示“已安全保存”，说明虚拟机里的系统密钥保护可用。
- 连接测试：Codex 与 Claude Code 都显示“连接正常”，用时 2～5 秒，回复来自真实模型。
- 真实会话：Codex 三秒内回复“7 乘 6 等于 42。”（[截图](evidence/W2-real-codex-session.png)）；Claude Code 八秒内回复“9 减 4 等于 5。”（[截图](evidence/W2-real-claude-session.png)）。
- 偶发：三次 Claude Code 对话里有一次在 60 秒内没有完成，界面停在“Agent 正在执行…”（[截图](evidence/W2-real-claude-session-unfinished.png)），当时没有等到结束就停了虚拟机，原因未查明；另外两次分别用时 5 秒和 8 秒。
- 发现：Codex 的地址不带 `/v1` 时，连接测试请求到网关的管理页面，应用提示“API 请求失败、超时或响应无效”；带上 `/v1` 后通过。Claude Code 的测试会自己补 `/v1`，两者不一致。用户 2026-11-13 决定自动补上 `/v1`，见[后续任务](../T20261113-codex-base-url/task.md)。
- 保密：证据目录和日志里没有 Key（按 `sk-` 前缀扫描）。显示网关地址的连接页截图没有提交，仓库是公开的。

## 验收标准

- [x] 两台虚拟机同时各完成一个界面交互场景，截图可读，本机没有启动应用窗口（探针验证，见上节）。
- [x] 交互检查入口：一条命令启动带应用的虚拟机并保持，另一条在其中执行 agent-browser 命令，结束时释放名额（`scripts/vm-ui.mjs`，实测见上两节）。
- [x] Task Protocol 写明界面交互检查的并行方式与限制。

## 收尾

- 2026-11-13，Main Agent 收尾。探针与真实 CLI 验证由 Main Agent 完成；`vm-ui.mjs` 的模拟模式由一个 worker 实现并实测（启动到就绪 42 秒，每条命令约 0.5 秒），Main Agent 审阅后加了 `--real` 与占位符。没有需要独立评审的改动。
- 自检：`pnpm test:scripts` 通过；`pnpm check:docs` 0 个问题；真实模式用提交后的命令完整跑过两遍；会话结束后没有遗留虚拟机、名额和临时引用。
- 文档复核：脚本说明新增“本机 VM 界面检查”，Task Protocol 的验收分层与贡献指南 §2 改为界面交互检查默认在虚拟机里做。
- 未做：没有用新命令复跑两台并行（探针已验证并行）；Claude Code 偶发未完成的原因没有查。
