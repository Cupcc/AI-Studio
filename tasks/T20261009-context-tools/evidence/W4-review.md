# W4 独立技术审阅记录

## 环境与方法

- 审阅者：W4；未参与 Browser、Terminal、工具 UI 或关闭接缝实现，仅编写独立验收场景。
- 平台：macOS arm64；2026-10-13。
- 初始审阅：`cadccc9`（阶段基线 `c3b81c9` 之后的 Browser 与资源准备提交）加主 Agent 进行中的关闭 / Session gate diff。最终集成基线尚待固定。
- 静态对照：直接读取 Browser policy/service/IPC/construction、Project close/quit/service、Session gate、工具 UI 和可信 IPC 校验；未采用实现者报告替代审阅。
- 独立执行：`W4_TERMINAL_REVIEW_ROOT=../runtime-tools-terminal pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W4-vitest.config.ts --reporter=verbose`，最终复验 4 个文件 / 25 tests passed。测试使用真实 Terminal 修复分支、fake timers、真实本地 PTY 和延迟服务端口，不调用 CLI 模型。
- 资料：与锁定 Electron `44.4.5` 的本地类型声明对照事件参数；同时核对 [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents)、[安全指南](https://www.electronjs.org/docs/latest/tutorial/security) 和 [xterm flow control](https://xtermjs.org/docs/guides/flowcontrol/) 官方说明。官方说明不作为本项目运行通过的证据。

## 发现与复验

### W4-F1：Project 关闭超时提前解除跨工具锁

来源：[Project spec §3.2.4](../../../specs/project/spec.md#324-关闭-tab-与确认)、[Tools §4.3](../../../specs/tools/spec.md#43-terminal-与-browser-接口准备)。

独立场景：初始无活动 Session，工具清理保持 pending；对实际 `projectShellFor` 调用确认关闭并推进 10,001 ms。关闭调用应返回失败，同时所属资源创建锁应保持，直至实际清理完成。

- 初测 11:47:03：3 项测试，2 项通过，1 项失败；`shell.isProjectClosing('p1')` 在超时后实际为 false，预期 true。真实清理仍 pending。
- 实现者修复：区分有界调用与底层清理，新增 cleaning Map，重试 pending 清理返回诊断；Session create/send 接受可信跨功能 canOperate gate。W4 未修改实现。
- 复验 11:47:36：独立 3 项测试全部通过；清理 pending 时锁保留，实际 settled 后解锁。
- 最终代码固定后仍需复跑，并独立检查重试不启动重复清理及 idle Runtime 的迟到关闭回调。

### W4-F2：Session 与工具清理之间缺少覆盖全程的共同 gate

静态发现：Session 自有 closing 锁仅覆盖 stopProjectTurns / projectClosed，不能覆盖两者之间工具释放；初始无活动 Session 时还有直接进入工具释放的窗口。已交回主 Agent。

当前修复检查：session feature 从 ProjectShell 提供 `canOperate`；create 在 await Provider 后、保存和 begin 前调用 ensureCanSubmit，send 及 ensure 同时校验。最终集成版本再独立复验。

### W4-F3：自然 Shell exit 漏掉仍存活的受管后代（修复分支已通过）

独立真实 PTY 场景：[W4-pty-ownership.test.ts](W4-pty-ownership.test.ts)。运行忽略 HUP 的后台 child，等待 driver 的 1 秒采样覆盖，然后用户输入 exit。系统列表确认该 child 的同 PID + startedAt 仍存活，服务却将 Summary.state 标 exited，`activeTerminals('p1')` 返回空；Tab 与 Project 关闭可以绕过仍存活进程的确认。finally 的服务 dispose 精确清理 child，不扩大到其他进程。

- 11:51:56 初测失败：预期 activeTerminals 长度 1，实际 0。修复后真实 PTY 复验保留 child；额外 mock 场景验证 Shell 从未取得 root identity 时，即使 OS listing 成功也拒绝 live/close 确认，避免把 orphan 当作已清理。

### W4-F4：ANSI 快照缺少后续输出依赖状态（修复分支已通过）

独立真实 headless xterm 参考：[W4-ansi-handoff.test.ts](W4-ansi-handoff.test.ts)。比较连续 xterm 与「服务快照 + 增量」恢复 xterm 的屏幕文本、颜色和光标，不把快照字符串与实现本身比较。

- 分片 CSI：`ESC[31` → snapshot → `mRED`，11:53:19 恢复输出为 mRED，参考为红色 RED。
- 11:54:30 扩展 4 项均失败；修复分支通过 25 项独立差分，覆盖原始 4 项及 CSI / DCS / OSC / C1、Unicode carry、tabs / margins / modes / alternate、DECSCA protected cells、curly RGB underline、OSC8 link identity 和严格 schema 失败原子性。实现增加有界 per-cell overlay/link remap；超限仍拒绝 ACK 并保留 PTY。

### W4-F5：WebContentsView 本地导航在实际构建中卡 loading

真实 Electron fixture（隔离 userData，`STUDIO_E2E_PROVIDERS=1`，本地 HTTP）验证：页面 `require/process/window.studio` 均 undefined；Project 分区 marker 隔离、外站 link/new-window prompt、不可达地址错误 / 重试通过。但通过页面按钮触发 `location.reload()`、本地 `/next`、以及 `/redirect` 302 到外站后，主应用地址状态分别停留旧 DOM/URL 或 `status=loading`，未出现预期本地导航 / 外站确认。该现象在固定 main / preview target 后复现，不能归因于 agent-browser target drift；见 `W4-browser-redirect-state.png`。当前实现仍需修复并重新构建。

### W4-F6：浅色毛玻璃 Terminal viewport 黑底

在同一实际 Electron 构建的默认浅色毛玻璃设置下，Renderer Terminal theme 使用透明 pane 和深色文字，但上游 `.xterm .xterm-viewport` CSS 将 viewport 固定为 `#000`。截图 `W4-terminal-cwd.png` 显示文字几乎不可读；需在 Terminal 作用域覆盖 viewport / screen 背景并在浅 / 深、glass / solid 组合复验。

## 已执行独立延迟场景

| 场景 | 当前结果 | 实际检查 |
|---|---|---|
| Project 超时保留资源创建 gate | 修复后通过 | 有界调用 failed；底层 pending 期间 gate 为 true；settled 后为 false |
| Stop 超时后才成功 | 通过 | 不继续工具或 idle Runtime 释放，不把迟到 Stop 当作关闭成功 |
| Quit 超时后 Cancel | 通过 | Cancel 回到 idle；cleanupPending 直到实际 settled；之后解 Session quit gate；未触发迟到退出 |
| idle Runtime 迟到关闭 | 通过 | close 超时返回失败；底层 settle 后调用 `projectCloseCancelled`，不提前退休 Project |

## 当前静态结论与待执行边界

Browser 构造显式禁用 Node、Worker / 子帧 Node、Preload 和 webview；开启 contextIsolation / sandbox / webSecurity。每实例生成无 persist 前缀的独立分区。权限请求、检查、设备授权及下载均拒绝。顶层地址、页面导航、redirect 与新窗口均调用同一 URL 分类；外站请求须持有当前实例代次与一次性 request ID 后才能调用系统浏览器。正常子资源不按顶层导航策略误拦。实际网页复验发现本地 reload / same-origin / redirect 接缝仍需修复。

上述 Browser 结论已补充真实网页、分区隔离、失败显示、外站选择、弹层遮挡与 Project 释放；本地 reload / same-origin / redirect 和最终打包仍未通过。Terminal 服务、driver、屏幕模型、IPC 和 UI 已直接阅读；修复分支序号 / ACK、暂停水位、有界屏幕、身份校验及 25 项独立恢复场景通过，主分支集成后需重跑。

未覆盖 Files、项目 / 本轮 Diff、文件引用及原生补丁保存，完整 AC-07 未通过。没有真实 Codex / Claude 模型调用授权，相关端到端链路仍未覆盖。人工产品验收状态待主 Agent 独立记录。
