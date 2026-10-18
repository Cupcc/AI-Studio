# Runtime 工具执行计划

## 2026-10-18 本轮 Diff 继续实施

- 基线 `dcfaac3`；worktree `../AI Stduio.worktrees/turn-diff`，分支 `feat/turn-diff`。主 checkout 保持 main，已快进同步检查，无远端新提交。
- 授权与范围见 [task.md](task.md#本轮授权与状态)。Main Agent 单独实施 Adapter → Session / SQLite → typed IPC → Diff / Conversation。
- 验证覆盖原生事件替换、重复 / 迟到事件、跨 Session / Turn、旧库升级、重启历史、失败 / 中断、数据限额；Electron 回归及 agent-browser 从完成行查看补丁、返回项目 Diff、跨项目和重启恢复。真实调用仅使用 Codex 隔离 fixture。
- 按 Task Protocol 的跨模块 / 持久化要求，实施后安排未参与实现的 Review Agent；其写入范围届时登记。代码实现和真实普通引用 / 原生 patch 验证已完成，独立评审及最终门禁结果见下方与验收记录；无发布或本次人工功能接受结论。

| Worker | 职责与只写范围 | 基线 / 集成 |
|---|---|---|
| W23（独立 Review Agent，未参与实现） | 独立检查 Adapter / Session / 迁移 / IPC / Diff 关联与安全边界，运行自己的探针；只写 `acceptance.md` 的本轮评审章节和 `evidence/W23-*`，不修改代码或计划。原生窗口测试待主 Agent 通知，避免焦点竞争 | `dcfaac3` + 本分支本轮 diff；缺陷交 Main Agent 修复，W23 复验 |

### 本阶段进度

- 最终自检：`pnpm check:code`（36 / 246 / 1160）、Electron E2E 49 / 49、本阶段 unsigned macOS arm64 打包与 smoke PASS；源码最后的证据注释更正重建后，119 个 out 文件 hash 全部相同。文档检查无新增问题、4 个历史基线问题保留。

- Adapter → Session / 迁移 → typed IPC → Conversation / Diff 已完成；新轮无 patch 也保存已知原生身份与版本，旧历史不回填。
- 真实 Codex 0.163.0 的 Git / 非 Git 原生 patch、普通 native mention 与实际 UI 已验证；Shell 写入没有对应 patch 事件，已写入 UI 覆盖提示。
- W23 独立发现的截断、路径标记、脱敏破坏结构、脱敏扩容、来源与无 patch 身份问题由主 Agent 修复，W23 独立复验。最终门禁、证据与剩余项由[自检记录](evidence/W0-turn-diff-report.md)与[独立验收](acceptance.md#2026-10-18-本轮-diff-独立评审w23)负责。
- 提交初次 hook 出现既有 Project View 监听用例超时；定向套件与完整提交检查重跑通过，失败与重检证据保存在上述自检记录，未修改该服务或测试、未绕过门禁。按既有授权完成本地快进合入与干净 worktree 清理，不推送、不发布；完整工具任务继续 `in_progress`。

## 当前人工体验结论（2026-10-18）

路线图所列现有功能的人工体验已全部通过，工具接受范围与确认依据见[验收记录](acceptance.md#当前范围与人工功能验收)。下文保留各阶段当时的计划与收尾基线；其中待人工体验的历史状态不再作为当前阻塞。同日后续指令已恢复实施，任务剩余技术验证由 [task.md](task.md#本轮授权与状态) 跟踪。

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

## 阶段 1：Files + 项目 Diff + 文件引用链路

- 指令与范围：用户 2026-10-14「continue implementing」（理解见 [task.md](task.md#本轮授权与状态)）。依据 [Tools spec](../../specs/tools/spec.md) FR-TOOL-001、FR-TOOL-002 第 2、3、6 项、§4.1，FR-INPUT-001；验收场景见 task.md 的 Files 正常、文件引用、文件失败、项目 Diff、Diff 边界行。基线：main `597b423` 之上的 `feat/files-diff`（`b6cd065`：Monaco 0.57.0 与共享契约）。
- 计划来源：只读规划 agent（2026-10-14）。非目标：本轮 Diff、Conversation 入口、补丁持久化、Git 写操作、文件编辑、任何真实 CLI 调用。推迟项与解除条件：文件引用的真实接收（按 DEC-16 只验证 Codex，并记录 CLI / 上游服务实际结果；应用不设置调用次数、费用上限或自动重试护栏）、Claude 运行中追加 / 排队（`inputWhileRunning: 'none'`，需原生对齐任务）、本轮 Diff（需真实能力探测与存储方案）、Monaco 真 Web Worker（仅当主线程实测超阈值才申请 `worker-src 'self'`）。原计划中的“真实 CLI 范围 / 预算”是当时的授权前提，已由 2026-10-18 的 DEC-16 当前口径取代。
- 技术选择（AI）：文件引用两个 CLI 都先以文本路径清单交付（`mention` 语义未验证、Claude 附件抛 `unsupported`；任何静默失效形式都违反“不静默丢弃”）；Monaco 用主线程回退、不改 CSP；符号链接只列出不跟随、拒绝查看与引用；隐藏 `.git`；无首个提交时说明基线不可用并列出新增文件，绝不写“无变更”。
- 先行验证（失败会改变设计）：SP1 Monaco 在生产 CSP 下无 worker 的回退、零违规、分块体积（W12）；SP2 macOS 上 `O_NOFOLLOW_ANY` 与 FSEvents 事件形态及过滤成本（W10）；SP3 Git 2.39 命令矩阵、`xcode-select` 垫片检测（W11）。

| Worker | 分支 / worktree | 声明写入范围（相对 `apps/desktop/`） | 集成方式与依赖 |
|---|---|---|---|
| W0 Main Agent | feat/files-diff / files-diff | task.md、plan.md、docs / specs 回写、`shared/ipc/contracts.ts`、`main/ipc/index.ts`（含 MainToolPort 组合）、`Tools.tsx` 槽位、package.json / lockfile、E2E、冒烟 | 契约 `b6cd065` 之后，顺序导入各 worker 提交；原生窗口测试串行 |
| W10 Files 服务 | feat/files-diff-files | `src/main/services/files/**`、`src/main/ipc/files.ts` | 只依赖契约；自行局部验证 |
| W11 Diff 服务 | feat/files-diff-diff | `src/main/services/diff/**`、`src/main/ipc/diff.ts` | 只依赖契约；带自有的有界读取辅助，不引用 W10 |
| W12 代码查看器 | feat/files-diff-code | `src/renderer/src/features/tools/code/**` | `CodeViewer` / `CodeDiffViewer` 接口见 `code/types.ts`；SP1 |
| W13 Files 面板 | feat/files-diff-files-ui | `src/renderer/src/features/tools/files/**` | 使用契约与 `addFileReference` 占位签名 |
| W14 Diff 面板 | feat/files-diff-diff-ui | `src/renderer/src/features/tools/diff/**` | 使用契约；独立于 W13 |
| W15 文件引用链路 | feat/files-diff-input | `src/main/services/session/**`、`src/main/ipc/session.ts`、`src/renderer/src/features/input/**`、`src/renderer/src/features/session/store.ts` 及其测试 | 通过 `FileReferenceResolver` 与 `addFileReference` 与其他 worker 耦合 |
| 独立评审 | 阶段完成后安排，不得参与实现 | `acceptance.md`、`evidence/W<n>-*` | 安全评审（无 GUI）与界面验收（agent-browser）分开 |
| W18 安全复验 | 聚合分支只读源码，无独立代码 worktree | `evidence/W18-*`；W16 测试静态断言的维护 | 接续未完成的 W16，独立运行边界测试并复验修复；不修改实现 |
| W20 目录隔离修复 | 聚合 worktree，W0 串行安排的三个文件 | `src/main/services/files/directory-reader.ts`、`directory-reader-worker.ts`、`electron.vite.config.ts` | 2026-10-16 针对 W18 后续 B5 失败实现隔离读取；W0 负责 list / service 接线，W18 独立复验 |
| W19 界面复验 | 聚合分支只读源码，独占 GUI | `acceptance.md` 阶段 1、`evidence/W19-*` | 接续 W17，重建后复验 Files 发现并完成 Diff / 文件引用交互；不修改实现 |

路径除注明外均相对 `apps/desktop/`。worker 先读取负责索引；不改 task.md / plan.md；不改 package / lockfile；不改共享登记表。原生窗口 / Electron 测试只由主 Agent 串行运行，worker 只跑局部 Vitest 与类型检查。

### 阶段 1 进度日志（Main Agent）

- 2026-10-14：用户回复「放宽安全限制，先实现功能为主。accept above, apply, continue implementing」。运行时阶段压缩为三个提交并本地快进合入 main（`0da636d` Adapter 严格释放、`1aeadf5` Terminal / Browser、`597b423` 文档与验收记录，未推送）；`style-src-attr` 放宽、最小对比度 5.5、终端 E2E 改用无插件无历史的 `zsh -f` 已在其中。
- 2026-10-14 ～ 15：在 main 之上建 `feat/files-diff`，安装 `monaco-editor` 0.57.0（精确锁定），提交共享契约（`b6cd065`）与占位查看器（`5c3fc3e`），登记 W10 ～ W15 及先行验证 SP1 ～ SP3，设计依据写入 research.md。六个 worker 在独立 worktree 并发实现，多次被会话额度限流打断后均从各自 worktree 的进展续做完成：W15 文件引用链路（`7b3afbd`）、W10 Files 服务（`2163aad`）、W13 Files 面板（`2f5e526`）、W14 Diff 面板（`20d930f`）、W12 Monaco 查看器（`c16c212`）、W11 Diff 服务（`cb76748`）。主 Agent 逐个导入并接线（契约登记、处理器、`MainToolPort` 全部尝试后聚合清理、渲染进程消失清理、`Tools.tsx` 挂载、`useNativeViewBlocked` 仅用于 Terminal / Browser），并新增 Files 与 Diff 的 Electron E2E 和独立 Git 夹具。
- 先行验证结论：SP1 Monaco 在生产 CSP 下无 Worker 回退、0 违规，1 MiB 文件冷启动 477 ms；两侧完全不同的 512 KiB diff 会占主线程 1.5 s，已把计算预算降到 250 ms，不申请 `worker-src`。SP2 darwin 上 `O_NOFOLLOW` 与 `O_NOFOLLOW_ANY` 同用得 EINVAL，改为 darwin 单独用 `O_NOFOLLOW_ANY`；APFS 名称最长 255 字符（至多 1020 字节），契约 `nameBytes` 放宽为 1020；FSEvents 在 `pnpm install` 级别事件风暴下过滤成本约 0.2 µs / 事件，仍需自己的 overflow 规则。SP3 `diff HEAD` 不输出冲突 `U`，须 `ls-files -u`；`--no-index` 退出码 1 仅在 stdout 非空时表示有差异；dubious ownership 消息含绝对路径须替换为固定文案。已记录的取舍：仓库本地配置里的 `filter.*.clean` 命令在 `git diff` 时仍会运行（textconv、外部 diff、fsmonitor 已中和），打开 Project 即信任其目录，由独立安全评审单独评估。
- 当前基线 `feat/files-diff` @ `b2d5fd4`（领先 main 17 个提交）：`pnpm check:code` 36 / 241 / 1126 通过；完整 Electron E2E 46 / 46；`pnpm package` + `pnpm smoke:packaged` PASS（含 Git 2.39.2 探测，不参与判定）。独立评审进行中：W16 安全评审（无 GUI，`evidence/W16-*`）与 W17 界面验收（真实窗口，开发构建与打包应用，写 acceptance.md 阶段 1 小节）。
- 待办：处理两路评审的发现（交回实现者修复并独立复验）；回写文档漂移（Session 规格 §5.4 转换位置、Adapter 规格 §3.13、Input 规格 §3 第 4 项与 I-Q4、Tools 规格的 Monaco 限制 / Diff 细节、`specs/project/spec.md` 第 59 / 352 行、README 的 Files / Diff 条目、路线图）；压缩过程提交（Files 与引用链路 / Diff / Monaco / 文档，各自单独验证）并本地快进合入 main，不推送；任务保持 `in_progress`，阶段 4（本轮 Diff）与真实 CLI 验证仍待授权。
- 2026-10-16（继续 all worktrees）：六个 Files / Diff worker 分支已导入聚合分支；不重复 cherry-pick。W16 发现的 Git hook / index 写入、Files 列表路径竞态、错误路径脱敏与 macOS 引用别名问题交回实现者修复；`ed64bdd` 已修复后三项。W0 修复 W17 的控制字符显示与截断排序。安排 W18 安全复验、W19 界面复验接续未完成的独立评审；本轮仍只用模拟 Provider，不调用真实 CLI。旧 runtime-tools-ui 的未提交残留保留待核对，不覆盖聚合实现。


- 2026-10-16（文档与证据整理）：已回写 Session / Adapter 的引用转换位置、Input I-Q4、Tools §5.2 的实际限制、Project 接缝、桌面开发说明、路线图与架构工具节点；未把真实接收或本轮 Diff 记为完成。W17 无记录引用的 15 个 Diff 原始截图 / JSON 已可逆移入 `.runtime/stage1-evidence-unused/`，保留其 Files 测量、引用截图与复现脚本；W19 使用新证据接续独立界面验收。

- 2026-10-16（竞态再次复现与修复）：W18 在首轮无泄漏之后的长时间复验中再次捕获外部名称，旧的 pathname 后校验不足以封住目录替换竞态。W20 与 W0 改为安全目录句柄 + 独立 utilityProcess cwd 身份核对，保留权限受限文件、特殊文件和符号链接提示；不采用会省略这些合法行的逐行 open 方案，也不放宽 RunAsNode fuse。最终源代码 `890a431`；正常提交门禁 36 / 241 / 1134 通过，338 项受影响定向检查通过，最终 package / packaged smoke PASS。W18 / W19 正在该基线完成独立终验，原生窗口资源依次安排，之后重跑 Electron E2E。

### 2026-10-17 worktree 收尾

- 本轮来源：用户「对尽快可以完成的worktrees 进行收尾，合并到main，clear worktrees」。主 checkout 保持 main，`git pull --ff-only origin main` 确认远端无新提交；本地 Runtime 三提交保留，不重写 main。
- 六个阶段 1 worker 的唯一实现提交均与聚合分支补丁等价：W10 `2163aad` → `f5fde11`、W11 `cb76748` → `162d8a8`、W12 `c16c212` → `0725119`、W13 `2f5e526` → `b48d7a8`、W14 `20d930f` → `9ba21d7`、W15 `7b3afbd` → `cd1e453`。独立只读盘点 agent 以 `git cherry` / `git range-diff` 核对，六个干净 worktree 已正常移除。
- 旧 Runtime UI 的两个实现提交在 `backup/runtime-tools-pre-squash` 内补丁等价，该备份与 main 树完全一致。未提交 package / lock 与 main 相同，四个旧契约为排版差异或 main 的旧子集。重复残留已保存在命名 stash `worktree-close: preserve redundant runtime-tools-ui files 2026-10-17`（对象 `defafc622a0d02bf3e5cdbca8e7e410a3658bc0d`），随后正常移除该 worktree，未强制删除未提交修改。
- 当前唯一候选为 `feat/files-diff`。W21（未参与实现）接续 W18 安全终验；W22（未参与实现）接续 W19 实际 Electron / 打包界面终验，独占 GUI；root 在其释放后串行执行最终 E2E 与打包冒烟。任务保持 `in_progress`，本轮 Diff / 原生补丁与真实引用仍由本任务跟踪。
- 本轮代码复核发现文件引用的 NFC / macOS 大小写预折叠会把区分这些名称的卷上两个不同文件误合并，已交由该复核 agent 修复：逐一解析请求后按 realpath 合并，main-only aliases 证明每个原始请求均被覆盖。实现者局部 83 项与 Node 类型检查通过；未参与实现的 W21 独立新增 12 项及引用 / IPC 回归 48 项通过，准确区分实体 APFS 结果与模拟文件系统语义，详见验收证据。

### 收尾验证（Main Agent，2026-10-17）

- 固定源码为 `890a431` + 引用身份修复、无 HEAD 说明文案与 ProjectPath 注释修正；六个相关源码 / 测试文件相对该基线的 diff SHA-256 为 `72e61737c7bb62616ba62274d1a8d3b6ff6d291acce6cacc48f63dfdc38aa801`，见 [最终产物审计](evidence/W21-package-final.log)。后续仅整理文档与证据。
- 本轮初检 `pnpm check:code` 通过（脚本 36、Adapter 241、桌面端 1134；[日志](evidence/W0-stage1-close-code.log)，在最后 aliases 修复之前）；修复的模块 / 类型检查及独立复验见上节。最终提交仍由正常 pre-commit 执行完整代码、类型、脚本和单元门禁。
- `pnpm test:e2e` 在最新源码构建后 46 / 46 通过，含 Files / 引用 / Diff 及全部既有 Electron 回归；[日志](evidence/W0-stage1-close-e2e.log)。没有调用真实模型。
- 同一流程复用该构建执行 `pnpm --filter @ai-studio/desktop package:built`，随后 `pnpm smoke:packaged` PASS；[打包日志](evidence/W0-stage1-close-package.log)、[原生冒烟报告](evidence/W0-stage1-packaged-smoke.json)。冒烟输出先由 pnpm 的包内 cwd 写入，随后原样移到本证据目录。
- W21 对最新 `out/` 与 `app.asar` 的 119 个文件逐字节审计通过，含目录 utility worker；W22 的实际 GUI 保留其已声明的旧包基线，不把新包自动化结果冒充新一轮 GUI。独立结论与剩余边界由 [acceptance.md](acceptance.md#stage-1)负责。
- 本阶段按一个完整可验证目标整理提交，保留 `backup/files-diff-pre-closeout` 以追溯压缩前代码与证据基线；同步 main 后 rebase，依 CONTRIBUTING §5 只作本地快进合入，再正常移除干净的聚合 worktree。真实 CLI、本轮 Diff、人工功能验收及整个任务的剩余范围继续保留。

### 2026-10-18 范围与文档同步（恢复实施前的历史记录）

- 用户确认当前 V1 的真实 CLI 验收只覆盖 Codex；Claude Code 暂不真实验收且不随当前 V1 发布。Codex 的额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定，应用不设置调用次数、费用上限或自动重试护栏；真实结果按 CLI 实际行为记录。
- 用户确认取消固定上线排期，GitHub Releases 为后续发布渠道；目标版本和发布准备边界见 DEC-21、DEC-22。签名 / 公证 / 校验和发布前再定；扩展范围不插入 V1。
- 用户接受 W5-F13，并确认 SET-Q6 / SET-Q7，已记录为 DEC-20；该时点后用户又确认现有功能体验全部通过，当前结论见顶部。
- 用户随后明确本轮仅更新文档，不继续推荐或推进实现、真实 CLI、打包、产物生成与发布。已经核对路线图、决定记录、技术要求、验收标准、架构快照、脚本说明及相关规格和任务；历史基线、未覆盖项、任务状态和人工验收结论保留。
