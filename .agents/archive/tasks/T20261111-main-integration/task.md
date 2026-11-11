---
id: T20261111-main-integration
status: done
fr: []
ac: []
specs: []
created: 2026-11-11
---

# 全部改动线性集成与清理

## 授权与范围

用户 2026-11-11 请求“所有的都合并到 main 中，并 linear clean”。整合主工作区字体与文档更新、CLI 连接收窄及直接 API 测试，核对旧工作台分支与四份 stash，保留线性 main 并清理已保留的临时状态。普通推送并检查 CI，不强推、不新增 merge commit。本机 `.env.local` 保留且不提交。此次 Git 交付不改变各功能的人工验收和未覆盖项。

Main Agent 单独负责集成。备份在忽略目录 `.runtime/git-consolidation-20261111/`，含两工作区文件、binary patch、stash patch、Git bundle 与清单。

## 执行与验证

- 起点 main / origin/main 均为 `c1593d0`，已 fetch 核对一致。
- CLI 工作区在 `3deffa4` 上有未提交改动，已完成的独立技术评审和界面验证见 [CLI 任务](../../../../tasks/T20261108-cli-install/task.md)，集成后保留原始验证基线。
- 主工作区改动包括共享排版、工作台字号、架构图剩余任务展示，以及用户已明确接受的原生输入输出体验文档。保留各负责记录的确认边界。
- 旧工作台 stash 的实现与 main 相同，差异为 main 后续的类型整理、范围确认、验收记录和归档；旧分支也已被 main 后续修正覆盖。未直接套用旧快照。
- 验证按影响执行：共享排版覆盖布局与设置主题；CLI 覆盖连接服务、Settings、Session、Adapter 两 Provider；检查脚本补充本次依赖的明确映射并测试未知变更仍阻断。最终实际 Electron 检查连接页无 model，以及排版、导航与主题。不重复真实远端模型请求。

## 当前结果

- `d9c4bb1` 提交主目录字体、架构图与验收状态文档；Renderer 类型检查与 33 文件 348 项相关测试通过。
- `43a5710` 提交 CLI 连接收窄、直接 API 测试与依赖检查映射，已快进合入 main 并普通推送。两次门禁暴露既有进程测试将 300 ms 超时与输出截断绑在一起的时序依赖；拆为两个独立行为用例后，正常门禁通过：脚本 3 文件 72 项、Adapter 19 文件 290 项、桌面 16 文件 246 项，以及 Adapter、桌面 node / web 类型检查。
- 主目录执行冻结 lockfile 安装与桌面构建通过。Main Agent 使用 agent-browser 操作最终构建的实际 Electron：独立 userData、临时 Project、模拟 Provider，仅用 fixture 替代原生目录选择器及设置窗口尺寸。从设置入口检查 Codex 与 Claude 两个自定义连接页只有 URL / API Key；切换深色和纯色，进入 New Chat，点击起步示例后文字填入且编辑器聚焦，工作台菜单正常，页面无脚本错误。已目视检查[连接页](evidence/W0-cli-model-removed.png)与[深色排版](evidence/W0-typography-dark.png)。本轮未发送真实模型请求。
- 旧工作台分支是 main 已保留并继续修正的早期提交。四份旧 stash 的 tracked / untracked 内容已核对：独有文件均已保留或归档，剩余差异是后续实现 / 文档替代。清理前再次创建并验证包含全部 refs 和五份 stash 的 bundle。CLI worktree 确认干净后普通移除，已合入分支删除；旧工作台分支因 main 使用后续修正版提交，在内容核对与备份后删除。四份旧 stash 及本轮临时 stash 已清理。
- 当前仅主 worktree、本地 main 与远端 main，无 stash。`.env.local` 文件保留，并在本机 `.git/info/exclude` 排除，未提交个人配置。恢复备份、清单与门禁日志保留于 `.runtime/git-consolidation-20261111/`。
- 首次代码 CI 在 macOS job 执行期间被取消，未取得失败或通过结论，GitHub 未提供该 job 的日志。核对远端 HEAD 仍为 `43a5710`；仓库与 origin 地址已更新为 `Tiancheng-ai/AI-Studio`。仅重跑被取消的 macOS job，未扩大为手动全量工作流。
- 远端 [代码 CI](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/42953968356) 已通过 `43a5710` 的文档、受影响类型检查，脚本 72 项、Adapter 290 项、桌面 380 项单测及 50 项 Electron E2E；未执行打包或真实模型调用。

## 文档同步复核

核对 settings spec 的连接字段和测试边界、Adapter §3.14、DEC-27、AC-08、路线图下一步 / 整体 / 模块 / 阶段 / 验收、架构图剩余工作及 CLI 任务，保留 main 的插件与人工验收更新。补充依赖检查映射说明与本次集成入口；将旧“未合入”明确为历史交付状态。CLI 连接独立评审保持 11-10 原基线，本轮集成自检不冒充独立复验。

保留项：安装、Claude 真实远端、打包和人工产品验收按各负责任务继续，Git 集成不代签功能验收；架构文档、字体设计与产品文档原有草稿 / 待审阅状态保持。文档链接检查 0 新问题，4 项历史问题未新增。

## 收尾

Main Agent 于 2026-11-11 完成本次 Git 集成、界面自检和清理，代码基线 `43a5710` 已推送且 CI 全部通过。新增两个代码提交均为线性普通提交，没有新增 merge commit、改写已发布历史或跳过 hooks。最终复核覆盖全部原工作区 / stash 清单、实际源码、文档标题 / 表格 / 入链及上列语义范围；本记录与截图归档后再普通提交推送。最后的文档提交不改变已通过 CI 的代码基线。
