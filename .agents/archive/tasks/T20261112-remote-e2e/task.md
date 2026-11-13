---
id: T20261112-remote-e2e
status: done
created: 2026-11-12
---

# 远端运行 AI 的 Electron E2E

## 收尾

Main Agent 自检收尾。本任务是仓库流程任务，按 [Task Protocol](../../../../tasks/README.md#验收范围与独立性) 的过程任务规则自检，没有安排独立 AI 评审。基线为 dev `c4badf1`，任务分支 `ci/remote-e2e`。

本地：`remote-ci.test.mjs`、`check-workflow.test.mjs`、`check-affected.test.mjs` 通过，提交门禁只选中脚本测试。远端在任务分支上各跑一次三种模式，三个运行同时排队，互不取消：

| 模式 | 运行 | 提交 | 结果 |
|---|---|---|---|
| affected | [43180884260](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43180884260) | `926c9d7` | 通过，约 2.5 分钟。基线取 dev `c4badf1`，只列出本分支文件，只跑脚本测试，未构建桌面 |
| e2e | [43180871279](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43180871279) | `926c9d7` | 两个用例都在启动时超时：只跑 spec 时没有 `check:code`，Adapter 的 `dist` 未构建，主进程加载失败。`bdcb5c8` 在构建步骤先构建 Adapter |
| e2e | [43181652632](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43181652632) | `bdcb5c8` | 约 3 分钟。`--grep` 只选中 2 个用例：选品无限画布通过，工作台管理失败（见下） |
| full | [43180897121](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43180897121) | `926c9d7` | 约 8.5 分钟。类型检查与单测、构建、显示器配置通过；E2E 75 通过、3 失败，所以打包与打包冒烟没有执行 |

`ci.yml` 中打包、CLI 安装与打包冒烟只改了 `if` 条件，与已执行的完整检查步骤同一写法，但本次没有远端执行到，记为未覆盖。

远端暴露的 dev 既有失败。本分支没有改应用或测试代码，这些失败与本任务无关，也不在本任务内修复：

- `project-view.spec.ts` AC-06：工作区里有两个名为“新对话”的按钮（导航的 split button 与视图头部按钮），定位器违反 strict mode。属于确定性失败，与界面调整后测试未同步有关。
- `workbench.spec.ts` 工作台管理：重启后依次移除工作台，最后一个“管理 项目笔记”点击后菜单项没有出现，两次远端运行都失败在同一处；05:18 main 的 push CI 也在这个用例失败过。原因未查明，可能是自定义工作台 iframe 加载时抢走焦点，使菜单关闭。
- `vscode-parity.spec.ts` FR-TOOL-003 第 3 步：按 URL 查找预览页时返回 undefined。原因未查明。

CONTRIBUTING 仍是草稿，本次 diff 待用户审阅。收尾日期 2026-11-12。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| E2E 打扰用户、受焦点影响的解决方式 | 用户选择把 AI 的 E2E 放到 GitHub Actions 的 macOS runner 上手动触发运行，接受需要推送任务分支的代价（2026-11-12） |

## 背景

Electron E2E 和 agent-browser 界面检查都会在用户桌面打开真实窗口，部分 E2E 还会抢焦点。添加浮层在失焦时关闭，HTML5 拖拽也依赖焦点，所以用户同时用电脑时，管理场景的拖拽、选品画布、选品添加各偶发失败过一次，单独重跑都通过。AI 的检查因此要么打扰用户，要么排队等用户空闲。

## 方案

- 手动 CI 增加 `scope` 输入：`affected` 以 origin/dev 与分支的 merge-base 为基线，复用 push 的受影响检查；`e2e` 只运行指定 spec，可加 `--grep`；`full` 保持原来的手动全量检查，也是界面手动触发的默认值，保留原语义。
- 手动运行各用独立的并发组，实现者和评审对同一分支的运行互不取消。push 与 PR 的取消规则不变。
- [remote-ci.mjs](../../../../scripts/remote-ci.mjs) 检查分支已提交且已推送，触发运行、等待、下载证据，失败时保存失败日志。命令不推送：推送是对外操作，由调用者显式执行。
- spec 名在 scope job 里校验为 `apps/desktop/e2e` 下存在的文件，grep 经环境变量传入，不拼进 shell。

不做：agent-browser 交互验收仍在本机执行。它需要 AI 边看截图边操作，放到 runner 上要另行设计。

## 交付

- [ci.yml](../../../../.github/workflows/ci.yml)：`workflow_dispatch` 输入、并发组、macOS job 按模式选择步骤。
- [check-scope.mjs](../../../../scripts/check-scope.mjs)：手动模式、spec 校验，输出 `mode` 与 `specs`。
- [remote-ci.mjs](../../../../scripts/remote-ci.mjs) 及其测试；[选择器](../../../../scripts/check-affected.mjs)把它归入脚本检查。
- [脚本说明](../../../../scripts/README.md#远端-e2e)新增远端 E2E 一节，更新命令表、测试分层与 CI 说明；[CONTRIBUTING](../../../../CONTRIBUTING.md) 第 2、4 节与 [Task Protocol](../../../../tasks/README.md#acceptance) 的验收分层、证据要求链接该节。

## 文档复核

- `apps/desktop/README.md` 中“需要真实窗口焦点的多份 Electron 测试须串行运行”仍适用于本机运行，保留。
- `tasks/T20261112-workbench-ui-polish` 中为避免争抢焦点而暂缓 E2E 的记录是历史过程，保留。
- [GitHub CI 任务](../T20261010-github-ci/task.md)记录的是首次配置时的范围，保留；现行行为以脚本说明为准。
