# AI Developer Studio

以本地项目为中心的轻量桌面 AI 工作台：统一管理 Codex CLI、Claude Code 等 CLI Agent 的 Session，通过预设工作台 Project Views 理解项目状态，并支持面向开发与创作的自定义工作台。两者的概念见[产品定义](<docs/01. Product Definition.md#workbench>)。V1 首发 macOS。最小工作台插件机制已实现，技术验收与剩余检查见[路线图](<docs/06. Development Roadmap.md#42-插件架构与工作台建设>)。

产品定位、V1 目标与核心概念见 [01. 产品定义](<docs/01. Product Definition.md>)；当前阶段、进度和下一步见 [06. V1 建设计划与进度](<docs/06. Development Roadmap.md>)。

## 快速开始

Node 与 pnpm 版本由根目录 [package.json](package.json) 的 `engines` 与 `packageManager` 固定。在仓库根目录执行：

```sh
pnpm install   # 安装依赖、Electron 二进制和本地 Git hooks
pnpm dev       # 以开发模式启动桌面应用
```

常用根命令见[开发命令](scripts/README.md#开发命令)；桌面包的命令细节与代码结构见 [apps/desktop/README.md](apps/desktop/README.md)。

日常体验在主目录 `dev` 分支运行 `pnpm dev`。功能先集成 dev，经人工验收后再进入 main；具体流程见[分支规范](CONTRIBUTING.md#2-分支规范)。

## 仓库结构

| 路径 | 内容 |
|---|---|
| [`docs/`](<docs/00. Documentation Index.md>) | 产品与技术规格、建设计划、决定记录 |
| [`specs/`](specs/README.md) | 模块规格及其 FR 对应关系；规格模板见 [`specs/templates/`](specs/templates/) |
| [`tasks/`](tasks/README.md) | 进行中的任务记录与验证证据；任务模板见 [`tasks/templates/`](tasks/templates/) |
| [`.agents/archive/`](.agents/archive/) | 按类别保存归档文件；任务归档见 [Task Protocol](tasks/README.md#archiving) |
| [`design/`](design/README.md) | 视觉方向、线框图、界面、组件与原型 |
| [`apps/desktop/`](apps/desktop/README.md) | Electron + React + TypeScript 桌面客户端 |
| [`packages/`](packages/) | 不依赖 Electron 的 workspace 包，例如 CLI Adapter |
| [`scripts/`](scripts/README.md) | 开发命令、Git hooks、CI 与真实 CLI 预检脚本 |
| `.runtime/` | 本地日志、缓存与临时输出，已忽略，可删除 |

各目录的命名、状态与审阅规则见其索引文件。

## 参与开发

- 先读 [AGENTS.md](AGENTS.md)：全局约束与按需读取入口。
- 开发协作、文档维护、分支、提交、PR 与合并见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 是否需要任务记录及任务流程见 [Task Protocol](tasks/README.md)。
