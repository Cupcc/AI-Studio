# W3 真实应用 + 真实 Claude Code 2.1.310 界面验收

日期：2026-10-26。执行者：Main Agent（开发者自检，非独立验收）。用户同日回复「approve , implement」，批准下一步优先做应用内 Claude 路径与 Needs Input 真实语义、保持 DEC-19、暂不升级 SDK。

## 环境与方法

- macOS 15，arm64；构建后的桌面应用（`electron-vite build`），**未启用模拟 Provider**；`STUDIO_ENABLE_CLAUDE_CODE=1`（未打包开发开关，见任务）。隔离 userData 与临时项目都在系统临时目录。
- Claude Code `2.1.310`（claude.ai 登录），SDK 0.3.293；模型 `Haiku 5.5`（默认模型行只用于查看 effort 目录）。
- 驱动脚本 [W3-app-real-claude.mjs](W3-app-real-claude.mjs)：Playwright Electron，只通过用户可见入口操作（打开目录、CLI 菜单、模型 / effort 菜单、输入框、卡片按钮、Stop）；截图用 `page.screenshot`（仅应用渲染内容，不含其他窗口）。
- 本机用户级 Claude 设置的权限模式为 `bypassPermissions`（只读取了该键，未记录其他配置），应用按 A-Q5 继承，所以 Bash 命令不弹授权卡。这使应用层的**授权卡**没有用真实 Claude 触发；Needs Input 用 `AskUserQuestion` 验证。

## 结果（最后一次完整运行；此前几次运行因脚本选择器与退出确认问题中止，已修正，不计为产品结论）

| 场景 | 结果 | 证据 |
|---|---|---|
| Provider 检测 | Codex 与 Claude Code 均 `available`；新建对话 CLI 菜单列出 Claude Code | 运行输出 `providers` / `cli-menu` |
| 默认模型下的 effort 目录 | 未手动选模型时，effort 菜单列出真实目录的 `low / medium / high / xhigh / max`（无 `ultra`），五格静态信号 | [截图](screens/W3-effort-menu-default-model.png) |
| 模型目录 | 真实目录 14 项（含 `Default (recommended)（默认）` 与其重复条目，沿用既有菜单对默认行的呈现） | 运行输出 `model-catalog` |
| effort 在应用内生效 | 选 `low` 后发送，Bash 内 `CLAUDE_EFFORT` 写入文件，内容为 `low` | 运行输出 `effort-applied-in-app` |
| Needs Input：AskUserQuestion | 出现「等待你的回答」卡片、橙色状态点；选项、自由文本与提交按钮可用 | [截图](screens/W3-needs-input-question.png) |
| 并发 | 该 Session 等待回答时，另一 Claude Session 完成（`APP_B_DONE`）；等待中的 Session 仍显示 Needs Input | [截图](screens/W3-concurrent-b-done-question-waiting.png) |
| 卡片作答 / 文字作答 | 选择 Banana 并提交 → Agent 回复 BANANA；第二次用底部输入框回复 Cherry → Agent 回复 CHERRY；状态点随之清除 | [截图](screens/W3-question-answered-from-text.png) |
| Stop | 长命令运行中（进程可见）点击 Stop → 界面「已停止」，命令进程消失，其他 Session 状态不变（均为完成未读） | [截图](screens/W3-after-stop.png) |
| Stop 后继续 | 同一 Session 再发消息，回复 `APP_C_AFTER_STOP` 并显示 Done | [截图](screens/W3-continue-after-stop.png) |
| 退出 | 最后一次运行未出现退出确认并正常退出，进程检查无遗留 Claude Runtime；前一次运行出现「停止并退出」确认，经脚本点击后正常退出（该次未单独做进程检查） | 运行输出 `quit` |

## 未覆盖

- 应用内真实 Claude 的**授权卡**（本机设置为 bypassPermissions）；打包应用；Claude 与 Codex 混合并发；macOS 13。
- 多请求并存的答复、Running 中追加、结构化附件。
- 其余 Playwright 回归：`claude-effort` / `composer` / `cli-default` / `alignment` / `session` 共 31 项，批量运行 29 通过，`session.spec.ts` 的 2 项（焦点相关的草稿流式完成、重启后草稿恢复）在批量运行中失败、单独重跑通过；未做基线对照，归因于运行环境的焦点 / 时序不稳（与既有记录一致），不作为通过证明。
