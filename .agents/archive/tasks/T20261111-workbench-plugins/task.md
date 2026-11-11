---
id: T20261111-workbench-plugins
status: done
fr: [FR-WB-001, FR-WB-006, FR-WB-007, FR-WB-008, FR-VIEW-002, FR-INPUT-001]
ac: [AC-WB-01, AC-WB-02, AC-WB-06, AC-WB-08]
specs: [specs/workbench/spec.md, specs/navigation/spec.md, specs/session/spec.md, specs/input/spec.md]
created: 2026-11-11
---

# 最小工作台插件机制与 Harness 对照验收

## 目标与依据

用户 2026-11-11 明确确认 [09 方案](<../../../../docs/09. Workbench Discussion.md>)，要求以 DeepSeek Harness 原则实现插件架构机制，在满足功能要求时避免全量复杂机制，并调用 agent team 持续开发到对照验收完成。范围按 [05 §6.1](<../../../../docs/05. Acceptance Criteria.md#61-插件机制阶段>)；[Harness 固定源码基线](../../../../docs/references/deepseek-harness/README.md)用于机制对照，不声称两款应用实机逐项比较。

## 范围

实现版本清单、页面资源、包修订与 Project 实例、草稿预览/应用、小型页面 SDK、普通 CLI 创建/修改上下文、导航和保存恢复。保留原五个 View。五图业务、出图接口、产物协议、导入导出、完整管理中心、包卸载/实例删除和安全专项依照上游后置。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 架构与 Harness 原则 | 核对模块依赖、契约、SDK 文档与上游固定源码 | 包/实例/Session 职责明确，无五图必需字段或通用后端加载 | 代码及规格独立评审 |
| AC-WB-01 机制 | macOS 隔离 Project，从添加工作台用模板及真实 Codex 创建，预览/修正/添加/导航打开 | 真实页面工作，失败有诊断，用户发送前不调用模型 | 服务测试、Electron E2E、agent-browser、真实 CLI |
| AC-WB-02 机制 | 编辑已有实例，预览再应用；同包另实例 fixture | 草稿不改当前实例；应用只改目标实例并保留其状态 | 服务测试与实际 UI |
| AC-WB-06 机制 | 改状态、关闭重开、应用重启；模拟保存失败 | 恢复固定修订及已保存状态，失败可见，不自动生成 | 服务测试、E2E、实际 UI |
| AC-WB-08 机制 | SDK 读/写/订阅/填草稿、切换/停用/重开、页面故障重试 | 页面资源卸载，迟到消息无效，普通 Session 不被误停 | 自动化及独立 UI |

## 已确认事项

2026-11-11：用户确认 09 方案并授权开发至插件机制对照验收；这不是人工产品验收。机制按候选交互实现并在实际应用中评审，后续业务未提前纳入。

## 技术决定

Main Agent（2026-11-11）：复用 Project View 与 Session；独立 Workbench 服务和 typed IPC；`app://workbench` 页面与 `app://studio` 宿主分离；固定资源修订、SQLite 实例状态；AI 读取项目内随宿主维护的指南/Schema/模板，无新增模型引擎或 MCP 服务。

## 收尾

2026-11-11 Main Agent 核对交付、验证和文档后关闭技术任务。W3 `harness_comparison` 与 W5 `final_review` 均未参与产品实现，独立结论为本次构建版机制及直接回归通过，见[验收记录](acceptance.md)。真实Codex两轮创建/修改、机制E2E和实际界面证据保留；55个直接回归场景按影响范围均有有效通过结果。最后构建基线由W5文件摘要固定。

解锁后11条Session回归保持原生焦点断言通过；共享输入候选的旧光标竞争已局部修复，原Composer E2E未修改，单项及13项直接影响回归通过。历史失败及对应关闭证据完整保留。人工产品验收仍待进行，五图业务与打包发布按原边界后置。

已复核负责文档、DEC-28、路线图的下一步/整体/模块/阶段/验收进度、默认View与Navigation/Session/Input接缝；修正仍写待设计或待解锁的当前状态，历史记录保留原基线。目录归档与相对链接同步在本次变更完成。原主目录方案文档作为开发基线保留，`.env.local` 不纳入变更。

## 后续范围

人工体验入口见[交付记录](report.md#人工体验入口)。五图业务、包分享、完整管理与安全专项依上游阶段安排推进；本任务完成不代表这些功能已交付或产品已获人工验收。
