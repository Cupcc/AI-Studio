---
id: T20261010-commit-gates
status: verifying
fr: [FR-CHAT-001, FR-CHAT-002]
ac: [AC-02]
specs: [specs/chat/spec.md]
created: 2026-10-10
---

# 配置本地 Commit 门禁

## 签收

- 状态：待人工签收；任务保持 `verifying`。
- 审阅依据：[交付报告](report.md)。

## 目标

响应用户 2026-10-10 对话请求「配置一下 commit 门禁」，落实仓库现有检查与 Conventional Commits 约定；不改变产品行为或 FR / AC。

## 范围

- 做：根 workspace 安装 Husky 与 commitlint；提交前运行现有 typecheck / test；检查提交信息；记录安装、手动检查与边界。按后续授权修复 CLI 菜单可访问名称问题，补充回归测试，通过门禁后提交并合并本地 main。
- 不做：新增格式化 / 源码 lint 规范、E2E 门禁、远端 CI 或分支保护、真实 CLI / 模型调用、推送远端。

## 依据

默认采用 Husky + commitlint，复用现有检查，不引入新的源码风格要求。

- 用户 2026-10-10 对话请求（任务授权，具体配置待 diff 审阅）。
- 用户 2026-10-10 后续指令「提交合并到main」「fix and 合并」授权修复阻塞问题并提交合并。
- CLI 菜单修复依据：[Chat spec](../../specs/chat/spec.md) 第 3 节（FR-CHAT-001/002）；[AC-02](<../../docs/05. Acceptance Criteria.md>) 的 CLI 选择与 New Chat 流程，不扩展产品功能。
- [仓库指南](../../AGENTS.md) 的 Build, Test, and Development Commands 与 Commit & Pull Request Guidelines。
- 门禁配置本身不直接对应产品 AC；后续 CLI 菜单修复关联上述 FR / AC，既有产品验收要求不变。

## 验收标准

- [x] `pnpm install` 自动配置仓库本地 Git hooks。（来源：用户请求；Husky 官方安装方式）
- [x] `pre-commit` 执行现有类型检查与单元测试，失败阻止提交；不调用 E2E 或真实 CLI。（来源：仓库指南的开发命令）
- [x] `commit-msg` 接受合法 Conventional Commits（包括 `!` 与中文主题），拒绝非法格式。（来源：仓库指南的提交约定）
- [x] 文档说明手动运行方式、本地可绕过与工作树检查边界。（来源：用户门禁请求的实现说明）
- [x] CLI 选择按钮名称保持唯一、不可用原因与默认状态作为可访问描述保留；禁用与选择行为不变，全量门禁通过。（来源：Chat spec 第 3 节、AC-02；用户修复授权）

以上为实现者自检，不是人工验收；完整结果及现有单测阻塞见 [report.md](report.md)。

## 已确认事项

用户已请求配置 commit 门禁，并授权修复阻塞问题后提交合并 main（2026-10-10 确认）。新增修复的验收结果尚待人工确认，不自动标记任务 done。
