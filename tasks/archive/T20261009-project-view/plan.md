# 执行计划：T20261009-project-view

## 交付入口

[交付报告](report.md)；[收尾记录](task.md#收尾)。

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

本轮把已确认的 DEC-04～07 写成实现可执行的规格草稿，先固定数据 / 展示分离和安全边界，再按“共享类型与 Schema → 主进程读取与刷新 → Renderer / Preview → Session 接入 → 默认 View 与集成验证”的依赖顺序推进。规格不把自由 HTML、自动生成、手动写 Knowledge 或自定义 View 混入 V1。

详细边界、接口草案和验证清单见 [`specs/project-view/spec.md`](../../../specs/project-view/spec.md)。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 待决事项调研（Sonnet 5.5 xhigh） | 本 task 的 `research.md`、`evidence/W1-*`；已合并至 `docs/07. Decisions.md` DEC-04～07 | 调研记录与决定草稿 | — | done |

## 进度与决定

- 2026-10-09 task 卡片为 draft，本轮只做调研。
- 2026-10-09 W1 完成并合并：4 份决定草稿（存储、渲染、Context 注入、刷新与权限）、research.md 与本机探测证据；12 个待人确认的问题已写入 task.md 未决问题。本轮不实现。
- 2026-10-09 人确认 Q1～Q12 均采纳推荐答案；4 份决定合并入 `docs/07. Decisions.md` DEC-04～07 并标为已确认，04 第 1 节第 1、2、3、10、11 项标为已定。task 转为 ready。
- 2026-10-10 完成 `specs/project-view/spec.md` 草稿：覆盖五个默认 View、`.ai-studio/` 文件布局、Schema / Renderer 安全边界、Preview 状态机、补扫规则、View Context、IPC / Session 接缝和六阶段实现计划；同步模块索引、路线图与任务报告。task 进入 `verifying`，等待人工审阅规格后进入实现轮次。
- 2026-10-10 用户要求“提交归位，需要我验收的地方停下”；将旧 detached HEAD worktree 的规格草稿与配套文档保存到 `task/project-view-spec`，再接到 `task/github-ci` 基线，保留双方的路线图进度。规格仍为草稿，task 保持 `verifying`，等待人工审阅。
- 2026-10-11 用户确认人类与 AI 职责调整：文档任务由 Main Agent 复核收尾，产品审阅和后续实现授权单独处理；本次规则 diff 待审阅。同步报告中已过时的 PV-Q8～PV-Q12 待确认描述，保留规格草稿和本轮只做文档的边界；尚未执行整份规格的收尾复核。
- 2026-10-11 用户明确规格内容已全部确认，无需再次复核。更新规格状态、删除重复审阅前置步骤，文档任务由 Main Agent 完成并归档；路线图下一步改为实现。
