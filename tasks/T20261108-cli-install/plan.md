# Plan：补测未覆盖项

## Workers

| Worker | 范围 | 写入范围 | Worktree / 分支 | 状态 |
|---|---|---|---|---|
| W2 | 一键安装真实联网流程（隔离 HOME）；打包应用的 CLI 设置、Claude / Codex Session 与安装路径 | `tasks/T20261108-cli-install/acceptance.md` 新增章节、`tasks/T20261108-cli-install/evidence/W2-*` | `../AI Stduio.worktrees/cli-install-retest` / `test/cli-install-retest` | 完成：补测部分通过，修复后复验通过 |

W2 只做验证，不修改产品代码；发现缺陷交回 Main Agent。需要窗口焦点的 Electron 操作在 W2 完成前不与其他 worktree 并行。

## 进度

- 2026-11-12：用户授权补测（见 [task](task.md#2026-11-12-补测未覆盖项)）；Main Agent 建立 worktree 并分派 W2。
- 2026-11-12：W2 完成补测，结论部分通过，见 [acceptance](acceptance.md#2026-11-12-补测w2)。发现 D-W2-1（原始打包产物启动即被 SIGKILL）与 D-W2-2（一键安装失败时设置页无提示）。
- 2026-11-12：Main Agent 修复：`electron-builder.yml` 的 `electronFuses` 设置 `resetAdHocDarwinSignature`；CLI 设置在安装失败时显示错误消息，重新安装时清除，并补充单测。下一步：W2 复验原始 `pnpm package` 冒烟、网络失败提示与重开保留，以及受影响回归。
- 2026-11-12：W2 复验 `1780c63`：原始 `pnpm package` 产物签名有效、`smoke:packaged` 通过；网络失败时显示错误、重开保留、重试清除；打包形态的连接详情、Claude Stop、Codex Session 与 Claude 一键安装在原始产物上重跑通过。见 [复验](acceptance.md#复验1780c63)。
- 2026-11-12：远端 CI full 模式（[run 43185179516](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43185179516)，`1780c63`）：E2E 76 通过、2 失败（`project-view.spec.ts` 新对话按钮重复匹配、`workbench.spec.ts:139`），均为 dev 既有失败，另一会话在 `fix/e2e-dev-failures` 修复；因此未执行到 CI 打包与打包冒烟。
- 待用户决定：官方 Claude 安装器会用 PATH 中的 npm 卸载全局 `@anthropic-ai/claude-code`（O-W2-4），一键安装是否接受、是否在界面提示。另有可选产品问题：是否在界面显示安装阶段与取消按钮（O-W2-2，后端已有取消）。
- 2026-11-12：rebase 到含 E2E 修复的 dev 后再次触发 full 模式；因 dev 新出现的 `product-selection.spec.ts` 失败同样会在打包前终止，且 full 为打包检查附带全量 E2E，Main Agent 取消该次运行（run 43227767866），按用户指示新增远端 CI 的 package 模式（只构建、打包与打包冒烟），选择器对打包输入改为提示该模式。
- 2026-11-12：远端 CI package 模式（[run 43229407183](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43229407183)，`dceac2c`）通过：干净 runner 上构建、`package:built`、固定版本 CLI 与 `smoke:packaged` 均成功（`ok: true`），未运行 E2E。Main Agent 随后集成本分支。
