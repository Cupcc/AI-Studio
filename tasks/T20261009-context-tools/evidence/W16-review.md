# W16 独立安全评审：阶段 1（Files + 项目 Diff + 文件引用链路）

> 状态：进行中（增量写入）。本文件在评审过程中持续更新；最终结论见末尾「总体结论」。未运行的检查一律不记为通过。

## 方法与环境

- 审阅者：W16；未参与实现，只写独立用例与证据，不修改任何源码、`task.md`、`plan.md`、`acceptance.md`、docs / specs。
- 基线：分支 `feat/files-diff`，HEAD `b2d5fd4`，集成 worktree `/Users/Chris/Projects/AI Stduio.worktrees/files-diff`；工作区在评审开始时干净。
- 环境：macOS 15（Darwin 24.6.0）arm64，APFS（大小写不敏感、规范化不敏感），Node v26.10，Apple Git 2.39.2（`/usr/bin/git`，`xcode-select -p` 返回 `/Library/Developer/CommandLineTools`，即开发者工具已安装；全程未模拟缺失 git，未触发安装器）。
- 约束：不运行 `pnpm install/add/build/package/test:e2e/dev`，不启动 Electron 窗口，不调用真实 Codex / Claude CLI 或模型，无网络访问。
- 用例：`W16-*.test.ts` + [W16-vitest.config.ts](W16-vitest.config.ts)，直接读取集成 worktree 源码；固件全部在 `os.tmpdir()` 下，结束清理。运行命令：

```sh
cd "/Users/Chris/Projects/AI Stduio.worktrees/files-diff" && pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W16-vitest.config.ts --reporter=verbose
```

## 发现（增量）

### W16-F1（中，初步）：Diff 的 Git 查询会执行仓库自带的 `post-index-change` 钩子，并改写用户的 `.git/index`

- 现象（以服务使用的完全相同参数，用原生 git 复现，见 `W16-probe-hostile-git.sh`）：`.git/hooks/post-index-change` 在 `git diff HEAD --raw --numstat …` 期间被执行，只需要工作树文件的 mtime 变了（未改内容）；同时 `.git/index` 被重写，尽管全局参数已含 `--no-optional-locks` 且环境含 `GIT_OPTIONAL_LOCKS=0`。
- 与已接受风险的关系：维护者已接受 `filter.*.clean`（`.git/config` + `.gitattributes`）。钩子是同一类（仓库自带 `.git` 内容在打开 Diff 面板时执行代码），但范围更宽、且未在设计文档中列出；`-c core.hooksPath=/dev/null` 即可消除，无需代价。
- 详情、复现与修复方向见下文「C 区」（待补全）。

（其余发现与各区结果在评审过程中逐步写入。）
