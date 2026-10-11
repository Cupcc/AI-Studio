---
id: T20261009-project-view
status: done
fr: [FR-VIEW-001, FR-VIEW-002, FR-VIEW-003, FR-VIEW-004, FR-VIEW-005, FR-VIEW-006, FR-VIEW-007, FR-VIEW-008]
ac: [AC-06]
specs: [specs/project-view/spec.md]
created: 2026-10-09
---

# Project View

## 收尾

- 状态：`done`，由 Main Agent 于 2026-10-11 收尾归档。
- 人工确认：用户明确“未确定的我都确定了”“我都已经全部确定了”，规格同步为已确认。
- 依据：下方本轮验收标准及[交付报告](report.md)；文档检查基线为 `810d230` 加本次规格状态、归档与链接同步 diff。
- 自检：归档后的相对链接、锚点与表格检查通过；旧路径引用已清除，2 份原始证据内容未变，`git diff --check` 通过。
- 本轮规格交付已完成；代码实现及 AC-06 验证为后续工作。

## 目标

把已确认的 DEC-04～07 落成 Project View 规格草稿，明确 Project Knowledge、声明式 Renderer、Preview、View Context 与普通 Session 的实现边界和后续实现顺序（FR-VIEW-001～FR-VIEW-008，AC-06）。

本轮不实现代码；规格完成后由后续实现轮次交付 Knowledge 读取、默认 View、Preview 和 Session 接入。

## 范围

- 本轮做：
  - 编写 `specs/project-view/spec.md` 草稿，覆盖 FR-VIEW-001～008；
  - 规划 Knowledge 存储 / Schema、声明式 Renderer、Preview 状态与刷新、View Context 注入、IPC 与 Session 接缝；
  - 同步 `specs/README.md`、`tasks/archive/T20261009-project-view/plan.md`、`report.md` 和 `docs/06. Development Roadmap.md`；
  - 保留实现阶段的技术问题，不把未确认的产品行为写成已确认需求。
- 后续轮次做：按规格实现 Knowledge 读取与校验、View Renderer、Preview 容器、Project View Mode 接入、View Context 注入、五类默认 View 与 AC-06 验证。
- 不做：自定义 View 的创建入口（FR-VIEW-002，P1）留待 P0 完成后评估。

## 依据

- 功能：[02. Functional Requirements](<../../../docs/02. Functional Requirements.md>) 第 2 节 FR-VIEW-001～004、第 3 节默认 View 定义、第 4 节 FR-VIEW-005～008。
- 界面：[03. UX Specification](<../../../docs/03. UX Specification.md>) 第 4、6 节及第 10 节 D-05、D-06、P-A、P-B；[Shell Spec v01](../../../design/components/shell-spec-v01.md) 第 8 节。
- 技术：04 第 3 节分层边界、第 4 节 CLI 原生能力复用、第 6 节 Project View 概念模型、第 1 节待决事项。
- 验收：[05. Acceptance Criteria](<../../../docs/05. Acceptance Criteria.md>) AC-06。

## 验收标准

本轮（规格草稿与同步）：

- [x] 上述五项在 [07. Decisions](<../../../docs/07. Decisions.md>) 中各有决定（DEC-04～07，2026-10-09 确认），引用依据，不新增产品需求。
- [x] 推荐方案满足 FR-VIEW-004 数据与展示分离、FR-VIEW-006 不创建特殊 Project Chat、04 第 3 节渲染隔离。
- [x] 无法由文档推导的产品取舍已列为 Q1～Q12 并由人确认，见“已确认事项”。
- [x] `specs/project-view/spec.md` 覆盖 Knowledge、Renderer、Preview、View Context、接口事件、实现计划和验证清单。
- [x] 模块索引、任务计划、任务报告和路线图进度已同步；规格按用户确认更新状态。

实现阶段（后续轮次，届时细化）：按已确认规格实现并验证 AC-06。

## 已确认事项

Q1～Q12 于 2026-10-09 全部采纳推荐答案，结论已写入 [07. Decisions](<../../../docs/07. Decisions.md>) DEC-04～07 和 [04. Technical Requirements](<../../../docs/04. Technical Requirements.md>) 第 1 节。

| 问题 | 回答（确认日期） |
|---|---|
| Q1 `.ai-studio/`（Project 内隐藏目录）作为存放位置与名称是否合适？推荐：是，避开 CLI 保护的目录名（[DEC-04](<../../../docs/07. Decisions.md>)） | 采纳推荐（2026-10-09 确认） |
| Q2 `.ai-studio/` 默认被 git 忽略（客户端写入内容为 `*` 的 `.gitignore`）还是默认跟踪？推荐：默认忽略 | 采纳推荐（2026-10-09 确认） |
| Q3 V1 是否接受 Agent 只在受信组件词汇内声明式设计 View，自由的沙箱 HTML 推迟到 P1 / 自定义 View？推荐：接受；这与 01 第 7 节、04 第 1 节“AI Generated UI / HTML”的措辞不同，需明确确认（[DEC-05](<../../../docs/07. Decisions.md>)） | 采纳推荐（2026-10-09 确认） |
| Q4 应用是否内置默认 View Definition，Agent 的 `views/*.view.json` 只作覆盖？推荐：是 | 采纳推荐（2026-10-09 确认） |
| Q5 Overview 的 Recent Sessions / Needs Input / Recently Completed 是否为客户端固定渲染区域，Agent 不能读取或摆放？推荐：是 | 采纳推荐（2026-10-09 确认） |
| Q6 何时标注“示例数据”（Shell Spec v01 第 8 节）？推荐：数据属性 `example`，默认 false，仅 Agent 写占位内容时设为 true | 采纳推荐（2026-10-09 确认） |
| Q7 View Context 是否作为首条消息的独立前置文本块，并折叠为可移除的“当前 View”标签；移除则不注入但仍记录 `origin_view_id`；是否在 04 第 6 节 Session 增加 `view_context_attached`？推荐：均为是（[DEC-06](<../../../docs/07. Decisions.md>)） | 采纳推荐（2026-10-09 确认） |
| Q8 客户端可否在用户发送带 View Context 的消息前，向 `.ai-studio/` 写入自己的指南、Schema 与 `.gitignore`（打开 View 本身不写文件）？推荐：可以 | 采纳推荐（2026-10-09 确认） |
| Q9 确认 V1 客户端不自动生成、不提示“知识已过期”、不提供自动修复入口（任何一项都是新增 FR）？推荐：确认 V1 都没有（[DEC-07](<../../../docs/07. Decisions.md>)） | 采纳推荐（2026-10-09 确认） |
| Q10 View Context 文本是否用英文（面向模型，界面中折叠）？推荐：是 | 采纳推荐（2026-10-09 确认） |
| Q11 暂定单文件 256 KB、500 个节点的上限，待渲染原型校准？推荐：接受 | 采纳推荐（2026-10-09 确认） |
| Q12 后续选项（内置 Skill、Claude hooks 写后校验反馈、`developerInstructions` / `append`）何时评估？推荐：`specs/agent-adapter` 确定配置加载边界后，或指南文本过长时 | 采纳推荐（2026-10-09 确认） |
