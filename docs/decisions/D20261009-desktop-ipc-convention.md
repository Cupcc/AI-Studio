# D20261009 桌面端进程边界与类型化 IPC 约定

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 日期 | 2026-10-09 |
| 关联 | task [T20261009-app-skeleton](../../tasks/T20261009-app-skeleton/task.md)；04 第 2、4、6 节；[D20261009-desktop-feature-folders](D20261009-desktop-feature-folders.md) |
| 取代 | — |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。

## 背景

[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2 节要求四层边界：Renderer 不直接访问文件系统、Shell 或凭据；Preload 只暴露最小化、类型化 IPC；Application / Runtime Services 在主进程。后续 project-shell、session、project-view、context-tools 等 task 将并行增加 IPC，需要一个各自新增文件、不争用同一段代码的约定。

## 决定

### 安全基线

1. 所有窗口：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webviewTag: false`、`webSecurity: true`。
2. 生产 Renderer 通过自定义协议 `app://studio/` 提供（不使用 `file://`），协议处理器拒绝越出 `out/renderer` 的路径。
3. CSP 由构建注入：生产为 `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; …`（无 `unsafe-inline` / `unsafe-eval`）；开发模式只额外放开 Vite HMR 与 React Refresh 所需项。需要 Worker、Monaco、`blob:` 等的 task 在 `electron.vite.config.ts` 中按需放开并说明原因。
4. 默认拒绝：`window.open` 与新窗口、导航到应用源以外的地址、`<webview>`、所有权限请求。Browser Preview（04 第 2 节 WebContentsView）由后续 task 单独设计，不复用主窗口的 Preload。
5. 主进程处理 IPC 前校验发送方 frame 的源（仅 `app://studio` 与开发服务器源）。
6. 打包时设置 Electron Fuses：关闭 `RunAsNode`、`NODE_OPTIONS`、`--inspect` 参数与 `file://` 额外权限（`grantFileProtocolExtraPrivileges`），开启 Cookie 加密与 `onlyLoadAppFromAsar`；asar 完整性校验待签名流程确定后再开启。因此不能用 `ELECTRON_RUN_AS_NODE` 方式让应用二进制充当 Node 运行子进程。

### 类型化 IPC

1. 每个功能一份契约 `src/shared/ipc/<feature>.ts`，用 `defineContract('<feature>', { invoke, events })` 声明：
   - `invoke<Req, Res>('<feature>:<action>')`：Renderer → 主进程请求 / 响应；
   - `event<Payload>('<feature>:<event>')`：主进程 → Renderer 推送。
   通道名必须以 `<feature>:` 开头；请求方法名不得以 `on` 开头。
2. 契约在 `src/shared/ipc/contracts.ts` 登记一行。`window.studio` 的类型 `StudioApi` 由登记列表推导，Renderer 调用形如 `window.studio.<feature>.<action>(req)`，订阅形如 `window.studio.<feature>.on<Event>(listener)`，返回取消订阅函数。
3. Preload 不写功能代码：`src/preload/bridge.ts` 按契约通用生成 API，只转发已声明的通道，监听器只收到 payload，`ipcRenderer` 与事件对象不越过 contextBridge。确需 Preload 特殊能力（如 `webUtils.getPathForFile`、MessagePort）时，在 `src/preload/` 新增文件并在本决定补充说明。
4. 主进程处理器 `src/main/ipc/<feature>.ts`，用 `defineHandlers(contract, { <action>: { parse, handle } })` 定义：`parse` 校验不可信输入（`src/main/ipc/validate.ts` 提供基础校验），`handle` 执行业务。处理器工厂接收 `CoreServices`（数据库、登录 Shell 环境、广播事件），功能自有服务在工厂内创建，可提供 `dispose` 在退出时清理（退出等待上限 5 秒）。
5. 处理器在 `src/main/ipc/index.ts` 登记一行。启动时校验：每个契约都有处理器、每个请求都有实现、通道不重复，否则启动失败。
6. 新增一个功能 = 新建契约、处理器（及其服务、Renderer 功能目录）文件 + `contracts.ts` 与 `ipc/index.ts` 各一行。
7. 输入校验暂用手写校验函数；是否引入 Schema 库（可与 Project Knowledge 的 Schema 校验统一，04 第 2 节）留待后续决定。

## 备选方案

| 方案 | 放弃原因 |
|---|---|
| Preload 暴露通用 `invoke(channel, ...args)` | Renderer 可调用任意通道，违背“最小化”要求，且无法静态检查。 |
| 每个功能手写 Preload 桥接文件 | 与契约重复，容易出现契约与桥接不一致；通用生成足以覆盖请求 / 推送两类。 |
| 引入 tRPC / electron-trpc 等框架 | 增加依赖与学习成本，当前需求只需请求 / 推送两种模式。 |
| `file://` 加载 Renderer | 所有 `file://` 页面共享源，CSP `'self'` 范围过宽；Electron 安全清单建议使用自定义协议。 |
| 用 `import.meta.glob` 自动发现功能 | 省去登记行，但登记关系隐式、难以审阅，且 Preload 沙箱打包与类型推导更复杂。 |

## 影响

- Renderer 中 `require`、`process`、`module`、`Buffer`、`ipcRenderer` 均不可用，内联脚本被 CSP 拦截，已由 Playwright 冒烟测试覆盖（`apps/desktop/e2e/app.spec.ts`）。
- 并行 task 只在两份登记文件中各加一行，合并冲突仅限相邻行，易于解决。
- 依赖原始 `IpcRendererEvent`（如 `event.ports`）的场景需扩展桥接，见决定第 3 条。

## 依据

- 04 第 2 节“分层边界”；第 6 节“稳定性”（单个功能失败不应导致应用崩溃：IPC 错误只返回给调用方）。
- 测试：`src/shared/ipc/contract.test.ts`、`src/preload/bridge.test.ts`、`src/main/ipc/registry.test.ts`、`src/main/security/policy.test.ts`、`e2e/app.spec.ts`（均在 `apps/desktop/` 下）。
- 实现与调研记录：[research.md](../../tasks/T20261009-app-skeleton/research.md) 第 2、5 节。
