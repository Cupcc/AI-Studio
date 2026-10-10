---
id: T20261010-github-ci
status: in_progress
fr: [FR-STATE-004, FR-STATE-005, FR-SESSION-001]
ac: [AC-04]
specs: []
created: 2026-10-10
---

# 推送 GitHub 并配置 CI

## 目标

将本地仓库推送到 `https://github.com/Cupcc/AI-Studio.git`，配置可重复执行的 GitHub Actions 检查。

## 范围

- 做：配置 origin、保留现有分支；新增 push / pull_request / 手动触发的 macOS arm64 CI；复用类型检查、单元测试、Electron E2E、未签名打包与打包冒烟命令；保存测试证据并验证首次远端运行；修正阻塞 CI 的 E2E 前台窗口准备和 Project Tab 定位。
- 不做：修改产品功能、签名、公证、发布 Release、配置分支保护或将尚待验收的原型对齐工作合并 main。

## 依据

- 用户 2026-10-10 请求「git push https://github.com/Cupcc/AI-Studio.git,配置好ci」。
- [仓库指南](../../AGENTS.md) 的开发命令、分支与提交约定。
- [Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 2 节的首发 macOS 平台约束。
- [Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>) 第 1 节：自动化检查不替代产品端到端人工验收。本任务不新增或变更 FR / AC。
- E2E 修正保留 [AC-04](<../../docs/05. Acceptance Criteria.md>) 的完成提醒、进入后清除和展示最新内容断言，关联 FR-STATE-004/005、FR-SESSION-001。

## 验收标准

- [x] CI 配置使用 Node 24、packageManager 指定的 pnpm 和冻结 lockfile 安装。（来源：仓库开发环境约定；远端执行待验证）
- [x] CI 配置执行现有类型检查、单元测试、E2E、打包及打包冒烟；不请求真实模型。（来源：用户请求、仓库开发命令；远端执行待验证）
- [x] CI 配置限制权限、超时、取消过期运行并保留测试证据。（来源：用户 CI 请求的实现细化）
- [ ] 提交推送到指定远端并检查首次 CI 结果。（来源：用户请求）

## 已确认事项

用户已授权推送到上述仓库并配置 CI（2026-10-10 确认）；实现结果尚待人工验收。

用户完成 GitHub 重新授权并指示继续推送、处理 CI 失败项（2026-10-10 确认）。已验证新凭据包含 `workflow` scope。

## 未决问题

无阻塞实现的问题；先前权限阻塞已解决，继续检查远端运行及修复测试阻塞。

## 实现者自检与恢复记录

- 工作流提交：`79b08cd`；`actionlint .github/workflows/ci.yml`、YAML 解析与 `git diff --check` 通过。
- 本地类型检查与 314 个单元测试通过；`pnpm package`、`pnpm smoke:packaged` 通过。本机 Node 为 26.10.0，CI 目标 Node 24 尚未远端验证。
- 本地 E2E 为 21 / 24 通过，保留全部用例：后台完成后未读未清除（并有 teardown 超时）、失焦后窗口未重新聚焦、滚动恢复用例按精确名称查找 Project Tab 失败（实际名称包含未读状态描述）。尚未修复，不能声称 CI 全绿。
- `origin` 指向用户指定仓库；使用单次 `http.postBuffer=52428800` 避免 HTTP 分块上传失败，成功推送 `main`（`969850a`）和 `task/prototype-alignment`（`2465167`）。未将待验收的原型工作合并 main。
- `task/github-ci` 推送被 GitHub 以缺少 `workflow` scope 拒绝，远端尚无 Actions runs。用户授权后，先确认 Git push 使用的新凭据，再推送该分支并检查 Actions 日志；修复阻塞检查后更新本记录。
- 重新授权后分支推送成功，首轮运行：[38010574348](https://github.com/Cupcc/AI-Studio/actions/runs/38010574348)。已通过冻结 lockfile 安装与 runner 架构检查。
- E2E 修正：测试准备使用 `app.focus({ steal: true })` 并等待真实 `isFocused()`，恢复焦点后仍检查未读状态；Tab 定位兼容名称后的注意力描述，不修改产品行为。此前失败的 3 项本地定向回归全部通过（10.7 秒）。依据：[Electron app.focus](https://www.electronjs.org/docs/latest/api/app#appfocusoptions)。
- 本记录是实现者自检，不是人工验收；本任务不标记 done。
