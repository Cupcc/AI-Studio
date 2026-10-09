# W6 独立窄范围复核

- 日期：2026-10-09。
- 验证者：W6，未参与实现。
- 代码基线：`c1c0fa9`，合入 `c44d840` 与后端增量 `004703e`。
- 只运行模拟 Provider，没有真实模型调用。等待 W5 最终提交后运行完整门禁与 Electron 场景。

## 已复现问题

`W6-renderer.test.ts` 独立控制 IPC Promise 返回顺序；`W6-renderer-narrow.log` 保留修复前两例失败。

1. **首条消息的旧 create 返回覆盖完成状态。** `store.ts` 的 `sendComposer(new_chat)` 等待 create 时已经收到 `onSummaryChanged` 的 `activity=none/status=completed_unread`；随后 create 返回旧 Running summary，`acceptSummary(result)` 把最新终态覆盖为 Running。终态提醒和 Stop / Send 按钮可能持续错误，直到重新加载。
2. **Rename 的旧返回覆盖完成状态。** Rename 执行后收到同一新标题的完成事件，随后 rename 返回旧 Running snapshot，覆盖最新终态。保留新标题不能代替保留新的状态。

两项已报告主代理及 W5，尚未收到修复提交，不能认定已解决。现有 `loadProject` / `loadConversation` 的 revision 防护覆盖加载路径，但不覆盖这两处 mutation response。

## 独立通过的窄测试

`W6-backend.test.ts` 使用真实临时 SQLite 文件和模拟 Codex / Claude Provider：

- 完成一个包含 1,200 个 Agent 消息的轮次，然后 Rename、保存未发送草稿。
- 再写入 1,999 份合法 Session 摘要，正常 dispose、关闭数据库，再从同一文件新建数据库与 SessionService。
- 2,000 摘要均保留；读取最新分页，再逐页向前读取共 1,202 行，最大页长 500，ID 无重复、sequence 连续。
- 标题、titleSource、nativeSessionId、完成行、未读状态与草稿文本均保留。
- 启动不会调用模拟 Provider 创建 / 恢复会话。模拟 CLI 原生历史显式保留后，下一轮向新的 Provider 实例传入原 nativeSessionId。
- 具体计数与耗时见 `W6-backend-results.json`；日志见 `W6-backend-narrow.log`。摘要恢复耗时是该机器的一次记录，不是 UI 帧率结论。

## 代码边界复核

- `main/ipc/session.ts` 用 senderId 匹配实际 BrowserWindow，并要求 focused、visible、非 minimized；renderer 提供的 foreground 不是单独依据。
- `createRendererSessionPort` 在显式 opened 前发送 viewing，窗口 foreground 改变只发送 viewing，不触发 opened，符合 S-Q1。
- `SessionService` 创建与下一轮接受后延迟 runtime 启动，原 native ID 懒恢复；恢复失败没有创建新会话的替代路径。
- `004703e` 的 replyWithText 在提交被接受后才追加用户消息 / 清草稿，提交期间缓存同步终态事件以保留消息次序。此次没有把实现方自己的单测结果替代独立完整门禁。
- 主进程 E2E fixture 只在未打包且 `STUDIO_E2E_PROVIDERS=1` 时注入；生产默认 Provider 没有自动模拟替代。
- New Chat 对已有草稿保留 CLI 与 C-Q1 的完整草稿保留建议相容；没有把该行为判为缺陷。
- shutdown dispose 等待路径没有固定五秒后关闭数据库的截断；正常 renderer draft flush 在退出流程中接入。完整退出行为仍待最终集成测试。

## 备好的 Electron 补充用例

`W6-session.spec.ts` + `W6-playwright.config.ts`：

- 实际 BrowserWindow 最小化、隐藏时当前 Session 完成，必须保留 Completed Unread；恢复 / show / focus 不清除，显式再次点击 Session 才清除。运行时会生成两张 W6 截图。
- 磁盘预置 2,000 条 Session 后重启实际 Electron，验证 DOM 行数受限、滚动可达、离屏 Rename 不改变滚动锚，并生成 W6 历史列表截图。

这些脚本尚未运行。按主代理指示等待 W5 最终 hash，随后与实现方的模拟 Provider AC-02～AC-05 E2E 一起验收，避免重复跑中间版本。
