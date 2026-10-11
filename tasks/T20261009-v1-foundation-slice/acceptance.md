# 验收：T20261009-v1-foundation-slice

> 写入者：独立验收 W6（兼 Adapter W4、Project W3），未参与实现。日期：2026-10-09。状态：待人工签收；不据此标记 task 为 done。

## 人工功能验收

- 状态：待人工验收（阶段 1 完整交付）。
- 接受范围与证据基线：已有[原型 v01 对齐签收](../archive/T20261009-prototype-alignment/task.md)、[原型 v02 对齐签收](../archive/T20261010-prototype-v02-alignment/task.md)及[核心交互模拟范围签收](../archive/T20261011-core-interaction-acceptance/task.md)，日期、版本和边界以各原记录为准；这些不代表阶段 1 完整交付已验收。
- 未覆盖项：本轮没有重跑验证；真实 CLI 等剩余范围仍按下文及对应模块的证据判断，不能由治理规则调整补记通过。
- Main Agent 于 2026-10-11 更新验收入口，依据本次职责调整；后续按[任务协议](../README.md#lifecycle)记录功能 / 阶段验收，内部 task 分别由 AI 收尾。本节以下及顶部引用保留 2026-10-09 验收时点的历史状态，不再作为逐 task 人工签收的现行规则。

## 未完成与签收

- Claude真实成功流式、Resume、模型切换、工具Stop受配额阻断。Codex六回合预算已耗尽，修正版精确Stop仅fixture / 模拟通过；当前安装0.162.0与历史 / 锁定协议0.161.0不同，没有当前真实兼容证明。真实两CLI并发、真实UI AC-02～05不能以模拟结果补齐。详见 [Adapter边界](../T20261009-agent-adapter/acceptance.md#未覆盖与边界)。
- 最终打包 / 发布 / 签名公证、其他平台、宿主异常崩溃与未观察到的脱离后代不在本轮最终证据内。View / 工具内容仍按任务范围保持占位，不将区域导航通过算作其内容实现通过。
- 人工签收日期：尚无。需人审阅阶段性验收、各spec推荐与Project View决定草稿；后续真实复测由主Agent安排已授权预算。未推送、未合main、未标done。

## 结论

**部分通过：本轮实现与模拟自动化通过；真实 CLI AC-02～AC-05 未完成，完整产品 AC 尚未签收。** 最终代码基线为 `188bd1d`，文档与报告基线为 `e8c4812`。各实现 task 保持 `verifying`，spec 与决定草稿保持原状态。

## 总任务四条标准

| 标准 | 结论 | 独立证据与边界 |
|---|---|---|
| 本轮每个 FR 有负责的子 task，无遗漏 / 重复工作 | 通过 | 下方归属表与 [总任务拆分](task.md)；Adapter 负责原生协议 / Runtime，Session 负责产品状态 / 持久化 / UI；Project 编排关闭，Session 停止目标轮次，职责相接且不重复 |
| 合入 dev/v1 后安装、类型检查、单测与应用冒烟通过；命令登记 AGENTS | 通过（安装与打包为历史基线，见说明） | 独立 [frozen 安装](../T20261009-project-shell/evidence/W3-install.log)；最终 [类型检查](../T20261009-session-slice/evidence/W6-typecheck.log)、[单测](../T20261009-session-slice/evidence/W6-unit.log) Adapter181 / desktop130、[Electron19/19](../T20261009-session-slice/evidence/W6-final-e2e-fixed.log) 含真实 SQLite / PTY / 登录 Shell 冒烟；命令见 [AGENTS](../../AGENTS.md) |
| AC-01～05 可演示，各子 task 有独立 acceptance | 部分通过 | [骨架](../T20261009-app-skeleton/acceptance.md)、[Project](../T20261009-project-shell/acceptance.md)、[Adapter](../T20261009-agent-adapter/acceptance.md)、[Session](../T20261009-session-slice/acceptance.md) 均存在；AC-01 壳层隔离 / 恢复通过，实际 Session 跨 Project 聚合 / 关闭隔离亦通过；AC-02～05 模拟流程通过，但 task 所要求的真实 CLI 场景未运行，不能认定完整 AC 通过 |
| 需人确认的决定 / 问题归负责文档 | 通过（记录完备，尚未确认） | [spec索引](../../specs/README.md) 中 Project / navigation / session / chat / input / Adapter 未决问题；[决定索引](<../../docs/07. Decisions.md>) 中地基三份与 Project View 四份草稿；[Project View task](../archive/T20261009-project-view/task.md) 十二问题仍待确认；阻塞问题的2026-10-09确认保留在负责spec，非阻塞推荐按授权实施并保持待确认 |

最终阶段未新增或升级依赖；W3 安装发生在 `8774bc1`，更早的骨架 [W2干净克隆](../T20261009-app-skeleton/evidence/W2-clean-clone-commands.log) 发生在 `1cd7b73`。不把它们称为最终HEAD从零冷缓存安装。最终构建与原生能力通过Electron实际加载验证；骨架历史打包 / open冒烟见其 acceptance，不代表最终Session产物已打包验证。

## FR 归属与补充验证

FR / AC 来源：[02 FR](<../../docs/02. Functional Requirements.md>)、[05 AC](<../../docs/05. Acceptance Criteria.md>)；责任范围见各 task。

| FR | 产品责任 task | 基础依赖 |
|---|---|---|
| FR-PROJ-001～003、FR-NAV-001/002 | Project shell | app-skeleton；关闭停止 / Session摘要接入依赖Session |
| FR-NAV-003、FR-CHAT-001～003、FR-SESSION-001～003、FR-STATE-001～007、FR-INPUT-001/002 | Session slice | app-skeleton、Adapter；与Project壳层共享明确接口 |
| 无新增产品FR；可信IPC、数据库、构建 / 原生环境 | app-skeleton | 技术要求04 §3；独立骨架验收 |
| 上述Session / 输入FR的原生能力部分 | agent-adapter | 协议映射、事件、Stop / Runtime隔离；不承担UI状态清除 |

task frontmatter列出的21个FR均有责任归属。Project View本轮仅调研，四份决定草稿分别为 [Knowledge存储](<../../docs/07. Decisions.md>)、[渲染](<../../docs/07. Decisions.md>)、[刷新](<../../docs/07. Decisions.md>)、[上下文](<../../docs/07. Decisions.md>)。Context工具与AC-06/07实现留待后续轮次。

Session独立补充验证：真实SQLite重开2,000摘要 / 1,202 transcript、renderer异步竞态、关闭超时 / 迟到输入探针共5项；真实minimize/hide未读规则和2,000历史有界DOM共2项；实际Session聚合驱动Tab / 折叠点、关闭计数2 / 取消保持 / 仅目标停止共1项。日志与逐项截图见 [Session acceptance](../T20261009-session-slice/acceptance.md)。已发现实现缺陷均有修前 / 修后证据，没有剩余已复现的本地自动化阻断。
