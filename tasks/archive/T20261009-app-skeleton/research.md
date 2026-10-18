# 调研记录：T20261009-app-skeleton（W1）

> 过程记录，无需评审。长期结论见 [07. Decisions](<../../../docs/07. Decisions.md>) DEC-01～03 与 `apps/desktop/README.md`。环境：macOS 15（Darwin 24.6.0）/ arm64，Node 26.10.0，pnpm 12.10.1，2026-10-09。

## 1. 版本选择

规则：取各包当前稳定版中发布满两周（2026-09-25 前）的版本，精确锁定。

| 包 | 版本 | 发布日期 | 说明 |
|---|---|---|---|
| electron | 44.4.5 | 2026-09-23 | 44 为最新稳定大版本；内置 Node 24.21.0、Chrome 152，modules ABI 149 |
| electron-vite | 5.0.0 | 2025-12-07 | 最新稳定版；peer 依赖 vite ^5/^6/^7（6.0 仍为 beta） |
| vite | 7.3.6 | 2026-06-25 | 受 electron-vite 5 限制不能用 vite 8 |
| @vitejs/plugin-react | 5.2.0 | 2026-03-12 | 6.x 需要 vite 8 |
| react / react-dom / @types | 19.3.0 | 2026-09-09 | |
| typescript | 7.0.2 | 2026-07-08 | 原生编译器版本；`tsc --noEmit` 三个工程均通过 |
| zustand | 5.0.15 | 2026-08-13 | |
| vitest | 5.0.1 | 2026-09-15 | peer 允许 vite 7 |
| @playwright/test | 1.63.0 | 2026-09-04 | 1.64.0 未满两周 |
| electron-builder | 26.16.1 | 2026-09-07 | 26.17.0 未满两周 |
| node-pty | 1.1.0 | 2025-12-22 | 唯一生产依赖 |
| @types/node | 24.13.6 | 2026-09-19 | 与 Electron 内置 Node 24 对齐 |
| jsdom / @testing-library/react | 30.1.0 / 16.3.3 | 2026-09-17 / 2026-08-27 | |

pnpm 12 默认阻止依赖构建脚本。`pnpm-workspace.yaml` 的 `allowBuilds` 明确允许 `node-pty`（只检查预编译文件）与 `esbuild`（校验平台二进制），拒绝 `electron-winstaller`（Windows 专用）。Electron 44 的 npm 包不再有 postinstall，首次使用时才下载二进制；为使安装结果确定，`apps/desktop` 的 postinstall 调用 `install-electron`。pnpm 12 还会执行默认的供应链策略检查（安装输出 “Lockfile passes supply-chain policies”）。

## 2. IPC 与目录约定

- 契约（shared）→ 通用 Preload 桥接 → 主进程处理器（parse + handle）。设计理由与备选方案见 [DEC-02](<../../../docs/07. Decisions.md>)。
- 新增功能的改动面：功能自有文件 + `src/shared/ipc/contracts.ts` 一行 + `src/main/ipc/index.ts` 一行（有表时再加 `migrations/index.ts` 一行）。启动时校验契约与处理器一一对应。
- 处理器工厂接收 `CoreServices`，功能自有服务在工厂内创建；退出时 `dispose` 最多等待 5 秒。
- 目录归属见 [DEC-03](<../../../docs/07. Decisions.md>)。

## 3. SQLite：node:sqlite 与 better-sqlite3

Electron 主进程探针（`require('node:sqlite')`，内存库建表、插入、查询）：

```json
{"electron":"44.4.5","node":"24.21.0","modules":"149","row":{"v":"hello"},"sqliteVersion":"3.53.4","ok":true}
```

- 无需 `--experimental-sqlite`，未捕获到 ExperimentalWarning。
- 系统 Node 26.10.0 同样提供 `node:sqlite`，Vitest 直接使用同一实现。
- better-sqlite3 13.0.3 基于 V8 原生接口，需按 Electron ABI 149 编译，与 Vitest 的 Node 26 ABI 不同，需要两份二进制或在 Electron 中跑单元测试，因此未采用。

结论见 [DEC-01](<../../../docs/07. Decisions.md>)。

## 4. node-pty

- 1.1.0 自带 `prebuilds/darwin-arm64/pty.node`，为 N-API 模块：同一文件在 Electron 44 主进程与系统 Node 26 中都能加载，不需要 `@electron/rebuild`（electron-builder 设置 `npmRebuild: false`）。
- **坑**：npm 包中的 `prebuilds/darwin-*/spawn-helper` 没有可执行位（`tar -tvzf` 显示 `-rw-r--r--`），任何 spawn 都报 `posix_spawnp failed.`（首次冒烟实际复现）。处理：
  - `apps/desktop/scripts/ensure-node-pty-helper.mjs`（postinstall）恢复可执行位；
  - `apps/desktop/scripts/after-pack.cjs`（electron-builder afterPack）在打包产物中再次设置并检查目标架构的 helper 存在。
- 打包时 `asarUnpack: **/node_modules/node-pty/**`；node-pty 自身会把 `app.asar` 路径替换为 `app.asar.unpacked` 来定位 helper。
- 主进程以 `await import('node-pty')` 懒加载，加载失败时返回错误而不是让应用崩溃（04 第 7 节稳定性）。

## 5. 安全与窗口

- `contextIsolation`、`sandbox`、`nodeIntegration: false`、`webviewTag: false`；生产页面经 `app://studio/` 提供；CSP 由 Vite 插件注入（开发 / 生产两套）。
- Playwright 中 `page.evaluate` 本身不受 CSP 的 `unsafe-eval` 限制（DevTools 评估），所以用“注入内联 `<script>` 并监听 `securitypolicyviolation`”来验证 CSP：被 `script-src-elem` 拦截。
- 窗口：1280×800，最小 1024×640，`titleBarStyle: 'hidden'`，`trafficLightPosition {x:14, y:14}`（12px 圆点在 40px 顶栏中垂直居中），顶栏 `-webkit-app-region: drag`，左侧预留 80px 给窗口控制区。
- **坑**：在 `will-quit` 中 `preventDefault()` 做异步清理后，若在同一轮异步链中再调用 `app.quit()`，应用不会退出（Playwright `app.close()` 超时）。改为 `setImmediate(() => app.quit())` 后正常。
- **坑**：Playwright / Electron 直接启动 `out/main/index.js` 时找不到 `package.json`，`app.getName()/getVersion()` 返回 Electron 自身的名称和版本；测试改为启动应用目录。

## 6. GUI 启动环境

- 实现：`$SHELL -i -l -c "printf <marker>; /usr/bin/env -0; printf <marker>"`，`detached` 进程组，10 秒超时后杀整个进程组并回退到启动环境；输出上限 4 MB；`SHELL` 缺失时用 `os.userInfo().shell`。设置 `AI_STUDIO_RESOLVING_ENVIRONMENT=1`，用户的 rc 文件可据此跳过交互内容。
- **发现**：当前 macOS 上 `open` 会把调用方的环境传给被启动的应用。第一次打包冒烟时启动 PATH 有 28 项、能直接找到 codex / claude，不能代表 Finder 启动。打包冒烟脚本因此以 launchd 的默认 GUI 环境（`PATH=/usr/bin:/bin:/usr/sbin:/sbin`，无 `SHELL`）调用 `/usr/bin/open`。
- 结果（[W1-packaged-smoke.json](evidence/W1-packaged-smoke.json)）：启动 PATH 4 项，codex / claude 均不在启动 PATH 上；登录 Shell 解析耗时约 0.7 秒，PATH 21 项，找到 `/Users/Chris/.local/bin/codex`（0.161.0）与 `/Users/Chris/.local/bin/claude`（2.1.295）。
- 证据只含布尔值、数量、版本和可执行文件路径；单元测试与 e2e 断言报告中不出现 `PATH`、`env` 字段。

## 7. 打包

- `electron-builder --mac --arm64 --dir`，`mac.identity: null`（未签名），产物 `apps/desktop/dist/mac-arm64/AI Developer Studio.app`，约 309 MB；`app.asar` 1.1 MB。
- 可执行文件保持 Electron 原有的 ad-hoc / linker 签名，Electron Fuses 修改后仍可通过 `open` 启动。`@electron/fuses read` 确认：RunAsNode、NODE_OPTIONS、CLI inspect、GrantFileProtocolExtraPrivileges 关闭，Cookie 加密与 OnlyLoadAppFromAsar 开启，asar 完整性校验未开启。
- 关闭 inspect fuse 后 Playwright 无法驱动打包应用，因此打包冒烟模式在主进程内以隐藏窗口加载真实 Renderer（`app://studio`，从 asar 读取），检查顶栏渲染、Node 全局不可见、Preload API 可用，结果写入同一报告的 `renderer` 字段。
- electron-builder 26 自动识别 pnpm workspace 并收集生产依赖（只有 node-pty）。
- `appId: dev.aistudio.desktop` 为临时值，签名 / 公证不在本 task。

## 8. 验证记录

| 命令（仓库根目录） | 结果 |
|---|---|
| 干净克隆（路径含空格）`pnpm install --frozen-lockfile` | 通过；postinstall 下载 Electron 并修复 spawn-helper |
| `pnpm typecheck` | 通过（node / web / e2e 三个 tsconfig） |
| `pnpm test` | 11 个文件、53 个测试通过 |
| `pnpm test:e2e` | 6 个测试通过 |
| `pnpm package` | 生成 `dist/mac-arm64/AI Developer Studio.app` |
| `pnpm smoke:packaged -- --out <evidence>` | PASS（SQLite、node-pty、登录环境、codex / claude、隐藏窗口 Renderer），见 [W1-packaged-smoke.json](evidence/W1-packaged-smoke.json) |
| `pnpm dev` | 开发服务器与窗口启动；对开发服务器的探测：窗口 1280×800、最小 1024×640、控制区 {14,14}、Renderer 无 `require`；截图 [W1-dev-window.png](evidence/W1-dev-window.png)（仅网页内容，不含系统窗口控制区） |

打包冒烟会在真实 userData（`~/Library/Application Support/AI Developer Studio/studio.sqlite3`）写入 `app_meta` 的 `smoke.lastRun`。
