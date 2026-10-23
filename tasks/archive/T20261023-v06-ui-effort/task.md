---
id: T20261023-v06-ui-effort
status: done
fr: [FR-CHAT-001, FR-INPUT-001, FR-INPUT-002, FR-SESSION-001, FR-VIEW-006]
ac: [AC-02, AC-05, AC-06]
specs: [specs/input/spec.md, specs/chat/spec.md, specs/session/spec.md, specs/navigation/spec.md, specs/project-view/spec.md]
created: 2026-10-23
---

# 对齐 v06 UI 与高强度思考动效

## 目标与依据

用户 2026-10-23 指令「对齐v06 的ui设计，加入 max和ultra模型思考effort动画特效」。采用 [v06 布局与输入设计](../../../design/layout-ux-review-v02.md)到桌面应用，保留真实 Provider 能力、原生目录与已有发送语义。设计与规格 diff 待人工审阅；实施授权不代表人工产品验收。

## 范围

- 统一底部 Composer、顶栏、空状态、相邻模型与信号格 effort、按来源组织的 Add 菜单、输入候选和就近反馈；保留草稿隔离与历史滚动行为。
- 为原生目录提供的 max / ultra 增加可区分动效，遵守减少动态效果；不虚构 Provider 支持的 effort、命令或插件。
- 根基线 `a0f2132`，独立 worktree `../AI Stduio.worktrees/v06-effort`，分支 `feat/v06-effort`。

## 验收标准与场景

| 来源 / 场景 | 操作与预期 | 验证方式 |
|---|---|---|
| 本次指令、v06 §3、FR-CHAT-001 | New Chat 与发送后的 Composer 底边一致；示例仅填入空草稿，顶栏保留 CLI 标识和标题 | Electron UI 操作、两主题布局 E2E |
| 本次指令、FR-INPUT-002 | 从模型目录选择 effort；max / ultra 信号格动效可区分，默认与未知值可恢复，减少动态效果时静止 | 模拟 Provider Electron 操作、截图与动画样式检查 |
| v06 §4、FR-INPUT-001 | 模型 / effort / Add 支持键盘选择与 Esc 恢复；候选使用真实目录，发送 / Stop、附件和草稿隔离不回归 | 类型检查、相关测试、Electron 操作 |
| input §3、AC-05 | 运行与等待时保留可用操作、附件阻止答复原因就近显示，失败保留输入 | 相关现有回归与 UI 自检 |

## 人工产品验收

待人工验收。此任务不调用真实模型；动效与界面验证使用模拟 Provider，既有真实 CLI 集成结论不变。

## 执行与收尾

实现、主 Agent 自检与 W4 独立界面验收已完成，分工见 [plan.md](plan.md)，独立结论见 [acceptance.md](acceptance.md)。主 Agent 于 2026-10-23 核对本任务验收标准、最终 diff、验证证据与文档影响后收尾；本次授权范围内无技术待办，人工产品验收仍待进行。

## 验证记录

- `pnpm check:code`：类型检查通过，脚本 36 / 36、Adapter 257 / 257、桌面单元 1176 / 1176；[日志](evidence/W1-code-check.log)。
- 模拟 Electron 专项与相关回归首轮 25 / 26，通过 max / ultra 四外观 / 减少动态效果 / 重启恢复、文件失效恢复、两主题三尺寸布局、Project View 与 Session 多项场景。未读标记用例两次失败后临时诊断单次通过，未改动产品行为；当时最终完整回归待解锁，解锁后的结果见下文。
- W4 实际界面发送再次出现未读标记；随后根 Agent 与 W4 只读核对确认：`document.hasFocus() = true`，主进程 `getWindowFocus().focused = false`，系统前台 `loginwindow`（PID 679），测试应用 native active = false。该次结果符合失焦完成应保留未读的既有规则，未计作原生前台场景通过；历史证据保留，解锁后的复验见下文。
- 文档链接检查：0 新增问题，4 个既有基线问题未增加；语义复核涵盖 UX、决定、Shell、input / chat / session / navigation / Project View、设计索引及路线图的下一步 / 概况 / 模块 / 阶段 / 验收。规格与界面人工产品验收仍待进行。

- 用户回复「continue」后，原生检查确认前台已恢复为 Code（不再是 loginwindow）；最终完整 Electron 回归 53 / 53 通过；W4 随后独立完成原生前台发送复验。
- 最终构建的 Composer 与设置专项 8 / 8，通过带空格目录导航、7 行输入短窗口候选边界、四外观与减少动态效果；完整回归仍单独记录。

- 最终完整 Electron：53 / 53，通过原生前台 / 后台未读、Needs Input、Project View、布局及设置回归；[日志](evidence/W1-electron-full.log)。最终 Composer / 设置专项：[8 / 8 日志](evidence/W1-composer-settings.log)；最后增补后类型检查及相关单元 58 / 58 通过。

- W4 独立原生前台复验通过：UI 发送到完成期间 70 次系统前台取样均为测试 Electron，完成后 native focused=true、无 Completed Unread、Done；证据与逐项结论见 [acceptance.md](acceptance.md)。历史锁屏故障不再是当前阻塞，未更改产品未读逻辑。

## 文档同步与收尾复核

主 Agent 和 W3 复核 UX、AC、DEC-23、Shell、input / chat / session / navigation / Project View、设计 / 原型索引；按决定与同义表述核对底部 Composer、目录边界、默认复位、View 最近对话、动效与减少动态效果。路线图的下一步、整体概况、模块状态、阶段计划和验收进度均更新为本轮技术验证通过，并保留人工验收入口。原始 v06 原型、旧真实 CLI 证据与既有 arm64 包保留原基线；本轮没有新增真实模型或发布 / 打包通过结论。归档时同步旧路径与相对链接；文档链接检查与 diff 检查结果由提交门禁复核。
