---
id: T20261031-inline-attachments
status: done
fr: [FR-INPUT-001, FR-TOOL-001]
ac: [AC-02, AC-05, AC-07]
specs: [specs/input/spec.md, specs/tools/spec.md]
created: 2026-10-31
---

# 输入区行内引用与粘贴附件

## 范围和依据

用户 2026-10-31 指示：「$和@导入的不要放到上边和下边了，直接放到输入区域，直接原地引入。 粘贴的图片，file等放到输入框内 文字的上方。」适用于共用 Composer。引用仍须符合 FR-INPUT-001、FR-TOOL-001 和 Tools §4.1 的发送与路径校验要求。

## 验收场景

| 场景 | 预期 | 状态 |
|---|---|---|
| 文件与 Skill | 在文字中间选中 `@` 文件或 `$` Skill，呈现有留白的标签；悬停真实内容、点击侧栏打开，编辑或删除与发送状态一致 | 独立实际界面复验通过，见 acceptance 第三轮 |
| 粘贴附件 | 粘贴图片或文件，附件在输入框中文字上方显示，可移除并能发送 | Main 实际 Finder 文件链路与真实 Codex 缓存接收通过；W1 独立 Preview 位图粘贴 / 移除且保留正文与引用通过；真实图片模型回合未做 |
| 草稿和失败恢复 | 切换对话、重启或发送失败后保留文字、引用、附件及其位置 | Session / New Chat 隔离独立通过；附件与标签重启恢复自检通过；失败保留与重试自动化通过 |
| 输入和安全边界 | 文字粘贴、输入法、键盘、文件身份、大小限制及 Project 隔离正常 | 定向自动化与独立技术复核通过；原生 macOS 键盘独立实际操作通过；输入法为模拟 composition 验证 |
| 附件缓存 | 无引用副本及中断残片自动回收，不误删仍被引用的附件 | 独立技术评审通过；精确宽限与保留规则由 Input spec §3 负责 |

## 当前状态

在 `feat/composer-inline` 独立 worktree 实现与验证；2026-11-05 按用户「合并到main中，我要pnpm dev测试」要求，已将完整实现与主 checkout 的 Files 查看列整合到 main 工作区，根目录 `pnpm dev` 将使用此版本。11-09 已通过正常门禁形成附件提交 `075f524`，含独有的 7 份 Electron E2E 适配；类型检查、Adapter 287 项与桌面 371 项通过。当前合入 / 推送 / 清理见[11-09 集成记录](../../T20261109-main-integration/task.md)，下节环境阻塞为历史记录。缓存生命周期已实现并通过独立技术评审。根据用户后续纠正补齐行内交互标签、真实内容预览和侧栏打开；又根据“边框贴文字、拥挤”的反馈改为实际参与排版的原子标签，使用 DOM 编辑区域保留真实 padding / margin，替代不能容纳留白的 textarea 镜像。未增加依赖。

2026-11-01 验收 App 经 `.runtime/attachment-review/Electron.app` 的开发签名运行器加载本 worktree 构建，真实 Provider 为 Codex 0.166.0；当时已启动供人工验收。此运行器用于本地开发，不作为打包分发验证；当前手动测试入口改为主 checkout 的 `pnpm dev`，勿同时启动两份共用 userData 的开发 App。最终独立结论及人工状态见 [acceptance.md](acceptance.md)，不能沿用旧输入区的人工接受。

2026-11-01 Main Agent 已核对本轮交付与完成条件：W1 独立缓存 / IPC / Adapter 技术评审、原子标签核心界面及最终滚动 / 位图粘贴复验通过，无未解决阻塞；Main 的 Finder、完整重启与真实缓存接收证据经 W1 检查。本轮技术工作完成，人工功能验收待用户进行。当时最终 App 保留 `请检查 @附件 样例.txt $check-attachment` 两标签和右侧文件查看器；未提交、合并或打包发布。此段保留 11-01 技术结论，不代替下节的主线集成状态。

### 2026-11-05 主线集成

Main Agent 将本 worktree 全部 61 个已修改 / 新增文件（含任务与证据）同步到主 checkout，三方整合 Files 查看列与引用 inspector 的 Tools 入口，并合并 Shell、Tools spec 和路线图的两部分文档。除入口组合外，附件实现保持原评审基线；没有重新发送模型请求或补记人工接受。

主 checkout 的 Files 提交门禁先通过类型检查、脚本 36 项和 Adapter 286 项；桌面 1305 项通过、6 项真实文件监听 / Project View 场景失败。原生 `fs.watch` 独立探针在系统临时目录与项目目录均返回 `EMFILE`，提高进程文件数限制未恢复；该环境故障与 11-01 历史全量失败范围一致，不能报告完整门禁通过。未绕过 hook；目前仅为 main 工作区可运行，尚未正式提交、Git 合并或推送。另一次远端同步因 `github.com` DNS 解析失败未完成；本地基线仍为 `a0619fe`。

集成后的 `pnpm build`、`pnpm typecheck` 和桌面 9 文件 254 项接缝回归通过，日志见[构建](evidence/W0-main-integration-build.log)、[类型检查](evidence/W0-main-integration-typecheck.log)、[回归](evidence/W0-main-integration-regression.log)；文档链接检查 0 新增、4 项既有，`git diff --check HEAD` 通过。源码指纹核对确认，附件实现与原 worktree 相同，只有 Tools 组合入口和合并文档发生预期变化；没有重新进行 GUI 验收。后续在文件监听恢复的环境通过正常提交门禁，完成正式提交与快进集成后再清理 worktree。历史独立技术收尾与本次环境阻塞分别记录，任务保留已完成的功能技术范围；人工功能验收仍待用户。

启动前检查另发现主 checkout 的 Electron 44.4.5 只有 linker 签名、缺少资源签名；Main Agent 在 `.runtime/main-integration-20261105/Electron-before.app` 留存副本后，对本机开发依赖执行 ad hoc 签名，`codesign --verify --deep --strict` 通过（valid on disk / satisfies its Designated Requirement）。该处理只修复本机开发启动依赖，不作为打包、Developer ID 或公证验证。

### 2026-11-06 环境故障续查与恢复入口

用户回复「fix」，授权继续处理阻塞并完成合入。Main Agent 复查确认源码和暂存状态仍保留，独立 Node 26.12.1 探针仍收到 `EMFILE`，未启动重复的全量测试，也未修改测试断言或绕过 hook。

只读诊断结果：系统当前文件句柄约 10,359 / 122,880，进程软限制 4,096；`launchctl print system/com.apple.fseventsd` 返回 `141: Reentrancy avoided`，`id -un` 仅返回数字 UID，`git fetch origin` 仍报 GitHub 域名解析失败。当前命令的父进程为 10-30 启动的 Codex 0.166.0 app-server daemon；新启动子命令及 `launchctl bsexec` 探针未恢复服务查询。结合上一轮提高限制和不同 Node 运行时仍失败的结果，证据指向当前命令执行环境与 macOS 系统服务的连接异常；具体失效触发原因尚未证实，不能将 `EMFILE` 直接认定为实际句柄耗尽或项目监听器泄漏。

恢复步骤由用户在正常的系统 Terminal 中执行 `codex app-server daemon restart`；已核对本机 CLI 0.167.0 及后台 0.166.0 的帮助，均提供该命令。重启会中断当前工具连接，也可能影响其他运行中的 Codex 任务，因此未从受影响的后台进程内部自行重启。OpenAI Docs 的[终端故障说明](https://learn.chatgpt.com/docs/reference/troubleshooting#terminal-issues)建议持续异常时待活动任务结束后重启应用；后台重启命令依据本机 CLI 帮助，不冒充文档已明确诊断此次故障。

续接顺序：恢复后由 Main Agent 先复测原生监听与系统服务查询，再通过正常提交门禁整理两部分提交、完成本地 main 的线性集成；网络恢复后同步远端。当前 main 工作区可供用户运行 `pnpm dev`，正式提交 / 合并 / 推送状态仍未完成。原 worktree 和 `.runtime/main-integration-20261105/` 的源文件、暂存补丁与集成备份全部保留。

本轮文档复核覆盖本任务当前状态与恢复条件、plan、Files 布局任务及路线图五类进度入口；只补充环境诊断与续接入口，保留 11-01 独立技术验收和 11-05 构建 / 定向回归的原基线。产品行为、验收标准、人工状态和源码均未改变。

### 初轮历史基线（已被后续实现与验证更新）

初轮仅有原位引用位置与附件暂存，没有缓存清理，未执行界面或自动化验收。后续用户要求继续完善并启动 App，本轮测试与清理范围随之增加；该历史基线不描述当前实现。

初轮 `pnpm typecheck`、`pnpm check:docs`（4 项既有基线问题未增加）和 `git diff --check` 通过，当时不能证明交互或发送链路可用。后续证据见下文及独立验收，不改写初轮结论。

初轮文档复核覆盖 input spec §3、Shell Spec v02 §7、UX 的工具与输入说明、AC-02 / 05 / 07 及路线图。既有产品需求、旧验收和历史原型保留各自基线。

## 2026-10-31 继续完善

用户本轮授权补齐附件缓存清理并启动应用供人工验收。缓存的准确生命周期由 [Input spec §3](../../../specs/input/spec.md#粘贴附件与缓存生命周期)负责；W1 已独立验证引用保护、孤儿 / 中断写入回收、Project 隔离、串行操作与退出。特别区分文件修改 / 本进程最近使用宽限与最后解除引用时间，避免把实现误写成“解除引用后再等 24 小时”。

## 2026-10-31 用户纠正引用交互

用户明确要求参考 ChatGPT / Claude Desktop、VS Code / Copilot Chat：`$` / `@` 不能只是普通文字，须有特别标记，悬停能预览文件内容，点击能在侧边栏打开文件。该要求补充本任务完成条件；旧版纯文本呈现不满足交付。Main Agent 参考 VS Code Chat 的引用装饰 / hover / 点击导航模式；项目文件复用 Files 校验及查看器，原生 Skill 通过 opaque ID 在主进程重新查询目录并读取 `SKILL.md`，不向 Renderer 开放任意本机路径读取。

参考源码：[VS Code input decorations](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/widget/input/editor/chatInputEditorContrib.ts)、[input hover](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/browser/widget/input/editor/chatInputEditorHover.ts)。本轮使用 frontend-design、React best practices、Vitest 与 agent-browser 技能；沿用现有配色与字体，最终标签使用 `@` / `$` 类型标记、淡底、细边、真实内边距和相邻间距。预览只在用户悬停或聚焦时按需读取。

## 本轮验证记录（2026-10-31～11-01）

- Main Agent 已从原生 Project 目录选择、Finder 中文空格文件复制 / 粘贴入口操作；附件在文字上方出现，退出 / 重启后恢复。初轮真实 Codex 返回 token，但读取了 Project 内原文件，不能证明缓存链路。最终改用 Project 外夹具，stage 后移除自造源文件、完整退出 / 重启，再从 App 发送；Codex 0.166.0 实际 `cat` 应用数据目录缓存并返回专用 token `cache-receive-9531`。操作、首次失败及修复、边界见[真实链路记录](evidence/W0-real-cli.md)与[关键截图](evidence/W0-cache-only-codex.png)。
- Main Agent 已实际选择文件 / Skill 标签并操作 hover、预览打开和点击侧栏。用户指出第一版留白不足后已重写排版，这些历史截图不能替代最终版独立复验。
- W1 发现 Skill inspector 遮住后续 Files 操作，已修复：显式 Files 入口清 inspector，打开新 Skill 后再设置 inspector，关闭 Project 清其状态，保留原 Diff 工具回调。独立自动化及最终实际界面复验通过。
- 新编辑器与发送接缝的 workspace 类型检查、构建及 **9 文件 214 项**定向回归通过，见[定向日志](evidence/W0-regression.log)、[类型检查](evidence/W0-typecheck.log)。新增自动化覆盖标签布局与模型偏移解耦、复制 / 剪切身份、IME 提交、浏览器换行、旧 DOM 索引、撤销 / 重做、超长回滚，以及缓存附件的 create / steer / retry 转交和失效保留。
- 缓存唯一来源验证发现旧 Adapter `file → mention` 不向模型提供本地路径；已改为明确的 JSON name / path 文本引用。图片 / Skill 保持原生，宿主附件身份仍为结构化。**Adapter 1 文件 66 项**定向回归通过，见[日志](evidence/W0-adapter-regression.log)，W1 已独立复核及执行通过。当前转换只由 [Adapter §3.13](../../../specs/agent-adapter/spec.md#313-工程工具接缝)负责，Input / Tools / Provider README 引用该结论，旧 0.163.0 结果保留历史范围。
- W1 最终补验发现长文本粘贴后光标未滚入视口，已补编辑区内部的 Range 光标跟随；重新构建、类型检查和 214 项定向回归通过。W1 复验 32 行粘贴后立即看到末行光标，单次撤销恢复两引用；Preview 复制真实位图后 App 显示文字上方的图片标签，移除后正文和两引用完整。最终独立证据见 acceptance 最后一轮。
- 首次测试命令误跑全桌面，1310 项通过、9 项失败；其中本次相关的 3 项已修复，剩余 6 项涉及真实 fs.watch / ProjectView 等超时，未纳入本任务修复。不报告全量测试通过；本轮以当前定向结果界定验证范围。

本轮未执行真实图片模型回合、Claude 结构化附件、macOS 13 或打包分发验证。Finder 文件和 Codex 缓存接收为 Main Agent 自检，不伪装为 W1 独立重做。原生中文输入法候选操作仍待人工体验，自动化已验证 composition 期间不重绘、不发送。人工功能验收仍为待人工验收。

## 文档同步复核

本轮核对 01 产品目标、02 FR-INPUT-001 / FR-TOOL-001、03 底部 Composer 与可信引用、04 CLI 边界、05 AC-02 / 05 / 07 与 FR ↔ AC 矩阵及 07 原授权范围；保持需求编号和既有验收标准，无需修改这些负责文档。Input §3 负责新标签交互及缓存生命周期，§4 / 5 对齐草稿和内容接口；Adapter §3.13 负责文件序列化纠正，Tools §5.2 / 5.3、Session §5.4 与 Provider README 统一引用；Shell v02 §7 仅简述交互。路线图已复核下一步、整体、输入模块、阶段与 AC 进度，并链接新基线及人工入口。08 是明确标注 2026-10-19 的静态快照，保留历史并由其既有路线图链接指向当前进度；旧原型与旧验收也保留原范围。最终源码 diff（含未跟踪新文件）、Markdown 表格 / 标题和链接均已复核；`pnpm check:docs` 0 新增、4 项既有问题，`git diff --check` 通过。2026-11-01 复核时，主 checkout 的另一项 Files 布局修改尚未迁入当时的任务分支；2026-11-05 的组合版本见主线集成记录。2026-11-01 已整体归档并修正外部引用与任务内部相对链接；旧路径搜索无遗漏，归档后再次执行文档链接检查，结果仍为 0 新增、4 项既有问题；不把文档检查当作语义复核的替代。

2026-11-05 收尾复核：检查本任务当前状态 / 下一步、plan、独立 acceptance 的历史基线、Files 布局任务，以及路线图的下一步、整体概况、模块状态、阶段与验收进度；更新主目录测试入口、未提交 / 未推送事实及门禁阻塞。Input / Tools / Adapter / Shell 的行为已随源码同步，UX 保留已确认的查看列规则；不改写独立验收结论、人工待验状态或打包范围。本机开发签名修复与文件监听故障分别记录，文档和接缝验证通过不代替正式提交或 GUI 验收。
