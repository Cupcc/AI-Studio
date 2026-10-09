# 验收：T20261009-prototype-alignment

> 写入者：验收 Worker（W3），不是实现者。人签收后，任务才能标记为 done。

验证对象：分支 `task/prototype-alignment`，HEAD `c9cf37c`（W1 `926ff97`、W2 `f1e33ab`、主 Agent 修正 `c9cf37c`），基线 `main` `969850a`。验证日期 2026-10-10。环境：macOS arm64、Electron 44.4.5、模拟 Session Provider（`STUDIO_E2E_PROVIDERS=1`），未调用真实 CLI 或模型。参照物：已确认的交互原型 v01 与 Shell Spec v01。

验证方法：

1. 新增 [alignment.spec.ts](../../apps/desktop/e2e/alignment.spec.ts)，在 1024×640、1280×800、1440×900 三种内容尺寸下驱动界面进入各状态，等 `innerWidth/innerHeight` 与窗口一致后截图，并断言 Shell Spec v01 第 1 节的布局不变量（结果见 [W3-layout-metrics.json](evidence/W3-layout-metrics.json)）。
2. 用本机 Chrome 在同一状态、同一尺寸下运行原型，逐张目视对照（原型截图 `evidence/W3-proto-*-1280.png`）。
3. 对同一状态下的原型与应用元素读取计算样式（尺寸、内边距、圆角、颜色、字体、阴影），逐组比较，结果见 [W3-style-probe-compare.txt](evidence/W3-style-probe-compare.txt)：85 组中 46 组完全一致，36 组有差异（第 3 节逐类归因），3 组为原型或应用在该状态下不存在的元素。探针脚本是 `.runtime/` 下的临时文件，未保留；原始数据见 `W3-style-probe-proto.json`、`W3-style-probe-app.json`。

## 1. 验收标准

| 验收标准 | 来源 | 结论 | 证据 |
|---|---|---|---|
| research.md 差异清单中标为“本任务”的每一项已对齐，或注明保留差异及原因 | task.md | 通过（有保留差异；部分项的证据来自 W1 / W2，见第 2 节“证据”列） | 第 2 节逐项表；[样式探针](evidence/W3-style-probe-compare.txt) |
| 1024 / 1280 / 1440 宽度下 Session Mode、Project View Mode 及 Needs Input、Error 状态的截图存入 `evidence/`，并与原型对照 | task.md；Shell Spec v01 第 1、11 节；AC-01、AC-05 | 通过 | 下表三宽度截图；[布局指标](evidence/W3-layout-metrics.json) |
| 不改变行为：`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 通过；测试只因可见文案或结构调整而修改选择器，不放宽断言 | task.md | 未覆盖：typecheck、单测通过，测试改动符合要求；完整 `pnpm test:e2e` 未能在解锁屏幕下跑完，待复跑 | [typecheck](evidence/W3-typecheck.log)；[单测](evidence/W3-test.log)；[e2e 中断运行](evidence/W3-e2e-run1-locked-screen.log)；对照日志见下 |
| 字体随应用打包，CSP 不放开外部字体来源 | task.md；04 第 2 节；DEC-02 | 通过 | 第 1.4 节 |

### 1.1 截图（标准 2）

每个状态三个宽度，均为整窗口截图（不含 macOS 原生窗口控制按钮，见第 4 节）。1280 的原型对照图一并列出。

| 状态 | 1024 | 1280 | 1440 | 1280 原型 |
|---|---|---|---|---|
| Session Mode：已完成对话，右侧边栏打开 Files | [图](evidence/W3-session-sidebar-1024.png) | [图](evidence/W3-session-sidebar-1280.png) | [图](evidence/W3-session-sidebar-1440.png) | [图](evidence/W3-proto-session-sidebar-1280.png) |
| Project View Mode：Overview（Preview 占位） | [图](evidence/W3-view-overview-1024.png) | [图](evidence/W3-view-overview-1280.png) | [图](evidence/W3-view-overview-1440.png) | [图](evidence/W3-proto-view-overview-1280.png) |
| Project View Mode：选中 Files | [图](evidence/W3-view-tool-1024.png) | [图](evidence/W3-view-tool-1280.png) | [图](evidence/W3-view-tool-1440.png) | [图](evidence/W3-proto-view-tool-1280.png) |
| Needs Input：审批请求卡片 | [图](evidence/W3-needs-input-1024.png) | [图](evidence/W3-needs-input-1280.png) | [图](evidence/W3-needs-input-1440.png) | [图](evidence/W3-proto-needs-input-1280.png) |
| Error：展开“查看详情” | [图](evidence/W3-error-1024.png) | [图](evidence/W3-error-1280.png) | [图](evidence/W3-error-1440.png) | [图](evidence/W3-proto-error-details-1280.png) |

仅 1280：[Needs Input 提问卡片](evidence/W3-needs-input-question-1280.png)（原型无此形态）、[启动页](evidence/W3-launcher-1280.png)（[原型](evidence/W3-proto-launcher-1280.png)）、[CLI 菜单](evidence/W3-cli-menu-1280.png)（[原型](evidence/W3-proto-cli-menu-1280.png)）、[草稿页](evidence/W3-draft-1280.png)（[原型](evidence/W3-proto-draft-1280.png)）、[关闭确认](evidence/W3-close-dialog-1280.png)（[原型](evidence/W3-proto-close-dialog-1280.png)）、[悬停提示](evidence/W3-tooltip-1280.png)（原型无独立截图，改用计算样式比较，第 3 节）。

### 1.2 布局不变量（标准 2，Shell Spec v01 第 1 节）

`alignment.spec.ts` 对 17 个“状态 × 宽度”组合断言：无横向溢出（Workspace `scrollWidth` 等于 `innerWidth`）、导航宽 248、顶栏高 40、所有主画布顶栏与右侧区域顶栏高 48、Session 对话列 ≥ 400 且右侧边栏 ≥ 320、View 对话列 ≥ 360 且右侧区域 ≥ 400、对话文字列与输入框 ≤ 720。全部通过，实测值：

| 状态 | 宽度 | 对话列 | 右侧区域 | 文字列 / 输入框 |
|---|---|---|---|---|
| Session + 边栏 | 1024 / 1280 / 1440 | 400 / 632 / 792 | 376 / 400 / 400 | 400 / 632 / 720（输入框 352 / 584 / 720） |
| View | 1024 / 1280 / 1440 | 376 / 440 / 440 | 400 / 592 / 752 | 不适用 |
| Session，无边栏（Needs Input、Error） | 1024 / 1280 / 1440 | 776 / 1032 / 1192 | 无 | 均为 720 |

1024 下 Session 边栏默认 400 被压缩到 376 以保住对话列最小 400，符合第 1.3 节“先压缩右侧、再压缩 Conversation”。原型自身在 1024 下会溢出窗口：View 右侧区域的工具图标被裁切（[原型 View 1024](evidence/W3-proto-view-overview-1024.png)），Session 边栏的关闭按钮被裁切（[原型 Session 1024](evidence/W3-proto-session-sidebar-1024.png)）；应用没有这个问题，应以应用为准。

### 1.3 不改变行为（标准 3）

| 项目 | 结果 |
|---|---|
| `pnpm typecheck` | 通过，退出码 0（[日志](evidence/W3-typecheck.log)） |
| `pnpm test` | 通过：Adapter 15 个文件 181 项，desktop 21 个文件 133 项（[日志](evidence/W3-test.log)） |
| 测试改动（`git diff 969850a..HEAD`） | 只有 2 处新增单测：`shell.test.tsx`（每个仅图标的壳层按钮带 `data-tip`、不再使用旧 `data-tooltip`）与 `session.test.tsx`（Needs Input 只有一个主按钮）。没有删除或放宽任何断言，没有改动任何 E2E 文件；`Send`、`Stop`、`Model Selector`、`消息`、`回复 Agent`、`关闭右侧工具`、`更多操作 …` 等可访问名称在 TSX 差异中均未变化 |
| E2E，本次运行（[日志](evidence/W3-e2e-run1-locked-screen.log)） | 第 1～16 项：`alignment.spec.ts` 5 / 5、`app.spec.ts` 6 / 6、`project.spec.ts` 3 / 3 通过；`session.spec.ts` 第 15 项（AC-02）失败、第 16 项（AC-03）通过，第 17 项（AC-04）挂起 16.6 分钟后被我终止，之后的用例未执行 |
| 环境原因 | 屏幕锁定（`CGSSessionScreenIsLocked = true`），窗口无法获得焦点；session spec S-Q1 把未聚焦窗口视为“未在查看”，依赖焦点的用例必然失败 |
| 对照实验（主 Agent，同样锁屏） | `session.spec.ts` 在基线 `969850a` 与任务 HEAD `c9cf37c` 上结果相同：AC-02、AC-04、FR-STATE-003/005、FR-SESSION-001 滚动共 4 项失败，其余 6 项通过（[基线](evidence/main-locked-screen-session-baseline-969850a.log)；[HEAD](evidence/main-locked-screen-session-task-c9cf37c.log)）。基线在解锁屏幕下为 19 / 19（plan.md 进度记录） |

结论：没有出现回归迹象，但“完整 `pnpm test:e2e` 通过”这一条不能在本次验证中确认。需要在屏幕解锁、窗口可聚焦时重跑一次完整 `pnpm test:e2e`（预期 24 项，含新增的 5 项），通过后本条转为通过。

### 1.4 字体与 CSP（标准 4）

| 检查 | 结果 |
|---|---|
| 字体随应用打包 | `apps/desktop/out/renderer/assets/` 含 5 个 IBM Plex woff2（Sans 400 / 500 / 600，Mono 400 / 500，latin 子集），`@font-face` 的 `src` 均为相对路径 `./…woff2` |
| 运行时确实加载 | `alignment.spec.ts` 第 1 项断言 `document.fonts` 中 `IBM Plex Sans` 与 `IBM Plex Mono` 状态为 `loaded`，且 `body` 的 `font-family` 含 `IBM Plex Sans`（该项在本次运行中通过） |
| 无外部字体引用 | 在 `apps/desktop/src`、`apps/desktop/out` 中搜索 `fonts.googleapis.com`、`fonts.gstatic.com`，无结果（原型 HTML 自身使用 Google Fonts，不属于应用） |
| CSP 未放宽 | 构建产物 `out/renderer/index.html` 的 CSP 为 `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'`。`git diff 969850a..HEAD` 对 `electron.vite.config.ts`、`src/main`、`src/preload`、`src/shared`、`src/renderer/index.html` 均无改动 |
| 单一浅色主题 | 渲染进程源码与构建产物中没有 `prefers-color-scheme`；`tokens.css` 声明 `color-scheme: light` |

## 2. 差异清单逐项结论

结论取值：对齐 / 保留差异（有原因，已记录）/ 偏差（未对齐）/ 范围外（归其他任务）。“证据”列中“探针”指 [样式探针](evidence/W3-style-probe-compare.txt) 中该元素一致；“W1 / W2”表示证据来自实现者，W3 未独立复现。本次没有发现“偏差”。

### 2.1 视觉参数

| # | 项目 | 结论 | 证据与说明 |
|---|---|---|---|
| V1 | 色板 | 对齐 | 原型 `:root` 的 26 个色值中 24 个在 `tokens.css` 逐值存在；缺的 `--add #e9f6ed`、`--del #fbecea` 只用于 Diff 行底色，随 T20261009-context-tools 引入。探针中顶栏、导航、选中态、卡片、对话框、遮罩、按钮的背景 / 边框 / 文字色一致 |
| V2 | 主题只有浅色 | 对齐 | 第 1.4 节：无 `prefers-color-scheme`，`color-scheme: light` |
| V3 | 字体 | 对齐 | 第 1.4 节；探针中字体族（IBM Plex Sans）、字号（正文 14、导航 13、辅助 12）一致。保留：中文使用系统苹方等回退字体（research 第 3 节既定），Plex 只含 latin 子集与 400 / 500 / 600 |
| V4 | 圆角与阴影 | 对齐 | 探针中 Tab 8、New Chat 9、导航项 7、卡片 12、输入框 16、对话框 14、弹层 12、气泡 14 与阴影（输入框、弹层、对话框）全部一致 |
| V5 | 图标 | 对齐 | `Icon.tsx` 为 16px 网格、1.4px 线宽、圆角端点，路径与原型 `render.js` 的 `P` 一致；渲染进程已无 `▾ ⋯ × +` 文字图标，仅保留“回到最新 ↓”（chat spec 与测试使用的名称） |
| V6 | 悬停提示 | 对齐 | [W3-tooltip-1280.png](evidence/W3-tooltip-1280.png)；`alignment.spec.ts` 悬停 800ms 后断言伪元素 `content` 为 `"Diff"`、`opacity` 为 1；探针中提示的背景、文字、字号、圆角、内边距与原型一致；新增单测保证所有仅图标按钮（Tab 关闭除外）带 `data-tip`。保留：减少动态效果时仍保留 500ms 延迟（W1 记录） |

### 2.2 组件

| # | 区域 | 结论 | 证据与说明 |
|---|---|---|---|
| C1 | Project Tab | 对齐 | 探针：选中 Tab 高 32、白底、上圆角 8、关闭按钮 18×18、`+` 30×32 一致；[session-sidebar-1280](evidence/W3-session-sidebar-1280.png)。保留：Tab 最小宽 96px（W1）。Shell Spec §2 写关闭按钮 16×16、`+` 28×32，与原型不一致，实现按原型，待人决定（第 5 节） |
| C2 | New Chat | 对齐 | 探针：分裂按钮、主区、chevron 区一致；铅笔图标 + New Chat + 右侧默认 CLI 标识（CX） |
| C3 | CLI 菜单 | 保留差异 | [应用](evidence/W3-cli-menu-1280.png) / [原型](evidence/W3-proto-cli-menu-1280.png)：标题、CLI 标识 + 名称 + “默认”、分隔线、“将 X 设为此 Project 默认”排布一致，行为不变。差异：菜单宽 260（Shell Spec §3）对原型 225，原型中最后一项折成两行，应用不折行 |
| C4 | 导航分组标题 | 保留差异 | 字号 11、字距 .06em、颜色一致。高度：区域标题 28（原型 30.5），日期分组 24（原型 28.5），均按 Shell Spec §3；视觉上导航项整体上移约 2.5px，日期分组间距小约 4.5px。`text-transform` 在应用中为 none，但文案本身是大写，外观一致 |
| C5 | Session 列表项 | 对齐 | 探针：选中 / 未选中行、CLI 标识一致；Running 转圈见 [W3-tooltip-1280](evidence/W3-tooltip-1280.png)，样式与原型 `.spin` 逐值相同；悬停出现的 ⋯ 按钮为 22px 图标按钮，由 CSS 与单测覆盖，W3 未做悬停截图。保留：选中行字重 400（原型），Shell Spec §10 写 500，待人决定 |
| C6 | Conversation 顶栏 | 对齐（部分未验证） | Session：CLI 标识 + 标题 + CLI 全名；草稿：“新对话 + Codex CLI · 发送第一条消息后创建 Session”（[草稿](evidence/W3-draft-1280.png)）。“· 来自 X”与蓝色链接“在 View 中打开”在 `Conversation.tsx` 中已实现，但 View 对话尚未实现，没有可达路径，W3 未验证 |
| C7 | 草稿页 | 对齐 | 探针：居中布局、标题 17px / 500、说明 12px 一致。应用显示绝对路径，原型显示 `~/…` 缩写，属显示选择 |
| C8 | 消息 | 对齐 | 探针：用户气泡（背景、圆角 14、内边距、字号 14、行高 1.55）、Agent 正文（14 / 1.7）一致；消息间距 14 |
| C9 | 工具活动 | 对齐 | 探针：等宽 12px、浅灰底、边框、圆角 8、内边距一致。保留：`<details>` 可展开，连续工具行用 `:has()` 视觉合并为一块（W2）；行首带状态符号 ✓，原型为“动词 + 路径”两列（内容来自 Provider） |
| C10 | 轮次完成行 | 范围外 | “Worked for … · Done”样式与原型一致（12px、淡色）；“修改了 N 个文件”链接归 T20261009-context-tools |
| C11 | Needs Input 卡片 | 对齐 | [应用](evidence/W3-needs-input-1280.png) / [原型](evidence/W3-proto-needs-input-1280.png)：探针中橙色浅底与边框、标题橙点、命令框、主 / 次按钮、右侧“也可以在下方直接回复”均一致。保留：主按钮为 Adapter 标记的选项，否则第一个（W2，新增单测）。卡片根元素字号 13 对原型 14，但原型卡片内每个文字节点都自带字号，视觉无差别 |
| C12 | Error 卡片 | 对齐 | [应用](evidence/W3-error-1280.png) / [原型](evidence/W3-proto-error-details-1280.png)：红色浅底与边框、红点标题、“重试”主按钮、“查看详情 / 收起详情”按钮一致；详情内容是 Provider 的原始 JSON，高度不同属内容差异 |
| C13 | 输入区 | 对齐（有保留差异） | 探针：输入框（圆角 16、内边距、阴影）、文本框、底行、`+`、圆形发送按钮一致；模型选择保留原生下拉，收起外观为“文字 + chevron”。保留差异：Needs Input 且输入为空时按钮显示 Stop（[input spec](../../specs/input/spec.md) I-Q1），原型显示禁用的 Send（[应用](evidence/W3-needs-input-1280.png) / [原型](evidence/W3-proto-needs-input-1280.png)）；占位文案（“向 Codex CLI 发送消息…”“回复 Agent…”）与原型不同，可访问名称未变 |
| C14 | 上下文标签 | 对齐（W2 证据） | [W2-composer-chips-tool-group-1280.png](evidence/W2-composer-chips-tool-group-1280.png)：带图标的 chip，24px 高、圆角 6，可移除；目前没有产品入口，W2 用注入 DOM 检查，W3 未复现。两类 chip 都带 ×，符合 Shell Spec §6“可单独移除”，原型的 View chip 没有 × |
| C15 | 右侧区域顶栏（Session Mode） | 对齐 | 探针：图标按钮、选中态一致；[W3-session-sidebar-1280](evidence/W3-session-sidebar-1280.png)：工具图标在左、当前工具名、右侧关闭 |
| C16 | 右侧区域顶栏（View Mode） | 对齐（布局）；保留差异 | [W3-view-tool-1280](evidence/W3-view-tool-1280.png)：标题在左，右侧 Preview 图标、分隔线、四个工具图标，探针一致。“示例数据”“已更新 · 时间”归 T20261009-project-view。差异：View Mode 选中工具时右上角多一个“关闭右侧工具”×，原型与 Shell Spec §7 均无，涉及行为，待人决定（第 5 节） |
| C17 | View 左侧草稿 | 范围外 | 归 T20261009-project-view；应用目前显示占位 |
| C18 | Preview 与五个 View | 范围外 | 归 T20261009-project-view |
| C19 | 工具内容 | 范围外 | 归 T20261009-context-tools |
| C20 | 关闭确认 | 对齐 | [应用](evidence/W3-close-dialog-1280.png) / [原型](evidence/W3-proto-close-dialog-1280.png)：探针中遮罩、对话框（宽 420、圆角 14、内边距、阴影）、标题、说明、红色“关闭并停止”与“取消”按钮全部一致；说明文案按 Shell Spec §9 |
| C21 | 启动页 | 对齐（有保留差异） | [应用](evidence/W3-launcher-1280.png) / [原型](evidence/W3-proto-launcher-1280.png)：浅灰背景、460 内容宽、标题、主按钮探针一致；最近项目为名称 + 等宽路径。保留：容器内边距 32 / 24（小窗口不贴边）、保留“已打开”徽标、“不可用”状态和移除按钮（行内可点区域因此为 426）；长路径在本截图中被省略号截断 |
| C22 | 回到最新 | 保留差异 | chat spec 要求，原型无；[W2-scroll-paused-latest-1280.png](evidence/W2-scroll-paused-latest-1280.png)。W3 未复现：对应 E2E（FR-SESSION-001 滚动）在锁屏下基线与 HEAD 均失败，待解锁屏幕复跑 |

## 3. 样式探针差异归因

85 组中 46 组一致。36 组差异归因如下，没有一项构成偏差。

| 归因 | 组 | 说明 |
|---|---|---|
| 内容或状态不同 | `tab-selected`、`tab-label`、`tab-unselected`、`tab-unselected-label`、`session-title`、`conv-title`、`feed-in`、`user-msg`、`agent-msg`、`tool-row`、`err-detail`、`draft-title`、`draft-path`、`launch-in`、`launch-path`（含列间距）、`composer-model` 宽度与右内边距（原生下拉的 chevron 空间）、`menu` 高度、`menu-item-last` | 项目名、文案、详情内容、菜单项折行不同，样式规则相同 |
| 结构不同、视觉等价 | `topbar` 左内边距（应用用 76px 的窗口控制区，等于原型 12 + 36 + 16 + 12）、`view-rarea`、`view-tool-rarea`（边框在父容器上，差 1px）、`sidebar`、`sidebar-header`（1px）、`compose`（不透明白底对透明底）、`composer-box` 边框色（输入框已聚焦，等于原型 `:focus-within` 的 `#bdbcb6`）、`launch` 内边距、`launch-project` 宽度（保留移除按钮）、`menu-item-meta`（探针命中的是外层 `.r`，原型的“默认”在内层 `.meta` 中为 12px 淡色，与应用一致）、`menu` 与 `menu-divider` 的容器字号（项目自带字号，无影响）、`nav-heading` 的 `text-transform`（文案已大写） | 数值不同但渲染结果与原型一致 |
| 规范优先于原型 | `nav-heading` 28 对 30.5、`nav-date` 24 对 28.5、`menu` 宽 260 对 225 | Shell Spec §3，见 C3、C4 与第 5 节 |
| 行为规范优先于原型 | `send` 背景（Stop 按钮对禁用 Send） | input spec I-Q1，见 C13 |
| 根元素字号 | `need-card`、`err-card`（13 对 14） | 卡片内所有文字节点自带字号，无视觉影响 |
| 元素在该状态不存在 | `spinner`（探针时无 Running 会话）、`send-stop`、`done-line` | `spinner` 见 C5 的截图与样式核对 |

## 4. 未覆盖与边界

- 未使用真实 CLI 或模型；所有会话由模拟 Provider 产生，截图中的 `[e2e:…]` 触发词与临时目录路径是测试数据。
- 完整 `pnpm test:e2e` 未在解锁屏幕下跑完，见第 1.3 节；本条是唯一未覆盖的验收标准。我没有启动 Electron 重跑。
- macOS 原生窗口控制按钮不在 Playwright 页面截图内，截图左上角的空白（76px）是为其预留的区域；原型用圆点示意。Shell Spec §11“窗口控制区”仍需在原生窗口中复核。
- 悬停、焦点环、按下等交互态只验证了悬停提示；Session 行 ⋯ 按钮、Tab 悬停与键盘焦点环由 CSS 与既有单测覆盖，W3 未截图。
- 以下内容 W3 没有可达路径或不独立复核：上下文 chip（只有 W2 注入 DOM 的截图）、“来自 View”顶栏与链接（View 对话未实现）、“回到最新”（只有 W2 截图）。
- 以下属其他任务，不计入偏差：Preview 与五个 View 的内容、View 左侧最近对话块与草稿、四类工具内容、“示例数据”“已更新”、“修改了 N 个文件”、文件上下文来源、原型的“演示控制”面板。
- 原型文案与 spec 不同处（输入框占位文本、关闭确认说明）按 spec 保留；原型在 1024 下的溢出不予照搬（第 1.2 节）。
- 截图为 2x（Retina）；其他像素密度与非 macOS 平台未验证。
- 样式探针只覆盖了 1280×800 与上述状态；1024 / 1440 的样式差异由截图目视与布局不变量覆盖。

## 5. 待人决定

| 问题 | 背景 | 建议 |
|---|---|---|
| View Mode 打开工具时右上角的“关闭右侧工具”按钮是否保留 | 原型与 Shell Spec §7 没有；§8 的关闭按钮只写 Session Mode 边栏。移除会改变行为（W1 因此保留） | 按 Shell Spec 则移除，并同步 project 测试 |
| Shell Spec §2 与原型的 Tab 关闭按钮（16×16 对 18×18）、`+`（28×32 对 30×32） | 实现按原型 | 改 Shell Spec 为原型值，或让实现回到 Shell Spec 值 |
| Shell Spec §3 与原型的区域标题（28 对 30.5）、日期分组（24 对 28.5）、CLI 菜单宽（260 对 225，原型菜单项折行） | 实现按 Shell Spec，视觉上与原型有 2～5px 差 | 保持实现，并在 Shell Spec 或原型 README 注明“以 Shell Spec 为准” |
| Session 选中行字重：原型 400，Shell Spec §10 写 500 | 实现按原型 | 二选一后统一 |
| Needs Input 且输入为空时显示 Stop 还是禁用的 Send | input spec I-Q1 推荐 Stop，答复栏为空；原型显示禁用 Send。实现按 spec | 确认 I-Q1 |

## 签收

- 状态：待签收
- 签收：
