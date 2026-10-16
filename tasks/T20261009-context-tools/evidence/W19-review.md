# W19 阶段 1 独立界面复验

验收者 W19 未参与实现，源码只读；只写本文件、W19 证据与 acceptance.md 阶段 1。日期：2026-10-16。**r1 历史记录；阶段 1 的最终项目 Diff / 打包 GUI 已由独立 W22 于 2026-10-17 补验，见 [W22-review.md](W22-review.md)。以下 r1 仅覆盖各行标明的 Files / 模拟引用范围，不代表最新 aliases 修复的 GUI 复验。**

## 范围与方法

- 承接 [W17](W17-review.md) 未完成的 Files / 项目 Diff / 文件引用验收。依据 Tools spec FR-TOOL-001 / 002、§4.1 / 5.2，Input spec FR-INPUT-001；没有本轮 Diff、原生补丁持久化或真实 CLI / 模型调用。
- macOS 15.6 arm64，Electron 44.4.5，Node 26.10.0，Git 2.39.2（Apple Git）。agent-browser 经 CDP 操作实际 Electron：点击、输入、工具 / Project 切换、原生窗口缩放；只读 DOM 摘要辅助断言，每张保留截图均查看。
- [启动 fixture](W19-gui-fixture.mjs) 与 [数据 fixture](W19-fixtures.mjs)：隔离 userData 与 /tmp 项目，只 stub 原生目录选择器，使用 STUDIO_E2E_PROVIDERS=1 的模拟 Provider。窗口控制与只读观察的注入同 W17。所有被验收行为从用户可见入口执行，没有调用内部 Files / Diff / Session API 或注入应用状态。打包应用会忽略模拟 Provider，打包验证不创建 Session。
- r1 为过渡构建，HEAD ed64bdd + 安全 / 显示修复工作区：main SHA-1 d5e4eb918f572227c7782535a995b41c884c214f，renderer/index.html SHA-1 fb6a4ff0db4624613d8da843aca45eccb4c71d9b。用于 Files 与引用；显示公共函数提取、Git index 修订及长路径降级将在最终构建补验。

## r1 实际交互结果

| 场景 | 操作与实际结果 | 证据 |
|---|---|---|
| W17-F1 / F2 | Files 列出并打开 RLO 名称，树 / 查看器标题 / title 显示 `rlo⟦RLO⟧name.txt`；NEL / LS 名称为 `nel␤name.txt` / `ls␤name.txt`。文件请求仍打开正确原名 | [控制字符](W19-files-control-names.png) |
| W17-F4 | 展开 2500 项的 many；只读 DOM 逐项比较，2000 项恰为 f0000.txt–f1999.txt，显示“仅显示前 2000 项” | [末端与提示](W19-files-first-2000.png) |
| View 引用、去重 / 移除 | View 草稿先加 a.txt 两次（只留一个），移除后加 docs/my file.md 并发送。模拟 Provider 只回显 docs/my file.md，证明移除项未提交；查看文件不会自动添加标签 | 交互 / DOM 记录，本文件 |
| 引用入口与非法名 | Context / Attachment → 从 Files 添加文件，展开右侧 Files；换行名可查看，点击添加显示“文件名包含控制字符，无法添加到对话”，标签不增加 | 交互 / DOM 记录，本文件 |
| Codex 普通发送与运行中追加 | 新建 Codex 对话发送 a.txt + 日本語.md，回显两路径；已有 Session 再发带 a.txt 的 [e2e:delay]，同一 Running 回合添加 b.txt 后 Send，回显 a.txt, b.txt。追加接受后清空文本与标签 | [模拟 Provider 回显](W19-codex-reference-delivered.png) |
| 追加失败 | 带 a.txt 的 [e2e:slow] 回合中添加 b.txt，发 [e2e:steer-error]。错误说明“模拟追加失败，输入已保留”，未接受文本与 b.txt 标签保留，Stop 有效 | 交互 / DOM 记录，本文件 |
| 发送前删除 | 添加 b.txt 后从 fixture 磁盘删除，再发消息：显示“文件引用失败，消息未发送：b.txt（文件已不存在）”，文本与标签保留，没有新增用户消息。watch 随后移除树条目，查看器变为不存在 | [失败且保留](W19-reference-deleted-keeps-input.png) |
| Claude 普通与能力边界 | UI 选择 Claude Code，新建对话发送 docs/my file.md，模拟 Provider 回显正确。Running 时能编辑 / 添加 a.txt，但没有 Send（当前 capability none，不计为已实现排队）；Stop 后原文本 / 标签仍在，发送成功并回显 a.txt | [Claude 回显](W19-claude-reference-delivered.png) |
| Project 隔离 | Claude 未发文本与 a.txt 标签留在 Refs，切到 Plain Two 的 View 添加 shared-name.txt；两 Project 来回切换分别恢复其文本 / 标签及 Files 选择，没有串投；随后各自发送并回显各自路径 | 交互 / DOM 记录，本文件 |

## 本轮发现与边界

- 错误提示包含 Electron 的 `Error invoking remote method 'session:send'` 包装。业务原因可读、输入保留，属既有统一错误呈现的低优先级文字问题；不作为本阶段阻塞。
- W17-F6（隐藏窗口再显示焦点落左上角折叠导航）是壳层窗口焦点行为，不丢失 Files 选择 / 展开；本阶段没有“恢复到原控件焦点”的已确认要求，不把它升级为 Files 阻塞。最终构建再检查状态与键盘可继续使用。


## 2026-10-17 续验

W22（未参与实现）补齐 `890a431` 构建的项目 Diff 正常 / 冲突 / 非 Git / 无 HEAD / 子目录范围、Project 与工具切换、最新 Files 正常加载及生产包 Files / Diff 入口，结果通过，详见 [独立记录](W22-review.md)。深路径 GUI 未完成，独立安全逻辑结果见 [W18 / W21](W18-review.md)。本文件 r1 的普通发送、追加失败、删除前校验、Claude capability 与 Project 引用隔离可沿用；本轮 aliases 修复另有 W21 独立测试，最新构建门禁由 Main Agent 负责。
