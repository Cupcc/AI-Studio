# Project View 规格交付报告

## Done

已将 DEC-04～07 落成 Project View 规格，覆盖 FR-VIEW-001～008。用户于 2026-10-11 明确全部确认，规格任务完成并归档；下一步为代码实现及 AC-06 验证。

## Outputs

- [`specs/project-view/spec.md`](../../../specs/project-view/spec.md)
  - 覆盖 FR-VIEW-001～008 与 AC-06；
  - 明确 `.ai-studio/` 下 Knowledge / View Definition 的文件布局、Schema 约束、realpath 边界和 256 KB / 500 节点防护上限；
  - 规划受信声明式 Renderer、Preview 状态（empty / loading / ready / stale / error）、last-good 回退和刷新补扫；
  - 明确左右布局、普通 Session、View Context 首条一次性注入和可移除标签；
  - 给出 Main Service、IPC、Renderer Store、Session / Project / Navigation 接缝和六阶段实现计划；
  - PV-Q8～PV-Q12 的决定已更新至规格的“已确认”记录（2026-10-11）。
- [`specs/README.md`](../../../specs/README.md)：登记 `project-view` 规格。
- [`tasks/archive/T20261009-project-view/task.md`](task.md)：记录规格交付与任务收尾。
- [`tasks/archive/T20261009-project-view/plan.md`](plan.md)：补充依赖顺序、写入范围和进度记录。
- [`docs/06. Development Roadmap.md`](../../../docs/06.%20Development%20Roadmap.md)：下一步为 Project View 实现。
- [`docs/00. Documentation Index.md`](../../../docs/00.%20Documentation%20Index.md)：更新索引最后更新时间。
- [`docs/04. Technical Requirements.md`](../../../docs/04.%20Technical%20Requirements.md)：技术设计交付物链接到 Project View 规格。

## Findings and pitfalls

1. 现有 Project Shell 已有 `UiState.mainCanvas.view`、`viewRightArea`、`ViewConversation` 和 `ContextItem` 的壳层契约；规格复用这些概念，避免再次定义 Project 状态。
2. 现有 Session DTO 已有 `originViewId` 与 `{type: 'view', viewId}`，但还没有“首条一次性 View Context”完整字段；实现阶段需要在 Session / Adapter 接缝补齐，而不是在 Renderer 拼接 CLI 特定参数。
3. `.ai-studio/` 的 Agent 生成文件与客户端初始化辅助文件必须分开：客户端可以幂等写入指南、Schema 副本和 `.gitignore`，但不能代替 Agent 写 Knowledge 或 View Definition。
4. Preview 的安全边界采用 DEC-05：固定组件 Registry 和受限数据绑定；不执行任意 HTML、脚本、CSS 或表达式。自由 HTML 仍是后续 P1 方案。
5. 文件监视只负责触发补扫，完整读取与 Schema 校验才是快照来源。部分写入或 Knowledge / Definition 不一致时要保留上一版成功渲染，避免清空用户可见内容。

## Not done

- 未实现 `ProjectViewService`、Schema、IPC、Renderer、Preview 或 View Context 注入代码。
- 未创建 `specs/tools/spec.md`，四类工程工具仍按路线图单独推进。
- 规格起草阶段未执行类型检查、单元测试、Electron E2E 或真实 CLI 验证；2026-10-10 提交归位时按仓库门禁执行类型检查与单元测试。本轮交付为文档，尚无功能实现验证。
