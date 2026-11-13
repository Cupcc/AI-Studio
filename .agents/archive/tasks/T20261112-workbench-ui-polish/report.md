# 结论：T20261112-workbench-ui-polish

## 待人决定

- 选品画布首次打开的缩放：全图缩放低于 75% 时改用 75% 并从第一个流程开始。这是 Worker 的技术取舍，待用户实测后决定是否保留。
- 模型菜单里“跟随 CLI 默认”一项右侧的“默认”小标记是否保留。
- 工具名称（Files / Search / Diff / Browser / Terminal）、Composer 的几个无障碍名称（Model Selector、Send、Stop、Plugins）、“Session History”“Session 标题”以及预设页面内部内容，本轮保留英文，是否后续统一为中文。
- 添加工作台入口从列表下方移到“工作台”标题旁，规格中写为按设计稿调整；用户已确认整体设计，是否单独记为用户确认由用户决定。

## 变更清单

基线为 dev `bdb1ed4`，共 75 个文件、+920 / −390，其中应用代码与测试 60 个文件，文档 13 个，任务记录 2 个。设计依据见[设计画布](https://claude.ai/artifact/FPDmPyEpuydS67DQWKCXM4)的“定稿”页，其中“单行标题 + 更多菜单”对应上一轮的方案 A。

### 界面变化

| 位置 | 之前 | 现在 |
|---|---|---|
| 工作台右侧标题栏下方 | 阶段行（含缩放、刷新、编辑、停用）、“插件信息与备份”、“包检查通过 / 页面已连接 / 已读取保存状态”三行 | 三行删除，页面紧接标题栏；仅草稿说明或模板升级提示时多一行 |
| 标题旁的状态 | 无 | 正常只显示一个状态点；加载显示转圈与文字；出错显示红点并在页面顶部出现带操作的提示；草稿显示“草稿”标记；停用显示“已停用” |
| 工作台操作 | 分散在阶段行，停用是蓝色文字链接 | 标题栏“更多操作”菜单：编辑工作台、重新加载、关于此工作台、停用工作台（警示色）或启用工作台；停用不弹确认 |
| 来源、版本、能力、备份说明 | 折叠在“插件信息与备份”里 | “关于此工作台”对话框；页面能力用中文描述 |
| 已停用的工作台 | 一段说明文字 | 停用页，带“启用工作台”按钮 |
| 草稿 | 阶段行里的主按钮和一段说明 | 标题栏里的“草稿”标记与主按钮（名称不变），下方一行简短说明 |
| 宿主缩放 | 每个工作台都有 −/100%/+ | 取消；只有带画布的页面自带缩放 |
| 导航 | “添加工作台”是列表下方的整行按钮；选中行比其他行短 | 加号在“工作台”标题旁；选中行整行高亮 |
| 工作台对话空态 | “在 选品工作台 中继续工作” | “和 AI 讨论这个工作台” |
| 选品页面顶部 | “工作画布”标题行与流程行两行固定工具栏 | 流程条悬浮在画布左上，任务要求、自动排布、比较入选、导出简报、新建节点悬浮在右上 |
| 选品页面提示 | 左下角浮层，会压住节点 | 右下角单行，可关闭；空间不足时移到缩放条上方；错误提示不可关闭 |
| 选品流程标题 | 被吸顶工具栏遮挡 | 适应全图、流程跳转和首次打开都为悬浮条留出边距 |
| 选品任务要求 | 工具栏下方的一行面板，执行期间强制展开 | 右上角下方的浮动面板，只在开始执行时自动展开一次 |
| 选品页面窄宽度 | 未处理 | 低于 760px 时流程条只显示当前流程名称，其余显示序号 |
| 字体 | IBM Plex Sans / Mono 优先 | 系统字体优先，IBM Plex 仅作回退；macOS 上界面为系统字体与苹方，等宽实际为 Menlo |
| 模型按钮 | “模型名（默认）” | 只显示模型名；菜单里的默认项用右侧“默认”小标记区分 |
| 对话列表空态 | “还没有对话”加蓝色 New Chat 链接 | 只有“还没有对话” |

未改动：应用四种外观的颜色、选品页面的绿色配色、思考强度指示、设置入口及图标、工作台清单 / SDK / IPC / 存储。

### 文案变化

| 之前 | 现在 |
|---|---|
| Overview / Progress / Architecture / Agent Team / Business Flow | 概览 / 进度 / 架构 / Agent 团队 / 业务流程（内部 viewId 不变，用户重命名仍优先） |
| New Chat | 新对话 |
| SESSIONS | 对话 |
| Preview | 预览 |
| Conversation（区域名与占位标题） | 对话 |
| Reasoning Effort（无障碍名称） | 思考强度 |
| 选择 New Chat CLI | 选择新对话的 CLI |
| 新增节点（选品页面按钮的无障碍名称） | 新建节点（与可见文字一致） |
| 发给 CLI 的上下文 `Current Workbench: Architecture` | `Current Workbench: 架构`（该行其余部分仍为英文） |

### 代码

| 范围 | 提交 | 主要文件 |
|---|---|---|
| 字体 | `36f2613` | `styles/tokens.css`、`styles/fonts.css`、`build/workbench-common/style.css`；Terminal 与 Monaco 的字体说明 |
| 选品页面 | `f117fd2` | `build/workbenches/product-selection/` 下的 `index.html`、`selection.css`、`selection.js`、`canvas.js`、`canvas-model.js`、`manifest.json`（版本 1.2.0） |
| 工作台宿主 | `009286a` | 新增 `features/workbench/WorkbenchHeader.tsx`、`host.ts`；修改 `WorkbenchPreview.tsx`、`WorkbenchPage.tsx`、`WorkbenchControls.tsx`、`WorkbenchNavigation.tsx`、`WorkbenchConversation.tsx`、`store.ts`、`workbench.css`；`features/project/Workspace.tsx` 与 `integration.tsx` 增加标题栏插槽；`app/Icon.tsx` 新增三个图标；`styles/tokens.css` 新增 `--color-needs-input-text` |
| 中文文案 | `ff7585a` | 五个预设包的 `manifest.json`、`shared/project/strings.ts`、`features/chat/CliMenu.tsx`、`features/session/SessionHistory.tsx`、`features/navigation/Navigation.tsx` |
| 模型名称 | `f33e973` | `features/input/Composer.tsx`、`composer.css` |

### 测试

- 单元测试：更新 `features/workbench`、`features/project`、`features/session` 与 `main/services/workbench` 下受影响的用例；新增标题栏状态、更多操作菜单、关于对话框、停用与启用、选品起始视图与边距、模型默认标记的用例；删除宿主缩放的用例。
- E2E：11 个 spec 按新界面与新文案修改（`alignment`、`claude-effort`、`composer`、`files`、`product-selection`、`project-view`、`project`、`runtime-tools`、`session`、`settings`、`workbench`）。

### 文档

回写提交 `f7d2836`，diff 待人工审阅。

| 目标文档 | 内容 | 状态 |
|---|---|---|
| `docs/07. Decisions.md` | 新增 DEC-30，记录 2026-11-12 的八项用户决定及其取代关系 | 待审阅 |
| `specs/workbench/spec.md` | §9.4、§9.7 宿主呈现、§9.8 添加入口、§9.9 选品页面与模板版本 | 待审阅 |
| `specs/project-view/spec.md` | 宿主不提供缩放；View Context 的工作台名称 | 待审阅 |
| `specs/navigation/spec.md` | NAV-Q13 改为已确认，新增概念名与界面文案对照 | 待审阅 |
| `specs/chat/spec.md`、`specs/input/spec.md` | 新对话文案；模型按钮与默认标记 | 待审阅 |
| `docs/03. UX Specification.md` | 工作台一节去掉通用缩放，补标题栏状态与更多操作 | 待审阅 |
| `docs/05. Acceptance Criteria.md` | 网页包检查项去掉缩放 | 待审阅 |
| `docs/06. Development Roadmap.md` | 下一步、整体概况、模块状态、阶段计划、验收进度 | 待审阅 |
| `design/visual-direction.md` | 新增 §1.2 系统字体优先 | 待审阅 |
| `design/README.md`、`design/screens/README.md`、`design/components/shell-spec-v02.md` | 登记设计画布；导航文案与右侧标题栏 | 待审阅 |
| `apps/desktop/README.md` | 字体说明；工作台宿主呈现与添加入口 | 待审阅 |

## 结论

实现已集成 dev，随已验收的 `872978b` 推进 main。当前验证状态：

- 桌面类型检查通过；桌面全量单元测试 116 个文件、1438 个用例通过（任务分支 `242c499` 对应的代码）。
- E2E 已修改但未运行：为避免与用户实测争抢窗口焦点而暂缓。
- 未参与实现的 Agent 的界面验收尚未进行。
- 人工产品验收：已验收，见[任务记录](task.md#人工功能验收)。

## 遗留问题

- 模拟 Provider `main/services/session/e2e-providers.ts` 仍匹配英文的工作台名称，`e2e/project-view.spec.ts` 的相关场景预计失败，待 W4 修正。
- `e2e/alignment.spec.ts` 与 `e2e/runtime-tools.spec.ts` 中“IBM Plex 已加载”的断言需改为“内置字体可按需加载”。
- 右侧区域接近最小宽度时，草稿标题与主按钮会被截断显示。
- 保存失败时没有提示条，状态点旁直接显示失败文字，超出设计稿。
- 已有的 1.1.0 选品实例需要用户通过升级提示预览并应用后才换成新页面。
- `shared/project/strings.ts` 文件头的注释仍引用旧的文案约定。
