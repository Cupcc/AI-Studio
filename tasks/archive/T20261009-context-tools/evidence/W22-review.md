# W22 阶段 1 独立界面终验

## 范围、未覆盖与结论

- 验收者 W22 未参与实现；只读应用源码，使用 agent-browser 从用户入口点击、选择与切换，读取 DOM 辅助断言；保留的截图均已查看。日期：2026-10-17，macOS 15.6 arm64、Electron 44.4.5、Node 26.10.0、Apple Git 2.39.2。
- 结论：本次补验的 Files / 项目 Diff 场景通过，无新阻塞。文件引用 UI 沿用 [W19](W19-review.md) 的模拟 Provider 结果；安全、引用身份修复由 [W18 / W21](W18-review.md) 独立复验。整体 AC-07 尚未完成，人工功能验收仍待人工验收。
- 未创建真实 CLI Session、未发送消息或模型请求；生产包会自动发现已安装 CLI / 探测模型目录（不计为真实文件接收验证）。没有本轮 Diff、原生补丁持久化、历史补丁或 Conversation 入口。未重做 W17 的全外观 / 编码矩阵。深路径降级没有完成 GUI 步骤，使用 W18 / W21 独立边界结果，不能记为 GUI 通过。
- 沿用 [W19-gui-fixture](W19-gui-fixture.mjs) 与 [数据 fixture](W19-fixtures.mjs)，独立 ROOT `/tmp/studio-w22`、CDP 9557、控制端口 9558；只 stub 目录选择器、使用隔离 userData 与模拟 Provider，不注入 Files / Diff / Session 状态或调用内部功能 API。长路径的通用 DOM selector 命中隐藏 Project 中的树行并被顶栏遮挡，后续等待超时，故中止该项；屏幕仍正常显示长名根目录，没有据此认定应用缺陷。

## 构建基线

本轮 GUI 使用 `890a4314e2217c2e6085d1cb20097c0461bcd25e` 的既有构建：

| 产物 | mtime（UTC+8） | SHA-1 |
|---|---|---|
| out/main/index.js | 2026-10-16 16:14:31 | c8ec2179ea36fd4fafec6f5ec4dfd5b30238a121 |
| out/renderer/index.html | 2026-10-16 16:14:36 | 81a5191f94a4697968af1ed0281f4710fb666fc8 |
| app.asar | 2026-10-16 16:14:43 | 41e31cd0ebb5bcbb12cce0a8c58079186606071b |

不包含本轮未提交的无 HEAD 说明文案与引用 aliases 修复。无 HEAD 新文案不改变本次已核对的文件列表 / 基线状态，最新措辞未在本轮 GUI 核对；aliases 不影响本次不发送引用的 Files 查看 / 项目 Diff，其最新源代码另有独立测试，最新构建、E2E、package / smoke 由 Main Agent 在 GUI 释放后执行，不能将旧包 hash 当作新包证据。

## 实际操作与结果

| 场景 / 来源 | 用户操作与实际结果 | 证据 |
|---|---|---|
| HEAD 最终差异 / FR-TOOL-002 | 从 Preview 点 Diff，22 个文件；both.txt 同时显示 STAGED 和 UNSTAGED 两处编辑（+2/−2）。staged、unstaged、未跟踪、删除、重命名均在列表，未归因到 Session | [列表与两处编辑](W22-diff-both.png)、[DOM](W22-diff-both.json) |
| 特殊类型与路径 / Tools §5.2 | 逐个点 image.bin（“二进制文件，不显示文本对比”，patch 回退）、a-link（不跟随目标，9 行 patch）、重命名（双侧只读 Monaco）、untracked.txt（空基线到新内容）、run.sh（100644 → 100755，仅模式变化）、`:(top)colon.txt`（正确原名内容，未被当 pathspec） | [特殊路径](W22-diff-literal-path.png)、[二进制](W22-diff-image.bin.json)、[链接](W22-diff-a-link.json)、[重命名](W22-diff-renamed_new-name.ts.json)、[未跟踪](W22-diff-untracked.txt.json)、[模式](W22-diff-run.sh.json) |
| 冲突 / FR-TOOL-002 | 打开独立冲突 Project，conflict.txt 显示 U，明确“工作区内容相对 HEAD”，Monaco 显示冲突标记 | [截图](W22-diff-conflict.png)、[DOM](W22-diff-conflict.json) |
| 非 Git 与无 HEAD / AC-07 | 非 Git 显示原因和重试，不写“无变更”；无 HEAD 显示黄色解释和 4 个可见文件，不自动创建仓库 / 提交 | [非 Git](W22-diff-notgit.png)、[无 HEAD](W22-diff-unborn.png)、[非 Git DOM](W22-diff-notgit.json)、[无 HEAD DOM](W22-diff-unborn.json) |
| 仓库子目录 / Tools §5.2 | 打开仓库的 pkg 子目录，只列 inner.txt 与 new.txt；根与其他目录改动不出现，横幅说明前缀范围 | [DOM](W22-diff-subdir.json) |
| Project / 工具切换 / AC-01、AC-07 | Main → Conflict / NotGit / Unborn / pkg → Main，Main 恢复原 22 文件和 `:(top)colon.txt` 选中内容；Files → Diff 再次恢复同一内容，不串 Project | [Project 恢复](W22-diff-project-restored.json)、[工具恢复](W22-diff-tool-restored.json) |
| 最新目录读取 / FR-TOOL-001 | 在正常 Project 点 Files、展开 src、点 index.ts，utility worker 目录加载成功，Monaco 只读内容和“添加到对话”可用。没有代替目录替换竞态的独立压力结果 | [截图](W22-files-latest-normal.png)、[DOM](W22-files-latest-normal.json) |
| 深路径 / Tools §5.2 | 打开长路径 Project，根长名正常截断；未完成深入展开 / 提示 UI，列为未覆盖；长路径不使父目录失败的逻辑由 W18 / W21 边界测试通过 | [当前界面](W22-files-long-paths-visible.png)、[安全复验](W18-review.md) |
| 生产包 / Tools §5 | 退出开发应用；直接启动打包二进制，同一隔离 userData 恢复此前通过 UI 打开的 Project。切正常 Project → Files → src/index.ts，代码查看成功；切 Diff Main → Diff → both.txt，22 文件与两处编辑成功。打包形态没有创建 Session，没有模型调用 | [Files](W22-packaged-files.png)、[Diff](W22-packaged-diff.png)、[Diff DOM](W22-packaged-diff.json) |

## 结束与限制

开发 fixture 通过其 `app.quit()` 控制清理，进程退出；打包实例仅用于 Files / Diff 检查，结束后对本次精确 PID 发送 TERM（不是本轮退出流程验收）。两个专用 agent-browser session 已 close，GUI slot 已交回 Main Agent。打包应用会自动发现已安装 CLI / 读取模型目录，本轮未发送任何消息、未启动真实模型请求。

文档自查：`pnpm check:docs` 通过（0 新增问题、4 个基线问题保持），`git diff --check` 通过；本节与 acceptance 阶段 1 的标题 / 表格已按 GFM 结构检查。
