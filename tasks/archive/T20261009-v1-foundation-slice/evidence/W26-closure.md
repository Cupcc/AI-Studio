# W26 V1 技术收尾自检（2026-10-18）

执行者：Main Agent；代码在 `fix/v1-closure` worktree，基线 `dc66a16` 加本轮未提交 diff。此记录是开发者自检，不代表独立验收或人工接受。

## 最终门禁（2026-10-19）

系统已解锁，Main Agent 重新构建并完整运行 Electron **49/49** 通过，见[完整日志](W26-final-e2e.log)。W28 最终包独立结果、基础 36/257/1172、1.0.0 arm64 打包与 open 冒烟均已通过，七任务已按完成条件收尾归档；当前基线和产物见[最终报告](../report.md)。下方各轮的“待复验 / 等待解锁”保留为其历史进度，不代表当前阻塞。新体验人工验收、Claude 后续及发布决定仍保留。

## 已验证的真实 Codex UI

这一组使用未包含本轮新实现的 `dc66a16` 构建，Codex CLI `0.163.0`，macOS 15.6 arm64。隔离 Project 与 userData 在 `/tmp/ai-studio-native-ui-20261018/`；Project 不继承仓库规则。

| 场景 | 操作及结果 | 证据 |
|---|---|---|
| AC-03 并发与单方停止 | A 执行 120 秒命令；New Chat 创建 B 执行 80 秒命令；两个 Session 同时 Running。回 A 点击 Stop，A 命令 PID 13295 退出，B PID 14016 继续运行并最终完成 | [同时运行](W26-ui-parallel.png)、[Stop 与模型](W26-ui-stop-model.png) |
| 第二模型与原 ID 续聊 | A 停止后 UI 改选 `gpt-6-astra` 并发送 marker，回复成功，turn_end 实际模型及 nativeSessionId 只读取证，原 Thread ID 未改变 | [只读状态](W26-ui-state.json) |
| AC-04 后台完成与查看清除 | B 后台完成出现 Completed Unread；将 Electron 明确置为 macOS 前台后打开 B，未读清除 | [后台未读](W26-ui-background-unread.png)、[前台打开清除](W26-ui-open-cleared.png) |

焦点说明：CDP 的 `document.hasFocus()` 不足以证明原生应用在前台。第一次清除未发生时实际前台为 Notion；明确切到 Electron 后复验通过。此前尝试的 10 秒未读压制和重复 opened 调用已撤回，没有将它们当作修复。原代码两个针对焦点 / 未读的 E2E 独立重跑 2/2 通过。

## 当前实现与自检

- 持久 Runtime 身份登记、已观察后代采样、宿主失效后启动清理；不按同名进程批杀。退出失败保留句柄并可重试，严格退出失败时不关闭数据库或直接退出。
- 显式模型不因目录缺失被客户端替换；effort 每轮快照、显式恢复原生默认；CLI 已公开 reasoning 与工具结果进入 Transcript 和持久化。
- 图片使用原生 localImage；Skill 从原生目录选择，以 Project 隔离的 opaque ID 保存，主进程重新查询 enabled 目录解析原生路径；普通 / Running / Retry 不静默降为文字引用。
- 生产入口只注册 Codex，Claude 实现与模拟覆盖保留。协议类型更新为当前 CLI 0.163.0，共 215 个生成类型；类型生成不证明全部上游方法已验收。
- `pnpm check:code` 通过：scripts 36、Adapter 255、desktop 1165。该次未包含后续真实 UI 发现后的修订；后续结果补记。

## 本轮最终包真实接缝（Main Agent 自检）

Codex 0.163.0；macOS 15.6 arm64；隔离 Project / userData。完整界面操作及只读核对见 [结果摘要](W26-native-result.json)。图片左红右蓝、Project Rule / 所选 Skill、high effort、原生审批 Accept 与 I-Q2 同轮文字拒绝均通过；被拒绝文件不存在。Astra low 切回默认后，原生 turn_context 确认为 gpt-6.1-sol / xhigh；正常重启保留选择与历史。证据：[输入就绪](W26-native-input-ready.png)、[原生结果](W26-native-input-result.png)、[原生审批](W26-native-approval-pending.png)、[文字拒绝](W26-native-declined.png)。

真实 Electron 宿主 PID 1610 在命令活动时被 SIGKILL；已登记 Runtime / 命令随 CLI EOF 退出，启动 recover 确认旧记录 cleaned，外部 HTTP sentinel 保持活动；同一 native ID 继续并正确回忆图片。此轮没有遗留进程存活到 recover，不单独证明 recover 实际杀死残留；该路径的 OS 证据由 W27 独立探针补充。见 [进程身份与恢复](W26-electron-recovery.json)、[强杀前](W26-native-before-crash.png)、[恢复续聊](W26-native-resumed.png)。截图发现中断历史工具仍转圈，随后补当前 turn 的未完成条目恢复，尚待修复包复验。

原生恢复 Thread 的 summary 持续为 none，CLI 没有公开正文；不将空 reasoning 条目算作正文显示通过。W28 发现 function output、Review 及搜索正文丢失，Main 已修复并加入正式事件回归，独立 10/10 探针通过。

最新全基础自检在公开输出补映射前通过 scripts 36 / Adapter 255 / desktop 1170；补映射后 Adapter 256 通过，恢复条目修复后 Session 79 通过。最终提交门禁与 GUI 结果另补，历史日志不改写。

## 2026-10-18 门禁等待（历史）

W28最终包独立技术复核已通过，包括公开非空摘要、四工具 / 原生布局 / Browser错误 / cleanup超时重试、新强杀回合和旧版遗留条目恢复、原ID续聊；见[独立结果](W28-review.md)。最终包app.asar SHA256为 `fc68a61326caa6ae55dadc860e33aa34c6bc5abd6f65931377d5170d41694813`。

最终 `pnpm check:code` 通过 scripts36 / Adapter257 / desktop1172；最终 `pnpm package` 和 `pnpm smoke:packaged` 通过，版本1.0.0，真实open启动验证SQLite / PTY / 屏幕模型 / 登录Shell / Renderer。主checkout已留存相同应用目录。

最终完整Electron回归为38通过、11未进入业务测试：所有11项均在launch的原生前台前置失败。诊断确认本机 `IOConsoleLocked=true`，frontmost是PID717 / com.apple.loginwindow；Electron focus、System Events和NSRunningApplication调用都未实际改变锁屏前台。没有放宽断言，临时的额外激活尝试已撤回。已向用户请求解锁，等待后重跑完整49项；不能以先前子集与其他基线拼成49/49，也不在门禁未完成时将相关任务归档。

不创建或上传GitHub Release；新增体验人工验收仍待。macOS15.6本机结果不能记为macOS13实机通过。锁屏诊断及失败命令保存在本地 `.runtime/v1-e2e-focus-precondition-failed.log`、`.runtime/v1-focus-diagnostic.log`；完整门禁日志和包摘要同步留存。

清理记录：W28结束后按PID1646 / 启动时间10:27:30 / HTTP9417精确核对并停止本轮自建sentinel；已删除隔离CODEX_HOME复制的auth.json、config.toml和模型目录，未触及全局配置。应用副本及验证manifest已留存在主checkout；待完整门禁通过前保留实施worktree。
