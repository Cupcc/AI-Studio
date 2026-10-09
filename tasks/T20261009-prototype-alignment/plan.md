# 执行计划：T20261009-prototype-alignment

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
| W1 | 壳层与共享原语：V1～V6、C1、C2 外框、C4、C15、C16 布局、C20、C21 | `apps/desktop/src/renderer/src/app/**`、`styles/**`、`features/project/**`、`features/navigation/**`、`apps/desktop/e2e/{app,project}.spec.ts`；本 task 的 `evidence/W1-*` | 对齐后的壳层样式与结构；共享原语 | — | todo |
| W2 | Session 区域：C2 徽标、C3、C5～C9、C11～C14、C22 | `apps/desktop/src/renderer/src/features/{session,input,chat}/**`、`apps/desktop/e2e/session.spec.ts`；本 task 的 `evidence/W2-*` | 对齐后的 Session、对话、卡片与输入区 | 共享原语契约（上表） | todo |
| W3 | 独立复核与验收 | 新增 `apps/desktop/e2e/alignment.spec.ts`（仅截图采集，不改实现）；本 task 的 `acceptance.md`、`evidence/W3-*` | 1024 / 1280 / 1440 截图与原型对照、门禁结果、逐项结论 | W1、W2 合并 | todo |

状态：`todo` | `in_progress` | `done` | `blocked`

## 进度与决定

- 2026-10-10 用户要求推进原型对齐（路线图下一步 1），可调用 Sonnet 5.5 xhigh 的 agents。主 Agent 审计 `80624bb` 后确认剩余项以 CSS 为主（见“方案”）。在分支 `task/prototype-alignment`（基于 `main` `969850a`）上工作；基线 `pnpm typecheck` 与 `pnpm test` 通过，`pnpm test:e2e` 基线运行中。
