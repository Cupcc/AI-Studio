# 工程工具参考与验证边界

调研日期：2026-10-10。对应 FR-TOOL-002、FR-TOOL-004、04 第 1 节第 13 项。产品选择以 [DEC-08、DEC-09](<../../docs/07. Decisions.md>) 及负责需求为准；本文记录公开资料，不代表本项目实现验证通过。

## 1. ChatGPT Desktop 公开行为

| 主题 | 官方资料确认的内容 | 来源 |
|---|---|---|
| 审阅范围 | Git 审阅包含用户及其他工具产生的修改；提供独立的 Last turn 范围 | [Code review](https://learn.chatgpt.com/docs/code-review) |
| 非 Git 项目 | 审阅面板要求项目位于 Git 仓库，非 Git 时提示创建仓库 | 同上 |
| Terminal 入口 | 每个 Chat 的终端绑定当前 Project 或 worktree，从 New tab → Terminal 打开 | [Integrated terminal](https://learn.chatgpt.com/docs/integrated-terminal) |
| Terminal 展示 | 可配置 Terminal Tabs 的默认打开位置 | [Developer settings](https://learn.chatgpt.com/docs/developer-settings) |

这些文档没有给出桌面端 Last turn 的完整内部算法、同一 Chat 的终端实例上限或完整进程生命周期。我们选择 Project 归属的多终端，是结合本产品工具面板作出的设计取舍，不能写成 ChatGPT Desktop 内部实现事实。

## 2. 原生接口依据

[Codex App Server](https://learn.chatgpt.com/docs/app-server) 的 Events 章节公开了：

- `turn/diff/updated`：携带 `threadId`、`turnId`、本轮最新聚合 unified diff。
- `fileChange`：携带文件路径、类型、Diff 和状态；完成事件可区分成功、失败与拒绝。

因此本项目有优先复用原生轮次数据的接口依据，而非只能比较轮前、轮后的 Git 状态。本次仓库搜索未找到 `turn/diff/updated` 的现有接入，不能把在线文档的能力等同于锁定版本已经支持或本地 Adapter 已经实现。

## 3. 实现前验证

以下项目由 04 第 1 节第 13 项负责登记，在工具实现时补充证据：

- 锁定版本的事件是否实际提供数据；多次聚合更新、完成状态与 Thread / Turn 关联是否正确。
- Shell 脚本、外部工具修改是否被原生记录覆盖；无记录不能推断成没有修改。
- Claude Code 是否提供同等粒度的数据；本次未验证其接口，不能承诺与 Codex 相同。
- 非 Git 目录是否仍可取得和展示原生轮次补丁；此项与项目级 Git 基线分开验证。
- 保存的轮次补丁能否在重启后恢复，以及后续工作区修改是否不影响历史查看。

无可用原生数据时使用 FR-TOOL-002 的降级行为；不借用 Project Diff 伪造本轮结果。本次未调用真实模型、未执行应用测试。
