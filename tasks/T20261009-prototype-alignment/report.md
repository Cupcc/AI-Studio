# 结论：T20261009-prototype-alignment

## 待人决定

| # | 问题 | 现状 | 依据 |
|---|---|---|---|
| 1 | View Mode 打开工具时，右上角的“关闭右侧工具”按钮保留还是移除？ | 保留（移除属于行为变化） | 原型与 Shell Spec §8 均无；§9 仅为 Session Mode 边栏规定关闭按钮 |
| 2 | Shell Spec 与原型的尺寸差异以哪一方为准？Tab 关闭按钮 16×16 / 18×18，`+` 28×32 / 30×32，导航分组标题 28 / 30.5，日期分组 24 / 28.5，CLI 菜单宽 260 / 225 | Tab 关闭与 `+` 按原型；分组标题、日期分组与 CLI 菜单按 Shell Spec | Shell Spec §3、§4；原型 v01 样式表 |
| 3 | Session 行选中时字重为 400 还是 500？ | 400（原型 `.srow.on`） | Shell Spec §11 写“字重 500” |
| 4 | Needs Input 且输入为空时显示 Stop 还是禁用的 Send？ | Stop（按推荐实现） | [input spec](../../specs/input/spec.md) I-Q1，原有未决问题；原型显示禁用的 Send |

## 需要回写的内容

| 目标文档 | 内容 | 状态 |
|---|---|---|
| [docs/06. Development Roadmap.md](<../../docs/06. Development Roadmap.md>) | 文档信息“进度依据”、下一步 1 改为签收与复跑、Project 管理行的剩余工作 | 已回写，待审阅 |
| [apps/desktop/README.md](../../apps/desktop/README.md) | `tokens.css` 不再标为临时；登记 `primitives.css` | 已回写（`c9cf37c`） |
| [design/components/shell-spec-v01.md](../../design/components/shell-spec-v01.md) §1 | “尺寸复核”可改为已在应用中按三种宽度复核，链接本任务验收 | 待人确认后回写（已确认文档） |
| 同上 §3、§4、§11 | 与原型不一致的尺寸与选中字重，按[待人决定](#待人决定)的回答修改 spec 或实现 | 待人决定 |

## 遗留问题

- 屏幕解锁后复跑 `pnpm test:e2e`，通过后验收标准 3 转为通过。
- 上下文 chip、“来自 <View>”顶栏与 View 左侧的输入区目前没有可达的产品路径，只有 W2 注入 DOM 的检查；由 [T20261009-context-tools](../T20261009-context-tools/task.md)、[T20261009-project-view](../T20261009-project-view/task.md) 实现时复核。
- `session.css` 中仍有组件内部尺寸使用像素字面量（与此前做法一致），高保真阶段调整视觉参数前可再收拢为 Token。
- 原型 v01 自身在 1024 宽度下右侧区域会溢出窗口；应用遵循 Shell Spec §2.3，不以原型为准。

## 结论

桌面端界面已按交互原型 v01 对齐，实现位于分支 `task/prototype-alignment`（基于 `main` `969850a`），等待人签收。独立验收见 [acceptance.md](acceptance.md)：

- 差异清单中标为“本任务”的各项均已对齐，或按 Shell Spec / 行为 spec 保留差异并注明原因；独立复核未发现偏差。
- 1024 / 1280 / 1440 三种宽度下 Session Mode、Project View Mode、Needs Input、Error 的截图与原型对照完成；17 个“状态 × 宽度”组合的 Shell Spec §2 布局不变量全部通过。
- 字体随应用打包，CSP 未放开；只保留浅色主题。
- `pnpm typecheck`、`pnpm test`（Adapter 181、desktop 133）通过；测试只新增 2 项单测，没有放宽断言或改动可访问名称。
- 完整 `pnpm test:e2e` **尚未在本分支跑通**：验证期间屏幕锁定，窗口无法获得焦点，依赖焦点的 4 项 Session 用例失败或挂起。同一锁屏条件下，基线 `969850a` 与本分支的 `session.spec.ts` 结果完全相同（4 项失败、6 项通过），其余 E2E（含新增 5 项）通过，没有回归迹象。需在解锁屏幕后复跑一次，预期 24 项。

## 变更

| 提交 | 内容 |
|---|---|
| `d7cb525` | 执行计划：W1 壳层、W2 Session 区域、W3 独立验收 |
| `926ff97`（W1） | 重写 `app/shell.css`；新增 `styles/primitives.css`（按钮、图标按钮、弹层与菜单、状态点、悬停提示），`base.css` 改为零特异性的按钮重置；浏览器式 Project Tab、New Chat 分裂按钮、导航、画布与右侧区域顶栏、关闭确认、启动页；新增“仅图标按钮都有悬停提示”单测 |
| `f1e33ab`（W2） | 重写 `features/session/session.css`：Session 行、CLI 徽标与菜单、Conversation 顶栏、草稿页、消息、工具活动、Needs Input / Error 卡片、输入区（模型选择保留原生下拉）、上下文 chip、“回到最新”；Needs Input 只有一个主按钮（Adapter 标记项，否则第一项），新增单测 |
| `c9cf37c`（主 Agent） | 文字按钮内边距改为原型 14px；`apps/desktop/README.md` 更新样式文件说明 |
| `8281764`（W3） | `e2e/alignment.spec.ts`（三种宽度状态截图与布局不变量）、验收记录与证据 |

工作方式：W1、W2 在独立 worktree 并行（Sonnet 5.5 xhigh，2026-10-10 用户指定），共享原语由 W1 定义、W2 使用；W3 不参与实现。原型参考截图由主 Agent 用本机 Chrome 采集，冻结原型计时器以保持状态稳定。
