# AI Developer Studio

以本地项目为中心的轻量桌面 AI 工作台：统一管理 Codex CLI、Claude Code 等 CLI Agent 的 Session，通过 Project View 理解项目状态，并支持面向开发与创作的自定义工作台方向。V1 首发 macOS。自定义工作台尚处于原型建设前，范围和进度见[路线图](<docs/06. Development Roadmap.md#42-自定义工作台原型>)。

产品定位、V1 目标与核心概念见 [01. 产品定义](<docs/01. Product Definition.md>)；当前阶段、进度和下一步见 [06. V1 建设计划与进度](<docs/06. Development Roadmap.md>)。

## 快速开始

Node 与 pnpm 版本由根目录 [package.json](package.json) 的 `engines` 与 `packageManager` 固定。在仓库根目录执行：

```sh
pnpm install   # 安装依赖、Electron 二进制和本地 Git hooks
pnpm dev       # 以开发模式启动桌面应用
```

常用根命令见[开发命令](scripts/README.md#开发命令)；桌面包的命令细节与代码结构见 [apps/desktop/README.md](apps/desktop/README.md)。

## 仓库结构

| 路径 | 内容 |
|---|---|
| [`docs/`](<docs/00. Documentation Index.md>) | 产品与技术规格、建设计划、决定记录 |
| [`specs/`](specs/README.md) | 模块规格及其 FR 对应关系 |
| [`tasks/`](tasks/README.md) | 任务记录与验证证据 |
| [`templates/`](templates/) | 任务、计划、验收、报告和规格模板 |
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
