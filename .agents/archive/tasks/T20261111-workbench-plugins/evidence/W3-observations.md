# W3 独立观察

2026-11-11；macOS 26.6 arm64；构建应用，真实 Provider；Codex 0.167.0；agent-browser 0.41.2。基础 commit 5524c4c 加工作台实现；首轮构建为 expectedPackageRevision 修复前版本。所有交互由 agent-browser 从可见入口执行。

## 首轮

1. 从本地目录入口打开隔离 Project。目录选择器由 launcher 替换为临时目录；没有预注入工作台或 Session。
2. 从添加工作台选择简单模板。预览显示“随手记”，尚无 Session 或实例导航。点击增加一次、输入“W3 模板已保存笔记”、保存。页面显示计数 1。
3. 在 Composer 写“已有用户草稿”，点击页面“填入对话”。结果保留原文并追加笔记，Session 列表仍为空，没有模型调用。
4. 添加至 Project。导航出现实例“随手记”；显示计数 1 和刚保存的笔记。停用后 iframe 消失，显示停用提示；启用后恢复计数和笔记。
5. 从 AI 创建入口进入新草稿，预填提示可编辑，Session 列表仍为空。替换请求为“W3 阅读计数”，点击 Send 后才创建真实 Codex Session。
6. 真实 Session 显示依次读取 SDK GUIDE、manifest schema、sdk.d.ts 和 template.html，再修改指定草稿的 manifest.json 和 index.html；未复制上游实现。首个 rg 查询没有匹配而退出非零，后续读取和写入成功。
7. 在 Codex 执行中切换到已有实例并停用；从历史 Session 进入 Conversation，再点“在 View 中打开”返回当前 AI 草稿。Codex 未被停止并最终完成。
8. 在已有真实 Session 的 Composer 写“W3 现有 Session 草稿”，在页面写“W3 来自页面的附加文字”后填入对话。当前 Session Composer 保留原文并追加，未发送。
9. 从应用设置将模式设为浅色、主题设为纯色，返回工作台检查布局。截图中的主题变化来自用户可见设置；agent-browser 的默认媒体模拟可能影响 iframe 的 prefers-color-scheme，后续深色检查单独说明。
10. Codex 完成后刷新工作台预览。真实页面出现“W3 阅读计数”和“读完一页”；点击一次并保存“W3 真实创建页面的笔记”。操作成功，完整真实会话文本保存在 W3-real-codex-create.txt。
11. 让出窗口供修复构建。首轮 launcher 未分配 TTY，stdin 已关闭，无法接收控制命令；两次退出快捷键未关闭应用。确认回合结束和状态保存后，仅向本次 CDP 端口所属 Electron PID 1924 发送 SIGTERM，确认进程及 9473 监听消失。后续复用同 userData 验证已提交状态的异常退出恢复，并通过修订后的 TTY launcher 验证正常重启。

首轮已查看 W3-template-preview.png、W3-template-installed.png、W3-disabled.png 和 W3-ai-before-send.png。控件无明显遮挡，说明、状态和已安装/草稿差异可读。真实创建与后续截图在最终复核时继续查看。

主 Agent 后续调查证实当时系统处于锁屏状态。这解释原生退出快捷键未生效；本轮 CDP 操作不依赖系统前台焦点，未绕过锁屏。依赖真实系统焦点的回归由主 Agent 单独记录，不能由本轮 CDP 操作代替。

## 修复构建与最终复验

12. 复用原 userData 启动含修订校验和竞态修复的构建。真实创建的草稿计数 1、笔记、Session 草稿以及模板实例停用标志恢复。顶部“新对话”保持单行。
13. 在原真实 Session 发送一次修改请求，Codex 只更新原草稿标题、按钮文字和版本到 1.0.2，保留状态逻辑。完成后从历史入口回 View，页面为“W3 阅读进度”；点击“再读一页”后计数 2，再从可见按钮添加至 Project。没有注入模型回复或生成文件。
14. 从模板实例“编辑工作台”创建独立草稿。直接修改该测试草稿的 manifest title/version，未刷新便点击应用，被拒绝并提示刷新。原实例保持旧包。随后故意写非法JSON，刷新显示清单错误；填入对话保留原文。恢复清单后在HTML注入 `W3 intentional runtime failure`，重试显示页面失败且禁用应用。删除该错误后恢复。
15. 为验证保存冲突，仅在该测试草稿增加一个可见“验证保存冲突”按钮。按钮经 SDK 读取快照，先用当前版本写count=2，再用旧版本写count=999。实际点击后第二次写入被拒绝，宿主与页面显示失败，页面保留2。最后移除测试按钮。
16. 返回原实例，标题仍为随手记、count=1、原笔记不变。以UI新建第二模板草稿，再将原始manifest与HTML完整复制进去，刷新并通过UI添加，得到真正同pluginId/原包hash的第二实例。回编辑草稿应用后，仅原实例变为“W3 编辑后的随手记”且保留count=1；第二实例仍为随手记、空状态。
17. 通过新Tab和目录入口打开第二Project。创建草稿并复制相同原包，预览添加后保存“W3 第二个Project独立笔记”。返回原Project，同包第二实例仍空。过程未直接插入数据库实例。
18. 正常app.close退出后，最后文案构建复用同userData启动。AI实例仍count=2及原笔记；Project与实例导航完整，无新模型回合。再次令编辑草稿manifest无效，从UI打开，错误仅显示“manifest.json 不是有效 JSON，请修正后刷新预览”；恢复文件并重试正常。
19. 主题通过设置切换。显式Playwright媒体模拟dark后可见深色页面，但该截图只证明深色环境可读。进一步正常退出、将launcher的媒体配置设为null再启动，在agent-browser连接前只读采样：nativeTheme dark/true，宿主与iframe dark=true，iframe背景rgb(32,37,31)。原生截图证明暗色随设置生效；此前浅色页面来自测试默认媒体覆盖。未修改产品实现或测试数据来制造暗色。
20. 最终使用app.close正常退出，关闭W3 agent-browser session。只读隔离数据库显示4实例、1个Session、2个completed回合；同包绑定与状态保存于W3-final-persisted-state.json。所有人工故障已移除。最终构建摘要保存于W3-final-build-hashes.json。

已查看最终错误、脚本异常、旧状态拒绝、编辑前后、同包另一实例、跨Project、正常恢复、原生暗色等关键截图。未见遮挡或不可读反馈。页面异常日志只有显式注入的一条错误；console监听安装后没有warning/error记录。系统焦点相关回归与Composer旧基线失败由acceptance.md分开记录，不将CDP操作外推为这些检查通过。
