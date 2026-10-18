# apps/desktop

AI Developer Studio 的 Electron 桌面客户端（macOS 首发）。技术栈见 [04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 3 节；本目录由 [T20261009-app-skeleton](../../tasks/T20261009-app-skeleton/task.md) 建立。

相关决定（状态见各条目）：

- [DEC-02](<../../docs/07. Decisions.md>)：进程边界、安全基线、类型化 IPC。
- [DEC-03](<../../docs/07. Decisions.md>)：功能目录与写入范围。
- [DEC-01](<../../docs/07. Decisions.md>)：SQLite 驱动、数据库位置与迁移。

## 1. 命令

根命令列表见[仓库指南](../../AGENTS.md)的 Build, Test, and Development Commands。本节只补充桌面包相关的细节。

桌面包通过 workspace 依赖 `@ai-studio/agent-adapter`。根命令会先构建该包；直接使用 `pnpm --filter @ai-studio/desktop …` 时，需先运行 `pnpm --filter @ai-studio/agent-adapter build`。

开发迭代的局部测试与提交／CI 检查范围见[测试分层](../../scripts/README.md#测试分层)。包内 `test:e2e:built` 与 `package:built` 不构建任何源码，仅供同一流程先构建后复用产物；源码、依赖或构建配置变化后必须重新构建。日常独立执行仍用根命令 `test:e2e` / `package`，不要把旧产物当作当前代码验证结果。

| 命令 | 桌面包细节 |
|---|---|
| `pnpm install` | `postinstall` 下载 Electron 二进制并修复 node-pty `spawn-helper` 的可执行位 |
| `pnpm dev` | electron-vite 开发模式，Renderer 热更新 |
| `pnpm test:e2e` | 覆盖原生依赖冒烟（SQLite、PTY、CLI 发现）与使用模拟 Provider 的 Project / Session 流程；另含真实本地 Shell / PTY 与回环 HTTP fixture 的 Terminal / Browser 流程（`runtime-tools.spec.ts`，不访问外网）；截图位置见第 4 节“自动化” |
| `pnpm package` | 输出目录 `apps/desktop/dist/mac-arm64/` |
| `pnpm smoke:packaged` | 以 `open` 启动打包应用，检查 SQLite、node-pty、Terminal 屏幕模型（`@xterm/headless` + 序列化插件 + 状态检查点，验证打包后能解析外部依赖及 xterm 私有结构）与登录 Shell 环境解析。每次默认使用独立临时 userData，保留供诊断；结果默认写入 `.runtime/desktop/packaged-smoke.json`；`-- --out <file>` 指定报告，`-- --user-data-dir <dir>` 显式指定测试数据目录 |

## 2. 目录

`build/` 保存纳入 Git 的打包输入资源，区别于生成产物目录 `dist/`。`build/icon.png` / `build/icon-dark.png` 为浅色 / 深色图标，来源与采用记录见[图标索引](../../design/icons/README.md#本机采用)。macOS 打包时由 electron-builder 将浅色版转换为应用包图标，并通过 `extraResources` 将两张 PNG 复制到 `Contents/Resources/icons/`。开发和打包应用运行时，`window/appearance.ts` 在 ready 后读取已保存的颜色模式，并通过 `app.dock.setIcon` 按 `AppearanceState.dark` 更新 Dock 图标；开发读取 `build/`，打包读取 `process.resourcesPath/icons/`。动态切换范围见[外观规格](../../specs/settings/spec.md#fr-set-002-外观主题)。更新设计稿后须同步这两个文件，再重启开发应用或重新打包。

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
  main/services/<feature>/     功能服务（database、shell-env、pty 冒烟、project、session、settings、project-view、terminal、browser、files、diff 已有）
  main/security/               app:// 协议、导航与权限拦截
  main/window/                 主窗口（Shell Spec v01 第 1、2 节）
  main/smoke/                  --studio-smoke-output 冒烟模式
  renderer/src/app/            壳层组合（顶栏等）
  renderer/src/features/<feature>/  功能 UI、Zustand store、测试
  renderer/src/styles/tokens.css    设计 Token（取值依据见 design/visual-direction.md 第 5 节）
  renderer/src/styles/primitives.css  共享样式原语：按钮、图标按钮、弹层与菜单、状态点、悬停提示
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
- 工程工具遵循 [工具规格](../../specs/tools/spec.md) 与 [DEC-10](<../../docs/07. Decisions.md#dec-10-工程工具实现原则>)：Terminal 服务持有 PTY、headless xterm 屏幕与序号输出；Browser 服务持有隔离 WebContentsView，Renderer 隐藏 / 卸载只解除显示。两工具分别登记 typed IPC；Project / 退出由独立 `MainToolPort` 清理，Session Stop 不触及用户 PTY。显示 ACK / 屏幕缓存、分区 / 地址、显隐与关闭细节见 Tools spec §5.1；Files / 项目 Diff 已接入有界主进程服务与按需 Monaco 查看器，限制及文件引用转换见 Tools spec §5.2；本轮 Diff 通过 Session 保存的 `turn_diffs` 记录与 `session:get-turn-diff` 展示历史，不读取工作区重建；迁移、来源、限额与原生覆盖见 Tools spec §5.3。`@xterm/*` 版本精确锁定，屏幕检查点依赖其私有结构（`shared/tools/terminal.ts`），升级后须重跑 ANSI 差分验证（目前仅保存在任务证据 `tasks/T20261009-context-tools/evidence/W4-ansi-handoff.test.ts`，不在 `pnpm test` 内）。
- 启动参数：`--studio-user-data-dir=<abs>` 用于测试隔离数据；`--studio-smoke-output=<abs>` 运行冒烟并退出。
- Adapter 为 ESM workspace 包；Electron 主进程构建当前为 CJS，包的 `exports` 同时提供 `import` 与 `default` 条件，供支持同步 ESM require 的 Node / Electron 加载。新增公共子路径需一并保留这两个条件，E2E 启动门禁覆盖实际构建产物。
- Session：`sessionCore` 迁移登记后创建 `createSessionFeature`，注册 Project 的主进程 SessionPort；Renderer 在 `createRoot` 前一次调用 `installSessionIntegration()`。退出时 QuitFlow 依次 Stop 全部回合、经 `MainToolPort` 清理全部工程工具资源、`releaseAllRuntimes` 释放全部空闲 / 已退役 Session Runtime（批准前可逆，任一失败保持应用打开并可重试），再完成草稿 / 壳层 flush 并批准退出；Renderer 确认路径先 flush，原生确认路径先 Stop 再 flush。最终统一等待功能与 IPC 清理后关闭数据库。
- 自动化：未打包且 `STUDIO_E2E_PROVIDERS=1` 时使用模拟 Provider，打包产物忽略该开关。普通 E2E 截图写 `.runtime/desktop-e2e/`；`STUDIO_E2E_EVIDENCE_DIR` 仅用于明确生成验收证据。需要真实窗口焦点的多份 Electron 测试须串行运行。用例一旦打开过 Terminal，结束应用须用 `e2e/quit.ts` 的 `closeTestApp` 处理合并退出确认。
- Project View：`shared/project-view/resources/` 打包五类默认 Definition 和可读 Schema；校验与绑定规则由同目录 `schema.ts` 实现。主进程只读取 Knowledge / Definition，在带 View Context 的首条发送前初始化指南/Schema/`.gitignore`；文件、回合结束和窗口聚焦触发补扫。生命周期与真实验收边界见 [Project View 规格](../../specs/project-view/spec.md#6-实现计划与落地记录)及[实现任务](../../tasks/archive/T20261011-project-view-implementation/task.md)。
- 外观（FR-SET-002；[settings spec](../../specs/settings/spec.md)）：主题（`glass` / `solid`）× 颜色模式（浅 / 深）。颜色、阴影与圆角都是 `styles/tokens.css` 中的 Token，按 `<html data-theme data-scheme data-glass-color>` 分四块覆盖（见文件头注释）；毛玻璃的少量几何差异在 `app/shell.css` 末尾。容器背景使用语义 Token（`--color-window`、`--color-pane` 等），不要直接写 `--color-surface`，否则毛玻璃下会挡住原生材质；新增颜色须在四块中都有取值（例外：Terminal 的 xterm 调色板是 `features/tools/terminal-theme.ts` 中按浅 / 深两种方案各一张的显式表，随 `data-scheme` 实时切换，不读 Token；其对比度要求由该文件的单元测试守护，改动配色须同步调整测试与规格）。主进程 `window/appearance.ts` 负责窗口材质与底色，颜色模式经 `nativeTheme.themeSource` 生效；Renderer 在首次渲染前写入 `<html>` 属性。界面改动须检查：`e2e/alignment.spec.ts` 的布局用例在两种主题下各跑一遍，`e2e/settings.spec.ts` 覆盖 AC-08 并测量浅 / 深色下的次要文字对比度（系统深浅色与“降低透明度”在主进程覆盖 `nativeTheme` 模拟）。
- `e2e/project-view.spec.ts` 覆盖 AC-06 的模拟 CLI 文件更新、last-good、工具切换、View Context、草稿隔离与重启；不发送真实模型请求。真实 AC-06 验证须另行记录已授权调用范围。
- `e2e/files.spec.ts` / `e2e/diff.spec.ts` 覆盖惰性文件树、只读查看与刷新、文件引用发送 / 失败保留、Git 项目变更及特殊状态；`e2e/turn-diff.spec.ts` 覆盖保存补丁、工作区变化 / 重启后的历史不变性、未知 / 空状态、失败 / 停止及用户主动切换范围。均使用隔离目录和模拟 Provider；真实 Codex 普通 / 同轮引用与原生 patch 的证据见[工程工具验收](../../tasks/T20261009-context-tools/acceptance.md#2026-10-18-codex-应用-ui-与四工具综合复验w24)及其 W23 独立评审。
- `e2e/runtime-tools.spec.ts` 覆盖真实本地 PTY / HTTP 预览及模拟 Session Stop；验证 ANSI 隐藏恢复、多 Terminal、合并关闭确认、Browser 页面隔离 / 外站选择 / 弹层 / 失败与地址恢复。界面独立交互、阶段范围及人工验收见[运行时工具验收](../../tasks/T20261009-context-tools/acceptance.md)，不代替真实双 CLI 或四工具整体验收。
