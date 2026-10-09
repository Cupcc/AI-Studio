# apps/desktop

AI Developer Studio 的 Electron 桌面客户端（macOS 首发）。技术栈见 [04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 2 节；本目录由 [T20261009-app-skeleton](../../tasks/T20261009-app-skeleton/task.md) 建立。

相关决定（草稿）：

- [DEC-02](<../../docs/07. Decisions.md>)：进程边界、安全基线、类型化 IPC。
- [DEC-03](<../../docs/07. Decisions.md>)：功能目录与写入范围。
- [DEC-01](<../../docs/07. Decisions.md>)：SQLite 驱动、数据库位置与迁移。

## 1. 命令

从仓库根目录执行（路径含空格亦可）：

桌面包通过 workspace 依赖 `@ai-studio/agent-adapter`。根命令会先构建该包；直接使用 `pnpm --filter @ai-studio/desktop …` 时，需先运行 `pnpm --filter @ai-studio/agent-adapter build`。

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装依赖；同时下载 Electron 二进制并修复 node-pty `spawn-helper` 的可执行位 |
| `pnpm dev` | electron-vite 开发模式（Renderer 热更新） |
| `pnpm typecheck` | 所有 workspace 包的类型检查 |
| `pnpm test` | 所有 workspace 包的单元测试（本包为 Vitest） |
| `pnpm test:e2e` | 构建后运行 Playwright Electron：原生依赖冒烟与使用模拟 Provider 的 Project / Session 流程，不调用模型 |
| `pnpm package` | 构建并生成未签名的 macOS arm64 应用目录 `apps/desktop/dist/mac-arm64/` |
| `pnpm smoke:packaged` | 以 `open` 启动打包应用执行原生依赖冒烟，每次默认使用独立临时 userData，保留供诊断；结果默认写入 `.runtime/desktop/packaged-smoke.json`；`-- --out <file>` 指定报告，`-- --user-data-dir <dir>` 显式指定测试数据目录 |

## 2. 目录

```text
src/
  shared/ipc/contract.ts       IPC 契约原语（defineContract / invoke / event）
  shared/ipc/<feature>.ts      功能契约（示例：app.ts）
  shared/ipc/contracts.ts      契约登记（每功能一行）
  preload/                     沙箱 Preload：按契约通用生成 window.studio
  main/index.ts                应用生命周期、安全设置、窗口
  main/ipc/<feature>.ts        功能处理器（示例：app.ts）
  main/ipc/index.ts            处理器登记（每功能一行）
  main/ipc/registry.ts         注册、发送方校验、事件发送
  main/services/core.ts        CoreServices：数据库、登录 Shell 环境、广播
  main/services/<feature>/     功能服务（database、shell-env、pty 已有）
  main/security/               app:// 协议、导航与权限拦截
  main/window/                 主窗口（Shell Spec v01 第 1、2 节）
  main/smoke/                  --studio-smoke-output 冒烟模式
  renderer/src/app/            壳层组合（顶栏等）
  renderer/src/features/<feature>/  功能 UI、Zustand store、测试
  renderer/src/styles/tokens.css    临时设计 Token
e2e/                           Playwright Electron 冒烟
scripts/                       postinstall、afterPack、打包冒烟脚本
```

## 3. 新增一个 IPC 功能

以 `project` 为例：

1. `src/shared/ipc/project.ts`：

   ```ts
   export const projectContract = defineContract('project', {
     invoke: { open: invoke<{ path: string }, ProjectSummary>('project:open') },
     events: { changed: event<ProjectSummary>('project:changed') }
   })
   ```

2. `src/shared/ipc/contracts.ts` 的列表中加一行 `projectContract`。
3. `src/main/ipc/project.ts`：`createProjectFeature(core)` 返回 `defineHandlers(projectContract, { open: { parse, handle } }, dispose?)`；`parse` 校验输入，服务放在 `src/main/services/project/`。
4. `src/main/ipc/index.ts` 的列表中加一行 `createProjectFeature(core)`。
5. Renderer：`window.studio.project.open({ path })`、`window.studio.project.onChanged(cb)`（返回取消订阅函数）；功能代码放在 `src/renderer/src/features/project/`，通过 `lib/studio.ts` 访问以便测试替换。
6. 主进程推送：`core.broadcast(projectContract.events.changed, payload)` 或 `emit(webContents, …)`。

启动时会检查契约与处理器一一对应；漏登记会直接报错。

## 4. 运行时约定

- 数据库：`<userData>/studio.sqlite3`（开发模式 userData 为 `AI Developer Studio (Dev)`），通过 `core.database()` 获取。新增表 = `src/main/services/database/migrations/<YYYYMMDDNN>_<feature>_<name>.ts` + `migrations/index.ts` 一行。
- 启动环境：Finder 启动的应用只有最小 PATH。需要启动 CLI 或 Shell 时使用 `await core.shellEnv.get()` 返回的 `env`（登录 + 交互 Shell 解析，10 秒超时后回退到启动环境，`source` 字段标明来源）。
- PTY：只在主进程 `services/` 中创建；node-pty 需懒加载并处理加载失败（参考 `services/pty/pty-smoke.ts`）。
- 启动参数：`--studio-user-data-dir=<abs>` 用于测试隔离数据；`--studio-smoke-output=<abs>` 运行冒烟并退出。
- Adapter 为 ESM workspace 包；Electron 主进程构建当前为 CJS，包的 `exports` 同时提供 `import` 与 `default` 条件，供支持同步 ESM require 的 Node / Electron 加载。新增公共子路径需一并保留这两个条件，E2E 启动门禁覆盖实际构建产物。
- Session：`sessionCore` 迁移登记后创建 `createSessionFeature`，注册 Project 的主进程 SessionPort；Renderer 在 `createRoot` 前一次调用 `installSessionIntegration()`。退出前完成草稿 / 壳层 flush、Session 停止与 Runtime 释放；Renderer 确认路径先 flush，原生确认路径先 Stop 再 flush。最终统一等待功能与 IPC 清理后关闭数据库。
- 自动化：未打包且 `STUDIO_E2E_PROVIDERS=1` 时使用模拟 Provider，打包产物忽略该开关。普通 E2E 截图写 `.runtime/desktop-e2e/`；`STUDIO_E2E_EVIDENCE_DIR` 仅用于明确生成验收证据。需要真实窗口焦点的多份 Electron 测试须串行运行。
