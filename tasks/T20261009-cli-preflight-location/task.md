---
id: T20261009-cli-preflight-location
status: verifying
fr: []
ac: []
specs: []
created: 2026-10-09
---

# CLI 校验报告归位

## 签收

待人工审阅 diff；本任务未签收。

## 目标

按 [仓库结构与文档职责](../../AGENTS.md#project-structure--module-organization)，将 CLI 集成实验报告归入原任务，保持产品基线与任务记录的职责清晰。来源：2026-10-09 用户对 CLI 校验文档存放位置的纠正；本任务仅整理文档位置，不新增 FR / AC。

## 范围

- 迁移 CLI 校验报告至 [T20261008-cli-preflight/report.md](../T20261008-cli-preflight/report.md)，保留实测内容与历史环境。
- 修正报告内部相对链接、所有外部引用、原任务说明及仓库编号文档清单。
- 长期技术约束继续由 [04. Technical Requirements](<../../docs/04. Technical Requirements.md>) 第 3、5 节承接。

## 依据

- [AGENTS.md](../../AGENTS.md)：Project Structure & Module Organization、Working on Tasks、Validation Guidelines。
- [tasks/README.md](../README.md)：Files、Lifecycle、Evidence。

## 验收标准

- [x] 报告位于原任务的 `report.md`，正文结论和原任务状态保留。（来源：仓库文档职责与任务生命周期）
- [x] 编号文档清单与所有引用指向新位置，无旧路径残留。（来源：仓库 Validation Guidelines）
- [x] 迁移后的报告及受影响引用的本地链接可解析。（来源：仓库 Validation Guidelines）

## 验证记录

- 2026-10-09：迁移报告并修正相对链接、外部链接与原编号简称；原任务保持 `verifying`。
- 与 Git 原文比对：报告仅调整文档分类、迁移说明和相对链接；受影响规范与开发记录仅更新引用，标题层级和表格列数保留。
- 检查受影响的 24 份 Markdown 文件中 255 个本地链接，均可解析；全仓搜索无原文件名或原编号引用残留。
- `git diff --check` 通过；仅文档整理，未运行应用测试。
