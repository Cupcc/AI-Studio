# 执行计划：T20261112-workbench-ui-polish

## 方案

分三个阶段。阶段一由三个写入范围互不重叠的 Worker 在各自 worktree 并行实现；Main Agent 将三条分支整理进任务分支 `feat/workbench-ui-polish`。阶段二在整合后的任务分支上由单一 Worker 统一中文文案，并串行运行受影响的 E2E、修复失败。阶段三由未参与实现的 Review Agent 在实际 Electron 应用中验收，同时由文档 Worker 回写规格与设计文档。Main Agent 负责任务记录、集成、变更清单与收尾。

Worker 不运行 `pnpm dev`；阶段一不运行 E2E（需要窗口焦点的 Electron 测试同一时间只能有一份）。设计依据为设计画布的源文件副本与现状截图，路径在各 Worker 的任务说明中给出。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 工作台宿主：标题栏状态与更多菜单、关于面板、停用 / 草稿 / 出错呈现、去掉宿主缩放、导航行与添加入口、对话空态文案 | `apps/desktop/src/renderer/src/features/workbench/**`；`features/project/Workspace.tsx`、`features/project/integration.tsx`；`app/shell.css`；`app/Icon.tsx`；`apps/desktop/e2e/workbench.spec.ts`；`e2e/project-view.spec.ts` 中引用宿主控件的行 | 分支 `feat/workbench-ui-polish-host` | — | done |
| W2 | 选品页面：悬浮流程条与操作、提示位置、流程标题遮挡、窄宽度、模板版本 | `apps/desktop/build/workbenches/product-selection/**`；`apps/desktop/src/main/services/workbench/` 下读取该包的测试；`apps/desktop/e2e/product-selection.spec.ts` 的页面内选择器 | 分支 `feat/workbench-ui-polish-page` | — | done |
| W3 | 字体：界面与等宽字体改为系统优先 | `apps/desktop/src/renderer/src/styles/**`；`apps/desktop/build/workbench-common/**`；五个预设包的样式；`src/shared/workbench/resources/` 中的字体行；Terminal / Monaco 的字体配置及其测试 | 分支 `feat/workbench-ui-polish-shell` | — | done |
| W4 | 中文文案统一；整合后串行运行受影响 E2E 并修复 | 整合后的任务分支上的全部应用代码与测试（单一写者） | 任务分支上的提交 | W1、W2、W3 集成完成 | in_progress |
| W5 | 文档回写：规格、UX、视觉方向、决定、路线图、桌面说明 | `docs/**`、`specs/**`、`design/**`、`apps/desktop/README.md` | 任务分支上的提交 | W4 | todo |
| R1 | 独立验收：实际 Electron 应用操作与截图 | `tasks/T20261112-workbench-ui-polish/acceptance.md`、`evidence/` | 验收记录 | W4 | todo |

状态：`todo` | `in_progress` | `done` | `blocked`

## 进度与决定

- 2026-11-12 13:55 用户确认设计并要求用 Opus 5.5 子代理实现；创建任务 worktree 与三个 Worker worktree（均基于 dev `0404448`），依赖安装完成。启动 W1、W2、W3。
- 2026-11-12 14:05 W3 完成，提交 `ede3d64`，源 worktree 干净；已快进并入任务分支。自检：桌面类型检查与 22 个文件、276 个用例通过，未运行 E2E。遗留给 W4：`e2e/alignment.spec.ts` 中“IBM Plex 已加载”的断言在系统字体优先后不再成立。Main Agent 决定改为检查内置字体已打包且可按需加载（显式加载后再断言），不删除该项检查。macOS 上等宽字体实际为 Menlo（Chromium 不支持 `ui-monospace`，SF Mono 需用户自行安装）。
- 2026-11-12 14:12 W2 完成，源提交 `afcb6af`，rebase 到任务分支后为 `1eccaf4` 并已快进并入，源 worktree 干净。自检：类型检查与 8 个文件、55 个用例通过；独立页面加 SDK 桩在 400 / 520 / 664 / 1000 宽度截图，Main Agent 已查看 664 与 400 两张，悬浮条不重叠、流程标题未被遮挡。未在 Electron 宿主内验证，未运行 E2E。模板版本升至 1.2.0，已有 1.1.0 实例会看到升级提示。W2 的技术取舍：首次打开全图缩放低于 75% 时改用 75% 并从第一流程开始；任务面板只在开始执行时自动展开一次；画布保留规格要求的纯色底，不采用设计稿的点阵。Main Agent 接受这三项，75% 起始视图列入交付时的待用户体验项。
- 2026-11-12 14:30 W1 完成。首次提交被范围外的 `features/project/shell.test.tsx` 一处类型错误挡住（测试仍写着已删除的缩放状态）；Main Agent 将该行纳入 W1 范围后提交 `8ad0fa9`，rebase 到任务分支后为 `4de67e7`，无冲突，源 worktree 干净，已快进并入。自检：类型检查通过，工作台与 Project 两组 52 个用例通过，提交门禁选中的 21 个文件、311 个用例通过；`e2e/workbench.spec.ts` 与 `e2e/project-view.spec.ts` 已按新界面修改但未运行。W1 新增 `--color-needs-input-text`（四种外观各一处，不改已有取值）与 `PreviewHeader` 插槽。
- 2026-11-12 14:32 用户追加：模型名称不显示“（默认）”。并入 W4。三条分支整合完成，任务分支为 `4de67e7`，启动 W4。
- 2026-11-12 14:50 用户要求先并入 dev 实测。dev 此时多出其他会话的文档提交 `bdb1ed4`；将阶段一分支 `feat/workbench-ui-polish-host` rebase 到 dev（无冲突，三个提交变为 `36f2613`、`f117fd2`、`009286a`），用集成命令快进并入本地 dev，未推送。通知 W4 先提交文案改动并暂缓全部 E2E，避免测试窗口与用户实测争抢焦点。
- 2026-11-12 15:00 W4 提交中文文案 `5ab3085` 与模型名称 `242c499`（rebase 前的 SHA），源 worktree 干净。自检：桌面类型检查通过，桌面全量单测 116 个文件、1438 个用例通过；11 个 E2E 文件已按新文案修改但一份未运行。任务分支 rebase 到 dev 后并入本地 dev。W4 的 E2E 部分待用户实测结束后继续。
