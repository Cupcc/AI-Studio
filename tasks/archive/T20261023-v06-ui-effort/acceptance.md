# 验收：T20261023-v06-ui-effort

## 2026-10-24 修正复验（W7）

- 来源：用户本日纠正为最多五格、菜单与信号图标静态，实际选中 max / ultra 时由对话输入框做一次切换反馈；随后补充最低档为 low、ultra 使用随主题变化的渐变。验收依据为[本轮重开范围](task.md#2026-10-24-重开五格与选择切换反馈)及 [input spec](../../../specs/input/spec.md#思考强度信号与动效)。
- 验收者：W7，`/root/selection_review`，未参与本轮产品实现；只读代码评审，从实际 Electron UI 独立点击、输入、添加文件、换档、切换设置及键盘操作。只读 DOM 和动画事件观察用于留证，没有调用内部接口设置被验收行为。
- 边界：本地构建、隔离数据、模拟 Provider，不调用真实模型；不新增真实 CLI 兼容性、完整无障碍符合性、系统缩放或打包应用结论。Session 更新失败 / 等待和重启恢复另由下列主 Agent 自动化覆盖，未冒充 W7 独立 UI 执行。
- 基线与环境：`30c96e2` 加 `fix/effort-selection` 未提交 diff，最终构建已移除模拟目录中的 minimal 并采用主题渐变；macOS 15.6 arm64，1280×800 原生内容窗口、DPR 2。最终 fixture `studio-effort-selection-KM5NT6`、Electron PID 59994、CDP 9333、agent-browser 会话 `effort-w7-review`；仓库外 Project 为 `Effort Switch`，仅注入模拟 Provider / 模型目录及原生目录选择返回值。
- **AI 修正复验结论：通过。** 五格静态、选中一次输入框反馈、最低 low 与 ultra 主题渐变符合本轮范围。人工状态仍为“需调整；修正后待人工复验”，未写成人工接受。旧 W4 证据仍属于 2026-10-23 基线。

### W7 逐项结果

| 场景 | 独立操作与实际结果 | 结论与证据 |
|---|---|---|
| 五格、最低 low、菜单静态 | 从 New Chat 打开菜单；目录为默认、low、medium、high、xhigh、max、ultra，无 minimal。每项正好五格，亮格数依次 1 / 2 / 3 / 4 / 5 / 5；触发按钮与所有选项的动画数均为 0 | 通过：[最终菜单](evidence/W7-final-five-static-menu.png)、[只读观察](evidence/W7-final-ui-observations.json) |
| max / ultra 选中反馈与输入保护 | 输入草稿并从真实 fixture 文件候选加入 `src/app.ts`，点击 max，再点击 ultra。max 金橙单波、ultra 主题渐变双波扫过 Composer 边界；两轮色带在视频帧中可见，正文和文件标签保持原位。分别约 1s / 1.4s，单次、pointer-events 为 none，结束后移除，静态五格不动 | 通过：[约 7 秒最终预览](evidence/W7-final-effort-preview.mp4)、[max 帧](evidence/W7-final-max-transition.png)、[ultra 帧](evidence/W7-final-ultra-transition.png)、[双波序列](evidence/W7-final-ultra-wave-frames.png) |
| ultra 渐变跟随主题 | 通过设置从浅色极光切到浅色薄荷，再切到深色纯色。ultra 五格保持满格、连续静态渐变；极光为柔和蓝紫暖色、薄荷转为绿蓝暖色、纯色转为灰阶。实际浅色五格可辨，菜单无溢出；切换主题未增加选中动画事件 | 通过：[极光菜单](evidence/W7-final-five-static-menu.png)、[薄荷菜单](evidence/W7-final-mint-menu.png)、[深色纯色菜单](evidence/W7-final-solid-dark-menu.png) |
| 重选与浏览不重播 | 当前 ultra 再选 ultra；再次打开菜单后 Escape。选中事件累计数均保持 4、无 Composer 动画节点，焦点返回 Reasoning Effort | 通过：[观察记录 checkpoints](evidence/W7-final-ui-observations.json) |
| 减少动态效果与键盘 | 以浏览器媒体模拟启用 reduced-motion 后从 ultra 改 max：设置更新但事件数仍为 4、无动画；关闭 reduced-motion 不补播。随后 ArrowDown / End / Enter 选 ultra：累计只新增 1 次，结束后无动画节点，焦点返回按钮 | 通过：[观察记录 checkpoints](evidence/W7-final-ui-observations.json) |
| Session 异步与恢复边界（主 Agent 自动化，W7 只读核对） | 主 Agent 的单元用例覆盖 Session 更新等待时不播、成功后播、同值不写、失败保留旧值、恢复静态及减少动态效果变更取消；最终 E2E 覆盖四外观一次切换、主题色变化不重播和重启恢复。W7 核对测试 diff 与日志，未代称为独立 UI 操作 | 通过：专项单元 25 / 25、最终相关 Electron 20 / 20；[单元日志](evidence/W1-selection-unit.log)、[Electron 日志](evidence/W1-selection-electron.log) |

### W7 发现、修正与证据边界

首轮 max 扫光可见，ultra 双波在正常缩略观看下不易辨认；W7 将观察交回主 Agent，未参与修复。主 Agent 调整扫光为 ease-in-out、第二波间隔 400ms；并按后续用户指令移除模拟目录 minimal、改为主题渐变。W7 重连新 fixture 后完成上述最终复验，无剩余阻塞发现。[首轮菜单](evidence/W7-five-static-menu.png)与[首轮录像](evidence/W7-effort-selection-full.webm)仅为补充要求前的过程记录，不能证明最终版本通过。

最终[原始录像](evidence/W7-final-effort-15fps.webm)为真实应用约 6.93 秒、15fps 连续录制，包含选择前后静止段；预览仅等比例缩至 1280×800 并转码，未剪辑或修改动作画面。首个 30fps 录制遇到编码器积压而中断，未作为通过证据，改用上述完整 15fps 录制。截图与序列帧均已由 W7 实际查看；只读记录中的前两次选中发生于同一最终构建的录制准备，正式预览记录后两次 max / ultra，键盘复验再增加一次 ultra。

主 Agent 最终基础检查为脚本 36 / 36、Adapter 257 / 257、桌面单元 1178 / 1178、类型检查通过，W7 读取[日志](evidence/W1-selection-code-check.log)核对，未重复执行。W7 收尾复核本次用户纠正、最终 UI diff、input spec 本节、task 重开范围、自动化日志和本验收记录；实现结果与人工复验状态分别保留。

## 未覆盖与待决事项

- 本轮使用模拟 Provider 验证 UI，不发送真实模型请求；不新增真实 Codex / Claude 集成通过结论。完整无障碍符合性、系统缩放及打包应用未由 W4 验证。
- 原生前台完成场景此前受锁屏阻断；用户回复继续、系统解锁后，W4 已在新的隔离 fixture 独立复验通过，历史失焦证据保留在下节。当前无未解决阻塞项。

## 人工功能验收

- 状态：**需调整；修正后待人工复验**（2026-10-24）。用户本日明确纠正了格数与动效位置，原 2026-10-23 AI 通过结论不代表符合本日要求或人工接受。
- 范围与版本：v06 桌面 UI 对齐，以及本日修正的五格静态信号、最低 low、max / ultra Composer 选中反馈、ultra 主题渐变；本日基线、环境与验证边界见上节 W7，2026-10-23 历史结果见下节 W4。
- 人工记录：用户 2026-10-23 指令授权实施；尚未收到功能接受确认。实施授权、AI 验收与人工产品验收分别记录。

## AI 结论与运行环境

- 2026-10-23 历史总体结论：**通过**。该基线的 UI、动效、候选、草稿隔离与已报告缺陷复验通过；解锁后原生前台发送完成独立复验通过，主 Agent 最终 Electron 回归 53 / 53 通过。本轮用户纠正后的新要求另由上节 W7 复验，不能沿用历史结论。
- 验收者：W4，`/root/review_ui`；未参与产品实现，仅只读评审并操作应用、记录证据。
- 日期与代码基线：2026-10-23；`a0f2132` 加 `feat/v06-effort` 未提交 diff，范围为 Composer / ControlMenu / EffortSignal / useSuggestions、Conversation / Session、Project View 及相应样式。最终候选边界检查与前台发送使用主 Agent 重建后的 renderer；其余截图来自同轮修复后的构建，后续增补未改动所示动效与布局。
- 平台与应用形态：macOS 15.6 arm64；本地构建 Electron，隔离测试数据，CDP 9333。agent-browser 独立会话 `v06-w4-review`。1024×640 检查使用 CDP viewport emulation，原生窗口尺寸由主 Agent E2E 覆盖。
- Provider 与 CLI：模拟 Codex / Claude Providers 和 E2E 模型目录；真实 CLI 版本不适用。测试 Project 为仓库外 `V06 Motion`，含 `README.md` 和 `src/app.ts`；原生目录选择 fixture 由主 Agent 准备。最终前台复验使用新 fixture `studio-v06-acceptance-c50xID`、Electron PID 97991，先确认目录和原生焦点再发送。被验收行为均从 UI 入口操作，没有通过内部调用设置产品状态。
- 自动化区分：W4 独立相关单元检查 54 / 54；主 Agent `check:code` 脚本 36 / 36、Adapter 257 / 257、桌面 1176 / 1176，见[基础检查日志](evidence/W1-code-check.log)。W4 读取并核对主 Agent [最终全量 Electron 日志](evidence/W1-electron-full.log)的 53 / 53 和[Composer / Settings 专项日志](evidence/W1-composer-settings.log)的 8 / 8；这些自动化结果由主 Agent 执行，不替代下列独立 Electron 操作。

## 验收结果

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| [任务验收标准](task.md#验收标准与场景)、[v06 §3～4](../../../design/layout-ux-review-v02.md#3-布局与状态)：起步与底部 Composer | 打开 Project，选择 Codex；点击“了解项目”，随后正常发送模拟消息 | 示例填入并聚焦，已有内容不被覆盖，不自动创建 Session；发送前后 Composer 底边一致 | 示例只填入，另两项禁用，Session 数仍为 0；发送后框体底边仍为 748px；顶栏只保留 CLI 标识与标题 | agent-browser；构建 Electron、模拟 Provider | 通过 | [New Chat](evidence/W4-new-chat.png)、[发送完成](evidence/W4-session-completed.png) |
| [任务验收标准](task.md#验收标准与场景)、[input §3](../../../specs/input/spec.md#3-行为细则)：max / ultra 与减少动态效果 | 从真实模拟目录选择 max，再用 End / Enter 选择 ultra；启用 reduced-motion | 两档视觉动效可区分；减少动态效果后保持静态可辨识 | max 使用 `effort-max-wave`；ultra 使用 `effort-ultra-wave` 并有额外闪烁；减少动态效果下四格和闪烁 animation-name 均为 `none` | UI 选择、动画样式只读检查、录像帧检查 | 通过 | [max](evidence/W4-max.png)、[ultra](evidence/W4-ultra.png)、[动效录像](evidence/W4-effort-motion.webm) |
| v06 §4、input §3：键盘与当前值 | 打开 effort 选择器，按 End / Enter；重新打开后按 Esc | 支持键盘选择，选中 / Esc 关闭后回触发按钮；当前值可读 | ultra 可用键盘选择，焦点返回触发按钮；Esc 恢复焦点；触发按钮包含当前强度的 `aria-description` | agent-browser、独立源码评审 | 通过 | [ultra](evidence/W4-ultra.png)；缺陷复验见下节 |
| input §3：目录未列出与恢复 | 保留 ultra，切到 E2E Alternate；打开模型菜单，再点击“使用默认” | 不静默重置旧值，有就近提示和恢复；菜单紧贴触发按钮 | ultra 保留并显示目录未列出；模型菜单位于触发按钮上方约 7px；使用默认清除覆盖，模型无 effort 时控件隐藏 | agent-browser、DOM 边界只读检查 | 通过 | [未知 effort](evidence/W4-unknown-effort.png) |
| v06 §4、input §3：真实文件候选与菜单关闭 | 输入 `@src/`，选择 `app.ts`；输入 `@READ` 后打开模型菜单 | 使用当前 Project 文件目录；添加标签并移除 token，不发送；另一菜单打开时关闭候选 | 选择后生成 `src/app.ts` 标签，未新建 Session；模型菜单开启时文件候选关闭；后续模拟发送收到该文件 | agent-browser；模拟 Provider、真实 fixture 文件树 | 通过 | [发送完成](evidence/W4-session-completed.png) |
| v06 §4：短窗口候选边界 | 最终 renderer，1024×640，输入 7 行含 `@src/` | 候选可用且位于正文标题栏下方，不被高输入框顶出 | `app.ts` 可选；listbox top 312px / bottom 356px，标题栏 bottom 88px，textarea top 383px / bottom 535px；截图确认完整面板可见 | agent-browser viewport emulation、截图检查 | 通过 | [短窗口候选](evidence/W4-short-window-candidates.png) |
| v06 §3～4、[chat §3](../../../specs/chat/spec.md#3-行为细则)、[Project View §3](../../../specs/project-view/spec.md#3-行为细则)：View 与草稿隔离 | 切至 Overview；移除当前 View 标签，经 Add 重新添加；返回 New Chat | View 使用底部 Composer；标签不拉伸；不同来源草稿分别恢复 | Overview 提示语符合设计；单行标签区约 30px；可移除 / 重加当前 View；New Chat 恢复其独立正文和文件标签 | agent-browser、截图和边界检查 | 通过 | [View 草稿](evidence/W4-view-draft.png) |
| [任务验证记录](task.md#验证记录)、Session 未读回归：原生前台完成 | 解锁后重新打开隔离 Project，从 New Chat 输入并点击 Send，发送 `[e2e:delay] Independent W4 foreground completion`，保持原生前台直到 Done | 原生前台持续查看时，完成不增加当前 Session 未读点 | 发送前后 native focused 与 documentHasFocus 均 true；完成后 Running 0、Completed Unread 0、唯一 Session 显示 Done；约 7.2 秒内 70 次 NSWorkspace 采样均为前台 Electron PID 97991，覆盖发送到完成 | agent-browser UI、只读焦点检查与原生采样；构建 Electron、模拟 Provider | 通过 | [完成截图](evidence/W4-foreground-completed.png)、[完成与焦点读数](evidence/W4-foreground-completed.json)、[原生前台采样](evidence/W4-native-focus-timeline.json) |

录像为真实应用录制，保留约 8 秒：前 4 秒 max、后 4 秒 ultra；只剪去菜单选择与等待时间，未改动动效画面。静态截图用于布局核对，动效区别以录像及样式检查为证。

## 缺陷与复验

W4 报告、主 Agent 修复；W4 未参与代码修改。

| 发现 | 修复与复验 | 结果 |
|---|---|---|
| effort 触发按钮缺少可读的当前值 | 增加 `aria-description`；复核包含当前强度，原键盘选择与焦点恢复可用 | 通过 |
| `@` 候选绕过 20 个文件 / 图片上限 | 增加统一数量守卫；独立检查上限情形保留 token 与原标签，不添加第 21 个 | 通过 |
| 旧 View flex 规则拉伸标签行 | 移除冲突规则；实际 Overview 单标签行约 30px，移除 / 重新添加正常 | 通过 |
| 打开模型菜单后文件候选仍留在屏幕 | textarea blur 关闭候选；实际 `@READ` 后开模型菜单只保留模型面板 | 通过 |
| 提示区出现时选择器弹层锚点偏离按钮 | 依据触发按钮计算 bottom；未知 effort 提示存在时菜单 bottom 668.805px、trigger top 675.805px | 通过 |
| 高输入框下候选面板未按剩余空间收缩 | 依据 Composer 上边界限制高度并用 ResizeObserver 观察变化；最终构建以 1024×640、7 行输入独立复验；带空格目录导航另由主 Agent 增补覆盖 | 通过；带空格目录运行证据由主 Agent 负责 |
| macOS CI 偶发吞掉带空格目录的鼠标点击 | 在目录候选的 pointer-down 阶段记录浏览锚点并更新受控输入，文件 / Skill 选项仍在 click 阶段异步校验；本地构建重复运行该场景 3 / 3 通过，类型检查通过 | 通过；保持目录路径含空格的原有语义 |

### 原生前台场景的环境恢复与历史证据

首轮实际 UI 发送完成时出现绿色未读点；只读检查同时得到 `document.hasFocus() = true`、主进程窗口 `focused = false`。主 Agent 进一步查到系统前台为 `loginwindow`（PID 679）、测试应用 native active 为 false。锁屏使原生前台场景前提不成立，该轮不能计为原生前台通过，亦不据此改变未读规则。[焦点证据](evidence/W4-focus-boundary.json)、[首轮完成截图](evidence/W4-session-completed.png)和[主 Agent 诊断](evidence/W1-foreground-boundary.json)按原基线保留。

用户回复继续并恢复系统桌面后，全量 Electron 回归通过；W4 重新连接主 Agent 重启的唯一 fixture，再从 UI 执行最终原生前台发送。该次截图与 JSON 确认完成且无未读点，原生采样确认发送至完成均在前台，旧环境阻断已解除。

未发现其他阻塞性代码问题。该结论限于本次读到的 diff 与上述已执行场景。W4 收尾核对 task 的验收标准、最终 UI diff、自动化日志与本记录，未变更需求或人工验收状态。
