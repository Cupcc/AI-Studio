---
id: T20261010-linear-history
status: verifying
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

- [x] 当前全部改动已提交，工作区干净。（来源：本次用户指令）
- [x] main 与远端保持同一条线，本地及远端只保留 main，main 无 merge commit。（来源：本次用户指令）
- [x] 备份校验通过，整理前后最终文件树完全一致，保留每次合入的内容。（来源：贡献指南第 5 节的旧历史整理要求）
- [x] 正常提交门禁与本次 Markdown 链接、表格、空白检查通过。（来源：[仓库指南](../../AGENTS.md) 的 Validation Guidelines；[脚本说明](../../scripts/README.md)）

## 执行与验证记录

- 初始 main、origin/main、task/contributing 均为 `6a6644a`，远端只有 main，无其他 worktree；初始可达历史有 75 个提交，其中 3 个 merge commit。
- 正常提交门禁通过：workspace 类型检查、Adapter 181 项及 desktop 133 项单元测试。提交信息首次因正文超过 100 字符被 commitlint 拒绝，换行后重新通过完整门禁，未绕过 hooks。
- 本次修改中 27 份 Markdown 的 282 个本地链接（含锚点）、82 张表格与 353 个标题检查通过；模板的 `evidence/` 为占位链接。迁移后的 Task Protocol 另行复核，旧 `tasks/AGENTS.md` 引用已全部修正；清理两处模板原有行尾空白，暂存 diff 空白检查通过。
- 全部改动先提交为 `4c240ca`；备份包含该提交及原分支，`git bundle verify` 通过，备份共含 76 个可达提交。
- 删除已合入的 `task/contributing`，沿 main 第一父链将 3 个 merge commit 改为单父提交。整理后 main 为 `1781afa`，共 73 个提交、0 个 merge；逐个核对全部 73 个保留提交的文件树，均与对应原提交完全一致，最终工作区干净。提交映射留在本地 `.runtime/linear-history/rewrite-audit.json`。
- 以旧远端 `6a6644a` 为 lease 完成远端同步，`git ls-remote --heads origin` 确认只存在 main，且指向 `1781afa`。首次 HTTPS 推送返回 HTTP 400，改用本次命令级 HTTP/1.1 和缓冲设置后成功，未修改仓库的持久网络配置。
- [该次推送的 CI](https://github.com/Cupcc/AI-Studio/actions/runs/38034194510) 已触发；本记录随后以普通线性提交补齐，最新版本的 CI 结果在交付时核对。
- 本次验证为实现者自检，任务完成状态仍按 [Task Protocol](../README.md) 等待人工签收。

## 已确认事项

用户授权本次提交与分支、既有历史整理（2026-10-10 确认）；不据此将产品文档转为已确认，也不代替其他任务的验收。

## 未决问题

无。
