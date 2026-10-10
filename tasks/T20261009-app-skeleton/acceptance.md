# 验收：T20261009-app-skeleton

## 签收

- 状态：待签收
- 签收：<人在对话中确认的日期>

> 写入者：验收 Worker（W2），不是实现者。人签收后，任务才能标记为 done。

验收对象：分支 `dev/v1` 的 `1cd7b73`。验证方式：在仓库外、路径含空格的目录中重新克隆，从零执行命令；窗口、安全与打包项另外阅读实现与测试代码，并用独立探针复核，而不是只采信 W1 的报告。日期：2026-10-09，环境：macOS 15（Darwin 24.6.0）/ arm64，Node 26.10.0，pnpm 12.10.1。

## 验收结果

| 验收标准 | 来源 | 结论 | 证据 |
|---|---|---|---|
| `pnpm install` 在干净克隆上成功，原生依赖针对 Electron ABI 构建 | task.md；04 第 3 节 | 通过（有边界，见“未覆盖与边界”第 1、2 条） | [W2-clean-clone-commands.log](evidence/W2-clean-clone-commands.log) |
| 类型检查、Vitest、Playwright 冒烟测试均通过；命令写入报告并由主 Agent 记录到 `AGENTS.md` | task.md | 通过（`AGENTS.md` 已含命令；`report.md` 尚未生成，属主 Agent 工作） | [W2-clean-clone-commands.log](evidence/W2-clean-clone-commands.log) |
| 开发模式启动后显示窗口，最小尺寸 1024×640，窗口控制区在左侧，顶部区域可拖拽 | task.md；Shell Spec v01 第 2、3 节 | 通过（未取得系统窗口控制区的截图，见“未覆盖与边界”第 3 条） | [W2-clean-clone-commands.log](evidence/W2-clean-clone-commands.log)、[W2-dev-mode-probe.json](evidence/W2-dev-mode-probe.json)、[W1-dev-window.png](evidence/W1-dev-window.png) |
| Renderer 中无法访问 Node.js、文件系统和 `ipcRenderer` 原始对象，只能调用 Preload 暴露的类型化 API；有测试或检查证明 | task.md；04 第 3 节 | 通过（有残余风险，见“未覆盖与边界”第 4 条） | [W2-renderer-isolation-probe.json](evidence/W2-renderer-isolation-probe.json)、[W2-clean-clone-commands.log](evidence/W2-clean-clone-commands.log) |
| SQLite 在主进程可读写，迁移可重复执行；数据库位于应用数据目录而非 Project 目录 | task.md | 通过 | [W2-packaged-smoke.json](evidence/W2-packaged-smoke.json)、[W2-userdata-isolation.txt](evidence/W2-userdata-isolation.txt) |
| node-pty 在 Electron 主进程中启动 Shell 并收到输出；打包后的应用中同样可用 | task.md；[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 6 节 | 通过 | [W2-packaged-smoke.json](evidence/W2-packaged-smoke.json)、[W2-packaged-app-inspection.txt](evidence/W2-packaged-app-inspection.txt) |
| 通过 `open` 启动打包后的应用时，能解析登录 Shell 的 PATH，并找到 `codex` 与 `claude`；结果不含完整环境变量或凭据 | task.md；[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 6 节；`tasks/README.md` 证据规则 | 通过（以 `open` + launchd 默认环境代替 Finder，见“未覆盖与边界”第 5 条） | [W2-packaged-smoke.json](evidence/W2-packaged-smoke.json) |
| SQLite 驱动、IPC 约定、目录约定写成 `docs/decisions/` 下的决定草稿 | task.md | 通过 | `docs/decisions/D20261009-desktop-sqlite-driver.md`、`D20261009-desktop-ipc-convention.md`、`D20261009-desktop-feature-folders.md`；登记于 `docs/decisions/README.md` |

## 验证记录

1. 干净克隆：`pnpm install --frozen-lockfile` 退出码 0（402 个包，`node-pty` 预编译检查通过，postinstall 恢复了 `spawn-helper` 的可执行位）；`pnpm typecheck` 退出码 0（三个 tsconfig）；`pnpm test` 11 个文件 / 53 个测试通过；`pnpm test:e2e` 6 个测试通过；`pnpm package` 退出码 0，生成 `apps/desktop/dist/mac-arm64/AI Developer Studio.app`（309 MB）。
2. 窗口：阅读 `src/main/window/main-window.ts` 与 `e2e/app.spec.ts`。测试断言默认尺寸 `[1280, 800]`、`getMinimumSize()` 为 `[1024, 640]`、把窗口缩到 800×500 后实际为 `[1024, 640]`、`getWindowButtonPosition()` 为 `{14, 14}`、顶栏计算样式 `-webkit-app-region: drag` 且高度 40、位于 `(0, 0)`。这些断言与标准逐项对应，没有空洞。另在 `electron-vite dev` 下用 CDP 复核：窗口 1280×800、顶栏可拖拽 40px、Renderer 无 Node 全局。
3. 隔离与安全：阅读 `src/main/security/`、`src/preload/`、`src/main/ipc/registry.ts` 与 CSP 注入。窗口使用 `contextIsolation`、`sandbox`、`nodeIntegration: false`、`webSecurity`、`webviewTag: false`；`app://studio` 提供生产页面；CSP 为 `default-src 'none'`、`script-src 'self'`；新窗口、跨源导航与 `<webview>` 被拒绝；权限请求与检查一律拒绝。独立探针（对构建产物，不修改代码）结果：`window.studio` 只有 `app`，三个成员均为函数，对象冻结，无法增删成员；`require`、`process`、`module`、`Buffer`、`global`、`ipcRenderer`、`electron` 均为 `undefined`；`import('node:fs')`、`fetch('file://…')`、`fetch('https://…')` 失败；`<iframe>` 触发 `frame-src` 违规；`window.open` 返回 `null`，跳转 `file:///etc/hosts` 无效，窗口数仍为 1；定位、通知、剪贴板读取均被拒绝。**在真实 Electron 中**，让同一 Preload 加载于 `data:` 与 `about:blank` 页面，调用 `app:get-info` 均被主进程以 “Rejected IPC … from untrusted sender” 拒绝，可信窗口随后仍可正常调用。W1 的 e2e 没有覆盖发送方校验（只有 `registry.test.ts` 单元测试），这一项由本次探针补足。
4. SQLite：`database.test.ts` 覆盖路径落在 userData 内、拒绝越界文件名、迁移只执行一次、失败回滚、拒绝更新版本写入的库、WAL。打包应用在**全新**的 userData 上冒烟：`firstRunApplied: 1`、`secondRunApplied: 0`、`readBack: true`；之后用只读 `sqlite3` 确认库中有 `schema_migrations`（`2026100901_core_app_meta`）与 `app_meta`（`smoke.lastRun`）。W1 提交的报告中 `firstRunApplied` 为 0（复用了已迁移的真实库），不能单独证明首次迁移，本次补足。
5. node-pty 与打包：打包产物中 `app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/` 含 `pty.node` 与可执行的 `spawn-helper`（`-rwxr-xr-x`）；Fuses 与设计一致（RunAsNode、NODE_OPTIONS、inspect 参数、`file://` 额外权限关闭，Cookie 加密与 `onlyLoadAppFromAsar` 开启，asar 完整性校验关闭）。冒烟报告 `pty.ok: true`、收到标记、退出码 0；隐藏窗口加载 `app://studio`（从 asar 读取）通过。
6. GUI 启动环境：冒烟脚本以 `PATH=/usr/bin:/bin:/usr/sbin:/sbin`（无 `SHELL`）调用 `/usr/bin/open -n -W`。报告显示启动 PATH 只有 4 项，`codex`、`claude` 均不在其上；登录 Shell 解析来源为 `login-shell`（`/bin/zsh`，约 0.5 秒，PATH 21 项），随后找到两个可执行文件并读到 `--version`（codex 0.161.0、claude 2.1.295）。证据中只有布尔值、数量、版本和可执行文件路径，没有环境变量值、认证输出或邮箱；路径含本机用户名，W2 证据已把主目录替换为 `~`，W1 证据未替换。没有发起任何模型调用。
7. 决定草稿：三份均存在，`文档状态` 为 `草稿`，日期 2026-10-09，IPC 决定引用 04 第 3、5、7 节，SQLite 决定引用 04 第 3、7 节与 [CLI 校验报告](../T20261008-cli-preflight/report.md) 第 6 节，目录决定引用 `tasks/README.md` 与另两份决定；三份都有“依据”小节指向 research、测试或证据。

## 未覆盖与边界

### 1. 安装“干净”的程度

克隆是干净的（新目录、`--frozen-lockfile`），但 pnpm 内容寻址存储与 Electron 下载缓存是热的，安装日志中没有出现 Electron 的实际下载。无网络或冷缓存时 `install-electron` 的行为未验证。

### 2. “针对 Electron ABI 构建”

`node-pty` 1.1.0 使用 N-API 预编译，不需要也没有针对 Electron ABI 重新编译；`node:sqlite` 是运行时内置模块，也没有原生构建。验收按“在 Electron 44 主进程与打包应用中实际加载并运行”判定为通过，而不是按字面的“重新编译”。单元测试（Vitest）运行在系统 Node 26 上，与 Electron 内置的 Node 24.21.0 不同，Electron 一侧的证明来自 e2e 冒烟与打包冒烟，而不是单元测试。

### 3. 窗口控制区

左侧位置由 macOS 的红绿灯决定；代码中 `trafficLightPosition {14, 14}` 与顶栏预留 80px 与 e2e 断言一致。本次尝试对应用窗口做系统截图，因没有屏幕录制权限而失败，所以没有系统窗口控制区的图像证据；W1 截图只含网页内容。开发模式下的复核通过 CDP 与 `window.outerWidth/outerHeight` 完成，无法在该通道上验证最小尺寸（由 e2e 断言覆盖）。开发模式没有自动化测试，e2e 使用构建产物。

### 4. 安全的残余风险

- 发送方校验只比较 `senderFrame.url` 的源，没有要求发送方是主 frame。当前 CSP 禁止子 frame 且 Preload 不加载进子 frame，所以不可利用；这是纵深防御的缺口。
- CSP 只以 `<meta>` 注入，`app://` 协议响应没有安全响应头；`frame-ancestors` 在 meta 中无效。
- `eval` 被 CSP 拦截这一点没有独立实测（Playwright 的 `evaluate` 绕过 CSP），仅静态确认构建出的 CSP 不含 `unsafe-eval`。开发模式 CSP 含 `unsafe-inline`，属设计所述范围。
- 未设置设备权限（USB / HID 等）与 `setDisplayMediaRequestHandler`；已实测定位、通知、剪贴板被拒绝。
- `--studio-smoke-output` 与 `--studio-user-data-dir` 在打包的正式构建中同样生效（见下方缺陷 2）。

### 5. GUI 启动环境不是真正的 Finder 启动

W1 发现当前 macOS 的 `open` 会把调用方环境传给应用，所以脚本用 launchd 默认环境调用 `open`。这能复现“最小 PATH、无 SHELL”，但不是从 Finder 双击。[CLI 校验报告](../T20261008-cli-preflight/report.md) 第 6 节要求的是 Finder / `open` 启动，本项按 `open` 满足；Finder 双击、Dock 启动、登录项启动未覆盖。解析只在作者本机的 zsh 配置下验证过；bash、fish、会在交互模式下输出提示或阻塞的 rc 文件未验证（超时与回退有单元测试）。Shell 环境在应用运行期间只解析一次，用户修改配置后需要 `refresh()`。

### 6. 其他未覆盖

最低 macOS 版本、x64、签名与公证、Windows / Linux 不在本 task 范围，未验证。打包产物同时带有 `darwin-x64` 预编译文件但未运行验证。`node:sqlite` 在 Node 24 中的稳定性标注（决定草稿称为 Release Candidate）没有核对。

### 缺陷与风险（回给实现者，按严重度）

1. 中：`apps/desktop/scripts/packaged-smoke.mjs:42` 启动应用时只传 `--studio-smoke-output`，不传 `--studio-user-data-dir`。`pnpm smoke:packaged` 因此向真实的 `~/Library/Application Support/AI Developer Studio/` 写入 `studio.sqlite3` 的 `smoke.lastRun` 行以及 Chromium 缓存目录，并且让 `firstRunApplied` 在重复运行时总是 0，削弱“首次迁移”证据。建议脚本默认使用临时 userData（可用参数覆盖），并在 `AGENTS.md` 的命令说明中注明。W2 为避免副作用，没有运行未修改的脚本，而是用仅多一个参数的副本完成验证（[W2-userdata-isolation.txt](evidence/W2-userdata-isolation.txt)）；真实目录的修改时间在验证前后不变。
2. 低：`apps/desktop/src/main/index.ts:25-27` 与 `:102-103` 在打包的正式构建中也接受 `--studio-user-data-dir` 和 `--studio-smoke-output`。能启动应用的本地进程可以重定向数据目录或在任意绝对路径写入一份 JSON 报告。建议仅在测试 / 冒烟需要时启用，或在决定草稿中明确这是有意保留。
3. 低：`apps/desktop/src/main/ipc/registry.ts:102-103` 发送方校验没有比较 `senderFrame` 与 `sender.mainFrame`（见“未覆盖与边界”第 4 条第一项）。
4. 低：`apps/desktop/src/main/smoke/native-smoke.ts:97` 的 `dbInsideUserData` 是同义反复（路径由 `userDataDir` 派生）；它不能证明默认位置，实际默认位置已由本次对真实 Application Support 目录的观察与 `database.test.ts` 间接确认。
5. 低：`apps/desktop/src/main/security/hardening.ts:16-21` 协议处理器返回的响应没有安全头（见“未覆盖与边界”第 4 条第二项）。
6. 信息：`W1-packaged-smoke.json` 含本机用户名路径（非邮箱、非凭据），不违反证据规则，但与 W2 的做法不一致。
