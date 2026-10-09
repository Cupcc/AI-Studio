---
id: T20261009-install-dev-skills
status: verifying
fr: []
ac: []
specs: []
created: 2026-10-09
---

# 安装项目开发 Skills

## 目标

按用户 2026-10-09 对话指令，为本项目的 Claude Code CLI 和 Codex CLI 安装此前优先推荐的四个 Skills：vitest、frontend-design、vercel-react-best-practices、agent-browser。

## 范围

- 安装到项目 `.agents/skills/`，在 `.claude/skills/` 建立对应的相对符号链接。
- 保留上游资源，记录来源和版本，验证元数据及链接；检查 agent-browser 的工具依赖。
- 此任务为开发工具配置，不改变产品行为或 FR / AC 验收定义。

## 依据

- 用户 2026-10-09 对话指令：“install 优先推荐的4个，for claude cli and codex cli”。
- [Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 2 节的 React、TypeScript、Vitest 技术栈；[设计索引](../../design/README.md) 第 3 节的高保真设计阶段。
- 仓库 AGENTS.md 的任务记录和人工验收规则。

## 验收标准

- [x] 四个 Skills 的完整资源安装到项目目录，来源和版本可追溯。（来源：用户安装指令）
- [x] Codex 与 Claude Code 的发现目录均可读取同一份 SKILL.md，链接无断裂。（来源：用户指定两个 CLI）
- [x] 记录使用方式与 agent-browser 工具依赖。（来源：用户安装指令）

## 未决问题

无。

## 进度与验证

- 2026-10-09：检查工作区干净，当前分支为 `dev/v1`；确认 Codex CLI 0.162.0、Claude Code CLI 2.1.295 及 npx 可用。官方文档确认两种 CLI 支持项目级 Skills，Claude Code 支持链接目录。
- 2026-10-09：用 skill-installer 按固定 commit 安装四个 Skills；Claude Code 的四个相对目录链接均解析到 `.agents/skills/` 对应目录。来源、版本及调用方法记录在 [安装说明](../../.agents/skills/README.md)。
- 2026-10-09：Node 只读检查通过：四个 SKILL.md 的 name / description 元数据、Claude 链接内容一致性及 Vitest 引用资源存在性。Codex App Server 的 `skills/list` 实际发现四个项目 Skills，全部 `enabled=true`；未创建 Thread 或调用模型。Claude Code 验证发现目录及链接可读，未开启模型会话验证其菜单。
- 2026-10-09：`npx --yes agent-browser@0.38.2 --version` 返回 `agent-browser 0.38.2`；core 和 electron 工作流读取成功。该 CLI 缓存在 npm 的 npx 缓存中，通过固定版本 npx 调用；未添加应用依赖或全局 CLI，未下载独立浏览器。
- 2026-10-09：`git diff --check` 通过。任务保留 `verifying`，等待人工确认；没有写独立 acceptance.md 或将任务设为 done。
