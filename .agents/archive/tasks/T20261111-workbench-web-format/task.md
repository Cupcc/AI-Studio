---
id: T20261111-workbench-web-format
status: done
fr: [FR-VIEW-001, FR-VIEW-002, FR-VIEW-003, FR-VIEW-004, FR-WB-001, FR-WB-006, FR-WB-008]
ac: [AC-06, AC-WB-01, AC-WB-02, AC-WB-06, AC-WB-08]
specs: [specs/workbench/spec.md, specs/project-view/spec.md]
created: 2026-11-11
---

# 预设与自定义工作台统一网页插件格式

## 目标与依据

用户在 2026-11-11 明确纠正：“内置的组件应该也是自定义网页的方式，统一格式”。上一轮只统一宿主、保留两种 Renderer，未达到本轮明确的页面格式目标；原[统一宿主记录](../../../../.agents/archive/tasks/T20261111-unified-workbench/task.md)保留历史基线，本任务补齐并替代其两种 Renderer 技术选择。

五个预设必须是普通 manifest、HTML、CSS、JavaScript 包，与自定义页面共享校验、资源服务、iframe、SDK、快照和生命周期。Overview 的页面内容也迁入 iframe。保留现有知识、会话、草稿、实例状态及稳定 ID。列表管理由另一个任务处理，本任务不修改其 worktree 或额外增加管理行为。

## 执行阶段

- [x] Ground：当前宿主与原生页面链路、用户纠正及保留约束。
- [x] Sketch：比较嵌入式资源快照与独立资源 RPC 两种全部 Web 包方案。
- [x] Agree：用户已明确统一格式，无额外产品检查点；采用既有 SDK 快照订阅并新增通用资源能力。
- [x] Implement：预设标准包、通用资源和 SDK、唯一 iframe 页面、删除原生分支。
- [x] Verify：相关回归、可移植性、实际 UI、打包与真实 Codex。

## 验收标准

| 场景 | 预期结果与来源 | 验证 |
|---|---|---|
| 格式与运行链路 | 五个预设都有标准 manifest/HTML/JS/CSS；同一 validator、资源服务、iframe、SDK 与快照；无原生 Preview 分支。本轮用户指令 | 源码检查、包与服务测试、五个预设 E2E |
| 可移植性 | 预设包作为普通自定义草稿也能运行，Knowledge/Session 资源与动作没有来源特权。本轮统一格式要求 | 服务与实际 iframe 场景 |
| 预设功能 | 文件更新、Definition、last-good、生成草稿、缩放、主题、Overview 摘要与打开会话保持。FR-VIEW、AC-06 | 单测、Electron、agent-browser 截图 |
| 自定义兼容 | SDK1 状态读写、CAS、草稿隔离、应用、停用、恢复保持。AC-WB 机制分项 | 宿主/桥接测试与 Electron |
| 交付资源 | 实际 .app 包含并可加载五个预设、Overview 与自定义包，不依赖源码目录 | 打包检查与实际 UI |
| 真实上下文 | 预设和自定义实例各一轮默认 Codex，只读请求确认上下文 | 实际应用 UI；不扩展其他 CLI 或图片业务 |

## 收尾

独立分支及工作副本保留开始时主工作区的已暂存、未暂存及未跟踪基线。仅回传本任务差异，合并期间主工作区的新修改。Main Agent `/root` 完成实现、自检与收尾；独立 Review Agent `/root/rationale` 已完成技术验收。人工产品验收已于 2026-11-12 通过（见[验收记录](acceptance.md#人工功能验收)），文档 diff 待用户审阅。


独立结论见 [acceptance.md](acceptance.md)。本轮完成：三项 TypeScript 检查、74 项脚本测试、555 项受影响应用单测、32 项相关 Electron 场景的有效分批通过结果，以及独立 70 项检查。CSS 修正另有生成页面与实际浅/深色复验。实测包含五个预设 iframe、精确复制的 Overview 作为自定义草稿和实例、两轮真实 Codex 上下文及实际 .app 的 Architecture、Overview、自定义页面。

本地 .app 原签名不完整；仅对验收产物做 ad-hoc 临时签名并保留权限元数据，strict 校验和实际加载通过，未修改仓库发布签名配置。未扩展 Developer ID、公证、发布、其他 CLI 或图片业务。

文档复核覆盖 01～09、workbench/project-view、桌面说明和脚本影响映射；更新网页格式、SDK 资源、交付与状态，保留旧任务的历史基线。并行的路线图、架构图和 project-view spec 精简已合并保留。现有工作状态有 142 条历史归档断链，以捕获的工作状态树验证本轮 0 条新增；未恢复或删除无关历史文件。主工作区仅回写本轮差异，未提交或推送。
