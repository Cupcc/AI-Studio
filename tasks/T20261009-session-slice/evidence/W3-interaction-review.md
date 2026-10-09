# W3 主 Agent 交互检查

- 日期：2026-10-09；基线：`e4bd3c4`。
- 工具：agent-browser `0.38.2`，读取 CLI core / electron skills 后通过 CDP 连接独立 Electron 实例。使用临时 userData 与 Project；只有模拟 Provider，没有真实模型调用。
- 本文为集成实现者检查，正式独立验收见 [acceptance](../acceptance.md)。

通过界面依次打开本地目录、New Chat、发送中文需求、操作原生问题卡片、提交合成秘密答案、展开 Context / Attachment 菜单。回答后卡片显示“已答复（私密内容不保存）”，待答复状态解除、Done 行可见，合成答案文本不出现在页面正文；附件项禁用并显示原因。

将窗口调整为 1024×640 CSS px，`document.documentElement.scrollWidth = 1024`，没有横向溢出。已查看[实际截图](W3-secret-answer-1024.png)，标题、侧栏、回答卡片、完成行与输入工具栏可读。截图中使用 E2E 模型名；不代表真实 CLI 回答。

退出顺序为断开 agent-browser、fixture 调用正常 app.close，Electron 已结束；没有修改用户原有浏览器或应用数据。秘密答案持久化与数据库迟到写入的严格回归分别由 W4 单测和 W6 独立探针验证，本次页面观察不替代它们。
