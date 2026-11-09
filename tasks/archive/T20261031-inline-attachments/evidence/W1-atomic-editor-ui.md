# W1 原子标签编辑器实际界面记录

- 日期：2026-11-01。
- 应用：本 worktree `.runtime/attachment-review/Electron.app`，CDP 9341。
- 独立检查者：W1 `/root/attachment_review`，Main Agent 明确交接后独占应用窗口。
- 夹具 Project：`/private/tmp/studio-attachment-acceptance`。
- 初始与最终草稿：`请检查 @附件 样例.txt $check-attachment`，两个原子标签。
- 未发送模型请求，未通过 DOM 注入或内部 store 设置草稿。

## 可重复的操作与实际观察

1. agent-browser hover 文件标签，等待 snapshot 出现 `Attachment fixture token: paste-check-7319` 后截图。打开图片确认内容、类型标记、标签内边距和间距。
2. 点击 Skill 标签，侧栏显示 `Skill 文件查看器` / `文件内容：SKILL.md`，正文为夹具的 frontmatter 与说明。截图并查看确认。
3. Context / Attachment → 从 Files 添加文件：Skill inspector 清除，项目树可见。点击文件标签后选中 `附件 样例.txt`，文件查看器显示真实 token。
4. 原生 CUA 首次用 AX 点击消息区域未成功聚焦，随后 `Cmd+A` 选中了页面。此尝试不作为失败或通过证据。截图定位后，坐标点击消息纯文本，AX 明确显示 `focused UI element: 消息`。
5. 在已聚焦消息中原生 `Cmd+A`，输入 `W1 native shortcut probe`：仅消息草稿替换，导航 / 文件内容未改变。原生 `Cmd+Z` 按输入字符逐次撤销，恢复原文、file 和 Skill 两标签。
6. 保持草稿全选，原生 `Cmd+C` → Right → `Cmd+V`：原有两个标签保留，末尾新增普通文本 `请检查 @附件 样例.txt $check-attachment`。出现 `$` 目录候选，Escape 关闭；一次原生 `Cmd+Z` 恢复粘贴前草稿。
7. 原生 `Cmd+Right` → Backspace：Skill 标签整体消失，file 标签和前文保留。原生 `Cmd+Z` 恢复 Skill 标签。
8. 原生 `Cmd+Right` → `Shift+Enter` 两次 → 输入 `L`：agent-browser snapshot 显示 Skill 标签后连续空行与 `L`，两个引用仍在。三次 `Cmd+Z` 恢复原草稿。
9. agent-browser 再 hover Skill，完整 snapshot 出现实际 `SKILL.md` 夹具内容，保存并查看截图。
10. 点击现有 Session：消息为该 Session 自身草稿 `，`，未混入 New Chat 两引用。点击 New Chat：恢复 `请检查` 与两个标签。
11. W1 明确归还窗口给 Main Agent，之后未继续操作。

## 截图

- [文件真实内容 hover](W1-file-hover.png)
- [Skill 真实内容 hover](W1-skill-hover.png)
- [Skill 侧栏](W1-skill-inspector.png)

## 最终构建补验

Main Agent 完成 JSON 文件引用修复及最终重启 / CLI 验证后，再次明确交接窗口给 W1。

- 原生一次粘贴 32 行长文本，手动滚动到第 32 行，编辑区高度保持受限，原文及两个标签保留；一次撤销恢复。见 [滚动截图](W1-final-long-scroll.png)。
- 全选 Backspace 后 placeholder 可见、Send 禁用，原生 Cmd+Z 恢复原文与两标签。见 [placeholder 截图](W1-final-placeholder.png)。
- 点击文件标签恢复文件查看器，明确归还窗口。
- 发现一次长文本粘贴后的 caret 未自动滚入视口：首次贴入后仍显示第一行与前七行，虽 selection 在末尾、手动可到第 32 行；已反馈 Main Agent，不将 caret 跟随计为通过。

### 修复后最终复验

- Main Agent 增加 `revealEditorCaret` 并重建后，W1 再原生粘贴 32 行：不手动滚动，立即看到第 25～32 行及第 32 行末尾 caret。一次 Cmd+Z 恢复原文与两标签。已查看[修复截图](W1-final-caret-visible.png)，原问题复验通过。
- Finder 打开隔离 `/tmp/studio-paste-source/粘贴 图片.png` 到 Preview，Cmd+A / Cmd+C 复制位图；App Cmd+V 后出现上方 `图片 · image.png` 标签。移除图片后，原正文及 file / Skill 两标签保留。已查看[位图粘贴截图](W1-native-bitmap-paste.png)。没有发送模型请求。
- 最后点击 file 标签恢复 Files 文件查看器；明确归还窗口，无阻塞发现。

## 边界

本轮没有独立重做 Finder 文件粘贴、完整退出重启、跨 Project 或真实 CLI 接收；已独立执行 Preview 位图来源粘贴。前一段窗口构建早于最后两项 `painted` / placeholder 小补丁；后续最终补验使用 Main 新构建，已补长文本滚动、placeholder 和 caret 失败复验。Main 的 Finder / 重启 / 真实 CLI 操作由另一份记录负责，W1 已检查关键截图，不伪装成自己执行。
