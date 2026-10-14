# Runtime 工具执行计划

## 范围与基线

- 指令：用户 2026-10-13「推进运行时工具的开发。agents并发」。本阶段实现 Terminal / Browser 与关闭接缝，依据 Tools spec §3、§4.3、FR-TOOL-003 / 004、FR-PROJ-002、AC-07。
- 基线：`c3b81c9`；主 Agent 分支 `feat/runtime-tools`，独立 worktree `../AI Stduio.worktrees/runtime-tools/`。主 checkout 保持 main。
- 依赖：Browser fixture 可自行启动本地服务，最终从 Terminal 启动服务联验；Files / Diff 和真实 CLI 不作为本阶段已完成范围。完整工具任务继续进行。
- 技术选择：资源归主进程 Project 服务；Terminal 使用 xterm 屏幕模型、序号与有界输出，Browser 使用隔离内存分区 WebContentsView；主 Agent 集成 typed IPC、生命周期和文档。

## Workers

| Worker | 分支 / worktree | 声明写入范围 | 集成方式与依赖 |
|---|---|---|---|
| W0 Main Agent | feat/runtime-tools / runtime-tools | task.md、plan.md、docs / specs 实施回写、共享 IPC 登记、Project 关闭 / 退出契约和 UI、main 入口、依赖 / lockfile、E2E | 等 W1 / W2 契约后接入；依次导入 worker 提交；原生窗口测试串行 |
| W1 Terminal Agent | feat/runtime-tools-terminal / runtime-tools-terminal | src/shared/tools/terminal.ts、src/shared/ipc/terminal.ts、src/main/services/terminal/**、src/main/ipc/terminal.ts | 自行局部验证；不登记共享表、不改 package；导入独立提交 |
| W2 Browser Agent | feat/runtime-tools-browser / runtime-tools-browser | src/shared/tools/browser.ts、src/shared/ipc/browser.ts、src/main/services/browser/**、src/main/ipc/browser.ts | 自行局部验证；不改 main 入口、安全公共处理器和共享表；导入独立提交 |
| W3 UI Agent | feat/runtime-tools-ui / runtime-tools-ui | src/renderer/src/features/tools/**、src/renderer/src/main.tsx | 使用 W1 / W2 契约；保留既有设计 token 与 shell slot；不修改 Project store / ConfirmDialog；导入独立提交 |
| W4 Independent Reviewer | W1 / W2 / W3 完成后安排；不得参与实现 | acceptance.md、evidence/W4-* | 独立检查最终 diff、执行受影响场景、保留结论；发现交回实现者 |
| W5 Final Reviewer | runtime-tools 只读实现；W4 容量错误后接续 | acceptance.md、evidence/W5-* | 保留 W4 历史证据；独立复验最终集成与 F5 / F6，GUI slot 由 W0 串行安排 |
| W6 Adapter Cleanup | feat/runtime-tools-cleanup / runtime-tools-cleanup | `packages/agent-adapter/**`（Provider / SessionController / LiveSessions / RuntimeProcess / 新增 runtime-resources、Codex / Claude provider 与 driver、testing 及直接关联测试）；`specs/agent-adapter/spec.md` | 修复本阶段退出接缝的旧 best-effort 成功误报：严格、可重试的 `dispose()` 与 `releaseRuntimes(cwd?)`；先独立 worktree，W0 顺序导入；不改模型 / 原生 Stop 产品行为 |
| W7 Docs Drift Auditor | 只读，不使用独立 worktree | 无仓库写入（findings 写入会话 scratchpad） | 2026-10-13 16:30 后追加；逐条核对规格 / 文档与实现的漂移，由 W0 采纳并负责 task / plan / docs 回写 |

路径均相对 `apps/desktop/`，task / docs 与 W6 的 `packages/agent-adapter/**`、`specs/agent-adapter/spec.md` 例外。worker 先读取负责索引与所需 skills；不改 task.md / plan.md。分支不并发修改公共依赖；package 与 lockfile 由 W0 唯一负责。

## 场景与完成条件

执行 task.md 中 Terminal 恢复、Terminal 关闭、Project / 退出、Browser 导航、Browser 分区与隔离、Browser 布局场景；受影响自动化回归覆盖 session / project / settings。保持模拟 Provider 与真实 PTY / 本地 HTTP fixture 的区别。检查真实 shell 多实例、ANSI / resize / 输出压力 / 重附着、精确清理；Browser 顶层导航 / redirect / 新窗口同一策略，拒绝权限与下载，弹层遮挡和错误恢复。涉及界面由 agent-browser 从用户入口操作并查看截图；原生窗口检查不并发。

本阶段必须通过适用 typecheck / 单元 / Electron E2E、独立技术评审和交互验收；打包与冒烟按功能范围补充。未授权模型验证保持未覆盖；四工具总任务不标 done，人工产品验收不由 AI 代签。

## 进度

- 2026-10-13：读取贡献与 task 协议、负责索引及 Tools spec；同步 main，建立四个独立 worktree，登记 W1 / W2 / W3 写入范围与最终独立评审。
- 2026-10-13：集成 W1 / W2 / W3 的服务、typed IPC 与 UI；W0 接入 Project / 退出合并确认、Session 隔离及实际清理锁。基础实现提交 `04809cc`～`d35db82`；独立 W4 发现超时后迟到关闭、Shell 退出后子进程和 ANSI 快照将来状态遗漏，分别交 W0 / W1 修复，不以局部测试通过代替验收。
- 2026-10-13：W2 完成外站重定向取消修复 `2a255df`，W0 导入为 `9d10202`；Browser 45 项单元测试通过，实际 Electron 复验由 W4 执行。现有 Electron 回归 30 / 31 通过，剩余场景需响应新终端退出确认；W0 更新测试并补充 Terminal → 本地服务 → Browser 与退出场景。W2 追加只读生命周期复核，不扩大写入范围。
- 2026-10-13：顺序导入 W1 `114ab25`、`b38df54`、`3b550bb` 为 `e567b1c`、`f427aff`、`2f4bb5a`；完成未来 VT 状态、逐单元格属性 / 链接与精确自然退出核对。W0 UI 在恢复成功后才 ACK / 接受输入。W4 实际 GUI 发现 Browser View 的 type 同样为 window 与浅色 viewport 黑底；W0 改为对明确应用窗口安装导航 guards 并修正 viewport 透明背景。W4 / W1 的后续回合反复遇到模型容量错误，安排 W5 接续独立终验，不把未运行结论记为通过。
- 2026-10-13：W5 复验 ROOT 的 25 项独立测试通过；W0 增加 approve 前的可逆 idle Runtime release，3 项独立 QuitFlow 延迟 / 失败 / Cancel 通过。W5 进一步发现旧 Adapter dispose 将未确认进程清理仅记录诊断后 resolve，安排 W6 修复直接依赖，保持精确句柄和失败重试；真实模型链路仍不执行。实际 Terminal → HTTP 服务 → Browser → Project 精确清理及仅 Terminal / 混合退出 E2E 已通过。
- 2026-10-13（16:30 恢复）：上一轮在约 15:19 中断。核对五个 worktree：terminal / browser / ui 三个 worker 分支的写入范围内容均已完整导入 ROOT（范围内 diff 为空），无待办开发，仅在合入后清理；cleanup（W6）有未提交的 Adapter 严格释放改动，typecheck 通过但 Adapter 191 项测试 1 项失败（Codex stop 的旧 Runtime 退出确认）；ROOT 的 desktop 321 项中 3 项失败，均因 `provider.releaseRuntimes` 仅存在于 W6 未集成的改动，ROOT 目前依赖 W6 才能通过类型检查与相关 E2E。Adapter 规格（草稿）§3.6 第 7 / 9 条与 §5 表格仍写 `dispose()` 不抛错，W6 的契约反转须同步改规格并列出其他文档的旧表述。用户指令「并发 agents 推进所有的 worktrees」；本轮并发：W6 补完并提交 Adapter 严格释放（写入范围 `packages/agent-adapter/**` + `specs/agent-adapter/spec.md`）；W5 续接 F6 终端配色矩阵与 UI 复验（只写 `evidence/W5-*`，本轮独占 GUI，不测 Project 关闭 / 退出）；只读文档漂移审计。W6 提交后由 W0 导入并重跑完整验证，再安排最终独立复验与 E2E / 打包冒烟；不合入 main、不推送，待用户决定。
- 2026-10-13（17:00～18:20）：W7 文档漂移审计 20 条，F01～F07、F10～F16、F18 已采纳回写（含需人工审阅 diff 的已确认文档），F08 交独立评审、F09 在 W6 契约定稿后回写 Session 规格。W6 提交 Adapter 严格释放，W0 导入为 `25a79af`；同时提交终端渲染修复 `395befe`（修复已提交基线中 `emulatorState` 夹具缺失导致的类型错误）与关闭 / 退出接缝 `086706a`，均过提交门禁。W5 Part 1 发现 W5-F3：生产 CSP 拦截 xterm 运行时 `<style>`，打包应用的终端无颜色 / 等宽字体 / 光标 / 选区；用户在方案取舍说明后回复「我选1」（2026-10-13），仅放宽 `style-src-elem`，提交 `c02f7a6`，E2E 断言样式真实生效（负向对照：撤销放宽则 3 个 `<style>` 被拦、断言失败）。W8 独立评审 Adapter 严格释放，发现 F1（进程组成员收养丢失，确认退出与存活同组孤儿并存，高）及 F2～F6；交 W6 修复为 `4e7e5f8`，W0 导入为 `81db33c`，W8 正在独立复验（旧用例中 4 项断言旧缺陷行为，由 W8 而非实现者判定）。W5 Part 2 在新构建上重测配色矩阵并核实 W5-F4 / F5 预测。待办：W8-F7（`releaseAllRuntimes` 先串行等模型探测，可占满退出 10 秒上限）由 W0 在 W5 GUI 验证结束后修改；W5 / W8 结论齐备后固定最终基线，重跑类型检查 / 单元 / E2E / 打包冒烟，再由 W5 更新 acceptance.md。
- 2026-10-14（收尾）：W8 复验 Adapter 严格释放通过（`81db33c` 起）；W8-F8（Codex 探测错误被清理错误覆盖）、W8-F7（退出准备先串行等模型探测）由 W0 修复并提交（`47fcf10`、`493f544`）。新增 W9 在独立 worktree 修复 W5-F4 / F5 / F8（行高适配、显式无障碍主题），W0 导入为 `2223dad`；打包冒烟新增 Terminal 屏幕模型检查（`bc76742`），打包应用 PASS。W5 Part 3～5 在真实窗口复验：F4 / F5 / F8 关闭；新增 W5-F9（ANSI 彩色背景上文字不可读）、W5-F10（终端缩窄后 `terminal:attach` 永久失败，阻塞）、W5-F11（只有终端时的退出文案）。F10 根因为 capture / restore 把 tab 停靠位限制在当前列数内，而 xterm 缩列后保留旧停靠位；修复 `a76528f`（上限改为最大列数 500，保持与持续运行的 xterm 一致，差分回归用例对旧实现复现原错误）；F11 与 E2E 触发词竞态修复 `f06ba98`。W5 Part 5 以对抗方式复验（启动页往返 14 次、`less` / `vim` 备用屏幕、`tabs 4` / `tput hts`、隐藏终端缩放、两 Project 不同宽度）关闭 F10 / F11。最终代码基线 `f06ba98`：`pnpm check:code` 36 / 241 / 359 通过；完整 Electron E2E 40 / 40；`pnpm package` + `pnpm smoke:packaged` PASS（均为实现者自检）。未关闭：W5-F6 / F9（同一待人工决定：`style-src-attr`）、W5-F7、毛玻璃浅色选区对比度取舍、真实 CLI 预算。证据目录约 66 MB（此前任务最大约 11 MB），其中 16 张无记录引用的截图已移到 `.runtime/` 不入库；合入 main 前若要压缩体积，可在压缩过程提交时裁剪 PNG。不合入 main、不推送，等待用户决定。
