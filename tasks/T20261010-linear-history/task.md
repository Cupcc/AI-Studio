---
id: T20261010-linear-history
status: in_progress
fr: []
ac: []
specs: []
created: 2026-10-10
---

# 提交全部改动并整理线性历史

## 目标与依据

依据用户 2026-10-10 对话指令「commit all, 整理分支，保持一条线，不要有分叉」，提交当前全部改动，清理多余分支，并整理既有 main 的 3 个 merge commit。[贡献指南](../../CONTRIBUTING.md) 第 5 节要求旧历史整理单独记录保留内容、备份和协作影响；本次明确指令作为该次整理的授权，不改变后续禁止重写 main 的日常规则。

## 保留内容与方案

- 先通过正常提交门禁提交当前全部改动，包括工程工具规格、设计修订、Task Protocol 迁移与归档规则；保留各文档原有确认状态。
- 将原历史和全部分支保存为本地 Git bundle，位置为 `.git/history-backups/20261010-before-linearization.bundle`；备份包含本次提交，可用 `git clone <bundle> <新目录>` 恢复。
- 沿 main 的第一父提交链整理历史：每次合入的完整文件快照、冲突解决结果、提交信息及作者信息均保留；3 个 merge commit 改为单父提交，原侧分支提交完整保留在 bundle 中。受影响提交的 hash 会变化。
- 删除已合入的 `task/contributing`；检查远端没有新增提交后，以 `--force-with-lease` 同步这次明确授权的历史整理。远端目前只有 main；其他已有克隆需要依据备份和新 main 重新同步，不能继续推送旧历史。

## 验收标准

- [ ] 当前全部改动已提交，工作区干净。（来源：本次用户指令）
- [ ] main 与远端保持同一条线，本地及远端只保留 main，main 无 merge commit。（来源：本次用户指令）
- [ ] 备份校验通过，整理前后最终文件树完全一致，保留每次合入的内容。（来源：贡献指南第 5 节的旧历史整理要求）
- [ ] 正常提交门禁与本次 Markdown 链接、表格、空白检查通过。（来源：[仓库指南](../../AGENTS.md) 的 Validation Guidelines；[脚本说明](../../scripts/README.md)）

## 执行与验证记录

- 初始 main、origin/main、task/contributing 均为 `6a6644a`，远端只有 main，无其他 worktree；初始可达历史有 75 个提交，其中 3 个 merge commit。
- 本次验证为实现者自检，任务完成状态仍按 [Task Protocol](../README.md) 等待人工签收。

## 已确认事项

用户授权本次提交与分支、既有历史整理（2026-10-10 确认）；不据此将产品文档转为已确认，也不代替其他任务的验收。

## 未决问题

无。
