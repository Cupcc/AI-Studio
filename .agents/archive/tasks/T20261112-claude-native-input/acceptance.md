# 验收：T20261112-claude-native-input

## 未覆盖与待决事项

当前结论以 R2 复验（`b14f156`）为准；R1（`864f366`）的逐项结果与缺陷保留为历史，见[验收结果](#验收结果)与[缺陷与复验](#缺陷与复验)。

- 待决：`b14f156` 的远端 CI 尚未运行。选中的 E2E 现包含 `workbench.spec.ts` 与 `project-view.spec.ts`，二者在 dev 上因与本任务无关的原因失败，由 `fix/e2e-dev-failures` 修复；修复合入后由 Main Agent 对本分支补跑 `node scripts/remote-ci.mjs` 并记录 run。本地未运行 E2E（仓库规则）。
- 待决：路线图与架构页中 Claude 排队 / 结构化附件的状态行由 Main Agent 收尾时同步，不在本次复验范围。
- 已知边界（task.md 已记录，未修改）：原生 `queued` 回执无超时；从队列开始的回合进程基线异步获取；Runtime 恢复时取消已暂存回合的“没有执行”措辞。
- D3 未能在界面复现（窗口为毫秒级）：以代码审阅、新增单测及 R1 一次性复现测试在 `b14f156` 上改为通过作为证据。D4 只有单测与代码审阅（需 24 小时清理周期）。
- 未在真实应用覆盖，仅有单测或代码审阅：CLI 不声明 `msg_lifecycle_v1` 时前置 `unsupported`；Runtime 在 `system/init` 前结束时排队失败为 `invalid_state`；原生 `cancelled`（单条撤回，界面无入口）；Stop 收尾期间 CLI 已开始下一回合的暂存与回放，及 `started` 先于被停回合 result 到达时开新回合（时序不可从界面控制）；被停止回合自身输入仍在队列时的 Runtime 恢复路径；Claude Skill 附件（Claude 输入框不提供 Skill 选择）。
- Codex 回归只有自动化证据，未运行真实 Codex CLI；本任务未改变 Codex 行为路径。
- 打包应用不在本任务范围（见 task.md「不做」）；两轮均只验证开发构建。
- 注入输入：R1 粘贴场景派发合成 `ClipboardEvent('paste')`（agent-browser 无法使用系统剪贴板）；两轮添加 Project 时均用主进程 inspector 把原生目录选择框替换为返回 fixture 路径。其余操作均从界面入口执行。

## 人工功能验收

- 状态：待人工验收
- 范围与版本：Claude 运行中排队与结构化附件，`b14f156`；建议在远端 CI 补跑通过后提交人工验收
- 人工记录：未确认。本记录是 AI 独立验收，不代表人工产品验收

## AI 结论与运行环境

- 总体结论（R2，`b14f156`）：通过。R1 的 D1、D2 在真实应用中复验通过，D3、D4 由代码审阅与单测确认修复，D5 中 tools spec 已同步；排队并入与 Stop 后排队两项回归在真实 CLI 下通过。条件：`b14f156` 的远端 E2E 尚待补跑（见待决）。
- 历史结论（R1，`864f366`）：部分通过，不通过项为 D1、D2。
- 验收者：Review Agent R1（两轮为同一验收者），未参与实现，也未参与 `b14f156` 的修复
- 日期与代码基线：2026-11-12；R1 `864f366`，R2 `b14f156`（`feat/claude-native-input`，基于 dev `d924d2c`，评审范围 `git diff 864f366 b14f156 -- packages apps`），均无未提交改动
- 平台与应用形态：macOS 26.6、Apple Silicon arm64；`electron-vite build` 开发构建，从 `apps/desktop` 启动，隔离 `/tmp` userData 与 `/tmp` fixture Project，`env -i` 清理环境（不含 `CLAUDECODE` / `CLAUDE_CODE_*`）
- Provider 与 CLI：真实 Claude Code 2.1.322（已登录）、Agent SDK 0.3.293、模型 Haiku 5.5；自动化部分为模拟 Provider。本机 Claude 用户设置允许 Bash，工具运行未弹出批准卡，这是本机配置，不是应用行为

R2 自动化：`node scripts/check-affected.mjs --base d924d2c` 在 `b14f156` 通过（Adapter 11 文件 244 测试、桌面 33 文件 489 测试、三套桌面 tsc），记录见 [R2-review-checks.txt](evidence/R2-review-checks.txt)。

R1 自动化：`node scripts/check-affected.mjs --base d924d2c` 通过（Adapter 11 文件 241 测试、桌面 25 文件 392 测试、三套桌面 tsc）；远端 CI [run 43184581028](https://github.com/Tiancheng-ai/AI-Studio/actions/runs/43184581028)（`864f366`）成功，选中 E2E 21 项通过，含新增 I-Q3 用例。记录见 [R1-review-checks.txt](evidence/R1-review-checks.txt)。

## 验收结果

以下为 R1（`864f366`）结果，保留为历史；R2 复验见[复验（b14f156）](#复验b14f156)。

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| I-Q3 排队接受（task 验收标准第 1 行） | Bash `ping -c 20` 运行中，在输入框发送第二条 | 原生 queued 后清空输入，显示“排队中”，不算已执行 | 输入框清空，对话末尾虚线框“排队中 / CLI 会在当前步骤后或下一轮处理”，用户消息数不变 | agent-browser + 真实 CLI | 通过 | `evidence/R1-01-queue-during-tool.jpg` |
| I-Q3 首轮边界（同上，D1） | 新 Session 发送第一条，Runtime 启动中（约 1 秒内）发送第二条 | 排队，或明确且正确的错误、输入保留 | 输入保留，但报错 “This Claude Code version does not report queued input lifecycle (msg_lifecycle_v1)”；同一 CLI 稍后排队正常。回合结束后“重试发送”成功 | agent-browser + 真实 CLI | 不通过 | `evidence/R1-07-first-turn-queue-rejected.jpg` |
| I-Q3 并入当前回合 | 同第 1 行 | 工具结束后消息进入当前回合，回复处理它，只有一个完成行 | 用户消息出现在 Bash 结果之后，回复以 BANANA 结尾，该回合仅一行 “Worked for 21s · Done” | agent-browser + 真实 CLI | 通过 | `evidence/R1-02-queue-joined-running-turn.jpg` |
| I-Q3 下一回合 | 无工具写诗，文本流式中发送 “KIWI” | 当前回合完成后自动开始新回合，用户消息在新回合开头 | 诗回合 Done 后出现 KIWI 用户消息与独立完成行 | agent-browser + 真实 CLI | 通过 | `evidence/R1-03-queue-while-streaming.jpg`、`evidence/R1-04-queue-next-turn.jpg` |
| I-Q3 合并 | 写 60 行诗流式中连续排队 “APPLE”“PLUM” | 两条进入同一个新回合 | 两条用户消息相邻，回复 “APPLE PLUM”，一个完成行（实现者未在界面执行此项） | agent-browser + 真实 CLI | 通过 | `evidence/R1-16-two-queued-one-turn.jpg` |
| input Send / Stop | ping 运行中排队 “MANGO”，点击 Stop | 当前回合已停止；排队消息随后执行，不丢弃、不重复 | 停止中 Send 禁用、排队保留；ping 回合“已停止”，MANGO 作为新回合执行，MANGO 用户消息计数 1；测试应用无残留 ping | agent-browser + 真实 CLI | 通过 | `evidence/R1-05-stop-with-queued.jpg`、`evidence/R1-06-queued-runs-after-stop.jpg` |
| 失败恢复：Runtime 退出 | ping 运行中排队两条（一条带 notes.txt 引用），`kill -9` 仅本测试 Electron 主进程下该 Session 的 claude 子进程 | 排队消息标“未送达”，可放回或移除，不自动重发 | 回合失败卡片（SIGKILL）；两条“未送达”带「放回输入框」「移除」；侧栏 + 文件查看器收窄（对话列约 312 px）时“未送达”徽标单行（高 18.6 px），说明文字在自身列内换行 | agent-browser + 真实 CLI | 通过 | `evidence/R1-08-undelivered-narrow-layout.jpg` |
| 失败恢复：放回 / 移除 / 重发 | 对带附件的一条点「放回输入框」，另一条点「移除」，然后发送 | 文本与附件回到输入框并获得焦点；移除后消失；新 Runtime 正常执行 | 输入框含 notes.txt 标签与原文，`document.activeElement` 为输入框；移除后队列消失；发送后新 claude 进程启动，Agent 按路径 Read 并给出代码词。移除后焦点落到 body（次要，见下） | agent-browser + 真实 CLI | 通过 | `evidence/R1-09-restored-to-composer.jpg`、`evidence/R1-10-restored-message-resent.jpg` |
| 失败恢复：应用重启（技术决定 5、session §3） | ping 运行中排队 “PEAR”，`kill -9` 测试 Electron 主进程后用同一 userData 重启 | 未取用消息为“未送达” | 被中断回合显示“应用退出时本轮未完成”，PEAR 显示“未送达”并可移除 | agent-browser + 真实 CLI | 通过 | `evidence/R1-15-crash-restart-undelivered.jpg` |
| 排队不可用 | CLI 未声明 lifecycle；Stop 进行中发送 | 明确错误，输入保留 | 未声明 lifecycle：单测覆盖。Stop 中：界面 Send 禁用。首轮误报见 D1 | 单测 + 界面观察 | 部分通过 | `evidence/R1-05-stop-with-queued.jpg` |
| FR-TOOL-001、Tools §4.1 | Files「添加到对话」notes.txt 发送 | CLI 收到路径引用，不含内容；Agent 按路径读取 | CLI 会话记录中为 “Attached file reference … {name, path}” 文本块，不含文件内容；Agent 调用 Read 并引用代码词 | agent-browser + 真实 CLI + CLI 会话记录 | 通过 | `evidence/R1-11-files-image-and-reference-reply.jpg`、`evidence/R1-review-checks.txt` |
| FR-INPUT-001 图片 | Files「作为图片附加」蓝色 swatch.png；粘贴绿色 PNG（注入） | 原生图片块；Agent 描述图片 | CLI 记录为 `image` / `base64` / `image/png` 块；不用工具回答 “Blue”“Green” | agent-browser + 真实 CLI + CLI 会话记录 | 通过 | `evidence/R1-11-files-image-and-reference-reply.jpg`、`evidence/R1-12-pasted-image-and-file-reply.jpg` |
| 粘贴文件 | 粘贴 pasted-memo.txt（注入） | 路径引用文本，Agent 可读取 | CLI 记录为指向 userData 粘贴缓存的路径引用；Agent Read 后引用代码词 | agent-browser（注入粘贴）+ 真实 CLI | 通过 | `evidence/R1-12-pasted-image-and-file-reply.jpg` |
| 附件边界：运行中发送 | ping 运行中，fake.png（文本内容）「作为图片附加」后发送 | 发送前明确失败，输入保留 | 输入框保留文本与图片标签，提示 “Only PNG, JPEG, GIF and WebP images can be attached” | agent-browser + 真实 CLI | 通过 | `evidence/R1-14-invalid-image-queue-input-kept.jpg` |
| 附件边界：空闲发送（D2） | 无回合运行，fake.png「作为图片附加」后发送 | 发送前明确失败，输入保留 | 输入框被清空，写入用户消息，回合以同一错误失败（Session 红点、Runtime 退役）；“重试”会以同样原因失败 | agent-browser + 真实 CLI | 不通过 | `evidence/R1-13-invalid-image-idle-failed-turn.jpg` |
| 附件边界：Skill / 缺失文件 | Skill 标签、图片不可读 | 前置错误 | 单测覆盖；Claude 输入框不提供 Skill 选择 | 单测 | 通过（单测） | — |
| Codex 回归 | Codex 运行中追加、附件 | 行为不变 | `codex/mapping.ts` 仅抽出共用文本函数，输出逐字相同；桌面 Codex 仍走 steer 分支；相关单测与 CI E2E 通过 | 代码审阅 + 自动化（模拟） | 通过（自动化） | CI run 43184581028 |

## 缺陷与复验

### R1 缺陷（864f366）

| ID | 严重度 | 位置 | 复现与影响 | 建议修复 |
|---|---|---|---|---|
| D1 | 中 | `packages/agent-adapter/src/claude/driver.ts:197`、`:307` | `state.lifecycle` 只在 `system/init` 到达后为真；初始化握手（`supportedModels`）不设置它，实测新 Runtime 首轮早期仍为假。新 Session、应用重启或 Runtime 恢复后的第一轮早期发送第二条，即被以 `unsupported` “This Claude Code version does not report …” 拒绝，文案误导（2.1.322 支持该能力）。输入保留，无数据丢失 | 在 Runtime 有进行中的输入时等待 init（有界超时）后再判断能力，或在初始化握手中取得能力；未取得前返回可理解的中文“稍后重试”错误，而不是版本不支持 |
| D2 | 中 | `apps/desktop/src/main/services/session/session-service.ts:285-286`（`begin` 先写入并清空输入框，`:514` 才由 Adapter 校验图片）；`apps/desktop/src/renderer/src/features/tools/files/FileViewer.tsx:81`（按扩展名提供「作为图片附加」） | 空闲状态发送内容不是 PNG/JPEG/GIF/WebP 或超过 10 MiB 的图片：输入框清空、写入用户消息、回合失败并退役 Runtime，重试同样失败。违反 task 验收标准“附件边界：发送前明确失败，输入保留”及 session spec“校验或提交失败返回错误并保留输入”。运行中（排队）路径正确 | 在 `send` / `beginWithFiles` 的 `begin` 之前校验 Claude 图片（复用 `readImageAttachment` 的文件头与大小检查，或调用 Adapter 的前置检查），失败直接抛出以保留输入；可选：Files 对非图片内容或超限文件不提供「作为图片附加」 |
| D3 | 低 | `driver.ts:172`、`:188` 对比 `:206`；`session-controller.ts:389` | `sendUserInput` 返回后立即 `queueUserInput`，排队输入先于回合输入写入 CLI（`startTurn` 先等待进程快照再写入）。一次性单测复现：顺序为 `B,A`（见 R1-review-checks.txt 第 3 节）。CLI 会先执行 B，A 的输出归属错乱。界面上窗口很短且首轮被 D1 拦截，未在应用中复现 | `queueUserInput` 调用 `driver.queueInput` 前等待 `this.active?.startPromise`，或在驱动内串行化写入 |
| D4 | 低 | `apps/desktop/src/main/services/session/store.ts:118-127`；`pasted-attachments.ts:15` | 粘贴附件保留引用只统计草稿、回合与转录，不含 `sessions.data.queuedMessages`。“未送达”的消息超过 24 小时（或隔天重启后启动清理）再放回，粘贴缓存可能已删除，发送失败。代码审阅确认，未运行 | 在 `pastedAttachmentReferences` 中加入 `$.queuedMessages[*].contextItems` 的 upload 引用 |
| D5 | 文档 | `specs/tools/spec.md:157` 句末；`docs/06. Development Roadmap.md:118` | tools spec 仍写“Claude 运行中追加 / 排队及 Claude Code 真实接收暂缓”；路线图 Claude 行仍把结构化附件与排队列为保留边界。task 范围包含路线图同步 | 收尾时与本记录结论一起更新 |

其他观察（未确认的疑点与次要问题，不阻断）：

- 原生 `queued` 回执若始终不到达，`queueInput` 无超时等待（`driver.ts:207-208`），桌面 `entry.queueing` 一直为真，Send 保持加载、后续发送报“输入正在提交”，直到 Runtime 结束。真实 CLI 回执约 3 ms，未复现。
- 驱动以“`started` 时是否有原生回合”区分并入与新回合（`driver.ts:236`）。若 Stop 时 CLI 先发排队输入 `started` 再发被停回合的 `result`，该输入会被并入已停止回合，其输出被当作迟到事件丢弃。实测顺序为 result 在前，代码未防御。
- 从队列开始的回合进程基线异步获取（`driver.ts:247-252`）。基线完成前 Stop，可能把 Runtime 既有子进程计入本回合，清理失败转为 Runtime 恢复，进而取消其余排队输入。未复现。
- Runtime 恢复时被暂存的回合可能已在 CLI 中开始执行，却显示“这条消息没有执行”（`session-controller.ts:807-811` 已注明取舍）。
- CLI 合并开始的回合失败后，“重试”只重发首条排队消息（session spec 已写明）。
- 点击「移除」后焦点落到 body，Enter 不再发送（`apps/desktop/src/renderer/src/features/session/Conversation.tsx:138`），建议移回输入框或下一项。新增的 Adapter 错误以英文原文并带 IPC 前缀显示（R1-07、R1-14），与现有错误呈现一致，但 D1 文案尤其误导。

已检查且未发现问题：排队消息不重复写入（BANANA、MANGO 各一次）；有排队输入时 `sendUserInput` 拒绝且桌面改走队列；`dismissQueued` 拒绝移除仍在排队的消息、IPC 参数校验；Runtime 被杀、退役与应用崩溃后状态一致；Codex 引用文本逐字不变。

### 复验（b14f156）

复验者：Review Agent R1，未参与实现与修复。环境同上（真实 Claude Code 2.1.322、Haiku 5.5、`b14f156` 开发构建、隔离 `/tmp` userData 与 fixture、`env -i`）。fixture 另含 `fake.png`（文本内容）与 10.3 MiB 的噪声 PNG `big.png`。

| 缺陷 / 回归 | 操作 | 预期 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| D1 新 Session | 新 Claude Session 发送 “ONE”，约 1 秒内（Runtime 启动中）发送 “TWO” | 第二条排队，随后执行，不报版本不支持 | “TWO” 立即显示“排队中”、输入框清空、无错误；ONE 完成后 TWO 作为下一回合执行，各一行完成 | agent-browser + 真实 CLI | 通过 | `evidence/R2-01-d1-new-session-second-send-queued.jpg`、`evidence/R2-02-d1-new-session-next-turn.jpg` |
| D1 应用重启后 | 退出并重启应用，打开同一 Session，发送 “THREE” 后立即发送 “FOUR”（恢复的新 Runtime 首轮） | 同上 | FOUR 显示“排队中”，THREE 完成后 FOUR 作为下一回合执行；CLI 会话记录顺序 ONE、TWO、THREE、FOUR | agent-browser + 真实 CLI + CLI 会话记录 | 通过 | `evidence/R2-03-d1-after-restart-queued.jpg`、`evidence/R2-04-d1-after-restart-next-turn.jpg` |
| D2 已有 Session 空闲发送 | Files 选 `fake.png`「作为图片附加」，输入文字后发送 | 发送前明确失败，输入保留，无失败回合 | 提示“附件无法发送：Only PNG, JPEG, GIF and WebP images can be attached: fake.png”，无 IPC 包装前缀；文字与图片标签保留；用户消息数不变，无错误卡片，Session 仍为绿点，同一 claude 进程未退役 | agent-browser + 真实 CLI | 通过 | `evidence/R2-05-d2-invalid-image-idle-input-kept.jpg` |
| D2 超限图片 | 同一 Session，`big.png`（10.3 MiB）「作为图片附加」后发送 | 同上 | 提示“附件无法发送：Image exceeds 10 MiB: big.png”，输入保留，无失败回合 | agent-browser + 真实 CLI | 通过 | `evidence/R2-06-d2-oversize-image-input-kept.jpg` |
| D2 新对话首条 | 新建 Claude 对话（Haiku），`fake.png`「作为图片附加」后发送 | 明确失败，输入保留，不创建 Session | 同一提示，草稿保留，侧栏对话数仍为 1，仍停留在新对话页 | agent-browser + 真实 CLI | 通过 | `evidence/R2-07-d2-new-chat-no-session.jpg` |
| D3 输入顺序 | 界面窗口为毫秒级，未能复现；审阅 `driver.ts` `inOrder` 与 `ClaudeSession.afterChecks`，重跑 R1 一次性复现测试（进程快照延迟 30 ms，`sendUserInput` 后立即 `queueUserInput`） | 写入 CLI 顺序 A、B | 一次性测试在 `b14f156` 上通过（顺序 A、B，R1 为 B、A），已删除；新增单测“delivers inputs to the CLI in call order …”通过 | 代码审阅 + 单测（模拟） | 通过（单测） | `evidence/R2-review-checks.txt` |
| D4 粘贴缓存保留 | 审阅 `store.ts` 新增的 `queuedMessages` 引用子查询及更新的单测 | 未送达消息的粘贴附件计为引用 | 单测覆盖 `undelivered` 排队消息中的 upload 引用并通过 | 代码审阅 + 单测 | 通过（单测） | — |
| D5 文档 | 检查 `specs/tools/spec.md:157` | 不再写 Claude 排队与真实接收暂缓 | 已改为链接本任务，仅保留 Needs Input 文件答复暂缓 | 文档审阅 | 通过（路线图待 Main Agent 收尾） | — |
| 疑点：移除后焦点 | 杀掉本测试应用的 claude 子进程使排队消息“未送达”，点「移除」，直接输入并按 Enter | 焦点回到输入框 | `document.activeElement` 为输入框，Enter 在新 Runtime 发送 “PLUM” 并完成 | agent-browser + 真实 CLI | 通过 | `evidence/R2-10-remove-then-focus-send.jpg` |
| 回归：并入当前回合 | ping 运行中排队 “BANANA” | 工具后并入当前回合，一个完成行 | 用户消息在 Bash 结果后，回复以 BANANA 结尾，一行 “Worked for 21s · Done” | agent-browser + 真实 CLI | 通过 | `evidence/R2-08-regression-queue-fold.jpg` |
| 回归：Stop 后排队 | ping 运行中排队 “MANGO”，点击 Stop | 当前回合已停止，排队消息随后执行一次 | ping 回合“已停止”，MANGO 作为新回合执行，用户消息计数 1；同一 Runtime，无需恢复 | agent-browser + 真实 CLI | 通过 | `evidence/R2-09-regression-stop-with-queued.jpg` |

复验中的代码审阅另见两点次要观察，不阻断：

- 重试路径（`session-service.ts` `retryWithFiles`）未调用新的 `checkProviderInput`。只有历史中已存在的、含无效图片的失败回合重试时才会再次记录失败回合；修复后新发送不会产生此类回合，影响很低。
- 前置检查的提示为中文前缀加 Adapter 英文原文（如 “Image exceeds 10 MiB”），信息明确，措辞可在后续统一本地化。
