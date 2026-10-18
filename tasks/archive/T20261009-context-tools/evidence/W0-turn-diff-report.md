# 本轮 Diff 实施自检（W0，2026-10-18）

## 范围与基线

- 来源：用户同日「continue to implement」「try your best to do」恢复实施；FR-TOOL-002、FR-INPUT-001、FR-STATE-007、AC-07、04 §1 事项 13；不是新增人工功能验收。
- `dcfaac3` + `feat/turn-diff` 本次源码 diff。平台 macOS 15.6 arm64，Electron 44.4.5，Node 26.10.0，pnpm 12.10.1；Codex CLI 0.163.0，协议类型仍为 0.161.0。
- 实现与限制的唯一负责文档：[Tools §5.3](../../../../specs/tools/spec.md#53-本轮-diff-实现与原生能力证据)。独立结论由 [W23](../acceptance.md#2026-10-18-本轮-diff-独立评审w23)负责，本报告均为实现者自检。

## 原生能力与真实引用

| 场景 | 操作与结果 | 证据及适用边界 |
|---|---|---|
| Git / 非 Git 原生文件工具 | 隔离临时目录分别读取带空格的引用文件，再用 `apply_patch` 修改 native.txt；均收到聚合及 completed fileChange，磁盘内容匹配 | [原生结果](W0-codex-native-probe.json)、[脚本](W0-codex-native-probe.mjs)；此探针直接使用 App Server，不证明应用 UI |
| Git / 非 Git Shell 写文件 | 同 Thread 后续轮次只用 Shell 写 shell.txt；磁盘已改变，均没有这两类原生补丁事件 | 同上；没有事件不能解释为零变更，历史视图不作工作区归因 |
| Adapter 同轮 steer | 最新构建在 Shell 命令 item.started 时追加 native mention，含空格 / # / 中文路径；在 running 接受，同一 Adapter Turn 完成并读出随机 token，unknown 快照含实际版本 / 身份 | [结果](W0-codex-steer-live.json)、[脚本](W0-codex-steer-live.mjs)；这是 Adapter 真实场景，应用 UI 真实 steer 未复测 |
| Native mention | 实际 CodexProvider 提交附件，prompt 未给 token；CLI 读出 maple-harbor-918。随后原生 patch 收到归一化记录及实际版本 | [Adapter 结果](W0-codex-adapter-live.json)、[脚本](W0-codex-adapter-live.mjs)；此证据产生于来源字段和绑定 unknown 修复之前，旧 source 不作为最终实现正确性的证据，最终来源 / 身份由 W23 探针覆盖 |

原生探针的 login 字段为 unknown：脚本只检查 stdout，而该 CLI 将登录状态写到 stderr。该原始日志不改写；随后 Adapter 探针同时检查两流，记录 logged_in，实际请求成功。steer 首次准备脚本误用 command_execution 类型，未触发追加（[准备失败记录](W0-codex-steer-setup-miss.json)）；修正为公开契约 command 后完成上表验证，没有将首次未执行记为通过。不存登录响应、凭据或用户配置。脚本的 fixture 均在仓库外，未继承仓库 AGENTS.md。

## 实际应用交互

使用构建应用、真实 Codex Provider、隔离 userData / 非 Git Project，经 agent-browser 的 `studio-turn-diff-main` 会话操作。准备仅固定原生目录选择器返回值和 1440×900 窗口；未通过内部 API 注入受验行为或补丁。

1. New Chat → Files → 查看 reference note.txt → 添加到对话 → 发送读取并原生修改 native.txt 的请求。CLI 读出 prompt 未给的 amber-ui-542，并将 before 改为 ui-native-after；磁盘读回一致。完成后仍停在 Files，原生事件没有打开工具。见[引用及完成](W0-native-reference-ui.png)。
2. 点击“查看本轮变更”查看聚合、展开来源，核对 Codex 0.163.0、Thread / Turn、实际两种事件来源和覆盖提示。见[聚合与来源](W0-native-aggregate-light.png)。
3. 选择原生文件记录，核对已完成状态、原 patch 及“补丁记录不代表写入成功”。见[单文件](W0-native-file-patch-ui.png)。
4. 设置切为深色；直接将 fixture 的 native.txt 改为 later-workspace-version。工具栏 Diff 进入非 Git 项目说明，再从完成行进入旧轮次，仍显示 -before / +ui-native-after。见[深色历史](W0-native-history-dark.png)。

所有上述截图已逐张查看。聚合与单文件长路径在窄面板中可滚动 / 换行，没有覆盖输入区。该次 UI 构建含来源与脱敏限额修复，不含随后新增的无 patch 绑定身份快照；其 patch 路径不受此改动影响，最终构建由 W23 GUI 与 E2E 覆盖。真实重启与应用 UI 真实 steer 不由上述 UI 步骤证明，Adapter 真实 steer 见上表。

## 自动化与打包

- 最终源码 `pnpm check:code` 通过：脚本 36、Adapter 246、desktop 1160；见[日志](W0-turn-diff-code-check.log)。包含迁移、修订冻结、重启、跨 Session / Turn、错投、异常、脱敏与限额及 UI 状态检查。
- 最终构建 Electron 全量回归 49 / 49（3.3 分钟），含新轮次历史的 3 项与已有 Files / 项目 Diff / 输入 / 两种主题 / 运行时工具回归；见[日志](W0-turn-diff-e2e.log)。模拟 Provider 不代替真实 CLI 结论。
- 同一构建 `package:built` 生成未签名 macOS arm64 应用目录，`smoke:packaged` PASS：SQLite 首次 4 迁移、再次 0、读回；PTY、Terminal 屏幕、登录 Shell 与 Renderer 通过。见[打包日志](W0-turn-diff-package.log)、[冒烟 JSON](W0-turn-diff-packaged-smoke.json)。只探测 Claude 可执行文件版本，没有真实 Claude 模型调用。不是最终 V1 发布包，不包含新功能的打包 GUI 验收。
- 最后仅更正源码注释的证据文件名，重新 `pnpm build` 后，119 个 out 文件与 GUI / E2E / 包构建逐字节一致；见[产物等价性](W0-build-comment-equivalence.json)，未将行为改变后的旧构建当作新验证。
- 文档链接检查无新增问题，4 个历史基线问题不在本次范围；`git diff --check` 通过。架构 HTML 内联 JavaScript 语法解析通过。最终提交 hook 再按仓库门禁执行检查。
- 首次提交 hook 未通过：既有 Project View 创建文件监听用例在约 1 秒内仍为 empty，桌面端 1159 / 1160；见[失败日志](W0-turn-diff-first-hook-failure.log)。本次没有修改该服务或测试，单独重跑其套件 7 / 7 通过；随后原样重跑 `pnpm check:commit`，文档无新增问题、类型检查和全部 36 / 246 / 1160 测试通过，见[重检日志](W0-turn-diff-gate-recheck.log)。根因未确定，不将未复现表述为已修复；没有改超时、屏蔽测试或绕过 hook。

## 剩余范围

- 本轮 Diff 新体验待人工验收；既有功能的 2026-10-18 人工接受不自动扩展。
- 完整 AC-07 / 四工具综合技术验收、原生对话其余兼容性、Stop / 第二模型 / 并发、最终 V1 产品打包与发布由原任务继续跟踪；Claude Code 真实验收暂缓，不随当前 V1 发布。
- 本阶段打包验证不生成 Release，不修改包版本、签名策略或目标版本确认。
