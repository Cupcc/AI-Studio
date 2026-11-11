# W5 独立复验观察

2026-11-11，06:45–06:53 CST。W5 `final_review` 未参与实现。基线为 `5c3f7b1` 加 `useSuggestions.tsx` 与新增相邻测试；构建清单和差异见 `W5-final-build-hashes.json`、`W5-baseline-summary.json`。

## 范围与准备

使用实际 Electron 构建、agent-browser 0.41.2、独立 session `wb-review-w5`、临时 Project 与 userData。模拟 Provider 开关启用，本轮没有发送任何模型消息。`W5-ui-launch.mjs` 只准备 `src/app.ts`、`source files/entry.ts` 两个测试文件，替换原生目录选择器并设窗口尺寸，不注入产品状态或回复。

## 操作与结果

1. 从“打开本地目录”打开 W5 Project，再点击 New Chat。在消息中输入 `@src/` 并点击 `app.ts` 候选，随后通过 `keyboard type` 连续键入 ` @source`。原引用没有被打断，候选出现 `source files`。
2. 点击含空格目录候选后连续键入 `en`，得到 `@source files/en`，`entry.ts` 正常列出。点击文件后继续键入 ` W5 continuous typing`，两个引用与文本顺序正确。已查看 `W5-space-directory.png` 与 `W5-continuous-input.png`。
3. 再输入 ` @src/` 并选择文件，接着点击 Architecture。直接键入 `W5 separate architecture draft`，内容落在新草稿。返回 New Chat 后原三个引用及连续文本完整。已查看 `W5-switched-draft.png`，原草稿树见 `W5-original-draft-snapshot.txt`。
4. 从“添加工作台 → 从简单模板开始”创建草稿。点击“增加一次”，输入 `W5 保存与恢复笔记` 并保存。宿主显示已保存，计数为 1。
5. 在工作台 Composer 选择 `src/app.ts` 后连续输入 ` W5 template draft`。点击页面“填入对话”，原引用和原文保留，后追加笔记。Session 列表仍为空。已查看 `W5-template-draft.png`。
6. 点击“添加至当前项目”。在实例草稿中填写 `W5 instance editable draft`，页面再次填入对话，原文保留。切换 Architecture 可见其独立草稿，返回随手记恢复实例草稿、计数和笔记。
7. 点击“停用工作台”，iframe 卸载，显示停用说明；点击“启用工作台”。经 launcher 的 `app.close()` 正常退出再启动，实例启用、计数 1、笔记和草稿均恢复。再经导航往返确认。已查看 `W5-instance-navigation.png`、`W5-restored-instance.png`；恢复树见 `W5-restored-snapshot.txt`。
8. 正常退出应用并关闭 agent-browser。只读测试数据库为 1 个启用实例、0 Session、0 回合；四个草稿分别保留原文和引用，见 `W5-final-persisted-state.json`。未读取或保存用户连接配置和凭据。

## 自动化和历史证据复核

- W5 独立运行 `pnpm --filter @ai-studio/desktop exec vitest run src/renderer/src/features/input/useSuggestions.test.tsx`，6 项通过，见 `W5-input-unit.log`。
- 读取 `session.spec.ts` 的真实 app 活跃、窗口焦点和前台 PID 断言，断言仍在；W0 解锁后 11 项通过。修复前 Composer 仍失败的记录保留。
- `composer.spec.ts` 与 `session.spec.ts` 本轮均无 diff。W0 修复后原 Composer 用例通过，再跑 Composer、Files、CLI default、Workbench 共 13 项通过。
- 原 55 项直接范围按 `e2e/<file> › <test title>` 去重，以本轮或较新的适用日志覆盖旧结果，55 项均有通过记录。来源顺序及逐项来源见 `W5-regression-summary.json`；重复执行不累加计数。
- 读取 W3 真实创建和修改会话、最终状态摘要、机制操作记录，并查看最终恢复和错误文案截图。输入修复未修改 Adapter、Workbench 服务或协议，当前全部 7 个非 Renderer 构建文件 hash 与 W3 相同。相关输入和工作台接缝已重新验证，其他证据保留原基线并按影响复用。

agent-browser 的 `wait --text` 未能命中 iframe 内“增加一次”，一次等待超时；后续 snapshot 正常暴露 iframe 按钮并可操作。正常重启后第一次 snapshot 未列出 iframe 子树，但截图可见内容，导航重建后子树恢复。这些是测试工具观察限制，未把空树当作产品失败或通过依据。

本轮没有出现产品页面异常。监听安装后无 warning/error 控制台输出；该结论不覆盖安装监听前的启动输出。所有关键截图均由 W5 阅读。未执行真实 Provider、打包或后续五图业务，真实 CLI 结果只引用 W3 的实际两轮。
