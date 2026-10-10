# 项目开发 Skills

2026-10-09 按用户对话指令安装。Codex CLI 从本目录发现 Skills；Claude Code CLI 通过 `.claude/skills/<name>` 的相对符号链接读取同一份资源。

## 来源与版本

安装使用 skill-installer，固定到以下 Git commit；保留上游 SKILL.md 与配套资源。

| Skill | 上游路径 | Commit |
|---|---|---|
| `vitest` | [antfu/skills — skills/vitest](https://github.com/antfu/skills/tree/feb0f3aba6566426f12230e7fc7a10d97c1293bb/skills/vitest) | `feb0f3aba6566426f12230e7fc7a10d97c1293bb` |
| `frontend-design` | [anthropics/skills — skills/frontend-design](https://github.com/anthropics/skills/tree/683bc88e56f3e09ba94f7055977f3d3aa499f202/skills/frontend-design) | `683bc88e56f3e09ba94f7055977f3d3aa499f202` |
| `vercel-react-best-practices` | [vercel-labs/agent-skills — skills/react-best-practices](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/react-best-practices) | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| `agent-browser` | [vercel-labs/agent-browser — skills/agent-browser](https://github.com/vercel-labs/agent-browser/tree/0207911f1bd4d0393eddaa90f2e50f96e0fb8974/skills/agent-browser) | `0207911f1bd4d0393eddaa90f2e50f96e0fb8974` |

frontend-design 随包提供 LICENSE.txt；vitest 和 agent-browser 补充了对应 commit 的仓库许可证。React Skill 的 SKILL.md 标注 MIT，完整规则保留上游署名。

## 使用

从本仓库启动 CLI；新会话可发现这些 Skills。如果当前会话菜单未刷新，重启 CLI。

| CLI | 显式调用示例 |
|---|---|
| Codex CLI | `$vitest`、`$frontend-design`、`$vercel-react-best-practices`、`$agent-browser` |
| Claude Code CLI | `/vitest`、`/frontend-design`、`/vercel-react-best-practices`、`/agent-browser` |

使用时遵循本项目 AGENTS.md、任务协议、确认过的产品规格和视觉方向。React Skill 中 Next.js / SSR 专用规则只在对应技术存在时适用；模拟 Provider 的测试不能代替真实 CLI 验收。

## agent-browser 工具依赖

安装的 agent-browser Skill 是入口说明，完整 core / electron 工作流随工具版本提供。本机已验证 `npx` 可执行固定版本 `0.38.2`；使用下列命令，无需加入应用依赖：

```sh
npx --yes agent-browser@0.38.2 skills get core
npx --yes agent-browser@0.38.2 skills get electron
npx --yes agent-browser@0.38.2 --version
```

上游说明里的 `agent-browser ...` 可使用 `npx --yes agent-browser@0.38.2 ...` 调用。Electron 验证连接应用的 CDP 调试端口；独立浏览器验证首次使用时需要下载浏览器（`npx --yes agent-browser@0.38.2 install`）。

应用截图及日志先放 `.runtime/`，验收证据按 `tasks/README.md` 的规则保存。此次只验证工具启动及工作流读取，未启动应用或执行 UI 测试。

发现目录依据：[Codex 官方文档](https://learn.chatgpt.com/docs/build-skills)、[Claude Code 官方文档](https://code.claude.com/docs/en/skills)。安装记录：[任务](../../tasks/T20261009-install-dev-skills/task.md)。
