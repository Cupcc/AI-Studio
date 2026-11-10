# 执行计划：T20261110-workbench-plugins

## 方案

两个文档 worker 在当前工作区按文件分离写入，均使用用户指定的 `gpt-6-astra`、`high`。外部项目事实只由调研记录维护；本项目方案只由讨论稿维护。主 Agent 复核来源、交叉引用、产品确认状态及文档检查。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | Harness 源码调研落稿 | `docs/references/deepseek-harness/README.md`、`docs/references/README.md` | 固定版本调研与资料入口 | 既有源码克隆；结论通知 W2 | done |
| W2 | 工作台插件设计更新 | `docs/09. Workbench Discussion.md` | 创建、包协议、导航、生命周期及原型建议 | 既有草案；引用 W1 调研 | done |
| Main | 集成与收尾 | `docs/00. Documentation Index.md`、本任务记录；worker 结束后复核其文件 | 一致性复核、验证、归档 | W1、W2 | done |

## 进度与决定

- 2026-11-10：按用户指令安排两个指定模型的子代理。读取任务协议、贡献指南、文档与参考索引；本次为并行文档更新，按文件隔离，不改代码或切换共享 checkout 分支。已在 `/tmp/ai-studio-workbench-plugin-docs-baseline-20261110/` 保存本轮前文档快照以审阅增量。
- 2026-11-10：外部源码参考 `/tmp/ai-studio-harness-research-20261110`，基线 `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。来源引用使用固定 commit；不将源码阅读记为实机验证。
- 2026-11-10：主 Agent 核对产品定义的 Project / Session / View、FR-VIEW-002～008、现有 AC-06、DEC-04～07、Project View 与 Navigation spec，以及路线图的下一步、整体概况、模块状态、阶段计划和验收进度。正式功能、确认状态及排期未变，仅在讨论草案记录与声明式 Renderer 约束的差异；这些负责文档和历史验收不制造修改。
- 2026-11-10：W1 完成固定 commit 调查、27 个来源定位及索引更新；W2 完成插件创建、SDK、实例导航与生命周期设计，保留建议状态。两位 worker 已停止写入。主 Agent 对读两份文档，核对“创建只填草稿”“启用不等于加载”“生命周期不等于隔离”及包与实例的职责；统一包/模板用词，补齐跨项目验证操作与索引对话依据。
- 2026-11-10：主 Agent 文档检查通过，0 个新增链接问题；6 份文档的结构与示例、27 条固定来源定位通过。完成关联文档语义复核和增量 diff 审阅后归档，产品设计继续保留为待讨论草案。
