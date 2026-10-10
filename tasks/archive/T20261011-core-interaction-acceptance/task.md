---
id: T20261011-core-interaction-acceptance
status: done
fr: [FR-PROJ-001, FR-PROJ-002, FR-PROJ-003, FR-CHAT-001, FR-CHAT-002, FR-CHAT-003, FR-SESSION-001, FR-SESSION-002, FR-SESSION-003, FR-STATE-002, FR-STATE-003, FR-STATE-004, FR-STATE-005, FR-INPUT-001, FR-INPUT-002, FR-NAV-003]
ac: [AC-01, AC-02, AC-03, AC-04, AC-05]
specs: [specs/project/spec.md, specs/session/spec.md, specs/chat/spec.md, specs/input/spec.md]
created: 2026-10-11
---

# agent-browser 核心流程验收

## 目标与依据

按用户 2026-10-11 对话指令「走一遍你说的agent-browser核心流程验收」，从用户入口操作当前 Electron 应用，记录实际界面结果与证据。场景依据为 [V1 AC](<../../../docs/05. Acceptance Criteria.md>) AC-01～AC-05 与第 4 节补充场景；执行方法见 [Task Protocol Acceptance](../../README.md#acceptance)。

## 签收

- 状态：已签收
- 签收日期：2026-10-11
- 签收结论：用户确认“签收通过”。接受本任务记录中的模拟 Provider 验收结果及未覆盖范围；未覆盖项不视为真实 CLI 通过。

## 范围

- 使用 agent-browser `0.38.2`，W1 为本轮主 Agent，未参与当前应用代码实现；独立运行既有实现。
- 使用当前 main `528b44e` 的应用源码构建；已有未提交修改仅涉及任务规范及模板。
- 模拟 Provider；实际 Electron、IPC、SQLite 与渲染界面。新建隔离 userData 和三个临时 Project。
- 启动 harness 仅负责生命周期、窗口尺寸／焦点和原生目录选择器 fixture；用户界面操作均通过 agent-browser 完成。
- 本轮覆盖已实现的 Project／Session 核心流程及布局；真实 CLI、打包产物、Project View／Context 工具内容另列未覆盖，不将模拟流程认定为完整 AC 通过。

## 验收场景

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式 |
|---|---|---|---|
| AC-01；FR-PROJ-001/003 | 打开 Alpha／Beta／Gamma，配置不同页面和边栏，来回切换 | Project 状态独立、Tab 可切换 | agent-browser 点击、截图、可见状态 |
| AC-02；FR-CHAT-001/002 | 在 Codex New Chat 输入并发送中文需求 | 未发送为草稿；发送后进入 History，显示 Running 与输出，最终 Done | agent-browser 输入／点击、状态快照 |
| AC-03；FR-SESSION-003；FR-INPUT-001 | 同 Project 启动 Codex 与 Claude，切换并 Stop 其中一个 | 两个 Running；Stop 只停止当前轮 | agent-browser 点击、状态快照／截图 |
| AC-04；FR-STATE-004/005 | Session 后台完成，用户从另一页面打开它 | 出现绿色未读点；显式打开显示最新并清点 | agent-browser 点击、状态快照／截图 |
| AC-05；FR-STATE-002 | 后台等待确认／回答，打开后提交答复 | 提醒明显；仅查看不解除等待，回答后完成 | agent-browser 点击／输入、截图 |
| FR-STATE-003；AC 第 4 节 | 模拟错误，查看详情并重试 | 错误可理解，重试可完成 | agent-browser 点击、截图 |
| FR-PROJ-002；FR-SESSION-002 | 关闭 Running Project，取消后确认，再从最近项目重开 | 取消保留运行；确认停止并关闭；重开保留对话与草稿 | agent-browser 点击／输入、截图 |
| FR-SESSION-002；FR-INPUT-002；FR-NAV-003 | Rename、切换模型、保存未发输入，重启并续聊 | 标题、模型、草稿、历史恢复；继续同一个 Session | agent-browser 操作；harness 重启 |
| FR-SESSION-001；AC 第 4 节 | 长对话上滚、切换 Tab、回到最新；1024×640 查看关键页面 | 上滚位置保留；最新入口工作；无横向溢出／遮挡 | agent-browser 滚动／截图；harness 调整尺寸 |

## 进度

- 2026-10-11：读取 agent-browser core／electron 工作流；准备构建与隔离启动。当前用户开发实例继续保留，本轮实例使用独立数据库。
- 2026-10-11：完成 agent-browser 核心交互走查。AC-01～AC-05 在模拟 Provider 下通过；真实 CLI、错误重试、Project 重开、重启恢复与长对话滚动当时列为未覆盖。结果与截图见 [acceptance.md](acceptance.md)。
- 2026-10-11：补跑 FR-STATE-003 错误详情／重试，以及 FR-PROJ-002、FR-SESSION-002、FR-INPUT-002、FR-NAV-003 的关闭确认、Project 重开、Rename、模型与草稿重启恢复；模拟环境全部通过。长对话滚动、打包产物、Project View／Context 工具和真实 CLI 仍未覆盖。用户当日确认“签收通过”，任务完成并归档。
