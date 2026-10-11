# 执行计划：T20261009-prototype-alignment

## 人工审阅入口

[界面待决问题](report.md#待人决定)；[签收依据](task.md#签收)。

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

`80624bb` 已按原型 v01 改写 `tokens.css`、字体打包和多数组件的 TSX 结构（C6、C7、C11、C12 的结构，C3 的菜单分组，C13 的输入框与图标按钮），但 `shell.css`、`session.css` 仍沿用旧选择器与旧 Token：引用未定义的 `--radius-small`、`--launcher-top-padding`、`--title-letter-spacing`；新类名 `danger-button`、`link-button`、`popover`、`menu-item*`、`menu-heading`、`menu-divider`、`grow`、`composer__box`、`split-button__badge`、`session-spinner--inverse`、`request-card__hint` 等没有样式；悬停提示仍按旧 `data-tooltip` 只作用于工具按钮，TSX 已改用 `data-tip`。剩余工作以 CSS 为主，辅以少量结构调整。

做法：以原型 `studio-prototype-v01.html` 的样式表与 `studio-prototype-v01/render.js` 的 DOM 为准，按区域重写两份样式表，再统一截图复核与测试。

1. W1、W2 在独立 worktree 并行实现，写入范围不重叠。
2. 共享样式原语由 W1 定义，W2 只使用、不定义（见下表）。W2 需要新原语或新 Token 时在报告中提出，由主 Agent 协调。
3. 两者合并后，W3 独立复核：三种宽度截图、与原型同尺寸截图对照、全部门禁，写 `acceptance.md`。W3 不修改实现代码；发现的偏差交回主 Agent 分派。

### 共享样式原语（W1 定义，W2 使用）

| 类名 / 属性 | 原型对应 | 说明 |
|---|---|---|
| `.primary-button`、`.secondary-button`、`.danger-button` | `.btn.pri`、`.btn`、`.btn.danger` | 高 30、圆角 8、13px；`.button--small` 对应 `.btn.sm` |
| `.icon-button` | `.tb` / `.ib` | 30×28（顶栏）与 30×30（画布顶栏，`.icon-button--lg`）；`.is-selected` 对应 `.on` |
| `.link-button`、`.text-button` | `.linkbtn` | 12px 蓝色链接 |
| `.popover`、`.menu-heading`、`.menu-item`、`.menu-item__text`、`.menu-item__sub`、`.menu-item__meta`、`.menu-divider` | `.pop`、`.pg`、`.mi`、`.sub`、`.r`、`.popdiv` | 弹层与菜单项 |
| `[data-tip]`、`[data-tip-align="end"]` | `[data-tip]`、`[data-tip-r]` | 深色提示，500ms 延迟 |
| `.grow`、`.muted`、`.attention-dot*`、`.sr-only` | `.grow`、`.meta`、`.dot` | 通用 |

## Workers

模型：Sonnet 5.5，effort xhigh（2026-10-10 用户在对话中指定）。

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 壳层与共享原语：V1～V6、C1、C2 外框、C4、C15、C16 布局、C20、C21 | `apps/desktop/src/renderer/src/app/**`、`styles/**`、`features/project/**`、`features/navigation/**`、`apps/desktop/e2e/{app,project}.spec.ts`；本 task 的 `evidence/W1-*` | 对齐后的壳层样式与结构；共享原语 | — | done |
| W2 | Session 区域：C2 徽标、C3、C5～C9、C11～C14、C22 | `apps/desktop/src/renderer/src/features/{session,input,chat}/**`、`apps/desktop/e2e/session.spec.ts`；本 task 的 `evidence/W2-*` | 对齐后的 Session、对话、卡片与输入区 | 共享原语契约（上表） | done |
| W3 | 独立复核与验收 | 新增 `apps/desktop/e2e/alignment.spec.ts`（仅截图采集，不改实现）；本 task 的 `acceptance.md`、`evidence/W3-*` | 1024 / 1280 / 1440 截图与原型对照、门禁结果、逐项结论 | W1、W2 合并 | done |
| W4 | 2026-10-11 独立复验（本轮主 Agent；未参与实现） | `acceptance.md`、`report.md`、`task.md`、`plan.md`、`evidence/W4-*`；本轮已确认决定的负责规格与索引 | E2E、实际 Electron 交互、截图复核、规格 diff | main `411ce12` | done |
| W5 | 修复本轮发现的滚动跟随缺陷 | 独立 worktree 中的 `apps/desktop/src/renderer/src/features/session/Conversation.tsx`、`features/input/Composer.tsx`、相关 Session 样式与测试、`apps/desktop/e2e/session.spec.ts`；不得写验收或任务文档 | 最小修复、失败场景回归、自检结果；不放宽断言 | W4 三次完整复跑发现问题；修复后交 W4 独立复验 | done |

状态：`todo` | `in_progress` | `done` | `blocked`

## 进度与决定

- 2026-10-10 用户要求推进原型对齐（路线图下一步 1），可调用 Sonnet 5.5 xhigh 的 agents。主 Agent 审计 `80624bb` 后确认剩余项以 CSS 为主（见“方案”）。在分支 `task/prototype-alignment`（基于 `main` `969850a`）上工作；基线 `pnpm typecheck` 与 `pnpm test` 通过，`pnpm test:e2e` 基线 19 / 19 通过。
- 2026-10-10 主 Agent 用本机 Chrome 采集原型 v01 参考截图（1024 / 1280 / 1440 下 View、View 工具、Session 边栏、Needs Input、Error；1280 下 CLI 菜单、草稿、关闭确认、启动页、错误详情），存于 `.runtime/prototype-ref/`，供 W1～W3 对照；采集时冻结原型计时器，避免预置后台事件改变状态。W1、W2 已在各自 worktree 启动。模拟 Provider 触发词：`[e2e:approval]`、`[e2e:question]`、`[e2e:error]`、`[e2e:delay]`、`[e2e:slow]`（`src/main/services/session/e2e-providers.ts`），供 W3 采集状态截图。
- 2026-10-10 W1 交付 `926ff97`，主 Agent 审阅后合并为 `8ec5230`。新增 `styles/primitives.css`（共享原语，在 `shell.css` 前引入），`base.css` 改为零特异性的按钮重置与悬停 / 禁用默认值；`tokens.css` 只补充原型数值。W1 自测 typecheck、单测与 19 项 Electron 通过，未改 E2E 选择器。保留差异：导航分组标题按 Shell Spec 为 28px（原型 30.5px）；只有 Session 列表滚动（虚拟列表需要独立滚动容器）；Tab 最小宽 96px；减少动态效果时保留 500ms 延迟。已把共享原语的位置与注意事项转告 W2。待人决定：View Mode 打开工具时右上角的“关闭右侧工具”按钮（原型与 Shell Spec §8 均无，§9 仅为 Session Mode 边栏）是否移除——涉及行为，暂保留；Shell Spec §3 的 Tab 关闭按钮 16×16、`+` 28×32 与原型 18×18、30×32 不一致，实现按原型。
- 2026-10-10 W2 交付 `f1e33ab`（已先合入 W1 原语），合并为 `ccbfb35`。重写 `session.css`，移除全部 `--radius-small` 与重复的 `.sr-only`；Needs Input 只有一个主按钮：Adapter 标记的选项，否则第一个（新增单测）；“回到最新”改为随输入区高度定位。W2 自测 typecheck、单测、19 项 Electron 通过，未改 E2E。保留差异：连续工具行用 `:has()` 在视觉上合并为一块，DOM 仍为每个工具一个 `<details>`；上下文 chip 目前无产品入口，只用注入 DOM 检查。待人决定：Session 行选中字重按原型 400 还是 Shell Spec §11 的 500（暂按原型）。主 Agent 在 `c9cf37c` 把文字按钮左右内边距改为原型的 14px（W1 用了 16px），并更新 `apps/desktop/README.md` 的样式文件说明；合并后 typecheck、Adapter 181 / desktop 133 单测通过。W3 在主 checkout 的本分支上开始独立复核。
- 2026-10-10 W3 写出 `e2e/alignment.spec.ts`（三种宽度的状态截图与 Shell Spec §2 布局不变量，5 项通过）及计算样式对照（46 项一致、36 项不同；多数随内容或状态变化，或按 Shell Spec 保留），随后因 API 用量上限中断。主 Agent 复跑全量 E2E：alignment 5/5、app 6/6、project 3/3 通过，session 第 1 项失败、后续挂起。原因是环境：屏幕已锁定（`CGSSessionScreenIsLocked = true`，DarkWake），窗口无法获得焦点，按 S-Q1 不视为正在查看。对照：同一锁屏条件下基线 `969850a` 与本分支 `c9cf37c` 的 `session.spec.ts` 结果完全相同（第 1、3、6、10 项失败，其余 6 项通过），证据为 `evidence/main-locked-screen-session-{baseline-969850a,task-c9cf37c}.log`；无本任务引入的回归。00:48 未锁屏时基线 19/19 通过。完整 `pnpm test:e2e` 需在屏幕解锁后复跑。用量恢复后让 W3 在不运行 Electron 的前提下完成验收记录。
- 2026-10-10 W3 恢复后未再运行 Electron，提交 `8281764`：`alignment.spec.ts`、[验收记录](acceptance.md)与 39 份证据。结论：标准 1、2、4 通过，未发现偏差；标准 3 未覆盖（typecheck、单测通过，测试改动只有 2 项新增单测；完整 E2E 待解锁屏幕后复跑）。主 Agent 写入 [report.md](report.md)，回写路线图（下一步 1 改为签收与复跑），task 转为 `verifying`。待人：签收、复跑 E2E（可交 AI）、report 中 4 个待决定问题。
- 2026-10-11 用户要求推进路线图第 1 项验收。W4 在独立 worktree `prototype-v01-acceptance` 验证 main `4a2e988`，未修改应用源码。屏幕已解锁；typecheck 与 Adapter 181 / desktop 133 单测通过。三次完整 E2E 均为 23/24：第 1、3 次在第二轮发送后距底部仍为 435px，第 2 次当前 Session 完成后保留未读绿点。滚动单独两次通过，agent-browser 实际操作也能返回最新并在第二轮完成后保持 gap=0，说明问题间歇出现。按 Acceptance 的缺陷修复与独立复验规则安排 W5 修复，W4 不参与实现。
- 2026-10-11 用户逐项确认：View Mode 保留工具关闭 × 并补入规范；尺寸采用当前实现；Session 选中字重 400、靠背景区分。已回写 UX 与 Shell Spec v02 的 diff，v01 原型与组件规范保留历史文件；本次 diff 待人审阅，未视为任务签收。Needs Input 按钮仍由 input spec I-Q1 负责确认。
- 2026-10-11 W5 在 `prototype-v01-scroll-fix` 交付 `5423666`，仅改 `Conversation.tsx` 与 `session.test.tsx`：区分 scrollTop 未变化的延迟程序滚动事件，同时观察对话 viewport 与正文尺寸。确定性回归修复前失败、修复后通过，保留用户上滚暂停与 Tab 返回位置；未改 E2E 断言。W5 自检门禁通过（Adapter 181 / desktop 134），完整 E2E 24/24。W4 cherry-pick 为验证分支 `411ce12`；独立 typecheck / 315 项单测与完整 E2E 24/24、针对性场景重复 6/6 及实际 Electron 滚动操作均通过。
- 2026-10-11 W4 在 `411ce12` 完成独立复验：`pnpm check:commit` 通过（315 项单测），完整 E2E 24/24；两条曾失败场景各重复 3 次共 6/6。实际 Electron 中长对话上滚暂停、窗口改为 1024×640 后保留阅读位置、回到最新并恢复 1280×800 后输入区增高，均符合预期，第二轮完成时 gap=0。W4 更新验收与报告；任务仍为 `verifying`，待人工审阅和签收。
