---
id: T20261009-app-skeleton
status: done
fr: []
ac: []
specs: []
created: 2026-10-09
---

# macOS 应用骨架

## 当前收尾（2026-10-19）

- 状态：`done`；Main Agent 按 Task Protocol 核对当前授权范围、完成条件、独立评审与证据后收尾，并在本次变更中整体归档。依据为用户要求路线图已完成事项移除、未完成继续推进及后续「continue」；真实 CLI 和发布范围遵循 DEC-16～22。
- 八条骨架标准按 W2 独立结果和本轮最终包核对完成。决定草稿现归 docs/07；open 冒烟确认 SQLite 首迁移 / 重复启动、PTY、屏幕模型、Renderer 隔离及登录 Shell 后发现 Codex / Claude。不将版本探测写成 Claude 真实模型验收。
- 基线：应用源码 `9cd17ef`，随后仅更新文档及归档路径。W27 / W28 独立评审、最终包指纹与真实 UI 结果见[总体验收](../T20261009-v1-foundation-slice/acceptance.md)；Main Agent 最终完整 Electron **49 / 49**、基础门禁 **36 / 257 / 1172**、`1.0.0` arm64 打包和 open 冒烟见[最终报告](../T20261009-v1-foundation-slice/report.md)。此前锁屏条件已解除，没有遗留的技术收尾阻塞。
- 人工接受与技术收尾分开：既有体验确认保留；新增本轮 Diff、推理控制 / 公开输出及图片 / Skill 仍待人工验收。Claude 后续、未观察后代 / 共享 MCP 的证明边界、macOS 13 实机和暂不发布边界继续由总体验收及路线图维护；不改写历史验证或把草稿标成人工确认。

## 历史签收入口（当前收尾见上）

- 人工体验：应用窗口等现有体验已随 V1 功能验收通过（2026-10-18），范围见[总体验收](../T20261009-v1-foundation-slice/acceptance.md#人工功能验收)；当时任务保持 `verifying`，技术收尾按 Lifecycle 执行。
- 审阅依据：[验收记录](acceptance.md)、[交付报告](report.md)。

## 目标

按 [04. Technical Requirements](<../../../docs/04. Technical Requirements.md>) 第 3 节的技术栈建立可开发、可测试、可启动的 Electron 应用骨架，并完成 [CLI Integration Preflight](../../T20261008-cli-preflight/report.md) 第 6 节中属于骨架阶段的两项校验：macOS GUI 启动下的 PATH / 登录环境，以及 Electron 原生依赖（SQLite、node-pty）。

本 task 不交付产品功能，为后续 task 提供分层结构、IPC 约定、本地持久化和测试框架。

## 范围

- 做：
  - pnpm Workspace 根配置；`apps/desktop` 使用 electron-vite + React + TypeScript；Renderer 状态使用 Zustand。
  - 04 第 3 节四层边界：Renderer 不直接访问文件系统、Shell 或凭据；Preload 只暴露最小化、类型化 IPC；Application / Runtime Services 在主进程。启用 `contextIsolation` 与 `sandbox`，关闭 `nodeIntegration`。
  - 类型化 IPC 约定（请求 / 响应与主进程推送事件），供后续 task 按功能目录扩展，互不改动同一文件。
  - SQLite 本地持久化：选型、数据库位置、迁移机制；只建立机制和一张示例表，不定义产品数据表。
  - node-pty：在 Electron 主进程中加载并启动一个 Shell 的冒烟验证；Terminal UI 不在本 task。
  - GUI 启动环境：从 Finder / `open` 启动时解析用户登录 Shell 的环境（PATH 等），供 CLI 可执行文件发现使用。
  - macOS 窗口：最小尺寸 1024×640，窗口控制区位于左侧，顶栏可拖拽（[Shell Spec v01](../../../design/components/shell-spec-v01.md) 第 2、3 节；2026-10-08 确认 macOS 窗口控制区在左侧）。
  - Vitest（主进程与 Renderer 单元测试）与 Playwright（Electron 启动冒烟）。
  - electron-builder 生成未签名的 macOS 应用目录（`--dir`），验证打包后原生依赖可加载、GUI 启动环境解析可用。
  - 功能目录约定：后续 task 在 Renderer、主进程和共享类型中各自拥有目录，写入范围不重叠。
- 不做：产品界面（Project Tabs、导航、Conversation 等）、CLI Adapter、产品数据表、签名 / 公证、最低系统版本与 x64 验证、Windows / Linux。

## 依据

- 技术栈、分层边界、首发 macOS：04 第 3 节。
- 稳定性与性能：04 第 7 节（单个 CLI 进程失败不得导致应用崩溃；并行 Session 不得阻塞主 UI）。
- 骨架阶段校验项：[CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 6 节“macOS GUI 下 PATH / 登录环境”“Electron 原生依赖、SQLite / node-pty”。
- 窗口尺寸与顶栏：Shell Spec v01 第 2、3 节（探索中；最小窗口与窗口控制区位置按该稿实现）。
- 用户 Terminal 与 Agent Runtime 隔离：04 第 5 节（本 task 只确保 PTY 由主进程 Runtime Services 管理）。

## 验收标准

- [x] `pnpm install` 在干净克隆上成功，原生依赖针对 Electron ABI 构建（04 第 3 节）。
- [x] 类型检查、Vitest、Playwright 冒烟测试均通过；命令写入本 task 的报告，由主 Agent 记录到 `AGENTS.md`。
- [x] 开发模式启动后显示窗口，最小尺寸 1024×640，窗口控制区在左侧，顶部区域可拖拽（Shell Spec v01 第 2、3 节）。
- [x] Renderer 中无法访问 Node.js、文件系统和 `ipcRenderer` 原始对象，只能调用 Preload 暴露的类型化 API；有测试或检查证明（04 第 3 节）。
- [x] SQLite 在主进程可读写，迁移可重复执行；数据库位于应用数据目录而非 Project 目录。
- [x] node-pty 在 Electron 主进程中启动 Shell 并收到输出；打包后的应用中同样可用（[CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 6 节）。
- [x] 通过 `open` 启动打包后的应用时，能解析出用户登录 Shell 的 PATH，并找到 `codex` 与 `claude` 可执行文件；结果写入证据，不保存完整环境变量或凭据（[CLI 校验报告](../../T20261008-cli-preflight/report.md) 第 6 节；`tasks/README.md` 证据规则）。
- [x] 影响其他模块的技术选择（SQLite 驱动、IPC 约定、目录约定）写成 `docs/decisions/` 下的决定草稿。
