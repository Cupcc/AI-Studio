---
id: T20261111-main-integration
status: in_progress
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
- CLI 工作区在 `3deffa4` 上有未提交改动，已完成的独立技术评审和界面验证见 [CLI 任务](../T20261108-cli-install/task.md)，集成后保留原始验证基线。
- 主工作区改动包括共享排版、工作台字号、架构图剩余任务展示，以及用户已明确接受的原生输入输出体验文档。保留各负责记录的确认边界。
- 旧工作台 stash 的实现与 main 相同，差异为 main 后续的类型整理、范围确认、验收记录和归档；旧分支也已被 main 后续修正覆盖。未直接套用旧快照。
- 验证按影响执行：共享排版覆盖布局与设置主题；CLI 覆盖连接服务、Settings、Session、Adapter 两 Provider；检查脚本补充本次依赖的明确映射并测试未知变更仍阻断。最终实际 Electron 检查连接页无 model，以及排版、导航与主题。不重复真实远端模型请求。

## 待完成

提交主目录改动；补齐依赖检查映射并整合 CLI；最终验证、推送与 CI；核对备份后清理 worktree、旧分支与 stash；复核相关文档并归档本记录。
