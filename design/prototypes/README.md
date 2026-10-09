# Prototypes

存放可交互原型、外部原型链接及操作说明。

## 1. 场景覆盖

| 场景 | 验证重点 | 依据 |
|---|---|---|
| 打开与切换 Project | 首次 Overview、状态恢复与 Project 独立性 | FR-PROJ-001、FR-PROJ-002、FR-PROJ-003；AC-01 |
| New Chat 与 Session 切换 | 创建后进入历史记录，切换后到最新 Conversation | FR-CHAT-001、FR-CHAT-002、FR-SESSION-001；AC-02 |
| 多 Session 状态 | 并发状态、完成提醒清除、等待用户内容 | FR-SESSION-003、FR-STATE-002、FR-STATE-004、FR-STATE-005；AC-03、AC-04、AC-05 |
| Project View | 左右布局，通过普通 CLI Session 更新 Preview | FR-VIEW-005、FR-VIEW-006、FR-VIEW-007、FR-VIEW-008；AC-06 |
| Context Panel | 用户主动打开、切换与收起工具 | FR-TOOL-001、FR-TOOL-002、FR-TOOL-003、FR-TOOL-004；AC-07 |

## 2. 原型说明

每份原型记录入口链接或本地文件、版本、状态、起始画面、操作步骤、预期表现，以及模拟数据和当前未实现的行为。

本地原型需要运行环境时，补充实际启动命令。原型用于评审交互，产品验收仍遵循 [Acceptance Criteria](<../../docs/05. Acceptance Criteria.md>)。

## 3. 原型索引

| 原型 | 版本 | 状态 | 入口 | 依据 |
|---|---|---|---|---|
| Studio 灰度交互原型 | v01 | 已确认（2026-10-09） | [在线原型](https://claude.ai/artifact/ANF4XoboMHvZjzn4tRT17c)；源文件 [studio-prototype-v01.html](studio-prototype-v01.html) + [studio-prototype-v01/](studio-prototype-v01/) | 线框图 v02；[Shell Spec v01](../components/shell-spec-v01.md)；AC-01 ~ AC-07 |

### Studio 灰度交互原型 v01

- **起始画面**：my-saas 的 Overview（首次打开 Project），左侧为新对话草稿。
- **运行方式**：在线链接直接打开；本地查看需通过任意静态服务器访问 `design/prototypes/`，例如 `python3 -m http.server`，再打开 `studio-prototype-v01.html`。窗口宽度需不小于 1024px。
- **操作步骤**：左下角“演示控制”列出 AC-01 ~ AC-07 的操作步骤，并可触发后台完成、后台请求确认、后台出错、CLI 未登录和重置。
- **预置事件**：约 10 秒后“支付模块开发”在后台完成（AC-04）；约 25 秒后 admin-console 的 Session 请求确认，Tab 出现橙点（D-07）；约 40 秒后 landing-page 的 Session 完成。
- **模拟数据**：所有 Project、Session、代码、Diff 与终端输出均为示例；Agent 回复由原型脚本生成，不调用真实 CLI。
- **未实现**：真实目录选择与文件读取、Session Resume、图片附件、Terminal 多实例、窗口尺寸以外的平台差异、视觉参数为当前基线（2026-10-09 确认按 v01 对齐，高保真阶段可调整）。
- **与 spec 的关系**：原型确定布局、组件外观与交互示意；行为与 spec 不一致时以 spec 为准，例如窗口失焦时不视为正在查看（[session spec](../../specs/session/spec.md) S-Q1）。
- **链接权限**：在线原型默认私有，需由所有者在页面 Share 菜单中共享后他人才能访问。
