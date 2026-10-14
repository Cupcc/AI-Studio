# W5 最终独立复核

## 环境与基线

- W5 未参与实现；承接 W4 的最终复验与验收文档写权限，不改写 W4 历史证据。
- 2026-10-13，macOS arm64；`feat/runtime-tools` HEAD `2f4bb5a` 加主 Agent 未提交的 IPC / Project / Session / guards / Terminal UI 集成 diff。
- 无真实模型调用；源码和 headless / 真实本地 PTY 测试与需要窗口焦点的 Electron E2E 分开执行。

## 独立自动化复验

14:38:17 在最终 ROOT worktree 执行：

```sh
pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W4-vitest.config.ts --reporter=verbose
```

无 worker-root override；4 文件 / 25 tests passed（3.91 s），包括 19 项 ANSI / schema 差分、真实 HUP-ignoring 后代进程、未知 root identity 和 4 项迟到清理 / gate 场景。W4-F1～F4 修复已在集成源码复验通过，不再只引用 worker 分支结果。

## W5-F1：最后 shutdown 阶段忽略 Runtime 清理失败

来源：[Tools §3 Terminal 第 5～6 项及 §4](../../../specs/tools/spec.md)、[Project §3.2.4](../../../specs/project/spec.md#324-关闭-tab-与确认)。

14:40:05 独立 [W5-shutdown.test.ts](W5-shutdown.test.ts) 注入 feature-owned idle Runtime release rejection；预期保留数据库和诊断入口、不批准退出。实际 `createShutdownHandler` 的 finally 已调用 `disposeCore`，随后安排 `quit`，测试失败。退出确认只等待活动 Turn 与工具；idle / retired Session Runtime 清理由后续 `will-quit` 处理，因此这个既有路径会绕过本轮「清理失败不批准退出、允许重试」保证。

主 Agent 将 Runtime release 移到 QuitFlow 的批准前可逆清理；14:43:02 独立 [W5-quit-runtime.test.ts](W5-quit-runtime.test.ts) 的无活动资源等待、失败重试、超时 Cancel 三项均通过。`W5-shutdown.test.ts` 保留原最后防线行为的历史复现，不把它单独通过等同实际 Runtime 清理已严格。

## W5-F2：Adapter dispose 的 best-effort 语义吞掉退出未确认

真实 SessionController 的 `disposeDriver` 捕获 driver.dispose 拒绝后继续 resolve；真实 Codex / Claude driver 的不确认报告也只推 error / diagnostic 后 resolve。因此只有桌面 `releaseAllRuntimes` 等待 dispose 仍不能证明所有受管资源已退出。

14:46:28 独立 [W5-idle-runtime.test.ts](W5-idle-runtime.test.ts) 使用真实 SessionService + Adapter FakeProvider（真实 SessionController），仅在 Driver 边界注入首次清理拒绝；预期 releaseAllRuntimes reject，实际 resolved undefined，复现失败。与替换 controller.dispose 的实现者 fixture 不同，本场景保留实际 Controller 的错误传播逻辑。主 Agent 已交 W6 在独立 worktree 实现严格、可重试释放；W5 不参与实现。

## 最终 UI 复验（进行中）

隔离 fixture：源码构建 14:43（F5 / F6 + QuitFlow idle release，早于 W6 Adapter 修复）、`STUDIO_E2E_PROVIDERS=1`；仅目录 chooser stub，页面与 Terminal 操作均经 agent-browser。HTTP 为本机回环服务，无模型调用。应用 / preview 使用两个 named/pinned sessions；最初 pin-connect 的 Electron Target.createTarget 不兼容通过先非 pin connect、再固定 target 解决，未启动第二份应用。

- F5 实际页面内复验通过：Set Project Marker 触发 reload，Load 1 → 2；独立 Reload This Page 按钮使 Load 2 → 3；点击 Local Next Page 后 URL / 内容为 `/next`、Load 4；点击 302 External Redirect 出现主应用 prompt，Cancel 后保留 `/next` / Load 4 / PROJECT-ONE，不再 loading / failed。已查看 [next](W5-browser-next.png)、[prompt](W5-browser-redirect-prompt.png)、[cancel](W5-browser-redirect-cancel.png) 截图。页面 probe 的 require / process / window.studio 全为 undefined。
- 设置弹层内容和遮挡入口可操作，已查看 [overlay](W5-browser-settings-overlay.png)。主 Renderer 的 CDP 截图不合成 native preview，因此页面截图使用独立 preview target；未把截图中的空白预览区当作视图已经销毁的证据。
- F6 在 14:43 构建仍未通过：已查看 [glass-light](W5-terminal-glass-light.png)，深色文字叠在黑 viewport 上不可读。computed 显示 --color-pane 为 transparent；tools.css viewport 规则在前，lazy xterm.css 同 specificity 黑底在后。另 xterm-scrollable-element 由 xterm 写入黑色 inline 背景。两处均已交回主 Agent，需提高覆盖 specificity 并给 xterm 有效 rgba 透明背景后重建复验。

## Part 1 复验（2026-10-13 16:36–17:10，W5 续）

范围：F6 与 Terminal / Browser UI 在最新源码构建上的复验。未参与实现，未修改源码、`acceptance.md`、`task.md`、`plan.md`。未触碰 Project 关闭、应用退出、Session Stop 与工具释放路径（依赖尚未集成的 `provider.releaseRuntimes()`）。

### 基线与方法

- 构建：16:36:32 在 ROOT worktree 执行 `pnpm --filter @ai-studio/desktop build`（HEAD `2f4bb5a` + 当时未提交集成 diff）。已核对产物含 `.terminal-screen .xterm .xterm-viewport { background-color: transparent }` 与 xterm theme `#00000000`。
- 运行：单个 Electron 实例，隔离 userData，`STUDIO_E2E_PROVIDERS=1`，CDP 9386。fixture 为 [W5-gui-fixture-theme.mjs](W5-gui-fixture-theme.mjs)（复制自旧 fixture，不改旧文件）：仅注入目录选择器 stub、本机回环 HTTP 页面（新增无 CSS 的 `/bare`）、模拟 Provider，另只读打印窗口 CGWindowID。Project、Terminal、Browser、设置、标签全部经 agent-browser 在真实 UI 操作；app 与 preview 用两个 named session。
- 截图：`screencapture -x -o -l<windowId>` 只取应用自身窗口（含原生 Browser view 的合成结果；DPR=1，CSS px 即图像像素）。每张保留的图均已查看。无全屏 / 区域截图。
- 度量：本机无 PIL / ImageMagick，用 node:zlib 自写 [W5-png-contrast.mjs](W5-png-contrast.mjs)、[W5-measure.mjs](W5-measure.mjs)、[W5-terminal-probe.js](W5-terminal-probe.js)。每个文字框取背景中位像素，文字核心色取距背景最远的像素，按 WCAG 2.x 计算；worst 取文字框内纯背景像素中对文字最不利的 5% 分位。PNG 带 iCCP，数值未做色彩空间转换。汇总见 [W5-theme-measurements-r2.json](W5-theme-measurements-r2.json)。
- 终端内用行首空格 `exec zsh -f` 切到无 rc、无历史的 shell，避免写入用户 `~/.zsh_history`。
- 合成滚轮：agent-browser 0.39.0 的 `mouse wheel` 固定投递在 (0,0)（实测 target 为 topbar），无法滚动指定区域，改用 [W5-cdp-wheel.mjs](W5-cdp-wheel.mjs) 在指定坐标经同一 CDP 端口合成滚轮。
- 复跑辅助：[W5-theme-helpers.sh](W5-theme-helpers.sh) 由已执行的临时脚本改写，仅做 `zsh -n` 语法检查，未完整执行。

### 当前构建结果矩阵（无任何样式注入）

文字为 Terminal 默认前景色（普通文字、`ls -lGg`、150–200 行输出及滚动态）。「最不利」为对文字最不利的背景分位对比度。

| 组合 | 实测对比度 | 最不利 | viewport 空白区 vs 内边距条带平均亮度 | 判定 |
|---|---|---|---|---|
| 毛玻璃 + 跟随系统（本机解析为浅色），极光 | 15.85–16.28；滚动态 15.01–16.34 | 12.19–15.85；12.87–14.89 | 0.839 vs 0.828；亮度 < 0.02 的像素 0% | 默认文字通过 |
| 毛玻璃 + 显式浅色，极光 | 15.85–16.28；滚动态 16.14–16.34 | 12.19–15.85；14.55–14.73 | 0.839 vs 0.828；0% | 默认文字通过 |
| 毛玻璃 + 浅色，背景「无」 | 16.75 | 12.85–16.75 | 0.855 / 0.855 | 默认文字通过 |
| 毛玻璃 + 深色，极光 | 14.85–15.39；滚动态 15.11–15.78 | 12.15–14.92；12.58–13.28 | 0.0104 vs 0.0120 | 默认文字通过 |
| 毛玻璃 + 深色，背景「无」 | 14.01 | 11.30–14.01 | 0.0169 / 0.0169 | 默认文字通过 |
| 纯色 + 浅色 | 16.87 | 13.02–16.87 | #ffffff 均匀 | 默认文字通过 |
| 纯色 + 深色 | 13.63 | 11.17–13.63 | #212121 均匀 | 默认文字通过 |

「跟随系统」只覆盖本机当前的浅色（`AppleInterfaceStyle` 不存在）；系统深色下的跟随路径未测，不能为验证而改用户的系统外观。窗口截图中毛玻璃材质的背景在「无」时为均匀灰，后方桌面内容对材质的影响无法在用户机器上独立变化，只记录实际截到的像素。

证据：[glass-light](W5-terminal-glass-light-r2.png)、[glass-light-scroll](W5-terminal-glass-light-scroll-r2.png)、[glass-light-none](W5-terminal-glass-light-none-r2.png)、[glass-dark](W5-terminal-glass-dark-r2.png)、[glass-dark-none](W5-terminal-glass-dark-none-r2.png)、[solid-light](W5-terminal-solid-light-r2.png)、[solid-dark](W5-terminal-solid-dark-r2.png)、[bottom-row](W5-terminal-bottom-row-glass-dark-r2.png)。

### F6 结论

F6 的原现象（浅色毛玻璃下深色文字叠在黑色 viewport 上）在 16:36 构建关闭：`.terminal-screen`、`.xterm`、`.xterm-viewport`、`.xterm-screen` 计算背景均为 `rgba(0,0,0,0)`，scrollable 元素 inline 背景为 `rgba(0,0,0,0)`（纯色为 `rgb(255,255,255)` / `rgb(33,33,33)`），viewport 空白区与内边距条带亮度差 0.011，无黑色填充。四个主题组合默认文字对比度不低于 13.63（最不利不低于 11.17）。

这只关闭 F6 本身，不代表 Terminal 可用：下面 W5-F3 阻塞 ANSI 颜色、字体、光标、选区和滚动条。

### W5-F3：生产 CSP 阻断 xterm 运行时样式（阻塞）

来源：[Tools §3 FR-TOOL-004](../../../specs/tools/spec.md)（可用的 xterm 终端、ANSI / 光标状态）。

复现：构建后启动，打开 Project 与 Terminal，运行 `printf '\e[31mRED\e[0m \e[1;32mBOLD GREEN\e[0m \e[7mREV\e[0m ...'` 及 `CLICOLOR_FORCE=1 ls -lG`，再拖选一行文字，观察光标与滚动条。预期：ANSI 着色与反显，IBM Plex Mono 12px 等宽，可见光标、选区、滚动条拇指。实际：

- 所有 ANSI span 计算色均为 `rgb(13,13,13)`（继承应用文字色），`REV` 无反显，`ls` 目录无颜色。
- `.xterm-rows` 字体为 `"IBM Plex Sans" 14px`（比例字体，`ls -l` 列不对齐），期望的是 mono 12px。
- 光标元素宽度 0、背景透明（不可见）；选区层 `position: static`、背景透明，拖选后无高亮；滚动条 slider 背景透明（滚动位置无指示）。

原因与证据：生产 CSP（`electron.vite.config.ts` 的 `CSP_PRODUCTION`）为 `style-src 'self'`，开发 CSP 为 `'unsafe-inline'`。xterm 6.0.0 DOM renderer 在运行时创建 3 个 `<style>`（主题 / 行样式约 55 KB、`span{display:inline-block;…}`、scrollbar slider），全部 `sheet === null`。新建一个终端即收到 24 次 `style-src-elem` 与 17 次 `style-src-attr` 的 `securitypolicyviolation`。xterm.mjs 中没有 nonce 支持（`nonce` 出现 0 次）。因果验证（诊断，不计入验收）：把被阻断 `<style>` 的文本经 `document.adoptedStyleSheets` 重新应用后，字体变为 IBM Plex Mono 12px，RED 为 `rgb(204,0,0)`，光标为 7.2px 实心块，见下面诊断截图。该缺陷只在 build / 打包出现，`pnpm dev` 不出现，基于构建产物的 Playwright E2E 没有覆盖。

建议（技术方案，安全取舍由人决定，见报告第 5 项）：给主窗口 CSP 增加 `style-src-elem 'unsafe-inline'`（脚本仍为 `script-src 'self'`，与已使用的开发 CSP 一致），并在 E2E 增加断言：构建产物中某 ANSI span 的计算色不等于继承色、`document.styleSheets` 含 xterm 规则。备选的 WebGL addon 不能解决 scrollbar 的 `<style>`，不推荐。

### W5-F4：F3 修复后才会出现的主题缺陷（诊断预测，需在 F3 修复后确认）

诊断方法：F3 的 `<style>` 文本经 constructable stylesheet 重新应用，不是对当前构建的通过 / 失败判定。证据：[glass-light](W5-terminal-diag-styles-glass-light-r2.png)、[selection](W5-terminal-diag-selection-glass-light-r2.png)、[glass-dark](W5-terminal-diag-styles-glass-dark-r2.png)。

- 毛玻璃浅色：theme.background 为 `#00000000`，xterm 由此推导出的选区背景为 `rgb(0,0,0)`，选中文字 `#0d0d0d` 叠在黑条上为 1.08:1（不可读）；反显 `REV` 为黑块黑字 1.08:1。深色毛玻璃与纯色的选区 / 反显方向恰好可读（选区 15.5 / 13.38 / 10.54:1，反显 18.76 / 16.87 / 13.63:1）。
- 主题未设置 ANSI 调色板，使用 xterm 默认色：浅色毛玻璃 BOLD GREEN 1.31、YELLOW 2.08、CYAN 2.95（纯色浅色 1.58 / 2.50 / 3.50）；深色毛玻璃 RED 2.69、BLUE 2.84、BRIGHT-BLACK 2.38（纯色深色 2.60 / 2.67 / 2.20）。`ls` 目录蓝色在深色约 2.7:1。均低于 WCAG 小字 4.5:1。
- 建议（未验证）：theme.background 使用不透明基色，并用 CSS `!important` 保持 viewport / scrollable 透明；为浅 / 深各提供显式 ANSI 调色板。

### W5-F5（候选）：终端网格高于容器

当前构建中 `stty size` 为 35×78，xterm 内容区 651px，35 行 ×19px = 665px，多出 14px；`.terminal-screen`（`overflow:hidden`）的 `scrollTop` 在切换外观 / 聚焦后变为 5，造成顶部内边距丢失、末行贴底（末行底部约 1px 被裁，见 [bottom-row](W5-terminal-bottom-row-glass-dark-r2.png)）。渲染视口缩到 1100×640 后为 26×54，26×19=494 > 491px。很可能与 F3 同根（行高 / 字体来自被阻断的 CSS），F3 修复后须重测，不单独要求修复。

### 终端连续性与附着（当前构建）

| 场景 | 结果 |
|---|---|
| Terminal 2 运行 30 次 tick，期间切到 Terminal 1 标签、切到 Browser 工具再回来 | `bg tick 1`–`30` 与 `TICKS-DONE` 连续，无缺无重 |
| 运行中关闭右侧工具、约 7 s 后重新打开 | `hide tick 1`–`20` 与 `HIDE-DONE` 连续 |
| 打开 Project Two，两个 Project 来回切换 | 各自屏幕保持，互不串入；隐藏 Project 的 Terminal 仍挂载在 DOM |
| 200 行输出 → 切 Browser → 回 Terminal → Shift+PageUp | 回滚历史 `sb line 1`–`35` 连续 |
| 渲染视口 1100×640 再恢复 1280×800 | PTY 与 xterm 同步为 26×54 → 35×78，旧内容与提示符连续；仅模拟渲染视口，原生窗口未 resize |
| 切标签 / 切工具后立即输入 | 字符完整、无重复；CLI 延迟下无法观察「就绪前被拒绝」的窗口，gate 拒绝路径未单独验证 |
| 关闭 Terminal 3：取消 / 结束并关闭 | 取消保留；确认后标签消失，shell 子进程减少 |

观察：打开设置、改外观、关闭后，Terminal 滚动位置回到底部（重新附着），内容未丢，不计缺陷。用户默认 zsh 提示符里的 powerline 字形显示为方块，未保留截图，不计缺陷。

### Browser（当前构建，毛玻璃浅色）

- 无 CSS 的 `/bare` 页面区域为纯白（`min = max = 1.0`，平均 RGB 255,255,255），无黑色 / 不透明异常 viewport，见 [bare](W5-browser-bare-glass-light-r2.png)。
- 设置弹层（640×520，居中）完整可见，弹层期间原生 view 隐藏；关闭后页面恢复，焦点回到设置入口按钮，见 [overlay](W5-browser-settings-overlay-r2.png)。
- Browser → Terminal → Browser：切到 Terminal 时 view 被移除（该区域显示终端文字，平均亮度 0.826），切回 Browser 白页恢复；Terminal 的 xterm textarea 获得焦点，立即输入有效。
- F5 在本构建复验：Set Project Marker 触发 reload，Load 1 → 2；Local Next Page 为 `/next`（Load 3，地址栏同步）；302 外站重定向出现提示，Cancel 后保持 `/next` / Load 3，提示消失，无 loading / failed，见 [prompt](W5-browser-redirect-prompt-r2.png)、[cancel](W5-browser-redirect-cancel-r2.png)。页面 `require` / `process` / `window.studio` 均为 `undefined`。外站提示出现期间原生 view 被隐藏，提示下方为透明玻璃。

### 诊断注入范围

仅在 F3 / F4 诊断中把被 CSP 阻断的 xterm `<style>` 文本经 `document.adoptedStyleSheets` 重新应用，并在诊断结束后清除。上面「当前构建结果矩阵」、连续性和 Browser 结果均无注入。

### 副作用与清理

- 第一条命令在切换到无历史 shell 之前输入，已写入用户 `~/.zsh_history` 一行（`unset precmd_functions; PROMPT='$ '; RPROMPT=''; clear`，约第 1134 行）。未改动用户历史文件，交由人决定是否删除。
- Electron、fixture、HTTP 服务、PTY 子进程均已结束，CDP 端口已释放，agent-browser 会话已关闭；临时目录在会话 scratchpad，不在仓库内。承接自上一轮的两个 w5-* agent-browser 会话已先关闭。

### 未覆盖

系统深色下的「跟随系统」；原生窗口真实 resize（含 Browser view bounds）；真实桌面壁纸变化对毛玻璃的影响；Project 关闭、应用退出、Session Stop；打包应用；真实 CLI。

## Part 2 复验（2026-10-13 18:00–18:45，W5 续）

范围：W5-F3 修复（`c02f7a6`）在真实构建上的关闭检查；真实 xterm 样式生效后的完整外观矩阵；W5-F5 复测。未修改源码、`acceptance.md`、`task.md`、`plan.md`；未测 Project 关闭、应用退出、Session Stop 与工具释放路径。

### 基线与方法

- 构建：18:01:00 `pnpm --filter @ai-studio/desktop build`（HEAD `c02f7a6`，工作区仅有文档改动）；已核对产物 `index.html` 的 CSP 含 `style-src 'self'; style-src-elem 'self' 'unsafe-inline'`。
- 运行：与 Part 1 相同的 fixture（[W5-gui-fixture-theme.mjs](W5-gui-fixture-theme.mjs)），CDP 9387。共启动三次实例，用于复现首个终端的网格问题：第一次与第三次（全新 userData）打开 Project 后点击 Terminal；第二次沿用第一次的 userData（终端随会话恢复创建）。所有 Project / Terminal / 设置操作经 agent-browser 在真实 UI 完成，每次启动后的第一行输入都是行首空格的 `exec zsh -f`（见「副作用」）。
- 截图只取应用窗口自身（`screencapture -x -o -l<windowId>`），每张保留的图均已查看；度量方法同 Part 1，新增 [W5-terminal-probe-r3.js](W5-terminal-probe-r3.js)、[W5-measure-r3.mjs](W5-measure-r3.mjs)、[W5-cursor-blink-r3.mjs](W5-cursor-blink-r3.mjs)、[W5-terminal-geometry-r3.js](W5-terminal-geometry-r3.js)、[W5-csp-trace-r3.js](W5-csp-trace-r3.js)、[W5-style-attr-scan-r3.js](W5-style-attr-scan-r3.js)，汇总见 [W5-theme-measurements-r3.json](W5-theme-measurements-r3.json)。[W5-theme-helpers-r3.sh](W5-theme-helpers-r3.sh) 由本轮执行的临时脚本合并而成，只做了 `zsh -n` 语法检查，未整体重跑。
- 注入范围：本轮没有向页面注入样式。唯一的页面侧介入是只读观察：监听 `securitypolicyviolation`，并包装 `Element.prototype.setAttribute`（仅 `style` 时记录调用栈后原样转发），用来定位违规代码。
- 本机系统外观在运行中由 macOS 自动切到 Dark（`AppleInterfaceStyle = Dark`，非本轮操作），因此最后一个 cell 实测了「跟随系统」在系统深色下的路径。

### 1. W5-F3 关闭检查

| 检查项 | 结果 |
|---|---|
| 注入的 `<style>` 均有 `sheet` | 通过：3 个（105 / 54 811 / 267 字符）`hasSheet = true`，所有 cell 和三个实例一致 |
| `style-src-elem` 违规 | 0 次（全程只收到 `style-src-attr`） |
| 行字体 | `"IBM Plex Mono" 12px`（`.xterm-rows` computed） |
| ANSI 颜色 / 粗体 / 反显 | 生效：ANSI 0–15、粗体（computed 700）、反显、`ls` 颜色均为各自 computed 色，见下文矩阵 |
| 光标块可见 | 通过：块光标与背景对比 13.63–16.87 |
| 光标闪烁 | 未通过：见 W5-F7 |
| 选区层可见 | 选区元素存在且有背景（`position: absolute`），但可见性 / 可读性不足：见 F4 / W5-F8 |
| 滚动条拇指可见 | 通过：滚动态可见，拇指对轨道对比 1.44–2.07（偏弱，见 W5-F8） |

#### 剩余 `style-src-attr` 违规（第一个实例 58 次，全新实例启动时已有 27 次）

- 来源只有一处：xterm DOM renderer 的 `Vt._addStyle`（构建产物 `TerminalScreen-Baw5eWV2.js:3474:7`，即 `t.setAttribute("style", …)`），目标全部是 `<span>`。58 次调用与 58 次违规一一对应（叶子帧完全相同）。
- 触发源：24 位真彩色前景 / 背景（`38;2` / `48;2`，写成 `style="color:#rrggbb"`、`background-color:#rrggbb`），另有 `minimumContrastRatio` 调整（同一函数，产物第 3438 / 3451 / 3468 行；当前 `minimumContrastRatio` 为默认 1，未触发）。第一个实例的启动阶段 17 次违规来自用户自己 zsh 提示符的渐变色，未输入任何内容时就已发生。
- 对全文档扫描 `[style]` 元素（[W5-style-attr-scan-r3.js](W5-style-attr-scan-r3.js)）：声明未生效的只有真彩色 span；`textarea` 宽度 7.20513 与 7.20312 是亚像素舍入，与 CSP 无关。应用其他区域（Files / Diff / Browser / 设置弹层）没有被阻断的 `style` 属性。
- 有可见缺陷：24 位色全部丢失，见 W5-F6。256 色（`38;5`、`48;5`）与 SGR 58 下划线颜色走类名 / CSSOM，不受影响。

### 2. 外观矩阵（真实 xterm 样式生效）

数据均来自窗口截图像素与 computed 前景色；「名义」为 computed 前景色对实测背景中位色，ANSI span 的测得值与名义值相差不超过 0.3，完整数据见 JSON。带 `*` 的低于 4.5:1。每个 cell 的场景：普通文字、ANSI 0–15、粗体 + 0–7、反显、`ls -lGg`、拖选一行、150 行输出并滚动。

#### 默认文字、光标、选区、滚动条

| 组合 | 默认文字实测 | 最不利背景 | 滚动态 | 光标 vs 周围 | 选区背景 / 与周围 | 选中文字 | 滚动条拇指 vs 轨道 |
|---|---|---|---|---|---|---|---|
| 毛玻璃浅色（极光） | 14.54–16.43 | 12.99–15.98 | 16.16–16.44 | 16.58 | `#000000` / 17.73 | 1.08* | 1.47 |
| 毛玻璃浅色，背景「无」 | 15.30–16.75 | 13.32–16.75 | 16.75 | 16.75 | `#000000` / 18.10 | 1.08* | 1.46 |
| 毛玻璃深色（极光） | 13.60–15.80 | 11.37–15.55 | 15.07–15.78 | 15.84 | `#1a1a1a` / 1.01* | 15.55 | 2.06 |
| 毛玻璃深色，背景「无」 | 11.77–14.01 | 10.71–14.01 | 14.01 | 14.01 | `#1a1a1a` / 1.11* | 15.55 | 2.07 |
| 毛玻璃 + 跟随系统（系统为 Dark） | 12.91–15.43 | 11.23–14.58 | 14.90–15.75 | 15.13 | `#1a1a1a` / 1.02* | 15.55 | 1.84 |
| 纯色浅色 | 15.36–16.87 | 14.21–16.87 | 16.33–16.87 | 16.87 | `#e6e5e0` / 1.26* | 13.39 | 1.44 |
| 纯色深色 | 11.66–13.63 | 10.85–13.63 | 13.38–13.63 | 13.63 | `#343434` / 1.29* | 10.54 | 2.03 |

默认文字全部满足 4.5:1。「选区背景与周围」「滚动条拇指」是非文字元素，WCAG 1.4.11 建议至少 3:1，列出供判断。F6 的 viewport 黑底没有回归：各 cell 的 viewport 空白区与内边距条带平均亮度差不超过 0.03（毛玻璃 cell 不超过 0.02），浅色 cell 中亮度低于 0.02 的像素不超过 0.1%（为文字笔画），没有黑色填充。

#### ANSI 调色板（名义对比度，普通字重；粗体 + 0–7 渲染为亮色 8–15，同色同值）

| 色号 | 毛玻璃浅 | 浅 / 无 | 毛玻璃深 | 深 / 无 | 纯色浅 | 纯色深 |
|---|---|---|---|---|---|---|
| 0 黑 | 10.47 | 10.90 | 1.32* | 1.24* | 12.65 | 1.27* |
| 1 红 | 4.89 | 5.07 | 2.90* | 2.67* | 5.89 | 2.74* |
| 2 绿 | 2.93* | 3.04* | 4.89 | 4.44* | 3.53* | 4.56 |
| 3 黄 | 2.08* | 2.16* | 6.92 | 6.26 | 2.51* | 6.42 |
| 4 蓝 | 4.96 | 5.11 | 2.93* | 2.65* | 5.93 | 2.72* |
| 5 洋红 | 5.53 | 5.67 | 2.63* | 2.38* | 6.58 | 2.45* |
| 6 青 | 2.95* | 3.03* | 4.85 | 4.46* | 3.52* | 4.57 |
| 7 白 | 1.22* | 1.26* | 11.55 | 10.75 | 1.46* | 11.03 |
| 8 亮黑 | 6.01 | 6.30 | 2.28* | 2.15* | 7.31 | 2.20* |
| 9 亮红 | 3.46* | 3.61* | 4.00* | 3.75* | 4.18* | 3.85* |
| 10 亮绿 | 1.34* | 1.39* | 10.67 | 9.72 | 1.61* | 9.97 |
| 11 亮黄 | 1.04* | 1.07* | 13.93 | 12.63 | 1.24* | 12.96 |
| 12 亮蓝 | 2.32* | 2.39* | 6.27 | 5.66 | 2.77* | 5.81 |
| 13 亮洋红 | 2.78* | 2.84* | 5.30 | 4.76 | 3.29* | 4.89 |
| 14 亮青 | 1.35* | 1.38* | 10.69 | 9.80 | 1.60* | 10.06 |
| 15 亮白 | 1.01* | 1.00* | 14.68 | 13.50 | 1.16* | 13.86 |
| `ls` 目录（蓝 4） | 5.01 | 5.11 | 3.04* | 2.65* | 5.93 | 2.72* |
| 反显默认 `\e[7m` | 1.08* | 1.08* | 18.76 | 18.76 | 16.87 | 13.63 |
| 反显红 `\e[7;31m` | 3.42* | 3.42* | 3.42* | 3.42* | 6.14 | 2.62* |
| 反显绿 `\e[7;32m` | 6.04 | 6.04 | 6.04 | 6.04 | 3.48* | 4.63 |

低于 4.5:1 的色号数：浅色（毛玻璃 / 纯色）各 11 / 16，毛玻璃深色 6 / 16（背景「无」时 8 / 16），纯色深色 6 / 16。浅色下 ANSI 7、15（白）与 11（亮黄）基本不可见，深色下 ANSI 0（黑）、8（亮黑）同样几乎不可见。

#### 对 Part 1 W5-F4 预测的确认 / 修正

| 预测项 | 结论 |
|---|---|
| 毛玻璃浅色选区为黑块、选中文字 1.08:1 | 确认：选区背景 `rgb(0,0,0)`，文字 `#0d0d0d`，1.08:1（含背景「无」），见 [selection](W5-terminal-glass-light-selection-r3.png) |
| 毛玻璃浅色反显为黑块黑字 1.08:1 | 确认：`REV-DEFAULT` 背景 `#0d0d0d`、文字 `#000000`，1.08:1；反显红 3.42:1 同样低于 4.5 |
| 浅色下 ANSI 黄 / 绿 / 青 / 亮黑等对比不足 | 确认并细化：见上表。预测中的 BOLD GREEN 1.31、YELLOW 2.08、CYAN 2.95 与本轮 1.34、2.08、2.95 一致；亮黑在浅色为 6.0，并不低 |
| 深色毛玻璃 / 纯色下红、蓝、亮黑偏低 | 确认：2.9 / 2.9 / 2.3（毛玻璃深）、2.7 / 2.7 / 2.2（纯色深） |
| 深色与纯色的选区「方向恰好可读」 | 部分修正：选中文字对比 10.5–15.6 没问题，但选区底色与周围只差 1.01–1.29:1，几乎看不到选区，见 W5-F8 |
| 纯色浅色反显 16.87、深色 13.63 | 确认 |

F4 的各项现在都是实测事实，不再是预测；修复方向见 W5-F8 与调色板建议。

### 3. W5-F5 复测：网格高于容器（确认，比 Part 1 更严重；与 F3 无关）

| 状态 | 视口 | 行数 × 行高 | 网格高 vs xterm 内容区 | 末行 / 光标行 |
|---|---|---|---|---|
| 全新启动后的第一个终端，第一次实例 | 1280×800 | 37 × 19 | 703 vs 651，网格底 836，容器裁剪线 792 | 最后约 2.3 行被裁，填满屏幕后提示符和光标整行不可见，[截图](W5-terminal-first-terminal-37rows-clipped-glass-light-r3.png) |
| 全新启动后的第一个终端，第三次实例（新 userData） | 1280×800 | 37 × 18（PTY `37 78`） | 666 vs 651，网格底超出裁剪线 7px | 光标行 [781,799] 超出 792，被裁，[截图](W5-terminal-first-terminal-37rows-clipped-fresh-instance-r3.png) |
| 第二个终端 / 重新附着 / 窗口触发过 refit | 1280×800 毛玻璃 | 35 × 19 | 665 vs 651，超出裁剪线 6px（`scrollTop` 0） | 光标行 [779,798]，被裁 6px，[截图](W5-terminal-default-size-35rows-clipped-glass-light-r3.png) |
| 同上，输入后 | 1280×800 毛玻璃 | 35 × 19 | `scrollTop` 变 5，超出 1px | 顶部内边距丢 5px，光标行底部裁 1px |
| 纯色 | 1280×800 | 35 × 19 | 665，容器 675，网格底 798 < 800 | 完整可见 |
| 较小视口（渲染进程模拟 1100×640 与 1024×640） | 毛玻璃 | 26 × 19 | 494 vs 491，裁剪线 632，网格底 627 | 光标行完整可见 |

- 与 Part 1 描述的差别：Part 1 说「切换外观后 `scrollTop` 变 5」不准确。本轮实测切换外观和点击终端都不改变 `scrollTop`（保持 0），触发它的是输入（光标行靠近底部时浏览器为露出 helper textarea 滚动 `overflow:hidden` 的容器）。
- Part 1 推测它与 F3 同根（行高来自被阻断的 CSS）：已被反驳。样式生效后网格仍高于容器，且第一个终端更糟，是独立缺陷。
- 第一个终端的网格由「首次 fit 时 IBM Plex Mono 还未加载」的时机决定（实测：全新实例里 Mono 字体两个文件都是 `unloaded`，打开 Terminal 后才 `loaded`；首个终端 37 行，之后 resize 重新 fit 变为 35 × 19）。这是依据现象的推断，没有改源码验证；行高 18 与 19 两次不同，说明结果依赖时序。
- 修复方向（只建议）：fit 后的行数应由 DOM 行高（整数像素）整除并向下取整，使 `rows × rowHeight ≤ 容器内容高度`；在 `document.fonts` 的 Mono 字体加载完成后重新 fit；保证 `.terminal-screen` 不能因焦点滚动（例如为 helper textarea 固定位置，或把 `overflow:hidden` 容器的 `scrollTop` 复位）。

### 4. 新缺陷

#### W5-F6：24 位真彩色前景 / 背景被 `style-src-attr` 阻断（主要）

来源：[Tools §3 FR-TOOL-004](../../../specs/tools/spec.md)（ANSI / 光标状态的终端显示）。

复现：Terminal 内执行 `printf '\e[38;2;255;0;0mRGB-FG-RED\e[0m \e[48;2;0;128;0m\e[38;2;255;255;255m RGB-BG-GREEN \e[0m \e[38;5;208mIDX-208-ORANGE\e[0m\n'`。预期：红字，白字绿底，橙字。实际：前两段 span 带 `style="color:#ff0000;"`、`style="background-color:#008000;color:#ffffff;"`，但 computed 色为默认 `rgb(13,13,13)`、背景透明；`IDX-208-ORANGE` 正常为 `rgb(255,135,0)`，见 [截图](W5-terminal-truecolor-dropped-glass-light-r3.png)。违规来源与数量见第 1 节。

影响：使用 24 位色的 CLI（`bat`、`delta`、`eza`、powerlevel10k / starship 这类提示符，现代 TUI）整体丢色；用户自己的 zsh 提示符启动时就触发。只丢前景或背景之一时可能出现可读性问题（例如调色板黑字叠在被丢弃的真彩色亮底上），这一点是推论，未实测。

修复方向（只建议，不实现）：
1. 推荐：给 `style-src-attr` 增加 `'unsafe-inline'`，与 `c02f7a6` 对 `style-src-elem` 的取舍同类，且 VS Code workbench 也如此。风险增量很小（`script-src`、`img-src`、`connect-src`、`font-src` 仍为 `'self'`），但属于安全取舍，需人确认。
2. 不放宽 CSP 的备选：在 Terminal 容器上用 `MutationObserver` 监视 `style` 属性并用 CSSOM（`el.style.cssText = …`，不受 CSP 约束）重新应用；是 workaround，要防回环并增加重绘开销。
3. 不推荐：换 WebGL renderer（不再写 span 的 `style`，但换渲染器风险大，滚动条的 `<style>` 已由 `c02f7a6` 覆盖）。
4. 无论哪种，都应加 E2E：构建产物里打印一个真彩色 span 并断言其 computed 色。

#### W5-F7：光标不闪烁（次要，规格未要求闪烁）

复现：Terminal 获得焦点且在底部，间隔 0.1–0.2 s 轮询 `.xterm-cursor`（第一个实例 40 次约 8 s，全新实例 50 次约 7 s）。预期：`TerminalScreen.tsx:32` 设置了 `cursorBlink: true`，光标应交替出现 / 消失。实际：`.xterm-cursor` 始终存在，没有 `xterm-cursor-blink` 类，`document.getAnimations().length` 为 0；8 帧窗口截图的光标对比度均为 16.58。

可能原因（读代码，未在运行时验证）：`restoreTerminalEmulatorState` 把无头模拟器的 `options.cursorBlink`（默认 false）写回渲染端 xterm（`apps/desktop/src/shared/tools/terminal.ts:398`：`model.options.cursorBlink = blink`），覆盖了应用设置的 `true`。

修复方向：附着恢复只应用 `cursorBlinkOverride`（DECSET 12 的私有模式），不要覆盖 `options.cursorBlink`；或者让主进程无头模拟器的该选项与 UI 一致。是否需要闪烁光标是产品可见行为，规格 [Tools](../../../specs/tools/spec.md) 没有规定，需人决定（保持常亮也可接受，但目前的代码意图是闪烁）。

#### W5-F8：选区高亮几乎不可见，滚动条拇指偏弱（次要，毛玻璃浅色的选区见 F4）

复现：在任意外观下拖选一行文字。实际：选区底色与周围对比毛玻璃深色 1.01:1（背景「无」1.11:1）、纯色浅色 1.26:1、纯色深色 1.29:1，用户几乎看不到选中了什么；毛玻璃浅色则是黑块 + 黑字（F4，1.08:1）。滚动条拇指 `rgba(…,0.2)` 对轨道只有 1.44–2.07:1。

修复方向：为浅 / 深各显式设置不透明度足够的 `selectionBackground`（对周围 ≥ 3:1，同时选中文字 ≥ 4.5:1），并处理 F4 中透明 `theme.background`（`#00000000`）导致 xterm 推导出黑色选区 / 反显色的问题，例如主题使用不透明基色并用 CSS `!important` 保持 viewport 与 scrollable 透明（未验证）。调色板同理应分别提供浅色与深色的 ANSI 16 色；不要依赖 `minimumContrastRatio`，它也经过被阻断的 `_addStyle`，在 F6 修复前无效。

### 5. 未覆盖与限制

- 窗口缩小只用渲染进程视口模拟（`agent-browser set viewport`），原生窗口尺寸未变；真实窗口 resize、Browser 视图 bounds 未测。
- 闪烁判断基于 DOM 轮询和窗口截图，没有用 OS 级事件验证窗口是否被遮挡。
- F6 中「只丢一半颜色导致不可读」是推论，没有实测；`minimumContrastRatio` 路径没有触发。
- Browser、Project 关闭 / 应用退出 / Session Stop、打包应用、真实 CLI 本轮不在范围内。
- 系统外观自动切到 Dark 后才得到跟随系统深色的数据；系统浅色时的跟随结果来自 Part 1 与本轮第一个 cell（毛玻璃浅色）。

### 6. 副作用与清理

- 本轮没有向用户的 `~/.zsh_history` 写入任何记录：每个实例打开 Terminal 后的第一行都是行首空格的 `exec zsh -f`，之后在无历史 shell 中操作；结束时按本轮命令特征词（`exec zsh -f`、`fill line`、`scroll line`、`ANSI-`、`RGB-FG`、`stty size`、`CLICOLOR_FORCE`、`link-to-a`）只读 `grep` 计数为 0。Part 1 遗留的那一行（第 1134 行附近）未动。
- 过程中误用 Shift+End 滚动，xterm 把 `CSI 1;2F` 发给了 shell，在无历史 shell 中表现为提示符处多出 `;2F` 字符，无副作用。
- 三个 Electron 实例、fixture、本机 HTTP 服务、PTY 子进程、agent-browser 会话均已结束（`ps` 与监听端口复查无残留）；临时目录在会话 scratchpad，不在仓库内。
- 新增证据文件见上文链接；截图均为应用窗口自身，没有全屏截图。

## Part 3 复验（2026-10-14 08:38–09:05，W5 续）

范围：W9 的 `2223dad`（Terminal 适配 / 主题）在最终基线上的 GUI 复验：W5-F5 网格适配、W5-F4 / W5-F8 外观矩阵、此前观察项的回归、Browser 快速回归，以及最终基线的独立自动化复跑。未修改源码、`task.md`、`plan.md`；未测 Project 关闭、应用退出、Session Stop 与工具释放路径。`acceptance.md` 已按最终基线重写（W5 是其单一写入者），见 [acceptance.md](../acceptance.md)。

### 基线与方法

- 构建：08:39:04 `pnpm --filter @ai-studio/desktop build`（HEAD `2223dad`；工作区仅有文档 / 规格 / 任务记录改动，`git diff HEAD -- apps packages` 只有 `apps/desktop/README.md`）。
- 运行：同一 fixture（[W5-gui-fixture-theme.mjs](W5-gui-fixture-theme.mjs)），共两个全新 userData 的实例（矩阵实例；最终构建的回归实例），CDP 9388；首个终端的时间线在两个实例里各采样一次。从第一行开始使用无历史 shell：每个实例打开 Terminal 后第一行输入都是行首空格的 ` exec zsh -f`；结束后只读 `grep` 本轮命令特征词计数为 0。
- 截图只取应用窗口自身（`screencapture -x -o -l<windowId>`），保留的图均已查看；度量方法与 Part 2 相同（[W5-measure-r3.mjs](W5-measure-r3.mjs) + 新的 [W5-terminal-probe-r4.js](W5-terminal-probe-r4.js)）。新增工具：[W5-first-fit-sampler-r4.js](W5-first-fit-sampler-r4.js)（页面内每 25 ms 只读采样首个终端的字体 / 行数 / 滚动状态）、[W5-live-state-r4.js](W5-live-state-r4.js)（外观切换前后状态）、[W5-resize-trace-r4.js](W5-resize-trace-r4.js)、[W5-theme-helpers-r4.sh](W5-theme-helpers-r4.sh)（本轮执行脚本的合并版，仅 `zsh -n` 检查）。汇总见 [W5-theme-measurements-r4.json](W5-theme-measurements-r4.json)。
- 注入范围：仅有只读观察（`securitypolicyviolation` 监听、包装 `Element.prototype.setAttribute` 记录 `style` 调用栈、页面内采样器）。PTY resize IPC 调用次数页面内不可见：`window.studio` 与 `window.studio.terminal.resize` 都是冻结的不可写属性（`W5-resize-trace-r4.js` 返回 `not writable`）。改用 shell 内 `trap … WINCH` 记录 PTY 实际尺寸变化的次数。
- 系统外观：本次运行期间 macOS 为浅色（`AppleInterfaceStyle` 不存在），因此「跟随系统」只覆盖浅色；没有改动用户的系统外观，深色系统路径沿用 Part 2 的实测（见未覆盖）。

### 1. W5-F5 复测：网格与容器

首个终端时间线（页面内采样器，两个全新实例各一次）：

| 项 | 实例 1 | 实例 2 |
|---|---|---|
| 终端出现前（约 2.4 s）Mono 字体状态 | `400:unloaded / 500:loaded` | 同 |
| 首个含终端的采样 | t=2485 ms：`400:loaded / 500:loaded`，34 行 × 19px，xterm screen 547×646，host 567×651，wrapper / host `scrollTop` 0 / 0 | t=2530 ms：同值 |
| 之后的几何变化 | 无（只有一个不同的几何状态，没有 37 行 / 18 px 之类的中间状态） | 无 |
| `stty size` | `34 76` | `34 76` |

可见终端出现之前采样器看不到 xterm 的内部状态，所以「首次 fit 那一刻的字体状态」只能说：首个能观察到的终端已经在 Mono 加载完成后以最终网格出现。

| 视口（渲染进程尺寸） | 主题 | 行 × 行高 | screen / host（宽 × 高） | 网格底 vs 容器裁剪线 | PTY | 光标行 | `scrollTop`（wrapper / host） |
|---|---|---|---|---|---|---|---|
| 1280×800 | 毛玻璃 | 34 × 19 = 646 | 547×646 / 567×651 | 779 vs 792（host 底 784） | 34 76 | [760,779] 完整可见 | 0 / 0 |
| 1280×800 | 纯色 | 34 × 19 | 554×646 / 575×659 | 779 vs 800 | 34 77 | 完整可见 | 0 / 0 |
| 1100×640、1024×640 | 毛玻璃 | 25 × 19 = 475 | 367×475 / 387 或 383 × 491 | 608 vs 632 | 25 51 | [589,608] 完整可见 | 0 / 0 |
| 1100×640、1024×640 | 纯色 | 26 × 19 = 494 | 374 或 367 × 494 / 395 或 383 × 499 | 627 vs 640 | 26 52、26 51 | [608,627] 完整可见 | 0 / 0 |

- 在 1280×800 毛玻璃下执行：填满屏幕、输入、点击聚焦、浅色 → 深色 → 跟随系统的外观切换，`scrollTop` 在四种情形后仍为 0 / 0，wrapper 与 host 的 computed `overflow` 均为 `clip`，网格行数 / 行高 / 光标行不变，见 [1280×800](W5-terminal-fit-glass-1280x800-r4.png)、[1100×640](W5-terminal-fit-glass-1100x640-r4.png)。
- PTY 尺寸变化（shell 内 `trap WINCH`）：视口改为 1100×640 恰好一次（26 52），改为 1024×640 一次（26 51），重复设为 1024×640 没有；回 1280×800 一次（34 77）；毛玻璃 ↔ 纯色因为窗格宽度不同（76 ↔ 77 列）各一次；浅色 ↔ 深色没有。首个终端的「80×24 → 76×34」一次 resize 因 IPC 不可观测未能直接验证，只能确认首个终端出现后不再有尺寸变化。
- 与 W9 预测对照：1280×800 毛玻璃 34 行 × 19 = 646、网格底约 779、76 列、547px 宽 screen 在 567px 窗格内，均与预测一致；毛玻璃小视口 25 行与预测一致；纯色小视口为 26 行（纯色窗格更高，host 499px），不是 25 行。
- 结论：**W5-F5 关闭**（首个终端的 37 行 / 18–19px 问题、5px `scrollTop`、光标行被裁均不再出现）。

### 2. W5-F4 / W5-F8 外观矩阵（真实像素）

场景与 Part 2 相同，新增失焦后的非活动选区（点击聊天输入框使 xterm 失焦，选区保留）。「选区对周围」为选区块与其外圈背景的对比，「选中文字」为文字色对选区背景。

| 组合 | 默认文字 | 最不利背景 | 滚动态 | 光标（活动 / 非活动轮廓） | 选区对周围 / 选中文字 | 非活动选区 | 滚动条拇指对轨道 |
|---|---|---|---|---|---|---|---|
| 毛玻璃浅色 + 跟随系统（极光） | 13.32–16.44 | 11.16 | 15.94–16.41 | 16.60 / 16.60 | 2.89 / 5.68 | 2.79 / 5.88 | 4.04 |
| 毛玻璃浅色，背景「无」 | 13.71–16.75 | 11.59 | 16.52–16.75 | 16.75 / 16.75 | 2.95 / 5.68 | 2.85 / 5.88 | 4.19 |
| 毛玻璃深色（极光） | 13.31–15.82 | 11.45 | 14.98–15.68 | 16.08 / 15.88 | 3.31 / 4.68 | 3.33 / 4.64 | 4.85 |
| 毛玻璃深色，背景「无」 | 11.80–14.05 | 10.59 | 13.93–14.05 | 14.05 / 14.05 | 3.00 / 4.68 | 3.03 / 4.64 | 4.53 |
| 纯色浅色 | 17.40–19.44 | 15.15 | 19.44 | 19.44 / 19.44 | 3.42 / 5.68 | 3.31 / 5.88 | 4.86 |
| 纯色深色 | 12.30–14.38 | 11.17 | 14.38 | 14.38 / 14.38 | 3.07 / 4.68 | 3.10 / 4.64 | 4.63 |

- 低于 4.5:1 的文字：默认文字、ANSI 0–15（含粗体）、选中文字、非活动选中文字名义值都高于 4.5。单个「最不利」像素估计中有两项略低：非活动选区文字在毛玻璃深色「无」为 4.45、纯色深色为 4.42（名义 4.64）。
- ANSI 调色板（名义对比度）：浅色毛玻璃最小 6.01（亮红，ANSI 9），背景「无」最小 6.25，纯色浅色最小 7.25；深色毛玻璃最小 6.77（红，ANSI 1），背景「无」最小 6.19，纯色深色最小 6.34。粗体 0–7 取亮色 8–15，同值。完整 16 色 + 粗体 + 反显数据见 JSON。
- 反显：默认反显浅色 19.44、深色 14.38；反显红 9.16 / 6.25，反显绿 9.37 / 6.43；Part 2 中毛玻璃浅色的黑块黑字（1.08:1）已消失。
- 毛玻璃透明：窗格空白区与内边距条带的平均亮度差 0.004–0.018（≤ 0.03），`.xterm-viewport` 与 `.xterm-scrollable-element` 的 computed 背景在每个 cell 都是 `rgba(0,0,0,0)`（xterm 内联不透明背景被 `!important` 覆盖），不存在不透明矩形。
- 实时切换（回归实例，终端有内容且光标可见）：浅色毛玻璃 → 深色毛玻璃 → 深色纯色 → 浅色纯色 → 跟随系统，每一步可见行文本、光标位置、滚动条几何均与切换前相同（[W5-live-state-r4.js](W5-live-state-r4.js)），默认前景色、ANSI 1 / 4、反显背景的 computed 色即时变化（如 `rgb(13,13,13)` ↔ `rgb(242,242,242)`、`rgb(152,4,22)` ↔ `rgb(255,123,114)`）。有 150 行滚动历史时内容仍在（拇指高度 143/646 不变，Shift+PageUp 6 次回到第一条命令行）；关闭设置弹层后视口回到底部，是重新附着的既有行为，不计缺陷。注意：首次尝试时我自己安装的 `trap WINCH` 会在毛玻璃 ↔ 纯色切换时往屏幕里多打印 `WINCH …` 行，去掉后行文本完全一致。
- 与 W9 预测逐项对照：

| W9 预测 | 实测 | 结论 |
|---|---|---|
| ANSI ≥ 4.8（浅，毛玻璃）/ ≥ 4.7（深，毛玻璃） | 最小 6.01–6.25 / 6.19–6.77 | 确认（预测偏保守） |
| 默认文字 12.99–16.4（浅）、10.7–15.8（深） | 浅 13.32–16.75；深 10.59–15.82（最不利像素 10.59） | 确认（浅色上界略高 0.35） |
| 选中文字约 5.7（浅）/ 4.7（深） | 5.68 / 4.68；非活动 5.88 / 4.64 | 确认 |
| 选区对周围约 2.3–3.4（毛玻璃）、3.43（浅纯色）、3.08（深纯色） | 2.89、2.95、3.31、3.00；3.42；3.07；非活动 2.79–3.33 | 确认，均在预测范围内 |
| 滚动条拇指 3.3–4.9（浅）、3.4–4.6（深） | 4.04–4.86；4.53–4.85 | 确认（毛玻璃深色 4.85 略高于预测上界） |

W5-F4 与 W5-F8 在默认文字、ANSI 前景、选区、反显、滚动条上**关闭**。选区对周围在毛玻璃浅色（2.79–2.95）仍低于 WCAG 1.4.11 建议的 3:1，属 W9 提交说明里声明的「可读优先」取舍，不算缺陷。

### 3. 此前观察项的回归

- 24 位真彩色仍被丢弃（预期，W5-F6 待人工决定）：`RGB-FG-RED` 的 computed 色仍为 `rgb(13,13,13)`，`RGB-BG-GREEN` 背景透明；256 色 `38;5;208` 正常。
- 光标：活动时为块光标，约 7 s 内 45 次轮询均存在、无 blink 类、`document.getAnimations()` 为 0，仍然不闪烁（与 W9「W5-F7 是 headless DECSCUSR 状态，不算缺陷」的判断不矛盾：这是现象，不是规格要求）；失焦后是 `xterm-cursor-outline` 轮廓，边缘对比 14.05–19.44。
- 选区引起的 `style-src-attr`：每次拖选会为被选 span 写入 `style="background-color:#698eb3"`（浅色活动）、`#868e96`（浅色非活动）、`#516e95`（深色活动）、`#696d71`（深色非活动），均来自同一个 `Vt._addStyle`（`TerminalScreen-DRQZf66K.js:3474:7`），被 CSP 阻断；没有可见缺陷，因为 `.xterm-selection` 图层自己绘制高亮，像素测得的选区对比与预测一致。整个矩阵实例共 33 次违规事件，全部是 `style-src-attr`，`style-src-elem` 为 0，3 个 xterm `<style>` 均有 sheet。
- Browser 快速回归（矩阵实例）：无 CSS 的 `/bare` 页面区域纯白（`min = max = 1.0`）；Set Project Marker 触发 reload（Load 1 → 2）；Local Next Page 为 `/next`（Load 3，地址栏同步）；302 外站重定向出现提示，取消后保持 `/next` / Load 3；设置弹层（320,140，640×520）完整覆盖原生页面区域；页面 `require` / `process` / `window.studio` 仍为 `undefined`。见 [overlay](W5-browser-settings-overlay-r4.png)、[prompt](W5-browser-redirect-prompt-r4.png)、[cancel](W5-browser-after-cancel-r4.png)。
- Terminal 连续性回归（最终构建，回归实例）：Terminal 2 的 30 次输出在切到 Terminal 1、Browser 再回来后连续（1–30 + `TICKS-DONE`）；隐藏右侧面板期间 40 次输出，重新打开时已到 22 且连续，结束后完整（9–40 可见，`HIDE-DONE`）；200 行输出后切 Browser 再回来，Shift+PageUp 回到第一行（`sb line 1…`，连续）；切换后立即输入无丢失 / 重复；两个 Project 终端互不串入且来回切换保持；关闭 Terminal 2 取消保留、确认后标签消失、shell 进程减少。

### 4. 新缺陷

#### W5-F9（主要，与 W5-F6 的人工决定相关）：ANSI 彩色背景上的文字不可读

来源：[Tools §3 FR-TOOL-004](../../../specs/tools/spec.md)（终端可读的 ANSI 显示）；W9 提交说明只声明了 `30;47` 一类黑白背景组合的低对比取舍，实际范围大得多。

复现：Terminal 内执行 `printf '\e[41mDEF-ON-RED\e[0m \e[44;97mBRWHITE-ON-BLUE\e[0m \e[43;30mBLACK-ON-YELLOW\e[0m \e[46;30mBLACK-ON-CYAN\e[0m \e[47mDEF-ON-WHITE\e[0m \e[41;37mWHITE-ON-RED2\e[0m\n'`。预期：各色块上的文字清晰（≥ 4.5:1）。实际（像素实测，名义 / 测得）：

| 组合 | 纯色浅色 | 纯色深色 |
|---|---|---|
| 默认前景 + 红底 (`41`) | 2.12 | 2.30 |
| 默认前景 + 绿底 (`42`) | 2.07 | 2.24 |
| 亮白 + 蓝底 (`44;97`) | 1.23 | 2.53 |
| 黑 + 黄底 (`43;30`) | 1.59 | 1.04 |
| 黑 + 青底 (`46;30`) | 1.62 | 1.19 |
| 默认前景 + 亮黑底 (`100`) | 1.86 | 1.97 |
| 默认前景 + 白底 (`47`) | 2.34 | 1.76 |
| 白 + 红底 (`41;37`) | 1.10 | 1.31 |
| `1;37;41`（矩阵场景） | 1.26（毛玻璃浅色同） | 2.58 |
| `30;47`（矩阵场景） | 1.77 | 1.25 |

见 [浅色](W5-terminal-solid-light-bgpairs-r4.png)、[深色](W5-terminal-solid-dark-bgpairs-r4.png)。按调色板值计算：两种配色里「ANSI 0–15 前景 × ANSI 0–7 背景」的 120 个组合全部低于 4.5:1，默认前景对 0–7 背景为 1.33–2.34（浅）/ 1.75–2.27（深）。原因是新调色板把每个颜色都调成与窗格背景对比 ≥ 4.5，同一个颜色用作背景时就与前景互相接近。影响：`htop`、`tmux` 状态栏、`mc`、带背景色的 diff / 错误徽标、反色以外的高亮等凡是使用彩色背景的程序都会难以阅读；只用前景色和反显的输出（`ls`、`grep`、`git`、`less`）不受影响。

修复方向（只建议，不实现）：xterm 的做法是 `minimumContrastRatio`（默认 VS Code 为 4.5）逐单元格调整前景色，这是标准解法，但它和 24 位色一样经 `Vt._addStyle` 写内联 `style`，必须先有 W5-F6 的 `style-src-attr` 决定才可用；因此建议与 F6 作为同一个人工决定处理。不放宽 CSP 的话，只能在「前景用途」和「背景用途」之间折中调色板（无法同时满足），或接受彩色背景程序不可读的限制。

### 5. 最终基线独立自动化复跑

摘录见 [W5-run-2223dad.log](W5-run-2223dad.log)：W4 套件 25 passed；W5 套件 4 passed / 1 failed（`W5-shutdown.test.ts` 是有意保留的历史复现，will-quit 最后防线在特性清理拒绝后仍调用 `disposeCore` 并 quit，真正的保护是 QuitFlow 的批准前释放，对应的 `W5-quit-runtime.test.ts` 3 项与 `W5-idle-runtime.test.ts` 通过）；W8 套件 98 passed（首次运行 97 / 98，`W8-differential` 的 `recoveryReason` 为 `cleanup_timeout` 而基线是 `cleanup_failed`，在系统负载均值约 5 时出现；该文件单独重跑 3 次、全套再跑 2 次均通过，按时序抖动处理，没有进一步追查）；`pnpm test` 36 + 241 + 357 = 634 passed；`pnpm typecheck` 无错误（它会重新构建 Adapter `dist/`，git 忽略，源码未变）。

### 6. 未覆盖与副作用

- 未覆盖：真实窗口的原生 resize 与 Browser 视图 bounds（小视口为渲染进程模拟）；系统深色下的「跟随系统」（本次运行系统为浅色，深色路径见 Part 2）；首个终端的 PTY resize IPC 次数（不可观测）；Project 关闭、应用退出、Session Stop 的 GUI 路径；打包应用；真实 CLI 与模型链路；`minimumContrastRatio` 与 24 位色的修复验证（待人工决定）。
- 副作用：本轮没有写入用户 `~/.zsh_history`（本轮命令特征词计数 0；Part 1 遗留的一行仍在，未动）。`pnpm typecheck` 重新生成了 git 忽略的 `packages/agent-adapter/dist/`。两个 Electron 实例、fixture、PTY 子进程、agent-browser 会话都已结束并复查无残留。

## Part 4 复验（2026-10-14 09:08–09:50，W5 续）

范围：最终基线上此前没有独立结果的 Project 关闭、应用退出、Session Stop（带工具）GUI 路径，以及打包应用。HEAD `2223dad` 加仅含文档的未提交 diff；开发构建仍是 08:39:04 的 `out/`；打包应用是主 Agent 在 09:05 构建的 `apps/desktop/dist/mac-arm64`（我没有运行 `pnpm package`）。未修改源码、`task.md`、`plan.md`。

### 方法与说明

- fixture：[W5-gui-fixture-lifecycle.mjs](W5-gui-fixture-lifecycle.mjs)（复制自主题 fixture，不改旧文件）。注入范围：目录选择器 stub（依次返回 4 个临时 Project 目录）、本机回环 HTTP 页面、`STUDIO_E2E_PROVIDERS=1` 的模拟 Session Provider；另有只监听 127.0.0.1 的控制端口：`POST /menu-quit`（主进程点击 `role: 'quit'` 菜单项）、`POST /app-quit`（主进程 `app.quit()`，与实现者 e2e 相同，用作对照）、`POST /probe-quit-events`（只读登记 before-quit / will-quit / quit 监听并写日志）、只读的 `/menu`、`/webcontents`。所有 Project / Terminal / Browser / Session 操作仍由 agent-browser 经真实 UI 完成，终端里第一行都是行首空格的 ` exec zsh -f`。
- 进程判断全部按精确 PID + 启动时间：[W5-proc-tree.mjs](W5-proc-tree.mjs) 记录 Electron 主进程的全部后代，[W5-proc-alive.mjs](W5-proc-alive.mjs) 判断是否仍是同一进程且存活（应用自己周期性执行的瞬时 `/bin/ps` 探测不计）。快照汇总见 [W5-lifecycle-processes-r5.json](W5-lifecycle-processes-r5.json)；`lsof` 按监听 PID 与端口核对服务是否仍在；预览视图是否释放用 CDP target 列表与主进程 `webContents` 列表（只读）核对。
- 模拟 Provider 的长回合触发词是 `[e2e:slow]`；`[long]` 不会让回合保持运行（0.5 s 内完成）。实现者 `runtime-tools.spec.ts` 里仍使用 `[long]` 后立即期待 Stop 按钮，属于靠竞态通过的写法，记作测试卫生提示，不算产品缺陷。模拟 Provider 在进程内，没有 CLI / Runtime 子进程，所以「退出后没有 CLI / Runtime 孤儿进程」这一条在本机只能证明桌面端没有留下 PTY / 服务 / Electron 子进程；Adapter 侧由 W8 套件覆盖，真实 CLI 链路仍未执行。
- 关于「通过真实应用菜单项触发 Quit」：主进程里 `Menu.getApplicationMenu()` 找到 `Quit AI Developer Studio [quit]` 后调用 `item.click()`，在 3 个实例上都没有触发 `before-quit`（探测日志为空；应用保持运行 15 s 以上），而同一实例上 `app.quit()` 会立刻产生 `before-quit` / `will-quit` / `quit` 并在 1 s 内退出。macOS 上该调用只是把 `terminate:` 发给第一响应者，在这个无焦点的测试环境中没有到达应用，因此不是应用缺陷。为了仍然验证真实菜单项，我在先只读确认 Accessibility 可用后，使用 System Events 按精确 PID 点击菜单项（不是按键，只作用于该 PID 的进程）：`click menu item "Quit AI Developer Studio" of menu 1 of menu bar item 2 of menu bar 1`，每次都能看到 `before-quit` 日志。这偏离了「只用主进程点击」的安排，是因为后者无效；没有使用任何全局按键。

### 1. Project 关闭（带工具）

Instance 1：W5 Alpha = Terminal 1（前台 node 服务，PID 75268，端口 61852）+ Terminal 2（空闲提示符）+ Browser 预览该服务 + 运行中的 `[e2e:slow]` Session；W5 Bravo 同样（Terminal 1 zsh 76476 → node 76669，端口 62380；Terminal 2 zsh 76688；预览；运行中 Session）。

| 步骤 | 结果 |
|---|---|
| 点击 Alpha 标签的关闭按钮 | 只出现一个合并确认：`关闭 W5 Alpha？ / 1 个对话仍在运行或等待你的输入。当前一轮将停止，对话记录会保留。 2 个终端尚未退出，终端及其运行的命令将结束。`，列表为 Alpha 的 Session、Terminal 1、Terminal 2（空闲提示符的 Terminal 2 也列出），见 [对话框](W5-project-close-merged-dialog-r5.png) |
| 取消 | 弹层消失、标签不变；12 个已记录进程全部仍是同一进程且存活；两个服务都返回 HTTP 200；CDP 里两个预览 target 都在；Alpha 的 Session 仍在运行（Stop 按钮、转圈）；预览仍显示 `ALPHA-SERVICE`；Terminal 2 能继续输入，见 [取消后](W5-project-close-cancel-intact-r5.png) |
| 确认「关闭并停止」 | 只关闭 Alpha：Alpha 的 zsh 75087、zsh 75282、node 75268 与 Alpha 预览渲染进程 75755 都不存在；`127.0.0.1:61852` 不再监听；CDP 与 `webContents` 里 Alpha 预览消失。Bravo 的 zsh 76476、zsh 76688、node 76669 与预览渲染进程 77513 仍存活，服务 200，Session 仍在运行，预览仍显示 `BRAVO-SERVICE`，Terminal 2 输入有效，见 [Bravo](W5-project-close-other-project-intact-r5.png) |
| 从最近打开重开 Alpha | 该 Session 显示「Worked for 2m 47s · 已停止」，历史保留 |

变体与最后一个 Project：

- 仅终端（重开的 Alpha 里只有一个登录 shell `/bin/zsh -l`，PID 78550）：确认框只列 `1 个终端尚未退出` 与 Terminal 1；取消后 78550 存活，确认后 78550 消失，Bravo 的 PID 不变。该截图里的终端提示符含系统用户名，没有保留截图，只保留文字记录。
- 仅 Session（W5 Charlie，未打开 Terminal，没有任何终端进程）：确认框只列 `1 个对话仍在运行…` 与该 Session，见 [对话框](W5-project-close-session-only-dialog-r5.png)；取消后 Stop 仍在、标签保留；确认后只关闭 Charlie，Bravo 的 PID 不变。
- 关闭最后一个 Project 标签（W5 Bravo，3 个终端 + 服务 + 预览）：确认框列出 3 个终端；确认后 Bravo 的 zsh 76476 / 76688 / 79741 与 node 76669 全部消失，服务端口不再监听，`webContents` 只剩应用窗口；应用回到启动页并保持响应（控制端口仍 200），见 [启动页](W5-project-last-tab-closed-r5.png)。

### 2. Session Stop（带工具）

W5 Bravo 有 2 个终端（含前台 node 服务）与预览，点击 Stop：Session 变为「Worked for 2m 58s · 已停止」；zsh 76476、zsh 76688、node 76669 仍是同一进程且存活，服务 HTTP 200，CDP 里预览 target 仍在并显示 `BRAVO-SERVICE`，见 [截图](W5-session-stop-tools-intact-r5.png)。随后终端输入的结果见第 5 节 W5-F10（终端重新附着失败与 Stop 无关）。

### 3. 应用退出（真实菜单项）

| 情形 | 结果 |
|---|---|
| (a) 2 个 Project：1 个运行中 Session + 3 个终端（Alpha 的 Terminal 1 前台服务 / Terminal 2 空闲；Bravo 的 Terminal 1 空闲，prompt-only） | 一个合并确认：`2 个 Project 中有 1 个活动对话及 3 个未退出终端。…`，列出 Session 与 3 个终端，见 [对话框](W5-quit-merged-dialog-r5.png)。取消：弹层消失，9 个已记录进程存活，服务 200，预览 target 在，Session 仍在运行，Bravo 终端可输入。再次从菜单退出并确认「停止并退出」：约 1 s 内 Electron 主进程退出，`closed.json` 写入；已记录的 9 个进程（含 3 个 shell、node 85439、各 Electron 子进程）全部消失，命令行含实例根目录的进程为 0，端口不再监听，fixture 随之退出 |
| (b) 仅终端：1 个空闲 shell + 1 个在运行 `sleep 5555` 的 shell | 确认框列出两个终端（`1 个 Project 中有 2 个未退出终端`）；取消后 86797、86981、`sleep` 87165 均存活，终端可输入；确认后 7 个已记录进程全部消失（含 `sleep 5555`） |
| (c) 无终端、无运行中 Session（只有一个已完成的 Session） | 菜单 Quit 之后没有任何确认弹层，`before-quit` 后约 0.15 s 应用退出，4 个已记录的 Electron 进程全部消失。另在启动页（没有 Project）用 `app.quit()` 也在 1 s 内退出 |
| 打包应用（1 个 Project、1 个终端、1 个服务 + 预览） | 菜单 Quit 出现 `1 个 Project 中有 1 个未退出终端` 确认，见 [对话框](W5-packaged-quit-dialog-r5.png)；取消后 shell 与服务存活（HTTP 200）；确认后约 1 s 内退出，7 个已记录进程全部消失 |

### 4. 打包应用（独立运行）

- `pnpm smoke:packaged`（2026-10-14 09:10，用的是 `apps/desktop/dist/mac-arm64`，`app.asar` 09:05:36）：`Result: PASS`，报告 [W5-packaged-smoke-r5.json](W5-packaged-smoke-r5.json)：SQLite（`node:sqlite`，首次迁移 3 项、第二次 0 项、读回成功，SQLite 3.53.4）、PTY（`/bin/zsh` 收到标记，退出码 0，92 ms）、`terminalScreen`（`serializedMarker: true`，状态版本 1，xterm 6.0.0）、登录 Shell 环境解析（`login-shell`，505 ms，21 个 PATH 项）、Renderer（`app://studio`、顶栏已渲染、无 Node 全局变量、preload API 可用）均 ok；同时发现本机 Codex 0.162.1 与 Claude 2.1.296，没有调用模型。
- 打包应用可以驱动：fuse 关闭了 `runAsNode` 与 Node inspect 参数，但 Chromium 的 `--remote-debugging-port` 仍然有效。直接启动二进制并传 `--studio-user-data-dir=<临时目录> --remote-debugging-port=9391`（userData 是实例 6 留下目录的副本，应用启动时由会话恢复自动出现 Project 标签），agent-browser 经 CDP 连接；窗口 ID 用 JXA 按拥有者 PID 过滤读取（只读窗口元数据），截图仍是 `screencapture -l`。没有注入目录选择器 stub，也没有模拟 Provider（打包产物忽略 `STUDIO_E2E_PROVIDERS`），所以没有创建任何 Session，没有模型调用。
- 打包应用里的 Terminal：生产 CSP 含 `style-src-elem 'self' 'unsafe-inline'`；3 个注入的 `<style>` 都有 sheet；字体 IBM Plex Mono 12px；红色 `rgb(152,4,22)`、粗体绿 700 / `rgb(4,99,37)`、反显 `rgb(255,255,255)` on `rgb(13,13,13)`、256 色 `rgb(255,135,0)`、块光标可见；18 次 `style-src-attr` 违规来自启动时用户 shell 的真彩色提示符（F6 的既有现象），无 `style-src-elem` 违规。见 [截图](W5-packaged-terminal-r5.png)。
- 打包应用里的 Browser：Terminal 里启动的 node 服务（端口 49888）在预览中显示 `PKG-SERVICE`（页面区域纯白），设置弹层覆盖原生视图，见 [预览](W5-packaged-browser-r5.png)、[弹层](W5-packaged-settings-overlay-r5.png)。

### 5. 新缺陷

#### W5-F10（主要，阻塞终端的重新附着）：终端列数缩小后 `terminal:attach` 永久失败

来源：[Tools §3 FR-TOOL-004 §2](../../../specs/tools/spec.md)（PTY 与屏幕在隐藏 / 重新挂载后可重新附着）。

GUI 复现（Instance 1 中的 W5 Bravo、W5 Delta 各一次）：

1. 打开 Project，右侧栏打开 Terminal（窗格约 583px，PTY 76×34），在终端里输入若干命令。
2. 在同一个 Project 里 New Chat 并发送 `[e2e:slow] …`：对话列打开，右侧窗格变窄（约 400px）；再点 Terminal 工具时第一次重新附着成功，PTY 变为 51×34（`window.studio.terminal.list` 返回 `cols: 51`）。
3. 切到另一个 Project 标签（或启动页）再切回：Terminal 区显示 `无法恢复终端：Error: Error invoking remote method 'terminal:attach': Error: Invalid terminal emulator state` 和「重新连接」按钮；点「重新连接」仍失败；旧的 xterm 画面还留在界面上，按键落到当前焦点元素（我的一次输入因此被当作聊天消息发给了模拟 Session）。同一 Project 的 Terminal 1（前台运行 node 服务，PTY 同样是 51 列）仍能附着，原因没有查明；从未被缩小的终端（Delta 在开对话之前，Terminal 1 / 2 均为 76 列）来回切换都能附着，所以触发条件是「列数缩小之后」。

对照与最小复现：[W5-resize-tabs.test.ts](W5-resize-tabs.test.ts)（W5 套件，当前基线上 1 失败 / 1 通过）：headless xterm 76×34 缩到 51×34 后，旧 tab stop 仍保留到第 72 列（输出 `max = 72`），`captureTerminalEmulatorState` 中 `tabs` 的范围校验 `number(key, 0, cols - 1)` 抛出 `Invalid terminal emulator state`；没有缩小的对照与「先 51 再放大到 76」都能 capture。默认每 8 列一个 tab stop，所以从 76 缩到 ≤ 72 列都会触发；缩到 73–75 列不会。

预期：缩小列数后仍可 capture / 重新附着。实际：此后每次附着都失败，该终端在界面里不可用，只能关闭 Tab 重建。影响：打开对话、拖动窗格分隔条、缩小窗口等常见操作之后，任何一次工具切换、Project 切换或隐藏 / 重开面板都会让已缩小的终端失去界面；PTY 与进程仍存活（Project 关闭 / 退出照常清理它们）。之前几轮没有发现，是因为附着 → 缩小 → 再附着的顺序从未出现过（缩小后没有再附着，或之后又放大）。

修复方向（只建议）：capture 时过滤 / 丢弃 `>= cols` 的 tab stop，或在 headless 终端 resize 后清理它们；同时核对 `restoreTerminalEmulatorState` 对同样数据的校验；在实现者套件里加「缩小后 capture / 附着」回归用例（本文件的用例可直接并入）；考虑 capture 失败时退化为只恢复屏幕而不是永久拒绝附着。

#### W5-F11（低）：退出确认的正文在没有对话时仍写「对话当前一轮将停止，历史保留」

仅终端的退出确认文字是 `1 个 Project 中有 2 个未退出终端。对话当前一轮将停止，历史保留；终端及其运行的命令将结束。`，没有任何活动对话却提到对话。`S.quitBody` 的结尾句子是无条件的。预期：只描述实际会发生的事。修复方向：按 sessions / terminals 是否存在分别拼接句子。

#### 观察（不计缺陷）

- 重开最后一个工具为 Terminal 的 Project（最近打开 → W5 Alpha）会立即在右栏自动创建一个运行用户真实登录 shell（`/bin/zsh -l`）的新终端，没有用户点击；这与「首次用户打开时创建」相比是由恢复的工具选择触发的，可能符合设计，提请人注意它会执行用户的 shell 启动脚本。
- 取消一次退出或关闭后，应用保持响应，QuitFlow 回到 idle，可以再次发起并确认（实测）。

### 6. 未覆盖

- 失败 / 超时路径（清理失败保留 Project 与诊断、`停止超时` / `部分资源未能停止` / `退出未完成` 的界面、重试）：GUI 里没有不注入就能触发的方法，按要求不注入，列为未覆盖；实现者测试 `tool-close.test.ts`、QuitFlow 测试与 `W5-quit-runtime.test.ts`（最终基线通过）覆盖逻辑，没有 GUI 证据。
- 真实 Codex / Claude CLI 与模型链路；真实窗口 resize 与 Browser 视图 bounds；系统深色下的跟随系统（最终基线）；系统用户真实使用的原生 `⌘Q` 键盘快捷键（只验证了菜单项点击，没有使用按键）。
- 实现者自检（不计入独立结论）：根 worktree `pnpm check:code` 绿（脚本 36、Adapter 241、桌面 357）、实现者运行的 E2E 40/40 与 `pnpm smoke:packaged` 在 `2223dad` 通过；本轮独立运行了 `pnpm smoke:packaged`，其余没有重复运行。

### 7. 副作用与清理

- 没有写入用户 `~/.zsh_history`（本轮命令特征词只读 `grep` 计数 0；Part 1 遗留的一行仍在，未动）。
- 6 个开发实例与 1 个打包实例都已结束并按精确 PID 复核无残留；fixture、本机 HTTP / 控制服务、agent-browser 会话已清理。一次 agent-browser 在目标退出后自动「relaunched browser」，复查无遗留浏览器进程。
- 没有保留含系统用户名的截图（仅终端的关闭确认与重开的 Alpha 截图已删除）。

## Part 5 复验（2026-10-14 14:14–14:37，W5 续）

范围：F10（`a76528f`）与 F11（`f06ba98`）修复后的独立复验。基线：HEAD `f06ba98` 加仅含文档的未提交 diff（`apps/desktop/README.md`、`docs/`、`scripts/README.md`、`specs/`、`tasks/T20261009-context-tools/{task,plan}.md`，另有未跟踪的 `acceptance.md` 与 `evidence/`）；`apps/**/src` 与 `packages/**` 没有未提交改动。开发构建：`pnpm --filter @ai-studio/desktop build` 完成于 14:14:22（`out/main/index.js` 14:14:20）。未修改源码、`task.md`、`plan.md`，没有运行 `pnpm test:e2e`、`pnpm dev`、`pnpm package`。**退出触发方式：本轮只用主进程 `app.quit()`（fixture 控制端口 `POST /app-quit`），随后在界面里点击确认；没有使用 `osascript` / System Events，也没有使用任何全局按键。** 因此本轮没有重做「真实菜单项」这一条（Part 4 已做）；两条路径进入同一个 QuitFlow，确认框正文由同一函数生成。

### 1. W5-F10：独立 GUI 复验（通过）

fixture 与 Part 4 相同（[W5-gui-fixture-lifecycle.mjs](W5-gui-fixture-lifecycle.mjs)，目录选择器 stub、本机回环预览页、模拟 Provider、回环控制端口），所有操作经 agent-browser 点击真实 UI；每个终端的第一行是行首空格的 ` exec zsh -f`。辅助脚本：[W5-gui-helpers-r6.sh](W5-gui-helpers-r6.sh)、[W5-ab-wrapper-r6.sh](W5-ab-wrapper-r6.sh)。

**实例 1（W5 Alpha，Terminal 1，自定义 tab stop：`tabs 4; tput cup 0 70; tput hts`）**

- 默认布局 PTY 76×34（窗格 584px）；新建 `[e2e:slow]` Session 后对话列打开，窗格 400px，PTY 变为 `stty size` = 34 51，终端重新附着成功。这是 Part 4 触发 F10 的完全相同序列，本轮没有任何「无法恢复终端」。
- 14 次「Terminal → 别的工具 / 启动页标签 → 回来」往返，每次都无错误、画面保留、输入落在终端；`stty size` 随窗格变化：51；回到 Overview 布局再选 Terminal 为 76；对话列分隔条最小 / 最大与渲染进程视口 1024×640 / 1280×800 扫描得到 60 / 87 / 52 / 51 / 86 列，每个档位附着后都无错误。
- alternate screen：`less /etc/hosts` 与 `vim -u NONE -n /etc/hosts` 运行中，窗格缩窄 / 放宽并切换工具 3 次 / 2 次再附着：屏幕恢复正确，`q` / `:q!` 退出后 shell 正常，`stty size` 34 60 / 34 87。
- 隐藏终端被缩放：Terminal 2 在隐藏期间保持 87 列，窗格缩到 60 列后切回，附着无错误并在附着时变为 60 列；自定义 tab stop 行为正常；再放宽并附着也正常。
- Browser ↔ Terminal 工具切换与右侧面板隐藏 / 重开各 3 次（60 列）无错误。
- 默认尺寸的网格适配回归（Part 3 结果）：34 行 × 19px = 646px，光标行完整可见，`scrollTop` 0。

**实例 2（两个 Project：W5 Bravo 与 W5 Alpha，各一个终端，Project 标签切换）**

- 6 轮 Alpha ↔ Bravo 标签往返，每次切回后输入 `stty size` 都得到 `34 51`，`.runtime-tool__error` 均不存在。
- 右侧栏宽度按 Project 独立（Alpha 520px、Bravo 320px）：Alpha 拉宽到 520（67 列）→ 切到 Bravo 缩窄到 320（40 列）→ 切回 Alpha 仍 67 列，附着无错误；再把 Alpha 缩窄到 320（67 → 40 列，F10 的触发条件）并在 Alpha / Bravo 之间往返 3 轮：每轮 `.runtime-tool__error` 均不存在，输入有效；再拉宽到 560（73 列）并再次往返，终端仍可附着，tab 输出正常（`34 73`）。
- 截图（只含该窗口，终端是 `zsh -f` 的安静提示符，无用户名）：[W5-two-project-narrow-switch-r6.png](W5-two-project-narrow-switch-r6.png)（已查看）、[W5-terminal-narrow-reattach-r6.png](W5-terminal-narrow-reattach-r6.png)（已查看）。

**独立自动化复验（无 GUI）**

- `pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W5-vitest.config.ts`：5 个文件、13 项，12 通过、1 失败；失败只是 `W5-shutdown.test.ts`（历史上有意保留的红色，`will-quit` 最后防线，见缺陷表 W5-F1）。其中 [W5-resize-tabs.test.ts](W5-resize-tabs.test.ts) 2 / 2 通过（修复前基线 `2223dad` 为 1 失败 / 1 通过）。
- 新增 [W5-resize-attach-r6.test.ts](W5-resize-attach-r6.test.ts)（6 项，用真实终端服务与假 PTY，覆盖邻近场景）：默认 tab stop 76 → 51 后附着 3 次再放宽 76 并输入 Tab；`tabs 4` 式密集 stop；在 220 列的第 200 列设 HTS 后缩到 80 列再附着；最小宽度 2 到最大 500 逐档缩放并每档附着；缩窄时处在 alternate screen；隐藏期间被缩放后再附着。f06ba98 上 6 / 6 通过（运行两次）。**变异检查**：对 `git archive 2223dad` 导出的修复前代码运行同一文件，6 项全部失败（外加 `W5-resize-tabs` 的缩列用例失败），说明这些用例能区分修复前后。
- `pnpm check:code`（独立运行，exit 0）：脚本 36、Adapter 241、桌面 359 全通过，与实现者自检一致；类型检查无错误。

结论：F10 在 GUI（Part 4 的触发序列、14 次往返、两个 Project、alternate screen、隐藏终端、最小 / 最大宽度）与差分测试上都没有再现，**W5-F10 关闭**。

### 2. W5-F11：退出 / 关闭确认文字（通过）

Project 关闭确认与应用退出确认都在同一实例里逐一取得文字（取消后一切保持，6 个已记录进程仍存活）：

| 情形 | 确认框正文 |
|---|---|
| 关闭 Project，Session + 2 个终端 | `1 个对话仍在运行或等待你的输入。当前一轮将停止，对话记录会保留。 2 个终端尚未退出，终端及其运行的命令将结束。`（两句都在，列 Session、Terminal 1、Terminal 2） |
| 退出，Session + 2 个终端 | `1 个 Project 中有 1 个活动对话及 2 个未退出终端。对话当前一轮将停止，历史保留；终端及其运行的命令将结束。`，见 [W5-quit-both-sentences-dialog-r6.png](W5-quit-both-sentences-dialog-r6.png)（已查看） |
| 关闭 Project，仅 2 个终端（先 Stop 了 Session） | `2 个终端尚未退出，终端及其运行的命令将结束。`（没有对话句） |
| 退出，仅 2 个终端 | `1 个 Project 中有 2 个未退出终端。终端及其运行的命令将结束。`（没有对话句；Part 4 的缺陷已消失） |
| 关闭 Project，仅 Session（W5 Bravo） | `1 个对话仍在运行或等待你的输入。当前一轮将停止，对话记录会保留。`（没有终端句） |
| 退出，仅 Session | `1 个 Project 中有 1 个活动对话。对话当前一轮将停止，历史保留。`，见 [W5-quit-session-only-dialog-r6.png](W5-quit-session-only-dialog-r6.png)（已查看，没有终端句） |
| 退出，2 个 Project：1 个活动对话 + 2 个终端（实例 2） | `2 个 Project 中有 1 个活动对话及 2 个未退出终端。对话当前一轮将停止，历史保留；终端及其运行的命令将结束。`，列 Session 与两个终端 |

仅终端的退出 / 关闭确认没有截图（终端提示符是用户真实 shell 时含系统用户名；该场景只保留文字记录）。**W5-F11 关闭。**

### 3. Part 3 / 4 结果的低成本回归

- Terminal 网格适配：默认尺寸 34 行 × 19px = 646px，光标行可见，`scrollTop` 0，与 Part 3 一致。
- Project 关闭合并确认：只出现一次，列出 Session 与全部终端；取消保留所有进程；确认后 Alpha 的两个 shell（27097、29639）消失，其余已记录的 Electron 主进程与 3 个子进程保持存活（另一个 Project 没有终端，只有 Session，Session 仍在）。
- 应用退出：确认后 Electron 主进程约 1 s 内退出，`closed.json` 写入，已记录的进程全部消失，命令行含实例根目录的进程为 0；实例 2 同样（主进程 0.5 s 内退出，fixture 随之退出，两个 shell 消失，端口释放）。进程快照：[W5-lifecycle-processes-r6.json](W5-lifecycle-processes-r6.json)。

### 4. 新缺陷

没有发现新缺陷，没有 W5-F12。

观察（不计缺陷）：

- 沿用 Part 4：从最近打开重开最后一个工具为 Terminal 的 Project，会自动创建一个运行用户真实登录 shell 的终端；该终端的提示符含系统用户名，是我不保留这类截图的原因。
- 实例 2 复用了实例 1 的根目录与 `user-data`（我把新实例的根目录变量写错），因此启动时按会话恢复出现了两个 Project 标签；没有影响结论，只是起始状态由恢复而来。

### 5. 方法踩坑

- 点击左侧的 Overview 会把右侧工具切离 Terminal，之后打字会进入聊天输入框并创建聊天 Session；折叠左侧导航不会拉宽终端窗格。
- agent-browser 的 `snapshot` ref 在随后的 `tab t1` 重新固定后失效；按无障碍名称 `find role tab click --name` 点击 Project 标签才稳定。

### 6. 未覆盖与副作用

- 未覆盖（沿用）：失败 / 超时路径的 GUI；真实 Codex / Claude CLI 与模型链路；真实窗口的原生 resize 与 Browser 视图 bounds；系统深色下的「跟随系统」（本轮系统为浅色）；原生 `⌘Q` 键盘快捷键；打包应用里的 Session；实现者 E2E（3 / 3 与 40 / 40）本轮没有独立复跑（按要求不运行 `pnpm test:e2e`）。F6 / F9 / F7 仍待人工决定。
- 副作用：没有写入用户 `~/.zsh_history`（本轮命令特征词只读 `grep` 计数 0；Part 1 遗留的一行仍在第 1134 行，未动）。两个 Electron 实例、fixture、PTY 子进程、agent-browser 会话都按精确 PID 结束并复查无残留；端口 9390 已释放。`pnpm check:code` 重新生成了 git 忽略的构建产物。另停止了一个 Part 2 遗留的、已无作用的后台 shell 任务。

## Part 6 复验（2026-10-14 14:55–15:30，W5 续）

范围：用户 2026-10-14 决定放宽 `style-src-attr`（`b24ba9b` + `42a2e31`）之后，W5-F6（24 位色）与 W5-F9（彩色背景上的文字）的独立复验，以及 `minimumContrastRatio: 4.5` 可能波及的全部渲染面回归。基线：HEAD `42a2e31`（相对 `f06ba98` 的产品源码差异只有 `electron.vite.config.ts` 的 CSP、`TerminalScreen.tsx` / `terminal-theme.ts` 的 `minimumContrastRatio`、测试与 E2E；其余为文档提交 `6f05c52`、`dd399a7`）。开发构建：`pnpm --filter @ai-studio/desktop build` 完成于 **14:55:34**（`out/main/index.js` 14:55:32）；实例页面的 `<meta>` CSP 已确认为 `…style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; …`。未修改源码、`task.md`、`plan.md`；没有运行 `pnpm test:e2e`、`pnpm dev`、`pnpm package`；本轮没有 Project 关闭 / 退出测试，两个实例都通过「fixture 收到 SIGTERM → Playwright `app.close()` → 应用弹出退出确认 → 在界面里点击『停止并退出』」结束，没有使用 osascript 或全局按键。

### 方法

- fixture：[W5-gui-fixture-theme.mjs](W5-gui-fixture-theme.mjs)（目录选择器 stub、本机回环 HTTP 页面、模拟 Provider，沿用 Part 3）。实例 A（根 `w5r7a`，Electron 87131）做外观矩阵、回归与真实程序；实例 B（根 `w5r7b`，Electron 94883，全新默认窗口 1280×800）做首次 fit、纯净启动下的违规观察与 Browser / UI 检查。所有 Project / Terminal / Browser / 设置操作由 agent-browser 经真实 UI 完成，每个终端第一行是行首空格的 ` exec zsh -f`。**窗口大小说明**：实例 A 的窗口在运行中被改成了 1392×831 并移动了位置（不是我操作的，疑为用户手动调整）；A 的回归数值是相对对比度，不受影响，但「1280×800 的 34 行」只在实例 B 上测。
- 违规观察：[W5-csp-trace-r3.js](W5-csp-trace-r3.js) 在打开任何 Project 之前安装（`securitypolicyviolation` 监听 + `setAttribute('style')` 调用栈记录，只读）。
- 色彩场景：[W5-scenes-r7.mjs](W5-scenes-r7.mjs) 生成纯 ANSI 文本文件写入 Project 目录，再在终端里 `cat`（测试数据，不改变应用行为，也避免长命令被 shell 破坏）。S1 = 16 个 ANSI 前景 × 8 个 ANSI 背景（128 对，含同色对）；S2 = W5-F9 复现用例；S3a / S3b = 256 色前景 / 背景；S4 = 24 位色（前景 / 背景渐变、PASS / FIX 用例、下划线色、中亮度与同色对）；S5 = p10k 风格提示符（**模拟**，含 powerline 字符，24 位与 256 色）；S6 = htop / tmux 风格状态条（**模拟**；本机没有 htop、tmux）；S7 = 属性（加粗、dim、斜体、下划线、反显等）。真实程序：`bat`（Monokai Extended / GitHub / Dracula，24 位色）、`eza -l --color=always`、`rg --color=always`、`delta`（默认与 `--light`，24 位背景色）、`vim`（语法高亮、搜索、可视选择）；均使用 `BAT_CONFIG_PATH=/dev/null`、`delta --no-gitconfig`，不读取用户配置。
- 测量：窗口截图按窗口 ID 获取（DPR 1），[W5-terminal-probe-r7.js](W5-terminal-probe-r7.js)（r4 探针的超集，收集带 `style` 属性的 span 与 computed 颜色）+ [W5-measure-r7.mjs](W5-measure-r7.mjs)。每个有字的 span：背景取框内中位像素，墨色取距背景最远的像素（`measured`，真实像素，含抗锯齿，对细笔画 / 单字符偏保守）；`nominalCss` 为 computed 前景与 computed 背景（xterm 自己计算所用的两个颜色）；对默认（透明）背景，`nominalVsPixelBg` 用 computed 前景与实测背景像素。显示器的色彩管理会让饱和色背景的像素与 CSS 值略有差别（例如 `rgb(1,82,29)` 截成 `#225024`），所以 `measured` 与 `nominalCss` 之间有 ≤ 0.1 的系统差，单个字符的小格子差到约 0.5。回归汇总：[W5-summarize-r7.mjs](W5-summarize-r7.mjs) → [W5-color-matrix-r7.json](W5-color-matrix-r7.json)；ANSI 调色板核对：[W5-palette-check-r7.mjs](W5-palette-check-r7.mjs)（调色板从 `terminal-theme.ts` 解析）；24 位色核对：[W5-truecolor-check-r7.mjs](W5-truecolor-check-r7.mjs)；恢复前后比较：[W5-compare-spans-r7.mjs](W5-compare-spans-r7.mjs)；UI `style` 属性扫描：[W5-ui-style-scan-r7.js](W5-ui-style-scan-r7.js)；真实程序汇总：[W5-realprograms-r7.json](W5-realprograms-r7.json)；辅助脚本：[W5-gui-helpers-r7.sh](W5-gui-helpers-r7.sh)（函数库，来自 scratch，含 `cap`、`sceneRun`、`cell7`、`realrun` 等）、[W5-matrix-r7.sh](W5-matrix-r7.sh)（六个外观单元格的循环）；agent-browser 包装沿用 [W5-ab-wrapper-r6.sh](W5-ab-wrapper-r6.sh)。这些脚本里的绝对路径指向 scratch 目录，仅供复现参考。

### 1. W5-F6：24 位色与 CSP 违规（通过）

- **违规：0。** 实例 B（全新启动）从页面加载、打开 Project、首次创建 Terminal、输入、ANSI / 24 位 / 256 色场景、鼠标拖选（3 个选区层）、滚轮滚动（滚动条拇指出现）、工具与 Project 切换、设置弹层、Browser、Overview / Progress / Architecture / Agent Team / Business Flow / Files / Diff 各视图，`securitypolicyviolation` 计数始终为 0；实例 A 在六个外观单元格、活动 / 非活动选区、150 行彩色滚动、实时外观切换、隐藏 / 重新附着、Project 切换、2 万行彩色输出（不到 1 s 完成，之后渲染进程应答 20 ms）、全部真实程序期间同样为 0。Part 2 里选区会产生的 `style-src-attr` 事件已消失。没有任何剩余违规。`setAttribute('style')` 的调用栈全部来自 xterm 的 `Vt._addStyle`（span），没有应用自己的代码调用（记录上限 400 条，全部同一来源）。
- 24 位色确实生效：S4 的背景渐变 56 + 56 个单元格（色相、灰度）computed `background-color` 与请求的 rgb 逐格相等（浅 / 深各一次，0 个不符）；前景渐变（色相、灰度）里，请求色对名义背景（浅 `#ffffff` / 深 `#212121`）对比度 ≥ 4.5 的单元格原样应用，低于 4.5 的由 xterm 调整并全部达到 ≥ 4.5（浅色：色相 16 原样 + 40 调整，灰度 26 + 30；深色：色相 30 + 26，灰度 26 + 30；没有「低于 4.5 却没调整」的单元格）；PASS-A / B / C 原样应用（PASS-A 在深色下按设计被调亮）；下划线色 `58;2;r;g;b`、`58;5;n`、`4:3`（波浪线）的 computed `text-decoration-color` 与请求一致（红 / 红 / `rgb(0,160,0)` / 蓝）。Part 2 的复现语句现在：`38;2;255;0;0` 显示为 `rgb(229, 0, 0)`（纯红对白底只有 4.0:1，被调整到 4.85:1）、`48;2;0;128;0` + 白字原样。
- 真实程序与模拟输出：`bat` 三个主题、`eza`、`rg`、`delta`、`vim` 与 S5 / S6 的颜色都生效且可读，没有违规；汇总见 [W5-realprograms-r7.json](W5-realprograms-r7.json)。截图：[24 位色](W5-truecolor-glass-light-r7.png)、[p10k 风格（模拟；字体里没有 powerline 字符，显示为方框）](W5-p10k-style-glass-light-r7.png)、[bat](W5-real-bat-monokai-glass-light-r7.png)、[delta](W5-real-delta-glass-light-r7.png)。

### 2. W5-F9：彩色背景上的文字（通过；实测分布见下）

S1 的 128 对 ANSI 前景 × 背景（六个外观单元格各一次）：调整前对比度 1.00–2.02:1（128 对全部需要调整），调整后

| 外观 | 色彩空间内最小（`nominalCss`） | 真实像素最小 / 中位 | 像素 < 4.5 的对数 |
|---|---|---|---|
| 毛玻璃浅（极光 / 无）、纯色浅 | 4.50 | 4.44 / 4.69 | 5 / 128 |
| 毛玻璃深（极光 / 无）、纯色深 | 4.50 | 4.40 / 4.71 | 2 / 128 |

即 xterm 在 CSS 色彩空间里把全部 128 对调到 ≥ 4.5（0 对例外）；真实像素最差 4.40 / 4.44，比 4.5 低 0.06–0.10，来自显示色彩管理与抗锯齿，没有一对低于 4.4。完全同色的 8 对（前景 = 背景）此前文字完全不可见，现在都被调整到 4.53–5.01:1（浅色）；另 8 对近似同色（亮色前景 × 同序号普通背景，调整前 1.14–1.40:1）同样被调整。最差的几对（浅色）：f09 × b2（`rgb(227,162,174)` 于 `#01521d`）4.44、f01 × b4 4.48、f05 × b7 4.48。其余场景（`nominalCss` 最小 / 像素最小）：

- S2（`41`、`44;97`、`43;30`、`1;37;41`、`30;47` 等 14–16 个）：4.50–4.55 / 4.39–4.50。
- S3b（256 色背景 + 默认前景，256 格）：4.50 / 4.26（浅色 8 格、深色 30 格像素 < 4.5，最小 4.26，集中在饱和的洋红 / 紫色背景，同样是色彩管理造成的差）。
- S4 显式背景的 24 位对：4.50 / 3.76–4.02（单字符 `M` 的小格子被抗锯齿拉低；`nominalCss` 全部 ≥ 4.50）；中亮度与同色对：`SAME-119` → 4.52、`MID-128/100` → 4.58、`MID-90/140`（调成浅字）→ 4.52、`BLACK-ON-BLACK` → 4.82、`WHITE-ON-WHITE` → 5.25、256 色 `244 on 244` → 4.58。**没有 xterm 无法修复的组合**（对任意背景，黑 / 白两端至少有一端 ≥ 4.58）。
- S5 / S6 / S7 的显式背景段（p10k 风格、htop / tmux 状态条、反显行）：`nominalCss` 最小 4.50–4.57；powerline 分隔符与方块字符被 xterm 排除，不计（它们是形状，前景色就是相邻段的背景色）。
- 真实程序：`delta` 默认主题的增 / 删行背景（深红 / 深绿）上文字 5.29 起；`vim` 可视选择 6.16；`bat` / `eza` / `rg` 没有显式背景。
- 选区叠在彩色单元格上（活动）：选区层不透明，覆盖原背景，文字被 xterm 重新对选区背景计算：S1 三行选区内最小 4.55 / 中位 5.61，非活动选区 4.63–5.80，见 [截图](W5-selection-over-coloured-cells-r7.png)。

### 3. `minimumContrastRatio` 可能波及的回归

六个外观单元格（毛玻璃浅 / 毛玻璃浅·无 / 毛玻璃深 / 毛玻璃深·无 / 纯色浅 / 纯色深）逐项与 Part 3（[W5-theme-measurements-r4.json](W5-theme-measurements-r4.json)）对照（汇总：[W5-color-matrix-r7.json](W5-color-matrix-r7.json)）：

- 默认文字：15.15–16.44（毛玻璃浅，Part 3 为 13.32–16.44）、15.72–16.75、13.96–15.84、11.80–14.05、纯色浅 19.44、纯色深 12.30–14.38，与 Part 3 一致。
- ANSI 0–15 与加粗前景：**xterm 没有重新着色**——每个单元格 24 个 `ANSI-n` / `BOLD-n` span 的 computed color 都等于调色板值且没有内联 `color:`（0 个不符，[W5-palette-check-r7.mjs](W5-palette-check-r7.mjs)）；各 span 的实测对比度与 Part 3 相差 ≤ 0.5（多数 ≤ 0.1）。
- 光标 16.52 / 16.75 / 16.16 / 14.05 / 19.44 / 14.38（Part 3：16.6 / 16.75 / 16.08 / 14.05 / 19.44 / 14.38）；活动选区对周围 2.88 / 2.95 / 3.30 / 3.00 / 3.42 / 3.07，选中文字 5.68 / 4.68；非活动选区 2.79–3.32，文字 5.88 / 4.64；滚动条拇指 4.06 / 4.19 / 4.85 / 4.53 / 4.86 / 4.63；视口 / 可滚动元素 computed 仍是 `rgba(0, 0, 0, 0)`（毛玻璃保持透明），空白区与内边距亮度与 Part 3 相差 ≤ 0.01——全部与 Part 3 一致。
- 实时外观切换：S1 + 前景渐变在屏时 浅 → 深 → 浅：`nominalCss` 最小始终 4.50，像素最小 4.44 → 4.40 → 4.44，回到浅色后与最初一致；终端不重建、行文本不变。
- 恢复：屏幕上有 128 个彩色单元格时切换 Browser 再回 Terminal、切到另一个 Project 再回来：行文本一致，128 个彩色 span 的类、是否有 style、computed 前景 / 背景 / 下划线色逐个相同（[W5-compare-spans-r7.mjs](W5-compare-spans-r7.mjs)：0 / 0 差异），没有错误区。
- 复制：没有验证剪贴板内容（读取需要执行复制，会覆盖用户的真实剪贴板，因此不做）；选区层几何与文字未受影响（上一条），xterm 的选区文本来自缓冲区而不是 DOM 样式。
- Terminal 网格适配（实例 B，全新 1280×800）：34 行 × 19 px = 646 px，最后一行底边距裁剪线还有 13 px（无裁剪），光标行 760–779 完整可见，`scrollTop` 0，`stty size` 34 76；首次 fit 采样里有一次 13 ms 的 24 行（80×24 初始网格）瞬态，随后 34 行，`scrollTop` 全程 0，字体在 fit 前已加载，见 [截图](W5-terminal-fit-1280x800-r7.png)。
- dim（SGR 2）：渲染为 alpha 0.5 的前景，实测 2.1–2.9:1（对毛玻璃）；它不受最小对比度约束，Part 3 没有 dim 基线，所以只记录、不判定为回归。

### 4. Browser 与 UI（通过）

- Browser（实例 B）：加载本机页面（[截图](W5-browser-loaded-r7.png)）；Set Project Marker（reload）→ Load 2、Marker 写入；Local Next Page → `/next` Load 3，地址栏同步；External Redirect → 提示 `https://example.com/w5-redirect`（[截图](W5-browser-redirect-prompt-r7.png)），取消后仍为 `/next` Load 3；设置弹层 640×520 完整覆盖原生视图（[截图](W5-browser-settings-overlay-r7.png)）。
- UI 没有因 CSP 放宽而变化：[W5-ui-style-scan-r7.js](W5-ui-style-scan-r7.js) 在 Browser / Terminal / Files / Diff 工具、五个 Project 视图与设置弹层里，终端以外只有 2–3 个带 `style` 属性的元素（`main` 的 `--pane-width`、输入框 textarea 的高度、`.view-preview-document` 的 `zoom`），都是 React 通过 CSSOM 写的，与 CSP 无关；没有任何声明未生效（0 个不符）。唯一可见的变化是终端里每个 span 现在带有 `letter-spacing: 0.0098px`（xterm 的单元格宽度校正，此前被 CSP 丢弃），影响不可见。Files / Diff 仍是未实现的占位页，外观正常。

### 5. 新缺陷

**W5-F12（低～中）：默认（透明 / 毛玻璃）背景上的 24 位 / 256 色前景，调整只达到相对名义背景的 4.5:1，对真实毛玻璃背景只有 3.7–4.3:1。**
来源：[Tools §3 FR-TOOL-004](../../../specs/tools/spec.md)（`minimumContrastRatio` 取 4.5，使 ANSI / 24 位色背景上的文字按单元格调整到可读）；`terminal-theme.ts`「ANSI 对该方案的名义背景及毛玻璃实测最差背景均 ≥ 4.5:1」的设计目标。
现象：xterm 以 `theme.background`（浅 `#ffffff`、深 `#212121`，不透明名义值）计算 4.5:1，而毛玻璃浅色下默认背景的真实像素亮度约 0.80–0.85（`#e1eaee`–`#eaecee`）。S3a（256 色前景，256 格）实测对真实背景：毛玻璃浅（极光）最小 3.72、中位 4.27，190 / 256 格 < 4.5；毛玻璃浅·无 最小 3.88，157 格 < 4.5；毛玻璃深·无 最小 4.40，16 格 < 4.5；毛玻璃深（极光）最小 4.65、纯色浅 4.50、纯色深 4.50，无格 < 4.5。24 位前景渐变（S4）在毛玻璃浅色最小 3.70（单字符小格子的像素测量低至 3.2）。真实程序（毛玻璃浅·极光）：`bat` Monokai Extended 101 / 101 个文字 span < 4.5（最小 3.75，中位 3.93），Dracula 104 / 113（3.80），GitHub 37 / 107，`eza -l` 6 / 187，`delta` 默认的前景文字 4 / 8；见 [截图](W5-real-bat-monokai-glass-light-r7.png)（文字清晰但偏淡）。纯色外观与毛玻璃深（极光）没有此问题。
对比此前：这些颜色之前完全没有调整（纯黄 `255,255,0` 对白底 1.07:1），现在是改善；问题是没有达到规格声明的 4.5。
建议：把 `TERMINAL_MINIMUM_CONTRAST_RATIO` 提到约 5.5（毛玻璃浅色最差背景亮度 0.81 需要 5.49；深色最差需要约 4.92），代价是所有被调整的颜色更极端、反显文字也会按更高的比值落点（见 W5-F13）；或保持 4.5 并在规格里写明毛玻璃浅色下实测 3.7–4.3。属于视觉取舍，由用户决定。

**W5-F13（低）：反显（SGR 7）文字被压到约 4.5–5:1，比放宽前明显变灰。**
现象：同一场景（`scene`）里，反显默认色 `REV-DEFAULT` 的文字对比度：毛玻璃浅 / 纯色浅 19.1–19.4 → 4.92，毛玻璃深 / 纯色深 14.0 → 5.13；`REV-RED` 9.16 → 4.98（浅）、6.25 → 4.48（深，像素）；`REV-GREEN` 9.37 → 4.67、6.43 → 4.61；S7 的 `rev30–rev37`、`rev90–rev97`（16 个反显格）`nominalCss` 最小 4.51，同样落在 4.5 附近。computed 颜色：浅色 `REV-DEFAULT` 前景 `#818181`（原为 `#ffffff`）于 `#0d0d0d`，`REV-RED` 前景 `#bfbfbf`（原为白）于红色块；深色 `REV-DEFAULT` 前景 `#656565` 于 `#f2f2f2`。仍满足 ≥ 4.5，但 `less` 状态行、`vim` 状态栏、`htop` 选中条等常用的反显文字不再是白 / 黑，而是中灰，见 [截图](W5-reverse-video-dimmed-r7.png)。
原因（推断，未读 xterm 源码验证）：xterm 对反显单元格按「前景 = 背景」处理（结果恰好是把文字调到刚过 4.5），而不是保持原有的高对比。
建议：接受并在规格 / 验收里记录（反显仍 ≥ 4.5，F9 的收益更大）；若不接受，需要向 xterm 反馈或避免对反显单元格应用最小对比度（xterm 没有按属性的开关）。属于视觉取舍，由用户决定。

**W5-F14（低，文档漂移）：`terminal-theme.ts` 头部注释仍写「`minimumContrastRatio` is not used for the same reason」。**
第 13–15 行说 `selectionForeground` 不设置是因为生产 CSP 的 `style-src-attr` 会阻断、`minimumContrastRatio` 同理不用；现在 CSP 已放宽且 `minimumContrastRatio: 4.5` 已启用（常量在同一文件第 66 行）。`selectionForeground` 保持不设置仍由 `terminal-theme.test.ts` 断言，但理由需要改写；头部的「Criteria」也没有提到 4.5 的最小对比度及其对反显的影响。修复方向：更新注释（只需文字）。

观察（不计缺陷）：

- 字体（IBM Plex Mono）没有 powerline 字符（U+E0A0–E0D6），p10k / tmux-powerline 的分隔符显示为方框；没有字体回退设置。与本次改动无关，是否要支持 Nerd Font 属功能取舍。
- `delta` 启动时查询终端前景 / 背景（OSC 10 / 11），应用回报 `0d0d0d / ffffff`（毛玻璃下也是名义值），回复文本在 delta 退出得很快时会残留在提示符后；与本次改动无关，且再次说明 xterm 的参照背景是名义值（见 W5-F12）。
- Part 3 里「首个终端只有一个几何状态」：本轮采样器在 fit 之前抓到了一个 13 ms 的 24 行瞬态，随后 34 行；没有可见跳动（`scrollTop` 始终 0）。

### 6. 独立自动化

- `pnpm check:code`（`42a2e31`，独立运行，exit 0）：脚本 36、Adapter 241、桌面 360 全部通过（与实现者自检一致）；`W5-vitest.config.ts` 套件 13 项 12 通过，仅历史红色的 `W5-shutdown.test.ts` 失败。

### 7. 未覆盖与副作用

- 未覆盖：打包应用没有在 `42a2e31` 上重新构建 / 验证（`apps/desktop/dist` 仍是 `2223dad` 的产物，不含 `style-src-attr` 与 `minimumContrastRatio`；打包产物与开发构建共用同一份 CSP 注入逻辑，但打包形态下的 F6 / F9 没有验证）；系统深色下的「跟随系统」；真实窗口 resize；复制到剪贴板的内容；Terminal 之外 Files / Diff 的内容（未实现）；真实 Codex / Claude CLI 与模型；失败 / 超时路径的 GUI。htop / tmux / p10k 是按转义序列模拟的输出，不是真实程序。
- 副作用：没有写入用户 `~/.zsh_history`（命令特征词只读 `grep` 计数 0；Part 1 遗留的一行仍在第 1134 行，未动）。两个 Electron 实例、fixture、PTY 子进程、agent-browser 会话（含 preview 会话）都按精确 PID 结束并复查无残留，端口 9392 / 9393 / 50407 已释放；停止了两个因 heredoc 误写而挂起的后台 shell。截图没有含系统用户名（终端均为 `zsh -f` 的安静提示符；含用户 shell 提示符的画面未保留）。

## Part 7 复验（2026-10-14 18:37–19:00，W5 续）

范围：主 Agent 的 `7eea417`（`TERMINAL_MINIMUM_CONTRAST_RATIO` 提到 5.5，`terminal-theme.ts` 头部注释修订）与文档提交 `a0e7d49` 之后，W5-F12 / W5-F13 / W5-F14 的独立复测，以及打包应用（含 F6 / F9）验证。基线：HEAD `a0e7d49`（相对 `42a2e31` 的产品源码差异只有 `terminal-theme.ts` 的常量与注释、`terminal-theme.test.ts` 的断言）。开发构建：`pnpm --filter @ai-studio/desktop build` 完成于 **18:39:25**（`out/main/index.js` 18:39:23；包内 `TERMINAL_MINIMUM_CONTRAST_RATIO = 5.5`、页面 CSP 含 `style-src-attr`）；打包应用：`apps/desktop/dist/mac-arm64`，主 Agent 于 18:38:11 构建（`app.asar`）。未修改源码、`task.md`、`plan.md`；没有运行 `pnpm test:e2e`、`pnpm dev`、`pnpm package`、`pnpm smoke:packaged`。

### 方法

- 沿用 Part 6 的 fixture 与工具：[W5-gui-fixture-theme.mjs](W5-gui-fixture-theme.mjs)、[W5-scenes-r7.mjs](W5-scenes-r7.mjs)（S1–S7）、[W5-terminal-probe-r7.js](W5-terminal-probe-r7.js)、[W5-measure-r7.mjs](W5-measure-r7.mjs)、[W5-palette-check-r7.mjs](W5-palette-check-r7.mjs)、[W5-truecolor-check-r7.mjs](W5-truecolor-check-r7.mjs)；新增 [W5-compare-r8.mjs](W5-compare-r8.mjs)（4.5 → 5.5 前后对照）、[W5-matrix-r8.sh](W5-matrix-r8.sh)（六个外观单元格 + 真实程序循环）、[W5-matrix2-r8.sh](W5-matrix2-r8.sh)（其余毛玻璃背景色）。真实程序：`bat`（Monokai Extended、GitHub）、`eza -l`、`less -M -R`（状态行）、`vim`（`laststatus=2` 状态栏、搜索高亮），均不读用户配置。所有 Project / Terminal 操作经 agent-browser 点击真实 UI，每个终端第一行是行首空格的 ` exec zsh -f`。
- 实例：开发构建 A（`w5r8a`，Electron 64320，窗口 1280×800）做六个外观单元格；开发构建 B（`w5r8b`，Electron 73662）做其余毛玻璃背景色；打包应用（Electron 69016，窗口 1280×800）见第 4 节。开发实例通过「fixture 收到 SIGTERM → Playwright `app.close()` → 应用弹出退出确认 → 界面点击『停止并退出』」结束，两次都约 1 s 退出、已记录进程全部消失。
- 度量与 Part 6 相同：`nominalCss` = computed 前景对 computed 背景；默认（透明）背景上的文字用 computed 前景对真实背景像素（`nomPx`）；`px` 为真实像素的最远像素法（对细笔画 / 单字符偏低，约低 0.1–1）。对照数据：4.5 的一轮来自 Part 6（[W5-color-matrix-r7.json](W5-color-matrix-r7.json)），5.5 的一轮见 [W5-color-matrix-r8.json](W5-color-matrix-r8.json)、[W5-compare-r8.json](W5-compare-r8.json)。

### 1. W5-F12：默认背景上的调整文字（5.5 后基本达到 4.5，通过）

默认（透明）背景上的 256 色 / 24 位 / 真实程序文字，对真实背景像素的对比度（`nomPx`；括号为 4.5 时的 Part 6 数据）：

| 外观 | S3a 256 色前景（256 格） | bat Monokai | bat GitHub | eza |
|---|---|---|---|---|
| 毛玻璃浅·极光（默认） | 最小 **4.47**（3.72），中位 5.06（4.27），< 4.5：**4**（190）格 | 最小 4.45（3.75），中位 5.09（3.93），< 4.5：3 / 100（101 / 101） | 最小 4.80（3.76），0 / 106（37 / 107） | 最小 4.54（3.77），0 / 167（6 / 187） |
| 毛玻璃浅·无 | 4.70（3.88），0 格（157） | 4.71，0 / 100 | 5.05，0 / 106 | 4.71，0 / 167 |
| 毛玻璃深·极光 | 5.72（4.65） | 5.86 | 5.84 | 6.03 |
| 毛玻璃深·无 | 5.43（4.40，16 格 < 4.5），0 格 | 5.56 | 5.45 | 5.62 |
| 纯色浅 | 5.50（4.50） | 5.51 | 5.92 | 5.52 |
| 纯色深 | 5.50（4.50） | 5.63（4.62） | 5.51 | 5.69 |

- 毛玻璃浅·极光（真实背景亮度约 0.80–0.85）的最差几个文字（S3a）：第 4 行第 4 列 `rgb(0,120,81)` 4.47、第 9 行第 0 列 `rgb(175,0,215)` 4.47、第 6 行第 4 / 8 列 4.49；bat Monokai 的最差：`}` `rgb(105,105,101)` 4.45、`let` / `warn` `rgb(51,113,125)` 4.48。低于 4.5 的合计 7 个文字，最低 4.45，差 0.05 以内；33 个 24 位前景渐变单元格在真实像素测量下仍低于 4.5（最低 3.76；毛玻璃浅·无为 26 个），都是单字符 `M` 的抗锯齿读数，对 computed 前景与真实背景的 `nomPx` 全部 ≥ 4.5（最小 4.50）。
- 其余毛玻璃背景色（[W5-glass-colours-r8.json](W5-glass-colours-r8.json)；`nomPx` 最小）：浅·薄荷 S3a 4.64 / bat 4.61、浅·晚霞 4.56 / 4.57（S4 前景渐变有一个 4.49）、浅·海雾 4.55 / 4.56，深色三种 ≥ 5.68；背景像素亮度浅色约 0.82–0.87、深色约 0.01–0.02。六个组合全部 0 个 < 4.5（仅晚霞的渐变里一格 4.49）。
- 结论：5.5 把毛玻璃浅色的默认背景文字从 3.7–4.3:1 抬到 ≥ 4.45（几乎全部 ≥ 4.5），深色与纯色不变或更好，没有任何外观变差。**W5-F12 关闭**，附局限：测量用的是本机壁纸，毛玻璃的真实背景取决于窗口后面的桌面；实现者注释里写的「最差实测亮度约 0.65」我没有复现（本机五种背景色在默认位置均为 0.80–0.87）。背景更暗时（亮度 0.65 需要约 6.75）仍会低于 4.5，这是固定比值的固有限制，不是本次修复的缺陷。
- ANSI 调色板：六个外观单元格里 24 个 `ANSI-n` / `BOLD-n` span 的 computed color 都等于调色板且没有内联 `color:`（0 个不符），xterm 没有重新着色；开发实例全程 0 次 `securitypolicyviolation`（六个单元格 + 六个背景色组合）。

### 2. W5-F13：反显文字（仍是取舍，5.5 下略好于 4.5，没有不可读）

同一场景（`REV-*`）、S7 反显格与真实程序，对真实像素（括号为 Part 3 无最小对比度时 → 4.5 时）：

| 项 | 浅色（毛玻璃 / 纯色） | 深色（毛玻璃 / 纯色） |
|---|---|---|
| `\e[7m` 默认色 `REV-DEFAULT` | **5.86**（19.11 → 4.92） | **6.07**（14.04 → 5.13） |
| `REV-RED`（`7;31`） | 5.73（9.16 → 4.98） | 5.74（6.25 → 4.48） |
| `REV-GREEN`（`7;32`） | 5.42（9.37 → 4.67） | 5.95（6.43 → 4.61） |
| S7 `rev30–37`、`rev90–97`（16 格，`nominalCss`） | 5.52–5.95（4.51–5.21） | 5.53–5.99（4.55–5.16） |
| `less -M -R` 状态行 `sample.js lines 1-9/9 (END)` | 5.93（`rgb(142,142,142)` 于 `rgb(13,13,13)`） | 6.16（`rgb(90,90,90)` 于 `rgb(242,242,242)`） |
| `vim` 状态栏（`laststatus=2`，反显 + 加粗） | 5.93（同上） | 6.16 |

- 反显块的**块颜色保持**：`REV-DEFAULT` 的块在浅色方案里仍是 `rgb(13,13,13)`、在深色方案里仍是 `rgb(242,242,242)`，`REV-RED` 仍是调色板红 `rgb(152,4,22)`，`REV-GREEN` 仍是 `rgb(1,82,29)`；变化的只是文字：原先的白 / 黑变成中性灰（浅色方案约 `rgb(142–204)`、深色方案约 `rgb(40–90)`）。没有哪个反显文字变得不可读，也没有块颜色丢失；`vim` 搜索高亮（深黄褐块 + 浅字）与 `less` / `vim` 状态行可读，见截图：[反显场景](W5-reverse-video-5.5-r8.png)、[less 状态行](W5-less-status-reverse-r8.png)、[vim 状态栏与搜索高亮](W5-vim-statusline-search-r8.png)。视觉上文字比放宽前明显偏灰偏淡，是已知代价；5.5 比 4.5 高约 0.75–1.3。
- 结论：**F13 保持未关闭（低）**：仍是用户尚未决定的视觉取舍；W5 的测量支持主 Agent 的建议（接受并记录）：下限 5.4（像素）/ 5.5（CSS），可读，块颜色保留。文档（`specs/tools/spec.md` §5.1）写的「反显文字约 4.5–5:1」在 5.5 下不准确，实测 5.4–6.1:1（见 W5-F15）。
- F9 清单回归（128 对 ANSI 前景 × 背景，六个单元格各一次）：xterm 色彩空间内全部 ≥ 5.50，**像素最小 5.40（浅）/ 5.39（深）、中位 5.72 / 5.68，0 对 < 4.5**（4.5 时最小 4.44 / 4.40，5 / 2 对 < 4.5）；S2 复现用例（`41`、`44;97`、`43;30`、`1;37;41`、`30;47` 等）CSS 5.50–5.52、像素 5.30–5.41；S3b（256 色背景 + 默认前景）CSS 最小 4.60、像素 4.55（见下条）；S4 显式背景 CSS 最小 4.59（像素的单字符小格子最低 4.18）；S6 htop / tmux 风格（模拟）CSS 最小 5.08；S7 CSS 最小 5.52。**没有回归。**
- 5.5 在中等亮度背景上不可达（任何前景对亮度约 0.18 的背景最多约 4.58:1）：xterm 退而取黑 / 白中较好的一端，所以 S3b、S4 的最小是 4.59–4.60，而不是 5.5；这仍 ≥ 4.5，没有哪个组合被调到比原来更差。

### 3. W5-F14：`terminal-theme.ts` 头部注释（关闭，附两处措辞提示）

头部注释已不再写「`minimumContrastRatio` is not used」，改为说明 CSP 现已允许 `style-src-attr`（用户 2026-10-14）因此对程序自带颜色使用 `minimumContrastRatio`；常量旁的注释写明 5.5 的原因。F14 的原始问题（与现状矛盾）已解决，**关闭**。两处不影响行为的措辞提示（计入 W5-F15）：`selectionForeground` 那条仍说「production CSP blocks `style-src-attr`」后紧跟括号纠正，读起来前后矛盾；「Selected text keeps its own colour」对彩色单元格不再准确（选中的彩色格会按选区背景重新调整颜色，Part 6 实测选区内文字 4.55–5.80）。

### 4. 打包应用（`apps/desktop/dist/mac-arm64`，a0e7d49，通过）

方法同 Part 4：直接启动二进制并传 `--studio-user-data-dir=<临时目录> --remote-debugging-port=9395`（用户数据是开发实例 A 退出后的副本，启动时会话恢复自动出现 W5 Project One 标签；上次工具是 Browser，所以右栏关闭，终端是我点开的），agent-browser 经 CDP 连接；窗口 ID 用 JXA 按拥有者 PID 过滤只读读取（13896，1280×800）；截图用窗口 ID。**打包应用忽略模拟 Provider（`STUDIO_E2E_PROVIDERS`），所以没有创建 Session，没有任何模型调用。** 汇总：[W5-packaged-r8.json](W5-packaged-r8.json)。

- 生产 CSP（页面 `<meta>`）：`default-src 'none'; script-src 'self'; style-src 'self'; style-src-elem 'self' 'unsafe-inline'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; …`；`securitypolicyviolation` 全程 0（Terminal 创建、输入、S1 / S2 / S3a / S4 / S7、`bat`、选区、滚动、整屏填充、退出确认前的全部操作）。
- 字体与样式：`.xterm-rows` 为 `"IBM Plex Mono", ui-monospace, …` 12 px，400 / 500 两个字重已加载（`document.fonts.status` 为 `loaded`），3 个注入的 `<style>` 都有 sheet。
- 24 位色：背景渐变 56 + 56 个单元格 computed 背景与请求 rgb 逐格相等；前景渐变 9 + 23 个原样应用、47 + 33 个被调整且全部达到比值；PASS-A / B / C 原样；下划线色生效。
- ANSI 彩色背景：S1 128 对 CSS 最小 5.50、像素最小 5.47（中位 5.71）、0 对 < 4.5；S2 14–16 个用例像素最小 5.41；S3a 256 色前景对真实背景 `nomPx` 最小 4.54（0 格 < 4.5；真实像素最小 4.45），`bat` Monokai `nomPx` 最小 4.49（1 / 100 个文字 < 4.5），与开发构建一致。
- 粗体 / 反显 / 光标 / 选区：ANSI / 粗体 span 24 个都等于调色板、无内联 `color:`（0 个不符）；`BOLD-1` 6.15、`BOLD-4` 6.04、`ANSI-1` 7.55、`REV-DEFAULT` 5.86、`REV-RED` 5.70；纯文字行 16.2；光标 16.36；活动 / 非活动选区 2.88 / 5.68、2.78 / 5.88；滚动条拇指 4.03；视口 / 可滚动元素透明。
- Terminal 网格适配：1280×800 下 34 行 × 19 px = 646 px，最后一行距裁剪线 13 px，光标行 760–779 完整可见，`scrollTop` 0，`stty size` 34 76。截图：[适配](W5-packaged-terminal-fit-r8.png)、[24 位色](W5-packaged-truecolor-r8.png)、[ANSI 色块](W5-packaged-ansi-sweep-r8.png)。
- 退出：菜单项 Quit（System Events Accessibility 按精确 PID 点击，不是按键，与 Part 4 相同的理由：主进程 `Menu item.click()` 在本机不触发 `before-quit`）→ 确认框 `1 个 Project 中有 1 个未退出终端。终端及其运行的命令将结束。`（[截图](W5-packaged-quit-dialog-r8.png)）→ 点击『停止并退出』：主进程约 0.56 s 退出，已记录的 5 个进程（主进程、3 个 Electron 子进程、1 个 `zsh -f`）全部消失，调试端口释放，`app.log` 只有一行 DevTools 监听提示。

### 5. 新缺陷

**W5-F15（低，文档数字不符）：**
- `specs/tools/spec.md` §5.1 写「已知代价：反显文字约 4.5–5:1」；5.5 下实测 5.4–6.1:1（`REV-DEFAULT` 5.86 / 6.07，S7 CSS 5.52–5.99）。
- `terminal-theme.ts` 常量注释写「worst measured luminance ~0.65」，本机五种毛玻璃背景色实测 0.80–0.87，未复现；同文件头部「Selected text keeps its own colour」对彩色格不再准确（见第 3 节）。
- 修复方向：改文字（数字改为 5.4–6，亮度注明取决于桌面壁纸），不影响行为。

观察（不计缺陷）：打包应用的模型选择器显示 `GPT-6.1-Sol（默认）`（打包应用不用模拟 Provider，显示的是本机真实模型列表），没有创建 Session，没有模型调用。

### 6. 独立自动化

- `pnpm check:code`（`a0e7d49`，独立运行，exit 0）：脚本 36、Adapter 241、桌面 360 全部通过；`W5-vitest.config.ts` 套件 13 项 12 通过，仅历史红色的 `W5-shutdown.test.ts` 失败。

### 7. 未覆盖与副作用

- 未覆盖：更暗的桌面壁纸下的毛玻璃浅色（见 F12 局限）；系统深色下的「跟随系统」；真实窗口 resize；剪贴板内容；失败 / 超时路径的 GUI；真实 CLI 与模型；打包应用里的 Session。
- 副作用：没有写入用户 `~/.zsh_history`（命令特征词只读 `grep` 计数 0；Part 1 遗留的一行仍在第 1134 行，未动）。两个开发实例、打包应用、fixture、PTY 子进程、agent-browser 会话都按精确 PID 结束并复查无残留，端口 9394 / 9395 / 9396 已释放。截图没有含系统用户名。
