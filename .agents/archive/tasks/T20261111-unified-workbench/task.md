---
id: T20261111-unified-workbench
status: done
fr: [FR-VIEW-001, FR-VIEW-002, FR-NAV-001, FR-WB-001, FR-WB-006, FR-WB-008]
ac: [AC-06, AC-WB-01, AC-WB-02, AC-WB-06, AC-WB-08]
specs: [specs/workbench/spec.md, specs/project-view/spec.md, specs/navigation/spec.md]
created: 2026-11-11
---

# 统一预设与自定义工作台架构

## 目标与依据

用户 2026-11-11 指出 Project Views、Business Flow 都属于工作台，只是由 App 预设；随后要求检查是否符合工作台架构，并明确“统一为同一种架构”。本任务将预设与自定义页面归入同一个工作台宿主，替代此前 WB-Q8 暂不迁移的阶段限制。

## 范围

统一工作台目录与身份、宿主与 IPC、变更订阅、Project 生命周期、会话上下文、导航与预览入口。保留预设知识文件及声明式渲染功能、自定义包和实例状态、既有会话与恢复数据。隐藏、排序和预设结构编辑不改变现有行为；图片业务仍按原阶段安排。

## 执行阶段

- [x] Ground：追踪两套链路及历史约束。
- [x] Sketch：比较至少两种结构方案，记录类型、调用方式与取舍。
- [x] Agree：按本轮授权直接实施；新增产品取舍单独列明。
- [x] Implement：迁移调用方并删除旧宿主入口。
- [x] Scrap / Verify：若结构不适配则重设计；完成受影响测试、真实界面操作和独立评审。

## 验收标准

| 场景与来源 | 操作 | 预期结果 | 验证 |
|---|---|---|---|
| 用户本轮统一架构指令 | 从同一目录打开预设和自定义工作台 | 同一宿主、IPC、状态订阅及生命周期；调用者不再选择两套宿主 | 架构检查、类型检查、宿主与 Renderer 测试 |
| 既有 FR-VIEW 行为 | 打开预设、修改知识、写入坏 JSON、切换 Project 并重开 | 无自动生成，文件更新与 last-good 正常，Overview Session 信息保留 | 受影响单测与 Electron UI |
| 既有 FR-WB 行为 | 创建、预览、保存、添加、编辑、停用、重开 | 草稿隔离、固定修订、状态保存、普通 Session 与停用边界保留 | 宿主单测与工作台 Electron E2E |
| 既有导航与会话恢复 | 打开历史预设 View 和自定义实例 | 稳定 ID、草稿和 Session 关联保持 | 状态规则与 Session 测试 |

## 执行说明

较大变更在 `../AI Stduio.worktrees/unified-workbench` 的独立分支执行。开始时主工作区存在其他未提交修改，工作副本保留该基线；仅回传本任务差异，不提交或覆盖其他工作。使用 architect、how、why 及 arena 要求的只读探索和候选设计；这些技能指定的模型在当前工具中不可用，采用继承模型，跨模型评判不可用时明确记录。实现时遵循 TypeScript 与 React 技能；文档按 technical-writing 和 unslop 整理。

## 收尾

Main Agent `/root` 于 2026-11-11 完成自检与收尾，独立 Review Agent `/root/rationale` 已完成技术验收，见 [acceptance.md](acceptance.md)。文档改动待用户审阅，人工产品验收仍待进行。

- Node/Web/E2E 类型检查、72 项脚本测试、615 项受影响应用单测通过，构建通过，见 [W0 检查日志](evidence/W0-affected-check.log)及[最终构建](evidence/W0-final-build.log)。最后两处共享会话文案调整由 Renderer worker 补测 46 项测试通过。
- 46 个选中 Electron 场景按直接影响分批验证：首轮 32 项通过；修正已删除 preload key、旧 transcript 文案和草稿 DOM 选择器后，应用冒烟 1 项通过、预设/会话/工作台组 15 项通过；剩余焦点场景单独通过。有效结果复用范围见[初轮](evidence/W0-affected-check.log)、[应用补测](evidence/W0-app-recheck.log)、[相关组补测](evidence/W0-focused-recheck.log)、[最终焦点补测](evidence/W0-session-focus-final.log)。
- 锁屏和原生窗口失焦分别有实际证据，后者显示发送时 focused=true、完成时 focused=false；未修改焦点产品行为或放宽断言，见[诊断](evidence/W0-focus-diagnostic.log)。诊断代码未保留在产品或测试中。
- 已核对产品定义、需求、UX、技术模型、验收、路线图各状态区、DEC-29、WB-Q8、workbench/project-view/navigation/session/chat spec、桌面说明与设计组件。历史知识内容和插件验收保留原基线，迁移与隐藏/重排的未决状态已分开。

独立验收覆盖结构审计、200 项独立测试、实际 Electron 操作、两轮真实 Codex 首条上下文及重启恢复，无阻塞发现。人工产品验收待进行，文档 diff 待用户审阅。最终变更回传主工作区，未提交或推送。
