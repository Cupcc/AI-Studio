---
id: T20261010-github-ci
status: in_progress
fr: []
ac: []
specs: []
created: 2026-10-10
---

# 推送 GitHub 并配置 CI

## 目标

将本地仓库推送到 `https://github.com/Cupcc/AI-Studio.git`，配置可重复执行的 GitHub Actions 检查。

## 范围

- 做：配置 origin、保留现有分支；新增 push / pull_request / 手动触发的 macOS arm64 CI；复用类型检查、单元测试、Electron E2E、未签名打包与打包冒烟命令；保存测试证据并验证首次远端运行。
- 不做：修改产品功能、签名、公证、发布 Release、配置分支保护或将尚待验收的原型对齐工作合并 main。

## 依据

- 用户 2026-10-10 请求「git push https://github.com/Cupcc/AI-Studio.git,配置好ci」。
- [仓库指南](../../AGENTS.md) 的开发命令、分支与提交约定。
- [Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 3 节的首发 macOS 平台约束。
- [Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) 第 1 节：自动化检查不替代产品端到端人工验收。本任务不新增或变更 FR / AC。

## 验收标准

- [ ] CI 使用 Node 24、packageManager 指定的 pnpm 和冻结 lockfile 安装。（来源：仓库开发环境约定）
- [ ] CI 执行现有类型检查、单元测试、E2E、打包及打包冒烟；不请求真实模型。（来源：用户请求、仓库开发命令）
- [ ] CI 限制权限、超时、取消过期运行并保留测试证据。（来源：用户 CI 请求的实现细化）
- [ ] 提交推送到指定远端并检查首次 CI 结果。（来源：用户请求）

## 已确认事项

用户已授权推送到上述仓库并配置 CI（2026-10-10 确认）；实现结果尚待人工验收。

## 未决问题

无阻塞实现的问题。
