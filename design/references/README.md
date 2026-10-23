# References

存放参考产品截图、灵感图片和说明，帮助讨论视觉方向与操作方式。

## 1. 首批参考资料

| 参考 | 收集重点 | 状态 |
|---|---|---|
| Codex Desktop | 项目 / 会话导航、Add 入口、模型与推理设置 | 历史公开资料见 §3；现有本地 Composer / 工具截图见 §5，未独立操作客户端核验 |
| Claude Desktop | 新对话布局、框内控制分组 | 历史官方教程与 Code 模式说明见 §3；现有本地 Chat 截图见 §5 |
| Notion | 思考控件与输入框控制分组 | 本地截图见 §5，供 v06 信号格设计参考 |
| ChatGPT Desktop | Conversation、输入区、历史导航、留白 | 待收集 |
| OpenDesign | Workspace 布局、Conversation 与 Preview 协作 | 待收集 |
| Cursor | Files、Diff、Browser、Terminal 的局部呈现 | 待收集 |

参考方向来自 [Visual Direction](../visual-direction.md)。

## 2. 每份资料记录

- 图片：本地文件链接。
- 来源：产品或作者、来源页面、采集日期；能确认时记录产品版本。
- 参考点：具体布局、样式或交互。
- 使用方式：关联本产品界面或组件。
- 状态：取值见[设计索引](../README.md)第 5 节。

## 3. 2026-10-19 桌面布局参考

状态：探索中；应用于[页面布局评审](../layout-ux-review-v01.md)与原型 v05。没有登录竞品账户；以下公开材料不是最新版客户端的实机测量。

| 材料 | 来源与时间 | 可见内容 / 使用边界 |
|---|---|---|
| Claude Chat 官方教程图片（原本地截图未保留） | [Claude Desktop 导航教程](https://academy.claude.com/tutorials/navigating-the-claude-desktop-app) 的官方 CDN 图片；原记录采集于 2026-10-19；图中模型为 Opus 4.6，具体客户端版本未知 | 历史调研记录：Chat / Cowork / Code 顶部模式；居中欢迎语与 Composer；加号在框内左下，模型与发送在右下。用于控制分组参考，不证明新对话贴底 |
| Codex 官方文档页图片（原本地截图未保留） | 原记录于 2026-10-19 访问[原 Codex 功能入口](https://developers.openai.com/codex/app/features)，重定向到 [Features](https://learn.chatgpt.com/docs/features) 后截图；版本未知 | 历史调研记录：页面首图含 Codex 标识、New chat / Projects / Recents 和 Add 菜单；文档示意图未展示完整 Composer，不能推断其底部定位 |
| Claude Code Desktop 文本说明 | [官方 Desktop 文档](https://code.claude.com/docs/en/desktop#use-the-prompt-box)，查阅于 2026-10-19 | 输入、附件、运行中补充 / Stop、模型与 effort 快捷入口；不据文字推断像素布局 |
| Codex 模型目录契约 | [Model selection](https://learn.chatgpt.com/docs/model-selection)、[App Server](https://learn.chatgpt.com/docs/app-server)，查阅于 2026-10-19 | 模型与思考强度分别配置；目录返回支持档位与默认值；供输入设置的能力边界参考 |

外部图片保留原始内容，仅作内部设计评审参考。布局判断及本产品取舍统一记录在评审稿，不在本索引重复维护。

2026-10-23 集成复核：上述两张历史公开资料截图未在工作区找到，移除失效的本地链接并保留原始来源与观察边界；不使用下方不同来源的本地截图冒充历史证据。

## 4. 2026-10-20 键盘与状态反馈参考

状态：探索中；应用于[评审 v02](../layout-ux-review-v02.md#4-连续操作与键盘)与原型 v06。

| 材料 | 来源与时间 | 使用边界 |
|---|---|---|
| Disclosure 按钮模式 | [WAI ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)，2026-10-20 查阅 | 按钮展开、Enter / Space、aria-expanded / aria-controls；不把普通按钮列表冒充完整 menu / listbox 模式 |
| 状态消息 | [WCAG 2.2 Understanding Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)，2026-10-20 查阅 | 状态变化不需抢夺焦点、避免过度播报；引用不代表原型已完成无障碍符合性验收 |

## 5. 现有本地截图

状态：探索中。2026-10-23 集成时核对工作区内已有图片；原始提供者、采集日期与客户端版本未记录。以下是独立的本地参考，不能替代 §3 的历史官方图片，也不代表已操作或验证对应客户端。

| 图片 | 可见内容 / 使用边界 |
|---|---|
| [Codex Composer](<desktop-layout/codex desktop.png>) | 模型与推理档位、Add、权限及发送的分组；局部截图不能证明整个窗口的定位规则 |
| [Codex Add 展开](desktop-layout/codex-add-expand.png) | 图标、名称、描述和 Plugins 分组，供 v06 Add 菜单参考；不作为本项目 CLI 能力契约 |
| [Codex Browser](desktop-layout/codex-with-browser.png)、[Changes](desktop-layout/codex-with-changes.png)、[Files](desktop-layout/codex-with-file.png) | 对话与右侧工具并排、顶部工具标签；仅作布局参考 |
| [Claude Chat](desktop-layout/claude-chat.png) | 会话侧栏、底部输入区与控制分组；与 §3 官方教程图片为不同界面，不回写其历史观察 |
| [Notion Composer](desktop-layout/notion.png) | 思考信号格与框内控制分组；关联 [v06 Composer 任务](../../tasks/archive/T20261020-v06-composer/task.md) |
