# 结论：T20261009-prototype-alignment

## 待人决定

- 原有 input spec I-Q1 的问题、建议与回答统一在[负责规格](../../specs/input/spec.md#11-未决问题)维护。
- 路线图所列三个界面问题已于 2026-10-11 在对话中确认，规格回写见下表；本次 diff 与[复验结果](acceptance.md#6-2026-10-11-复验)待审阅，任务尚未签收。

## 需要回写的内容

| 目标文档 | 内容 | 状态 |
|---|---|---|
| [docs/06. Development Roadmap.md](<../../docs/06. Development Roadmap.md>) | 复跑进度、历史失败与签收条件 | 本轮回写，待审阅 |
| [apps/desktop/README.md](../../apps/desktop/README.md) | `tokens.css` 不再标为临时；登记 `primitives.css` | 已回写（`c9cf37c`） |
| [Shell Spec v02](../../design/components/shell-spec-v02.md) §3、§4、§11 | 按 2026-10-11 对话确认统一当前尺寸与 Session 选中字重 | 已回写，diff 待审阅；v01 保留历史文件 |
| [UX §5](<../../docs/03. UX Specification.md#5-context-panel-交互模型>)；Shell Spec v02 §8 | 按 2026-10-11 对话确认补充 View 工具关闭入口 | 已回写，diff 待审阅 |
| [原型说明](../../design/prototypes/README.md)、[组件索引](../../design/components/README.md)、Project / Navigation / Project View spec | 链接负责规则，清理重复的旧参数与过时入口说明 | 已同步，diff 待审阅 |

## 遗留问题

- 已在屏幕解锁后复跑；修复后的完整 E2E、针对性重复和实际 Electron 交互均通过，历史失败与复验见[验收第 6.3 节](acceptance.md#63-间歇失败与修复复验)。
- 上下文 chip、“来自 <View>”顶栏与 View 左侧的输入区目前没有可达的产品路径，只有 W2 注入 DOM 的检查；由 [T20261009-context-tools](../T20261009-context-tools/task.md)、[T20261009-project-view](../T20261009-project-view/task.md) 实现时复核。
- `session.css` 中仍有组件内部尺寸使用像素字面量（与此前做法一致），高保真阶段调整视觉参数前可再收拢为 Token。
- 原型 v01 自身在 1024 宽度下右侧区域会溢出窗口；应用遵循 Shell Spec §2.3，不以原型为准。

## 结论

桌面端界面已按交互原型 v01 对齐，原实现来自 `task/prototype-alignment`（基于 `969850a`），现已在 main。2026-10-11 修复后复验基线为 `411ce12`，本任务已实现范围通过，等待人签收。独立验收见 [acceptance.md](acceptance.md)：

- 差异清单中标为“本任务”的各项均已对齐，或按 Shell Spec / 行为 spec 保留差异并注明原因；独立复核未发现偏差。
- 1024 / 1280 / 1440 三种宽度下 Session Mode、Project View Mode、Needs Input、Error 的截图与原型对照完成；17 个“状态 × 宽度”组合的 Shell Spec §2 布局不变量全部通过。
- 字体随应用打包，CSP 未放开；只保留浅色主题。
- `pnpm typecheck`、`pnpm test`（Adapter 181、desktop 133）通过；测试只新增 2 项单测，没有放宽断言或改动可访问名称。
- 修复后 `pnpm check:commit` 通过（Adapter 181、desktop 134，共 315 项单测），完整 `pnpm test:e2e` 24/24，曾失败的两条场景重复 6/6；实际 Electron 界面操作中滚动、resize、恢复跟随均保持 gap=0。历史 23/24 失败仍保留在验收证据中，Completed Unread 单次失败未再复现，未虚构其原因。
- 三个界面问题已回答并形成规格 diff；本次用户选择不等同于最终签收，也不表示尚未实现的 View / 工具内容已通过验收。

## 变更

| 提交 | 内容 |
|---|---|
| `d7cb525` | 执行计划：W1 壳层、W2 Session 区域、W3 独立验收 |
| `926ff97`（W1） | 重写 `app/shell.css`；新增 `styles/primitives.css`（按钮、图标按钮、弹层与菜单、状态点、悬停提示），`base.css` 改为零特异性的按钮重置；浏览器式 Project Tab、New Chat 分裂按钮、导航、画布与右侧区域顶栏、关闭确认、启动页；新增“仅图标按钮都有悬停提示”单测 |
| `f1e33ab`（W2） | 重写 `features/session/session.css`：Session 行、CLI 徽标与菜单、Conversation 顶栏、草稿页、消息、工具活动、Needs Input / Error 卡片、输入区（模型选择保留原生下拉）、上下文 chip、“回到最新”；Needs Input 只有一个主按钮（Adapter 标记项，否则第一项），新增单测 |
| `c9cf37c`（主 Agent） | 文字按钮内边距改为原型 14px；`apps/desktop/README.md` 更新样式文件说明 |
| `8281764`（W3） | `e2e/alignment.spec.ts`（三种宽度状态截图与布局不变量）、验收记录与证据 |

工作方式：W1、W2 在独立 worktree 并行（Sonnet 5.5 xhigh，2026-10-10 用户指定），共享原语由 W1 定义、W2 使用；W3 不参与实现。原型参考截图由主 Agent 用本机 Chrome 采集，冻结原型计时器以保持状态稳定。
