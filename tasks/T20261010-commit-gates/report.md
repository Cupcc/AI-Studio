# Commit 门禁实现与自检

## 待人工签收

本次遵循 React 技能保持状态派生在渲染内，不增加 Effect 或额外缓存；按 Vitest 技能用行为断言与异步等待覆盖回归。任务保持 `verifying`，新增修复的验收结果待人工确认；提交合并授权不自动等同独立验收。

审阅与签收入口：[task.md](task.md#签收)。

## 变更

- 实现分支：`chore/commit-gates`；用户已授权修复后提交并合并本地 main。
- 根 workspace 固定 Husky 9.1.7、commitlint CLI / conventional config 21.2.3，并更新 lockfile。
- `prepare` 安装 Husky；`pre-commit` 运行 `pnpm check:commit`（typecheck 成功后运行 test）；`commit-msg` 检查带正确引号的提交信息文件参数。
- 配置与运行边界已写入 [scripts/README.md](../../scripts/README.md)，根仓库指南补充命令入口。门禁配置阶段没有修改产品源码、产品规格或已有测试；后续授权修复见下文。

## 2026-10-10 实现者自检

| 检查 | 结果 |
|---|---|
| `pnpm install` | 成功，自动执行 `prepare`；`git config --get core.hooksPath` 为 `.husky/_` |
| `git hook run pre-commit` | 类型检查通过；Adapter 181/181、Desktop 129/130 单测通过；失败以退出码 1 传播到 hook |
| Conventional Commits 正例 | 普通 scope、`feat!:`、中文主题、大写产品词、仅 `BREAKING CHANGE:` footer 共 5 例通过 |
| Conventional Commits 反例 | 无 type、非法 type、空主题共 3 例正确拒绝 |
| `git hook run commit-msg -- <文件>` | 含空格的合法信息路径成功，非法信息退出码 1 |
| `pre-commit` 失败注入 | 通过临时 PATH 中的 pnpm 替身返回 42，实际 hook 同样返回 42 |
| `git diff --exit-code -- apps packages` | 成功，已有业务代码和测试未被修改 |
| `git diff --check` | 通过 |

测试用信息文件与 pnpm 替身仅放在 Git 忽略的 `.runtime/commit-gates-test/`；仅单次失败注入进程修改 PATH，不影响后续 hooks。未创建测试 commit，未运行 E2E 或真实 CLI / 模型请求。

## 首轮阻塞与后续修复

首轮 `apps/desktop/src/renderer/src/features/session/session.test.tsx:159` 的 `shows CLI unavailability reasons and disables selecting that CLI` 失败：测试精确查找可访问名称 `Codex CLI`，渲染的按钮名称却为 `Codex CLICodex CLI请先登录 Codex CLI`。正常提交也被门禁阻止，没有绕过检查。

用户 2026-10-10 指令「fix and 合并」授权修复：

- `CliMenu` 用 `useId` 生成实例唯一标识，通过 `aria-labelledby` 指向可见 CLI 名称；用 `aria-describedby` 关联不可用原因和默认状态。保持现有样式、禁用行为与草稿选择逻辑，不改共享徽章语义。
- 保留原精确名称断言，补测不可用原因的可访问描述、禁用按钮不创建草稿、默认标记不污染名称，以及选择另一 CLI 不改变 Project 默认值。
- 新增选择回归测试首次未等待异步草稿加载，调整为 `await waitFor` 后通过；未修改业务异步流程或跳过测试。
- 最终 `pnpm check:commit`：类型检查通过，Adapter 181/181、Desktop 131/131，共 312 项单测全部通过；`git diff --check` 与暂存区空白检查通过。未运行 E2E 或真实模型调用。


## 参考

- [Husky 安装说明](https://typicode.github.io/husky/get-started.html)
- [Husky hooks、GUI PATH 与绕过边界](https://typicode.github.io/husky/how-to.html)
- [commitlint 本地设置](https://commitlint.js.org/guides/local-setup.html)
