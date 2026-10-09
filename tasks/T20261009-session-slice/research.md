# Session 参考应用与接口恢复记录

日期：2026-10-09。W2 的原调研没有落盘，由接续主 Agent 完成。本文是研究记录，产品建议继续保留为草稿；依据为本 task 的 2026-10-09 对话指示。未进行登录态 UI 操作，以下外部观察来自官方文档，不把未证实的细节写成竞品事实。

## 1. 参考来源

| 官方来源 | 核实到的行为 | 本项目采用方式 |
|---|---|---|
| [ChatGPT Projects and chats](https://learn.chatgpt.com/docs/projects) | 桌面应用把相关聊天组织在 Project 下；支持给聊天改名 | 保持 Project / Session 两层关系、独立对话与 Rename；归档、置顶不在 V1 范围 |
| [ChatGPT Commands](https://learn.chatgpt.com/docs/reference/commands) | 有模型选择、聊天切换、改名，以及同意 / 拒绝请求的独立入口 | 保持输入区模型选择器与显式等待卡片；不引入文档未要求的全局快捷键 |
| [Claude Code Desktop](https://code.claude.com/docs/en/desktop) | Session 可并行；侧栏可切换；桌面支持模型菜单与会话命名 | 保持并行 Session、CLI 级模型目录；本项目同 Project 共享目录的既定范围不因参考应用的 worktree 能力改变 |
| [Claude model settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings) | 模型选择位于发送按钮附近，可在对话中切换 | 支持既有 Session 的模型切换；“下一轮生效”仍以 FR-INPUT-002 与 Adapter 契约为依据 |
| [Claude conversation rename](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation) | 官方说明提供侧栏菜单 Rename；网页和移动端入口分别描述 | 保留本项目已规定的 ⋯ → Rename；不据此声称桌面失焦保存、字数上限与日期边界已经验证 |

## 2. 推荐复核

| 问题 | 本轮推荐与依据 |
|---|---|
| C-Q1、C-Q2、I-Q5 草稿 | 保持每 Project 一份新对话草稿、每 Session 一份输入草稿；切换不丢失，CLI 改变保留文字并重置模型。依据仍是 FR-PROJ-003 / D-15；上述官方资料未证明跨重启草稿规则，不以竞品行为背书 |
| C-Q3、C-Q4 默认 CLI | 保持原建议：不可用时可打开草稿并解释原因；新 Project 继承最近手动设置的默认值快照；不改变已有 Session 的 CLI |
| C-Q5 版本 | 与 Adapter A-Q1 对齐：只把已知不兼容版本禁用；未验证版本单独标注，不等同未安装或未登录。Stop 的协议清理失败由独立 Runtime 兜底处理。仍待人确认 |
| C-Q6、NAV-Q2、NAV-Q3 Rename | 保持用户标题优先、客户端首行 40 字符作为后备、Rename 不回写 CLI；保持失焦保存、空白取消、100 字符限制作为本项目建议。移除“与 ChatGPT 一致”的未验证断言 |
| NAV-Q1、NAV-Q12 日期与性能 | 保持 D−7 到 D−2 的日期区间与 2,000 条测试规模；这些是本项目待确认的具体参数，官方资料未证明参考应用相同 |
| NAV-Q5～Q11、NAV-Q13 | 保持当前范围建议：同 View 重复点击不重置、草稿无列表高亮、仅五个默认 View、折叠 / 空状态 New Chat 使用 Default CLI、无删除归档、折叠状态持久化、保证键盘可达、中文文案配英文产品词 |
| I-Q1～Q4 | 保持 Needs Input 空输入显示 Stop、非空输入显示 Send；I-Q2 已确认语义不改；本轮 Running 不排队；附件入口禁用并解释原因。参考应用有输入控制不等于两条 CLI 的排队协议已验证 |
| I-Q6 模型 | 保持原生默认不覆盖、已有 Session 可选择下一轮模型、目录失败保留当前值、已下线模型提示并按草稿建议回退默认；实际 Provider 能力由测试确认 |
| S-Q3～Q13 | 保持原建议：不迁移到新原生会话、绑定前失败可重试创建、空闲 Runtime 退出不报执行错误、退出确认后 Stop、异常中断保留错误、Stop 中禁止发送、保留只读卡片、墙钟耗时、不展示推理、不导入外部历史。S-Q6 仍待人确认，实现遵循此前“先按推荐”指示 |

S-Q1、S-Q2、I-Q2 与 NAV-Q4 已确认，不因参考产品调整。特别是窗口重新前台不会清除提醒，再次点击当前 Session 必须触发“打开”信号；修正 navigation §2.3.9 的旧提案冲突。

## 3. 实现前接口对齐

- Adapter 的可执行契约已经在 `packages/agent-adapter/src/provider.ts`、`events.ts`、`types.ts`，不再实现 session §4.1 的示意名字。Provider ID 使用 `BUILT_IN_PROVIDER_IDS` 的 `codex` / `claude-code`；界面名称为 Codex CLI / Claude Code。
- `sendUserInput`、`respondToInput`、`replyWithText(text)`、`setModel(model | null)` 为正式方法；Running 输入能力为 `inputWhileRunning`，自由文字用 `freeTextAnswers` 与具体请求判断。
- 只有回合事件有 `turnId`。Session 级原生 ID、标题、Runtime 事件按当前 Runtime 句柄与 generation 处理，不能因缺少 turnId 全部丢弃。
- Stop 清理失败会产生 `turn.completed(outcome=interrupted, stop.cleanup=failed)` 与 `session.error`。Session Manager 应记录一个 Error，不能追加“已停止”成功行后再重复报错；以 `StopResult` 和 Adapter spec §4.5 对齐。
- Product Running 必须在 Runtime 创建 / 恢复前落库并广播；不能等 `AgentSession.sendUserInput()` 完成才显示。
- 查看上下文和“打开”操作是两个独立输入；窗口 focus 只更新前者。Needs Input 不因打开清除。

## 4. 边界

本记录没有验证真实窗口的滚动首帧、IME、Rename 失焦、草稿重启恢复等行为；这些由本项目单元 / Electron 测试验证。外部资料用于检查交互建议，不能替代 FR / AC 或改变已确认内容。
