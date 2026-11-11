---
id: T20261111-worktree-workflow
status: done
owner: main-agent
---

# 清理旧 worktree 并修正集成流程

## 授权与范围

用户于 2026-11-11 指出上一轮只在 dev 提交、源功能 worktree 未提交的流程错误，要求删除已集成功能的旧 worktree，并更新工作流。后续明确“本次不用保留快照，直接删除”。本轮不创建清理快照，不修改产品行为，不执行界面验收；仅运行脚本提交门禁。

## 已执行清理

主目录保持 dev。已删除 unified-workbench、unified-workbench-host、unified-workbench-ui、web-workbench-format、web-workbench-format-host、web-workbench-format-ui、workbench-management 七个旧 worktree，并删除对应的七个旧任务分支。删除前核对其分支均为 dev 的祖先 `6e89141`；按用户明确授权删除脏目录，没有把旧源码覆盖回 dev。

## 流程修正

负责规则见 [CONTRIBUTING §5](../../../../CONTRIBUTING.md#集成到-dev)，操作说明见[任务分支集成](../../../../scripts/README.md#任务分支集成)。源 worktree 必须先 commit，冲突在源 worktree rebase 中完成，再将干净的源提交快进合入 dev。新增集成命令拒绝脏源目录、脏 dev、未提交的交付及不能快进的分支。

本轮修正本身在 `fix/worktree-integration` 的独立 worktree 实施，先提交，随后通过同一集成命令合入 dev；合入并推送后按本轮清理授权移除该临时 worktree 和已合入分支。main 保持原基线。

## 验证与收尾

脚本测试使用独立临时 Git 仓库，核对拒绝场景不会推进 dev、不会自动提交或复制源文件，以及正常快进结果。检查范围仅为脚本与文档，结果在收尾时补充。任务协议补充代码交付的 SHA 与目录状态，历史 dev 集成记录保留原操作事实并链接本次纠正。不把人工体验标为通过。

## 结果

- 源分支 `fix/worktree-integration` 在自己的 worktree 完成提交 `2dee8b280462918d48ec023201455ff34f1d1028`，提交门禁的文档回归及 5 文件、89 项脚本测试通过。源目录和 dev 均干净。
- 在源 worktree 执行 `git rebase dev`，结果为已是最新；随后从主目录运行源提交内的集成命令，dev 通过快进精确到达同一 SHA，并推送 origin/dev。没有复制未提交文件、代源分支提交或改写已集成历史。
- 七个旧 worktree 和七个无独有提交的旧分支已删除；本次没有新增清理快照。本轮修正使用的临时 worktree 在提交、合入和推送后正常移除，已合入的临时分支一并删除。
- 清理期间其他会话新建 `minimal-regression`（`fix/minimal-regression`）并写入独立任务，属于新工作，不在这次旧目录删除范围内，未修改或删除。
- 主目录保持 dev，main 仍为 `6e89141`。最后的任务归档与记录更新是主目录的局部文档提交，遵循允许直接提交 dev 的小改规则，不代替源分支交付。
- 文档复核覆盖 CONTRIBUTING 的分支职责、提交、冲突、集成和清理，脚本索引、Task Protocol 的 worker 交付，以及前轮集成和管理任务的目录状态。产品、规格和路线图的功能事实没有变化，保留现有人工待验收状态；未运行应用、界面或真实 CLI 验收。
