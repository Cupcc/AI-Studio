# Project View 规格草稿报告

## Done

已把 2026-10-09 已确认的 DEC-04～07 写成 Project View 模块规格草稿，并同步模块索引、任务计划和 V1 路线图。当前只完成文档与实现规划，没有修改应用代码，也没有把规格状态改为“已确认”。任务现处于 `verifying`，等待人工审阅。

## Outputs

- [`specs/project-view/spec.md`](../../specs/project-view/spec.md)
  - 覆盖 FR-VIEW-001～008 与 AC-06；
  - 明确 `.ai-studio/` 下 Knowledge / View Definition 的文件布局、Schema 约束、realpath 边界和 256 KB / 500 节点防护上限；
  - 规划受信声明式 Renderer、Preview 状态（empty / loading / ready / stale / error）、last-good 回退和刷新补扫；
  - 明确左右布局、普通 Session、View Context 首条一次性注入和可移除标签；
  - 给出 Main Service、IPC、Renderer Store、Session / Project / Navigation 接缝和六阶段实现计划；
  - 保留 PV-Q8～PV-Q12 作为实现阶段技术问题。
- [`specs/README.md`](../../specs/README.md)：登记 `project-view` 草稿规格。
- [`tasks/T20261009-project-view/task.md`](task.md)：范围改为规格草稿与同步，状态进入 `verifying`，保留实现阶段验收边界。
- [`tasks/T20261009-project-view/plan.md`](plan.md)：补充依赖顺序、写入范围和进度记录。
- [`docs/06. Development Roadmap.md`](../../docs/06.%20Development%20Roadmap.md)：Project View 模块状态和阶段 2 交付内容同步为“规格草稿已完成，实现尚未开始”。
- [`docs/00. Documentation Index.md`](../../docs/00.%20Documentation%20Index.md)：更新索引最后更新时间。
- [`docs/04. Technical Requirements.md`](../../docs/04.%20Technical%20Requirements.md)：技术设计交付物链接到 Project View 规格。

## Findings and pitfalls

1. 现有 Project Shell 已有 `UiState.mainCanvas.view`、`viewRightArea`、`ViewConversation` 和 `ContextItem` 的壳层契约；规格复用这些概念，避免再次定义 Project 状态。
2. 现有 Session DTO 已有 `originViewId` 与 `{type: 'view', viewId}`，但还没有“首条一次性 View Context”完整字段；实现阶段需要在 Session / Adapter 接缝补齐，而不是在 Renderer 拼接 CLI 特定参数。
3. `.ai-studio/` 的 Agent 生成文件与客户端初始化辅助文件必须分开：客户端可以幂等写入指南、Schema 副本和 `.gitignore`，但不能代替 Agent 写 Knowledge 或 View Definition。
4. Preview 的安全边界采用 DEC-05：固定组件 Registry 和受限数据绑定；不执行任意 HTML、脚本、CSS 或表达式。自由 HTML 仍是后续 P1 方案。
5. 文件监视只负责触发补扫，完整读取与 Schema 校验才是快照来源。部分写入或 Knowledge / Definition 不一致时要保留上一版成功渲染，避免清空用户可见内容。

## Not done

- 未实现 `ProjectViewService`、Schema、IPC、Renderer、Preview 或 View Context 注入代码。
- 未创建 `specs/tools/spec.md`，四类工程工具仍按路线图单独推进。
- 规格起草阶段未执行类型检查、单元测试、Electron E2E 或真实 CLI 验证；2026-10-10 提交归位时按仓库门禁执行类型检查与单元测试，当前交付仍是文档草稿。

## Decisions needed from a human

规格正文没有新增产品范围；人工审阅时请重点确认：

- 是否接受 PV-Q8～PV-Q12 的实现建议，尤其是 ViewSnapshot 的 IPC 形态、缩放持久化、Schema 版本策略、View Context transcript 展示方式和内置 Definition 的资源形式；
- 是否签收本轮规格草稿，以及后续是否授权进入代码实现轮次；task 保持 `verifying`，等待人工审阅。
