---
id: T20261020-v06-composer
status: done
fr: [FR-INPUT-001, FR-INPUT-002]
ac: [AC-02]
specs: [specs/input/spec.md]
created: 2026-10-20
closed: 2026-10-20
---

# v06 开发者输入框调整

## 目标与依据

用户 2026-10-20 要求：v06 思考控件参考 Notion 的信号强度；对话支持 `@`、`/`、`$`；去掉常驻 Enter 发送说明，提示可在发送按钮悬停时显示。参考本地 [Notion 截图](../../../design/references/desktop-layout/notion.png)，延续 [v06 评审](../../../design/layout-ux-review-v02.md)。仅调整探索原型，不代表采用完整 v06 或生产功能验收。

## 范围与验证计划

| 场景 / 来源 | 用户操作与预期 | 验证方式 |
|---|---|---|
| 信号格；本次用户要求、FR-INPUT-002 | 点击信号格、键盘选择低 / 中 / 高 / 极高 / 默认，格数、当前值与菜单一致 | 浏览器操作与截图，检查窄栏边界 |
| 开发者输入；本次用户要求、FR-INPUT-001 | 输入 @ 过滤项目文件、/ 过滤示例命令、$ 过滤示例 Skill；方向键、Enter / Tab 选择，Esc 取消；不自动发送 | 浏览器操作与截图；正常输入和换行回归 |
| 提示按需；本次用户要求 | 空闲无快捷键说明；悬停 / 聚焦发送按钮才显示；错误和不可用原因仍可见 | 浏览器操作与截图 |
| 草稿与附件；input §3 | 文件 / Skill 选择绑定当前草稿，发送失败保留，成功后消息保留引用 | 浏览器操作；原型模拟数据，无真实 CLI |

## 执行与收尾

延续 `design/ux-layout-review` worktree，基线 `d2a3f59` + 原有未提交 v05 / v06 文件。保留已有修改。Main Agent 实现与自检；本次为局部原型修订，无独立功能验收要求。

## 完成记录

- 修改 v06 Composer：思考控件改为 Notion 风格信号格，档位详情留在悬停提示与选择菜单；空闲状态移除常驻快捷键说明，发送按钮通过 `data-tip` 提示 Enter / Shift + Enter。
- 增加 `@` 文件、`/` 命令、`$` Skill 的示例候选与键盘 / 鼠标选择；文件与 Skill 变成上下文标签，命令插入正文。
- 复查 Composer 文案：移除模型 / 思考菜单中的时序说明和重复操作说明，常态只保留当前值和必要状态。
- 实际浏览器走查：`@read` → `README.md`，`/re` → `review`，`$co` → `code-review`，思考菜单选中“高”后信号格更新；空闲输入框 AX 树无快捷键常驻文案。
- 自动检查：三个 v06 JavaScript 文件 `node --check` 通过，`git diff --check` 通过。`pnpm check:docs` 仍被工作区既有的两个缺失参考图片链接阻断：`design/references/README.md:31-32`；与本次 Composer 改动无关。

本任务仅修改探索原型与评审记录，不代表生产应用已同步或人工产品验收通过。
