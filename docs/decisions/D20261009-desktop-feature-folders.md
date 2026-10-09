# D20261009 桌面端功能目录约定

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 日期 | 2026-10-09 |
| 关联 | task [T20261009-app-skeleton](../../tasks/T20261009-app-skeleton/task.md)；[tasks/AGENTS.md](../../tasks/AGENTS.md)“Parallel Workers”；[D20261009-desktop-ipc-convention](D20261009-desktop-ipc-convention.md)；[D20261009-desktop-sqlite-driver](D20261009-desktop-sqlite-driver.md) |
| 取代 | — |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。

## 背景

[tasks/AGENTS.md](../../tasks/AGENTS.md) 要求并行 worker 的写入范围不重叠。后续 task（project-shell、session-slice、project-view、context-tools）会同时修改 `apps/desktop`，需要事先约定每个功能拥有哪些目录，以及少数共享登记文件如何修改。

## 决定

以下路径相对 `apps/desktop/`，`<feature>` 为小写驼峰功能名（与 IPC 契约名一致，如 `project`、`session`、`terminal`）。

| 位置 | 归属 | 内容 |
|---|---|---|
| `src/shared/ipc/<feature>.ts` | 功能 | IPC 契约与跨进程数据类型 |
| `src/shared/<feature>/` | 功能 | 其他纯 TypeScript 共享代码（不得引用 Node 或 DOM） |
| `src/main/ipc/<feature>.ts` | 功能 | 主进程处理器工厂 |
| `src/main/services/<feature>/` | 功能 | Application / Runtime Services（进程、PTY、文件、Git 等） |
| `src/main/services/database/migrations/<id>.ts` | 功能 | 该功能的迁移，ID 见 SQLite 决定 |
| `src/renderer/src/features/<feature>/` | 功能 | 组件、Zustand store、样式与测试 |
| `src/renderer/src/app/` | project-shell task | 窗口壳层组合（顶栏、导航、画布、侧栏容器） |
| `src/renderer/src/styles/tokens.css` | 设计 / project-shell task | 临时视觉 Token，集中定义 |
| `src/shared/ipc/contracts.ts`、`src/main/ipc/index.ts`、`src/main/services/database/migrations/index.ts` | 共享登记 | 每个功能各加一行，不改动他人的行 |
| `src/main/index.ts`、`src/main/window/`、`src/main/security/`、`src/preload/`、`src/main/services/core.ts`、构建与测试配置 | 骨架 | 修改需在 task 中说明理由 |

规则：

1. 测试与源码同目录，命名 `*.test.ts(x)`；主进程 / shared / preload 测试在 Node 环境运行，Renderer 测试在 jsdom 运行；跨进程冒烟放在 `e2e/`，每个功能一个 `e2e/<feature>.spec.ts`。
2. 功能之间不直接引用对方的 `services/` 或 `features/` 内部文件；需要协作时通过 `src/shared/` 中的类型、`CoreServices` 或明确导出的接口。
3. PTY 与 CLI 子进程只由主进程 `services/` 持有。用户 Terminal（context-tools）与 Agent Runtime（session / CLI Adapter）使用各自的服务与 PTY，不共享实例（04 第 4 节）。
4. CLI 可执行文件发现与启动环境使用 `CoreServices.shellEnv`（登录 Shell 环境），不直接使用 `process.env.PATH`；CLI Adapter 包（`packages/agent-adapter`）只接收外部传入的 PATH / 可执行路径。
5. 视觉参数只写在 `tokens.css`；该文件标注为临时，高保真评审后整体替换（[Visual Direction](../../design/visual-direction.md) 第 5 节）。布局尺寸来自 [Shell Spec v01](../../design/components/shell-spec-v01.md) 第 1 节。

## 备选方案

| 方案 | 放弃原因 |
|---|---|
| 按技术层集中（所有 store 一个目录、所有组件一个目录） | 并行 task 会频繁修改同一目录下的公共文件，写入范围难以划分。 |
| 每个功能拆成独立 workspace 包 | 骨架阶段过重；Electron 三端打包与路径别名复杂度上升。确有复用需求（如 CLI Adapter）时单独建包。 |

## 影响

- task 的写入范围可以直接写成上表中的功能路径加“共享登记文件各一行”。
- 修改骨架文件的 task 需在 plan 中声明，避免与其他 task 同时修改。

## 依据

- 目录与登记文件的实际结构及示例功能 `app`：`apps/desktop/README.md`。
- [research.md](../../tasks/T20261009-app-skeleton/research.md) 第 2 节。
