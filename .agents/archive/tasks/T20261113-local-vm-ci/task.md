---
id: T20261113-local-vm-ci
status: done
fr: []
ac: []
specs: []
created: 2026-11-13
---

# 本机 tart 虚拟机作为正式 CI

## 收尾

Main Agent 自检收尾。本任务是仓库流程任务，按 [Task Protocol](../../../../tasks/README.md#验收范围与独立性) 自检，没有安排独立 AI 评审。基线为 dev `59db18f`，以下运行均在本机 tart 虚拟机中完成：

- affected（`226675a`）50 s 通过；package（`74b79ed`）73 s 通过，依赖与镜像一致时跳过安装，CLI 版本取自 `ci.yml`（codex-cli 0.161.0、Claude Code 2.1.294）。
- full 单台（`6f8f9c8`）7 分 05 秒通过，E2E 302 s，无 flaky；full `--parallel`（同一提交）7 分 39 秒通过，两台 E2E 各约 290 s，`project-view.spec.ts` AC-06 重试后通过，已修复（见下）。
- `--scope e2e --spec diff.spec.ts` 只运行该文件的 4 项（含 `turn-diff.spec.ts` 时为 7 项）。运行中发送 SIGINT：克隆、临时引用与名额都已清理，记为 `cancelled`。并发排队在 rebase 前（`d3a80af`，名额逻辑此后未改）验证：三个运行同时启动，第三个等待空名额后通过。
- 修复：镜像制作结束后补 `sync`（`tart stop` 直接断电，未落盘的写入丢失，之前的镜像没有记下依赖哈希）；终端恢复完成时不再抢走文本框焦点（`vscode-parity` 偶发失败的根因，单测覆盖）；`project-view.spec.ts` 首次点击工作台页面前先 `hoverInPage`，与 `product-selection.spec.ts` 同因。
- 脚本单测 `vm-ci.test.mjs` 18 项及 `check-affected`、`integrate-branch`、`remote-ci` 测试通过。最终源提交的全量运行由集成命令核对，记入集成提交的 `CI-Run`。
- 文档复核：更新 [scripts/README](../../../../scripts/README.md#本机-vm-ci) 的命令表、任务分支集成、测试分层、打包输入、新的本机 VM CI 一节、GitHub Actions CI 与远端 E2E；[贡献指南](../../../../CONTRIBUTING.md) §2 本机资源与 §4 CI；[Task Protocol](../../../../tasks/README.md) 的自动化检查、默认收尾与证据。历史任务中的远端 CI 记录保留原样。路线图不涉及此流程，未修改。贡献指南与 Task Protocol 的改动待用户审阅。

收尾日期 2026-11-13。

## 未决问题

| 问题 | 推荐答案与依据 | 决策方（人 / AI） | 是否阻塞 |
|---|---|---|---|
| GitHub Actions 的 dev / main push 与 PR 触发是否保留 | 保留为次要记录与本机不可用时的后备：公开仓库不计费，也不阻塞集成；正式结论以本机 VM CI 为准 | 人 | 否，未答复前保持现状 |

## 目标

把 AI 默认的应用检查（受影响检查、选中 E2E、全量与打包冒烟）从 GitHub macOS runner 移到本机 tart macOS 虚拟机，作为正式 CI；默认单台 4 核 8 GB，可选两台并行。同时修复正式运行暴露的偶发失败。

## 范围

- 做：
  - `scripts/vm-ci.mjs`：与 `remote-ci.mjs` 相同的 `affected` / `e2e` / `package` / `full` 模式，`--parallel` 两台并行，`--setup` 制作或刷新金镜像；测试已提交的 HEAD，不需要推送；结果写入集成门禁读取的运行记录。
  - 并发与资源：本机最多两台 macOS 虚拟机，多个会话共用时排队；运行结束或中断都清理克隆的虚拟机。
  - `--spec` 与 CI 的 `check-scope.mjs` 一样转成 `e2e/<name>`：Playwright 把文件参数当正则，裸文件名 `diff.spec.ts` 会多选 `turn-diff.spec.ts`。
  - 文档：脚本说明、贡献指南与 Task Protocol 中「E2E 默认远端 CI」的规则改为本机 VM CI。
  - 用正式流程反复运行全量，修复暴露出的偶发失败。
  - 终端恢复完成时不再抢走文本框焦点：恢复期间按 ⌘F 打开的查找框会被终端夺回焦点，是 `vscode-parity` 偶发失败的根因。
- 不做：删除 GitHub Actions 工作流（见未决问题）；签名、公证与发布。

## 依据

- 2026-11-13 对话：用户提出用本机 tart 运行 macOS 虚拟机测试以替代过慢的 CI；试运行后用户指示「本机tart作为正式的ci，默认单台4核8gb，可2台并行。fix all」。
- 试运行数据（同一提交，全量不含打包）：GitHub CI 约 640 s 加排队；单台 4 核 8 GB 370 s；6 核 12 GB 364 s（E2E 为 `workers: 1`，加核无效）；两台 4 核 6 GB 并行 280 s，期间本机 CPU 平均 67%、交换区增加约 2.5 GB。
- 正式脚本数据（本机 Apple M5，4 个性能核加 6 个能效核，32 GB）：full 含打包，单台 7 分 05 秒，两台并行 7 分 39 秒。并行时 `check:code` 由 47 s 变为 99 s，各半数 spec 的耗时与单台跑完全部相当，收益被本机 CPU 争用抵消，所以默认单台，`--parallel` 保留为选项。
- 并行协作：`ci/faster-feedback`（集成门禁 `verifyCi`、E2E 重试与 JSON 报告）与 `chore/dev-ref-integration`（集成命令改用 update-ref）先集成，本任务在其上 rebase。

## 验收标准

- [x] 四种模式在本机虚拟机中跑通，退出码与结果一致，证据落在 `.runtime/vm-ci/<id>/`（来源：用户指示）
- [x] 默认单台 4 核 8 GB；`--parallel` 两台按耗时分配 E2E，结果合并（来源：用户指示）
- [x] 运行记录被集成门禁接受（来源：与 `ci/faster-feedback` 的协作约定）
- [x] 两个会话同时运行时排队而不超过两台虚拟机；中断后不残留虚拟机与临时引用（来源：AI，本机多会话共用）
- [x] `--spec diff.spec.ts` 只运行该文件（来源：AI，与 CI 的 e2e 模式一致）
- [x] 正式流程连续全量通过，偶发失败已修复或记录原因（来源：用户「fix all」）

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 受影响检查 | 任务分支已提交 | 文档回归在本机执行，其余在虚拟机执行；纯文档改动不启动虚拟机 | 本机 tart，脚本单测覆盖计划生成 |
| 并行全量 | `--scope full --parallel` | 两台同时运行，E2E 不重不漏，打包冒烟执行一次 | 本机 tart |
| 并发排队 | 两个 worktree 同时运行 | 后到者等待空闲名额 | 本机 tart |

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 正式 CI 的运行位置与默认配置 | 本机 tart；默认单台 4 核 8 GB，可两台并行（2026-11-13） |

## 技术决定

- 本机计算检查计划（复用 `check-affected.mjs` 的 `affectedPlan`），虚拟机只执行命令，选择逻辑只有一份。AI，2026-11-13。
- 代码经只读共享的 Git 公共目录拉取临时引用 `refs/vm-ci/<id>/head`，不打包整个仓库；共享路径含空格时经临时目录的软链接。AI，2026-11-13。
- 并行时两台各 6 GB：两台 8 GB 使 32 GB 本机用到交换区，且实测并行收益主要受本机 CPU 争用限制，内存加大无益。AI，2026-11-13。
- 依赖输入（lockfile、workspace 配置与各 `package.json`）的哈希与镜像一致时跳过 `pnpm install`；不一致时照常安装并提示刷新镜像。AI，2026-11-13。
- 打包冒烟的 CLI 版本从被测提交的 `ci.yml` 读取，与 GitHub CI 共用一处固定版本。AI，2026-11-13。
- 失败输出复用 `remote-ci.mjs` 的 `e2eSummary` 与 dev 失败提示；每个 E2E 步骤的报告与 trace 移到 `<虚拟机>/<步骤>/desktop-e2e/`，后一步不会覆盖前一步。AI，2026-11-13。
