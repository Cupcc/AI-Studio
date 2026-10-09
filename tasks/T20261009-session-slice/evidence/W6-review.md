# W6 独立窄范围复核

- 日期：2026-10-09。
- 验证者：W6，未参与实现。
- 初始代码基线：`c1c0fa9`，合入 `c44d840` 与后端增量 `004703e`；最终代码 `188bd1d`，文档 `e8c4812`。
- 只运行模拟 Provider，没有真实模型调用。以下保留按时间顺序的发现；最终门禁与结论见 [acceptance](../acceptance.md)。
- 归档收尾仅规范化本次 W6 日志的行尾空白与文件末尾多余空行，记录内容及测试结果不变，未重跑测试。

## 已复现问题

`W6-renderer.test.ts` 独立控制 IPC Promise 返回顺序；`W6-renderer-narrow.log` 保留修复前两例失败。

1. **首条消息的旧 create 返回覆盖完成状态。** `store.ts` 的 `sendComposer(new_chat)` 等待 create 时已经收到 `onSummaryChanged` 的 `activity=none/status=completed_unread`；随后 create 返回旧 Running summary，`acceptSummary(result)` 把最新终态覆盖为 Running。终态提醒和 Stop / Send 按钮可能持续错误，直到重新加载。
2. **Rename 的旧返回覆盖完成状态。** Rename 执行后收到同一新标题的完成事件，随后 rename 返回旧 Running snapshot，覆盖最新终态。保留新标题不能代替保留新的状态。

当时两项已报告主代理及 W5，尚未收到修复提交。原 `loadProject` / `loadConversation` 的 revision 防护覆盖加载路径，但不覆盖这两处 mutation response；后续闭环如下。

### 后续独立复验（2026-10-09）

- `7a5fb3a` 后，同一 `W6-renderer.test.ts` 两例通过，见 `W6-renderer-fixed.log`；原失败日志保留。两项状态竞争已解决。
- Electron 启动独立发现 Adapter `exports` 只有 `import` 条件，而 main 构建输出使用 CommonJS `require`，启动抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`。`W6-launch-diagnostic.log` 保留实际启动 stderr。root `234ed32` 为四个入口补默认条件后，`W6-require-exports.log` 四入口均加载成功；Electron 实際创建窗口成功。
- `W6-backend.test.ts` 新增关闭超时后迟到 Stop 成功与迟到私密答复两个探针。`W6-backend-close-before.log` 复现开放 Project 保留关闭锁、数据库关闭后仍写入两项失败。W4 `a2dd106` 后同探针共三项全通过，见 `W6-backend-close-fixed.log`。
- 最终代码修复汇合后，独立 `pnpm typecheck` 通过，`pnpm test` 通过 Adapter 181、desktop 130；最终日志分别为 `W6-typecheck.log`、`W6-unit.log`（127是此前一次运行的历史数量）。
- `W6-e2e.log` 的两项初次启动超时是 Adapter 导出阻断；`W6-e2e-fixed.log` 后续在 Project 打开尚未完成时读 bootstrap，是 W6 harness 过早读取，已经加等可见 Tab；不将这项 harness 失败算产品缺陷。
- `W6-e2e-supplement.log` 中真实 2,000 条历史列表通过：滚动到 50,000px 时 DOM 中 23 行，总高度 64,048px；10 次 requestAnimationFrame 等待记录 0.9～9.3ms；离屏 Rename 保持 scrollTop 与可视 ID。`W6-history-2000.png` 已目视检查，没有重叠、横向溢出、输入区遮挡；这是单机器一次测量，不构成全平台帧率保证。
- S-Q1 曾复现独立集成缺陷：最小化期间完成产生未读，恢复前台保留未读均正确，但显式再次点击不清除。`W6-focus-diagnostic.log` 记录 document.hasFocus=true 与 native 三项条件正确，但 renderer 的 focusEvents 最后为 false（false,false,false,true,false）。root `36abe65` 合并原生窗口事件并于 setImmediate 采样后，同一探针实际 minimize/hide 两路径通过，见 `W6-e2e-final-supplement.log`；已关闭。
- 最终完整 Electron 门禁首次18/19：原 Project helper 在目录打开尚未完成即切 Tab，属于测试时序问题（`W6-final-e2e.log`）；root `188bd1d` 等待对应canonical Tab后，完整19/19通过32.0s（`W6-final-e2e-fixed.log`）。
- 最终窗口 / History 两项独立补充2/2通过9.6s；2,000历史仍为23 DOM行，scrollTop50,000、总高64,048，RAF等待0.5～11.9ms，离屏Rename锚点保持。
- 追加实际Session聚合 / 关闭检查1/1通过2.5s（`W6-attention-close-e2e.log`）：Running=1、Needs Input=1驱动非当前Tab / 折叠点，关闭计数2，取消保留，确认只停目标Project两个轮次，其他Project的Running / 已绑定native ID保持。初次检查把create立即返回的null ID当作稍后期望值，失败日志保留为 `W6-attention-close-before.log`；仅修正harness绑定采样与失败清理，无产品变更。

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

上述脚本已独立运行通过，后追加跨Project注意力 / 关闭用例也通过；最终结果见acceptance。所有15张W6运行截图均已逐张目视检查，无重叠、横向溢出、输入区遮挡；滚动截图顶部正文裁切符合当前滚动位置。不将模拟UI结果认定为真实CLI AC通过。
