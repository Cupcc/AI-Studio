# W27：E2E 原生前台前置独立评审

## 检查范围与结论

2026-10-18，源码只读；未启动 Electron、未激活 / 切换任何应用。Main Agent 报告全 49 项中 48 通过，唯一失败是 `session.spec.ts` 首个用例的前台完成未读断言；历史定向重跑可通过。本 Agent 未将该报告视作独立通过结果。

**建议先加强测试的原生前台前置，并保留未读为零的原断言。** 当前 `focusWindow()` 只调用 app / window focus 后等待 `BrowserWindow.isFocused()`，既未确认 macOS frontmost PID，也未确认 Renderer 已通过既有事件同步当前前台状态。现有证据不足以在“测试执行时前台被抢走”与“真实前台状态未同步到 Renderer”之间作最终归因。不得通过压制未读、重复 opened、延后清除或放宽断言处理。

## 源码观察

| 接缝 | 当前行为 | 对本次失败的含义 |
|---|---|---|
| `e2e/session.spec.ts:focusWindow` | `show`、`app.focus({steal:true})`、`win.focus`，只 poll `isFocused` | window focus 不是完整的 native app active 前置 |
| `window/foreground.ts` | focus / blur / show / hide / minimize / restore 后用 setImmediate 采样，推送 `windowFocusChanged` | 原生变化通过异步通知到达 Renderer |
| `project/store.ts` | 初始 `foreground=document.hasFocus()`，watchEvents 收原生推送；同步当前显示的 Session | 初始化值与真实原生前台可能不同，CDP hasFocus 不能替代 native 判定 |
| `session/integration.tsx` | microtask 合并后 invoke `updateViewing` | window native focus 成立还不代表 main 已收到最新 viewing |
| `SessionService` | 只有 Renderer viewing 匹配且 native window 仍在前台才不记未读；focus 本身不调用 opened | 当前断言应继续测试该语义，不更改产品条件 |

潜在启动竞态：主进程初始 `windowFocusChanged` 可能先于 Renderer `watchEvents()` 订阅；若 window 已 focus，再调用 focus 不一定产生新的变化事件。若 native 状态全真、Main 的最新 viewing 仍为 false，应修复负责接缝的初始化 / 状态同步；不能让测试强制 blur → focus 循环把这一缺口永久遮住。此处是只读发现的可能路径，尚未经实际失败现场证明。

## 建议的测试前置

1. 取得本次 Electron **主进程 PID**，例如 `await app.evaluate(() => process.pid)`。按 PID 区分此次实例，避免按通用应用名 `Electron` 激活错误窗口。
2. 必要时 restore / show window，调用 `app.focus({steal:true})` 与 `win.focus()`。
3. 在 darwin 上等待 **native frontmost PID 等于本次 PID**；同时等待 `app.isActive()`、`win.isFocused()`、`win.isVisible()`、`!win.isMinimized()` 全真。在首个前台完成用例 **Send 前**再次建立前置，不能只依赖启动时的 focus。
4. 如果普通 Electron 激活仍未建立前台，使用本机已授权的 System Events，按 `unix id` 精确设置该进程 frontmost，再等待上述实际状态。不能无条件假设命令返回就完成激活。
5. 超时保留实际 PID / native 状态，明确报前置未满足。用例执行期间若失去前台，记录其时间；不要在完成后 focus 再要求已有未读自行消失，S-Q1 明确 focus 不等同查看。

只读 native PID 查询可用 AppKit，无需更改焦点或访问其他应用内容：

```ts
const { stdout } = await execFileAsync('osascript', [
  '-l', 'JavaScript', '-e',
  "ObjC.import('AppKit'); String($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier)"
])
return Number(stdout.trim())
```

本 Agent 已在当前机器执行上述只读查询，正常返回 PID。**没有执行激活操作，也没有占用 GUI。** 实现时用结构化 `execFile` 参数，不把代码或 PID 拼接进 shell。

## 如果原生前置全部成立仍失败

补一次只读观测：记录窗口 focus / blur / show 等时间、原生 active / focus / visible / minimized、最近 `updateViewing` 的 Project / Session / foreground，以及 `finish()` 实际作出未读决定时的同组状态。观测不能更改这些值或触发 opened。

- 完成时 frontmost PID 不是本次实例：当次前台完成前置已经失效，修正测试执行环境及独占资源后复验。
- 原生状态全真但 viewing 不匹配 / false：接入状态同步缺口，修复产品的真实状态交付；旧定向测试偶尔通过不能豁免。
- 原生和 viewing 均正确仍产生未读：继续检查 Session 状态转换，保持断言。

针对受影响用例与同文件的“后台完成打开清除”“blur 完成后 focus 不清除、打开才清除”复验即可；若修订共用 helper，再执行受影响的完整 Session E2E。不要先为偶发失败增加 retry 或拉长完成超时来将其包装成通过。

## 官方依据

- [Electron app.focus / app.isActive](https://www.electronjs.org/docs/latest/api/app#appfocusoptions)：app active 与窗口 focus 是不同层次；本地 Electron 44 类型声明已提供 `isActive()`。
- [Apple NSWorkspace.frontmostApplication](https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication)：用于独立核对当前前台应用身份。

文档复核：该记录仅为测试前置与诊断建议，未改源码、验收结论、任务状态或产品需求；实际修订及复验由 Main Agent 执行后再交独立检查。

## 修补后独立复验（2026-10-18 11:07 UTC / 19:07 +08）

Main Agent 后续报告已确定重现启动同步缺口，并实现 `app.getWindowFocus` 可信 sender 快照；本 Agent 保持源码只读，检查真实 IPC 与 Renderer store，实现为先订阅事件、再请求快照，并用事件 revision 与 active 状态保护异步响应。未改未读计算、未调用 opened。

独立新增 [W27-focus.test.ts](W27-focus.test.ts)，在 Node 中使用真实 Project store 与 IPC handler，显式提供 `document.hasFocus=false` 的 fixture，不启动 GUI：

| 场景 | 独立结果 |
|---|---|
| 先订阅再读取；初始原生 true 事件已错过 | 快照正确恢复 foreground=true，当前 Session viewing 重新交付，未调用 userOpenedSession |
| 快照 in-flight 时收到新 true / false 事件（两项） | 旧反向快照均不覆盖新事件；viewing 与最终事件一致，未触发打开 / 已读 |
| unsubscribe 后迟到快照 | 不更新 store，不调用 SessionPort |
| 初始 IPC 失败 | 捕获诊断，无未处理拒绝；后续原生事件仍可恢复状态 |
| 可信 sender | handler 按 Main 提供的 senderId 读取，拒绝 Renderer 提交 focused 值 |

执行原有 W27 配置：**5 文件、25 项全部通过，2.51 秒**（新增焦点 6 项，其余 19 项复验）。另独立运行：

```sh
pnpm --filter @ai-studio/desktop exec vitest run src/main/ipc/app.test.ts src/preload/bridge.test.ts src/renderer/src/features/project/shell.test.tsx src/renderer/src/features/session/session.test.tsx
```

结果：**4 文件、37 项全部通过，2.03 秒**。测试控制台时区不同，本文以 clock 工具 UTC 时间记录本次执行，未将控制台时刻直接当作 +08。

| 受影响文件 | Git blob hash |
|---|---|
| `shared/ipc/app.ts` | `928714255ee8322f2b780fa03cdfb6561733a47d` |
| `main/ipc/app.ts` | `f3137f78a72678cd1199082110898509d7d248fb` |
| `main/ipc/index.ts` | `a713f4992f1a02f147b3ee0c43d170a9b9dd4944` |
| `project/store.ts` | `65db87623d84843393ef95f0a89cf90bdd48159a` |
| `e2e/session.spec.ts` | `1696bbec86795f5d48d11bf3b43cc58fd3575008` |

修补在上述独立自动化范围通过。E2E helper 已加入 native app active / window visible / 未最小化及 frontmost PID 前置，首个用例 Send 前再次调用；本 Agent尚未执行其真实窗口回归。**修补后 Session E2E、实际 GUI 与重新打包仍待完成**，不能沿用修补前的 1.0.0 包作为最终通过。
