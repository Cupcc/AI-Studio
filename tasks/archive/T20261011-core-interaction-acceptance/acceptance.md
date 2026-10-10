# 验收：T20261011-core-interaction-acceptance

## 未覆盖与待决事项

- 本轮使用 `STUDIO_E2E_PROVIDERS=1` 模拟 Codex／Claude Provider；未调用真实 CLI，因此不能据此认定真实 CLI 的 AC-02～AC-05 完整通过。
- 本轮仍未执行长对话滚动恢复、打包产物和 Project View／Context 工具内容；这些范围待后续独立验收。
- 未发现需提交实现修复的交互阻断。后台完成提醒在窗口重新获得焦点后清除；初次未聚焦时保持未读，符合失焦不清除规则。

## 签收

- 状态：已签收
- 签收记录：2026-10-11；用户确认“签收通过”。接受本记录中的模拟 Provider 验收结果及未覆盖范围；本记录不将未覆盖项视为真实 CLI 通过。

## 结论与运行环境

- 总体结论：**模拟环境下 AC-01～AC-05 及本轮补充的错误恢复、Project 重开与 Session 持久化通过；真实 CLI 与列明范围未覆盖**
- 验收者：W1 主 Agent；未参与本轮功能实现；本次为同一验收任务的补充复验
- 日期与代码基线：2026-10-11；`528b44e`；工作区另有验收规范、模板与本任务记录未提交修改，未影响应用代码
- 平台与应用形态：macOS 15.6、arm64；Electron 开发构建；隔离临时 userData 与三个临时 Project
- 工具与 Provider：agent-browser `0.38.2` 通过 CDP `9335`；模拟 Provider（E2E Codex／E2E Claude）

## 验收结果

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| AC-01；FR-PROJ-001/003 | 依次打开 Alpha、Beta、Gamma；在不同 Project 选择 Architecture／Progress、Terminal／Diff；点击 Tab 切换 | 三个 Project 可同时打开；Tab 切换；各自 View、工具和布局状态独立 | 3 个 Tab 均可见；切回 Alpha 仍为 Architecture + Terminal，Beta 仍为 Diff，Gamma 仍为 Progress | agent-browser 点击、snapshot、截图；Electron 开发实例 | 通过（模拟环境） | [W1-alpha-view-terminal.png](evidence/W1-alpha-view-terminal.png)、[W1-beta-chat-diff.png](evidence/W1-beta-chat-diff.png) |
| AC-02；FR-CHAT-001/002、FR-SESSION-001 | Alpha 选择 Codex；输入中文／`[e2e:slow]` 需求；发送 | 发送前是草稿且不创建 Session；发送后显示 History、Running、流式输出 | 草稿截图可见；发送后 Session 出现，显示 Running、模拟输出、工具行和 Stop | agent-browser 输入、点击、snapshot、截图；模拟 Codex | 通过（模拟环境） | [W1-unsent-draft.png](evidence/W1-unsent-draft.png)、[W1-codex-running.png](evidence/W1-codex-running.png) |
| AC-03；FR-SESSION-003、FR-INPUT-001 | 同一 Project 启动 Codex 与 Claude；切换到 Codex 点击 Stop | 两个 Session 可并发；Stop 只影响当前 Session | 两个 Session 同时显示 Running；Codex 显示“已停止”，Claude 仍保持 Running | agent-browser 点击、snapshot、截图；模拟双 Provider | 通过（模拟环境） | [W1-two-sessions-running.png](evidence/W1-two-sessions-running.png)、[W1-stop-isolated.png](evidence/W1-stop-isolated.png) |
| AC-04；FR-STATE-004/005 | 从 Project View 发送延迟 Codex 请求；等待后台完成；重新聚焦并打开 Session | 后台完成显示绿色未读点；显式打开显示最新 Conversation 并清除提醒 | 后台 Session 显示 `Completed Unread`；聚焦后打开显示 Done 与最新回复，提醒最终清除 | agent-browser 点击、等待、snapshot、截图；模拟 Codex | 通过（模拟环境） | [W1-background-unread.png](evidence/W1-background-unread.png)、[W1-unread-cleared.png](evidence/W1-unread-cleared.png) |
| AC-05；FR-STATE-002 | 发送 approval；查看确认卡；点击允许；再发送 question；在卡片输入框填写回答并提交 | Needs Input 清晰可见；查看不解除；确认／回答后等待状态解除并继续 | “等待你的确认”卡片及允许／拒绝可操作；回答卡片显示“等待你的回答”；提交后请求区域结束，Session 可继续 | agent-browser 点击、输入、snapshot、截图；模拟 Codex | 通过（模拟环境） | [W1-needs-input-current.png](evidence/W1-needs-input-current.png)、[W1-needs-input-answer.png](evidence/W1-needs-input-answer.png) |
| FR-STATE-003；AC 第 4 节 | 发送模拟错误；展开详情；点击重试 | 错误摘要可理解；详情可展开；重试恢复 | 显示“模拟执行失败”和原生错误详情；重试追加新一轮，显示模拟回复与 Done；历史错误保留 | agent-browser 输入、点击、snapshot、截图；模拟 Codex | 通过（模拟环境） | [W2-error-summary.png](evidence/W2-error-summary.png)、[W2-error-details.png](evidence/W2-error-details.png)、[W2-error-retry-done.png](evidence/W2-error-retry-done.png) |
| FR-PROJ-002、FR-SESSION-002、FR-INPUT-002、FR-NAV-003 | Rename；选择 E2E Alternate；填写未发送草稿；重启应用；发送草稿继续 | 关闭确认、停止范围、Session／草稿／标题／模型持久化 | 标题“支付模块验收回归”、E2E Alternate 与草稿均在重启后恢复；发送后同一 Session 继续，agent-browser 等待到模拟回复完成 | agent-browser 输入、点击、harness 重启、snapshot、`wait --text 模拟回复已完成`；模拟 Codex | 通过（模拟环境） | [W2-rename-model-draft-before-restart.png](evidence/W2-rename-model-draft-before-restart.png)、[W2-rename-model-draft-after-restart.png](evidence/W2-rename-model-draft-after-restart.png) |
| FR-PROJ-002、FR-SESSION-002 | 启动 Running Session；点击关闭 Project；取消；再次关闭并确认“关闭并停止”；从最近打开重开 | 取消保留运行；确认停止并关闭；重开保留对话与停止结果 | 取消后界面仍显示 Stop；确认后回到启动页并保留最近 Alpha；重开后 Session 仍在，显示原消息、工具行和“已停止” | agent-browser 点击、snapshot、截图；模拟 Codex | 通过（模拟环境） | [W2-project-running-before-close.png](evidence/W2-project-running-before-close.png)、[W2-project-reopened.png](evidence/W2-project-reopened.png)、[W2-project-reopened-stopped.png](evidence/W2-project-reopened-stopped.png) |
| FR-SESSION-001；AC 第 4 节 | 长对话上滚、切换 Tab、1024×640 检查 | 上滚停止跟随、回到最新、无溢出遮挡 | 本轮仅检查 1024×640 最终布局截图，未执行长对话滚动 | agent-browser 截图；模拟 Provider | 部分覆盖 | [W1-1024x640.png](evidence/W1-1024x640.png) |

## 缺陷与复验

本轮没有记录产品缺陷。后台完成提醒在窗口未重新获得焦点时保持未读，调用 `/focus` 后再打开目标 Session 清除，符合 AC-04 与失焦规则。关键截图已目视检查：Project Tab、侧栏、Conversation、输入区和 Needs Input 卡片无明显重叠、横向溢出或输入遮挡。

## 复跑信息

```text
agent-browser 0.38.2
CDP 9335
STUDIO_E2E_PROVIDERS=1
```

本轮临时目录在验收结束后由 Electron harness 关闭；截图和本记录保留在本任务 `evidence/`。
