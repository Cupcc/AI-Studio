# 验收：T20261009-v1-foundation-slice

## 2026-10-18 W28 当前收尾独立复核

### 未覆盖与人工入口

- 独立 Review Agent W28 未参与实现；当前检查 `dc66a16` 加 `fix/v1-closure` 未提交源码，详细指纹及命令见 [W28 记录](evidence/W28-review.md)。本小节新增当前事实，保留下方历史技术基线。
- 此次已独立操作打包应用与真实 Codex，完成四工具联验、原生窗口 resize、Browser失败重试、cleanup timeout GUI与精确隔离、真实宿主异常恢复及旧历史spinner修复。W26 主 Agent 自检及 W27 历史独立证据按其基线引用；Claude、未观察即脱离的后代、共享MCP及macOS13实机不算本轮通过项。
- 人工验收入口仍见[人工功能验收](#人工功能验收)；该历史确认不覆盖新增 Diff、推理控制 / 公开输出和图片 / Skill，W28 不代签。

### 当前技术结论

**当前 V1 Codex 技术范围独立复核通过。** 自写11项、正式Adapter48项、desktop初轮107项及最新Session81项独立回归通过；公开正文缺失与旧恢复spinner已修复复验。真实图片 / Skill / Rule / high、非空公开摘要与原生patch、历史保存隔离、四工具联验、cleanup超时重试、真实Electron SIGKILL恢复和原nativeID继续对话通过。最终独立包 `app.asar` SHA256为 `fc68a61326caa6ae55dadc860e33aa34c6bc5abd6f65931377d5170d41694813`；详情、历史失败与精确范围见 [W28 独立复核](evidence/W28-review.md)。最终完整E2E、packaged smoke与文档归档复核由Main Agent执行，当前结果由[总报告](report.md)负责；W28未执行这些最终命令，不代写其结论。

按 DEC-16 / DEC-19 当前范围，`native-cli-parity`、`app-skeleton`、`project-shell`、`agent-adapter`、`session-slice`、`context-tools`、本总任务七项均无剩余已复现技术阻断，可由Main Agent在最终门禁和同步通过后完成归档。原双CLI标准保持Claude历史未全过；人工新增体验仍待验收，技术收尾不代签。

## 2026-10-18 当前 V1 范围更新

本记录保留 2026-10-09 的历史基线和部分通过结论。当前 V1 的真实 CLI 验收只执行 Codex；Claude Code 的历史证据与未覆盖项不改写，新增真实链路暂缓且不随当前 V1 发布（DEC-19）。Codex 的额度、限流及限流后的停止 / 错误由 CLI / 上游服务提供方决定，真实复测按 CLI 实际结果记录；固定上线日期取消，发布准备目标为 GitHub Releases。W5-F13 与 SET-Q6 / SET-Q7 已按 DEC-20 确认；路线图所列现有功能的人工体验验收已全部通过，确认范围见下节。

目标版本及发布范围见 [DEC-21、DEC-22](<../../../docs/07. Decisions.md#dec-21-v1-github-release-版本号>)；同日后续已恢复实施，Codex 原生引用及本轮 Diff 新增技术证据见[工程工具验收](../T20261009-context-tools/acceptance.md#2026-10-18-本轮-diff-独立评审w23)。该证据不改写下文历史结论，暂不创建或上传 Release。

> 下文技术报告写入者：独立验收 W6（兼 Adapter W4、Project W3），未参与实现。日期：2026-10-09；当时待人工签收的状态保留为历史背景。当前人工体验结论见下节。

## 人工功能验收

- **状态：已验收（2026-10-18），路线图所列现有功能的人工体验验收全部通过。**
- 人工确认：用户明确表示“"docs/06. Development Roadmap.md" 里面人体验验收的都通过了，更新文档啊”。Main Agent 据此记录验收通过，移除相应的待人体验事项。
- 接受范围：应用窗口与多 Project / 导航、Session 对话与输入及状态提醒、Project Knowledge / 默认 View、Files / 项目 Diff / 文件引用的现有体验、Terminal / Browser 与关闭 / 退出交互、设置与外观，以及上述现有功能的阶段整体体验。工程工具和设置的负责记录分别见[工具验收](../T20261009-context-tools/acceptance.md#当前范围与人工功能验收)、[设置任务](../T20261012-settings-theme/task.md#人工功能验收)。
- 版本与证据基线：以 2026-10-18 对话所指路线图中的现有已实现功能为接受范围；用户未另提供体验构建版本号。技术证据沿用各模块原记录的提交、构建及环境，不把本次人工确认绑定到未经用户指明的新构建。
- 未覆盖项：该次人工体验确认不补充技术测试证据，也不覆盖随后实现的本轮 Diff / 原生补丁与对话关联；当前Codex真实兼容性、专项及最终产品打包的技术结论见[顶部独立复核](#2026-10-18-w28-当前收尾独立复核)与[总报告](report.md)。Claude Code 按 DEC-16 / DEC-19 暂缓。现有人工体验不再列为待办，任务状态由 AI 按[任务协议](../../README.md#lifecycle)核对技术交付后收尾。
- 原有[原型 v01 对齐签收](../T20261009-prototype-alignment/task.md)、[原型 v02 对齐签收](../T20261010-prototype-v02-alignment/task.md)及[核心交互模拟范围签收](../T20261011-core-interaction-acceptance/task.md)保留各自日期和基线。以下为 2026-10-09 的历史技术报告，部分通过及未覆盖项仍按当时证据解读。

## 历史技术报告（2026-10-09）

### 未完成与签收

- Claude真实成功流式、Resume、模型切换、工具Stop受配额阻断。Codex 六个历史真实回合已完成，修正版精确Stop仅fixture / 模拟通过；当前安装0.162.0与历史 / 锁定协议0.161.0不同，没有当前真实兼容证明。当前 V1 先补齐真实 Codex 并发与 UI AC-02～05；Claude Code 真实链路按 DEC-16 暂缓且不随当前 V1 发布，不能以模拟结果补齐。详见 [Adapter边界](../T20261009-agent-adapter/acceptance.md#未覆盖与边界)。
- 最终打包 / 发布 / 签名公证、其他平台、宿主异常崩溃与未观察到的脱离后代不在本轮最终证据内。View / 工具内容仍按任务范围保持占位，不将区域导航通过算作其内容实现通过。
- 人工签收日期：尚无。需人审阅阶段性验收、各spec推荐与Project View决定草稿；后续真实复测由主 Agent 按 CLI 实际结果执行和记录。未推送、未合main、未标done。

### 结论

**部分通过：本轮实现与模拟自动化通过；真实 CLI AC-02～AC-05 未完成，完整产品 AC 尚未签收。** 最终代码基线为 `188bd1d`，文档与报告基线为 `e8c4812`。各实现 task 保持 `verifying`，spec 与决定草稿保持原状态。

## 总任务四条标准

| 标准 | 结论 | 独立证据与边界 |
|---|---|---|
| 本轮每个 FR 有负责的子 task，无遗漏 / 重复工作 | 通过 | 下方归属表与 [总任务拆分](task.md)；Adapter 负责原生协议 / Runtime，Session 负责产品状态 / 持久化 / UI；Project 编排关闭，Session 停止目标轮次，职责相接且不重复 |
| 合入 dev/v1 后安装、类型检查、单测与应用冒烟通过；命令登记 AGENTS | 通过（安装与打包为历史基线，见说明） | 独立 [frozen 安装](../T20261009-project-shell/evidence/W3-install.log)；最终 [类型检查](../T20261009-session-slice/evidence/W6-typecheck.log)、[单测](../T20261009-session-slice/evidence/W6-unit.log) Adapter181 / desktop130、[Electron19/19](../T20261009-session-slice/evidence/W6-final-e2e-fixed.log) 含真实 SQLite / PTY / 登录 Shell 冒烟；命令见 [AGENTS](../../../AGENTS.md) |
| AC-01～05 可演示，各子 task 有独立 acceptance | 部分通过 | [骨架](../T20261009-app-skeleton/acceptance.md)、[Project](../T20261009-project-shell/acceptance.md)、[Adapter](../T20261009-agent-adapter/acceptance.md)、[Session](../T20261009-session-slice/acceptance.md) 均存在；AC-01 壳层隔离 / 恢复通过，实际 Session 跨 Project 聚合 / 关闭隔离亦通过；AC-02～05 模拟流程通过，但 task 所要求的真实 CLI 场景未运行，不能认定完整 AC 通过 |
| 需人确认的决定 / 问题归负责文档 | 通过（记录完备，尚未确认） | [spec索引](../../../specs/README.md) 中 Project / navigation / session / chat / input / Adapter 未决问题；[决定索引](<../../../docs/07. Decisions.md>) 中地基三份与 Project View 四份草稿；[Project View task](../T20261009-project-view/task.md) 十二问题仍待确认；阻塞问题的2026-10-09确认保留在负责spec，非阻塞推荐按授权实施并保持待确认 |

最终阶段未新增或升级依赖；W3 安装发生在 `8774bc1`，更早的骨架 [W2干净克隆](../T20261009-app-skeleton/evidence/W2-clean-clone-commands.log) 发生在 `1cd7b73`。不把它们称为最终HEAD从零冷缓存安装。最终构建与原生能力通过Electron实际加载验证；骨架历史打包 / open冒烟见其 acceptance，不代表最终Session产物已打包验证。

## FR 归属与补充验证

FR / AC 来源：[02 FR](<../../../docs/02. Functional Requirements.md>)、[05 AC](<../../../docs/05. Acceptance Criteria.md>)；责任范围见各 task。

| FR | 产品责任 task | 基础依赖 |
|---|---|---|
| FR-PROJ-001～003、FR-NAV-001/002 | Project shell | app-skeleton；关闭停止 / Session摘要接入依赖Session |
| FR-NAV-003、FR-CHAT-001～003、FR-SESSION-001～003、FR-STATE-001～007、FR-INPUT-001/002 | Session slice | app-skeleton、Adapter；与Project壳层共享明确接口 |
| 无新增产品FR；可信IPC、数据库、构建 / 原生环境 | app-skeleton | 技术要求04 §3；独立骨架验收 |
| 上述Session / 输入FR的原生能力部分 | agent-adapter | 协议映射、事件、Stop / Runtime隔离；不承担UI状态清除 |

task frontmatter列出的21个FR均有责任归属。Project View本轮仅调研，四份决定草稿分别为 [Knowledge存储](<../../../docs/07. Decisions.md>)、[渲染](<../../../docs/07. Decisions.md>)、[刷新](<../../../docs/07. Decisions.md>)、[上下文](<../../../docs/07. Decisions.md>)。Context工具与AC-06/07实现留待后续轮次。

Session独立补充验证：真实SQLite重开2,000摘要 / 1,202 transcript、renderer异步竞态、关闭超时 / 迟到输入探针共5项；真实minimize/hide未读规则和2,000历史有界DOM共2项；实际Session聚合驱动Tab / 折叠点、关闭计数2 / 取消保持 / 仅目标停止共1项。日志与逐项截图见 [Session acceptance](../T20261009-session-slice/acceptance.md)。已发现实现缺陷均有修前 / 修后证据，没有剩余已复现的本地自动化阻断。
