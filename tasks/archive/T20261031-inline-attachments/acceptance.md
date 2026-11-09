# 验收：T20261031-inline-attachments

## 范围边界与人工验收（2026-11-01）

- W1 未独立重做 Finder 文件粘贴、完整退出重启或真实 Codex 回合；这些场景已经 Main Agent 实际执行，W1 查看了关键截图与操作记录，不能表述为完全未验证。跨 Project 安全隔离由独立文件系统探针与自动化覆盖，未在实际 UI 重复切换。
- 本轮原生位图粘贴及移除已经 W1 实际验证；真实图片模型、Claude、macOS 13、原生中文输入法候选操作与打包分发未验证。它们不在本次内部任务的真实链路 / 平台交付范围，不扩大本记录为完整里程碑或发布通过。IME composition 由自动化覆盖。
- 24 小时宽限的代码语义是文件最近修改时间及本次应用运行的最近暂存 / 解析时间，**不是最后一个引用移除后的 24 小时**。旧草稿附件移除后可在下次小时扫描回收；向用户说明及负责规格须据此表述。
- 草稿、历史用户消息或回合输入仍引用的附件不自动过期，因而正常历史附件仍会占用空间；本轮完成的是无引用副本与中断写入残片的自动回收，未增加历史附件容量上限。
- 人工功能验收：待人工验收；本记录不替代人的确认。功能范围依据 [task.md](task.md) 和 [Input spec §3](../../../specs/input/spec.md#3-行为细则)。

## 当前 AI 技术结论

- **通过。本任务技术收尾没有剩余阻塞。** W1 未参与实现；独立检查缓存生命周期、Skill IPC 边界、原子标签编辑与 Codex 文件序列化，执行相关测试及实际窗口场景，检查 Main 的真实缓存接收证据。本轮发现的 Skill inspector、长粘贴 caret 跟随问题均已修复并经独立实际操作复验。
- W1 已确认真实标签留白、文件 / Skill 内容 hover 和点击、Files 切换、原生 `Cmd+A/C/V/Z`、整项删除 / 撤销、连续空行、草稿隔离、placeholder、长粘贴末尾可见，以及 Preview 原生位图复制 / App 粘贴 / 移除。详见第三、五轮及 [W1 界面记录](evidence/W1-atomic-editor-ui.md)。
- W1 独立回归包括缓存 121 项、引用接口历史 189 项、inspector 41 项、最终编辑器 7 项、Codex Provider 66 项；不同轮次有重复覆盖，不相加为总测试数。Main 最终 9 文件 214 项、Provider 66 项、类型检查和构建日志已核对。W1 未发送模型请求。
- 当前 Codex file → JSON name / path 文本引用修复通过独立源码 / 协议复核；Main 已通过 Finder → 移除自造源文件 → 正常退出恢复 → Codex 实读缓存并返回独有 token。两者的执行者与证据分别保留，不伪装为 W1 重复执行真实回合。

## 第一轮：缓存生命周期评审（历史基线）

- 当轮结论：缓存生命周期的独立技术评审通过，当时尚未操作应用窗口；后续界面结果见第三轮，不以本历史段落概括当前验证范围。
- 验收者：W1 `/root/attachment_review`，未参与实现，未修改任何源码。
- 日期与代码基线：2026-10-31，`a0619fef2f954ba0bd4b82504dba849d703b385c` 加 composer-inline worktree 的未提交 diff。评审文件为 `pasted-attachments.ts`、`SessionStore.pastedAttachmentReferences()`、`SessionService.pastedAttachmentReferences()`、Session IPC 单例及 dispose 接缝。
- 平台与形态：macOS arm64，Node 26.12.1，源码自动化；未运行打包应用。
- Provider 与 CLI：Session 测试使用 FakeProvider；独立文件系统探针不使用 Provider，不发送模型请求。

## 验收结果

| 场景与来源 | 前置条件与操作 | 预期与实际结果 | 验证方式 | 结论 |
|---|---|---|---|---|
| 草稿 / 历史 / 重试保护；task 本轮完善、Input §3 | 查询新对话、View、已有 Session 草稿、超过最新分页范围的用户消息及失败回合输入；使无引用副本超过宽限期 | 查询覆盖全部五种来源；保留有引用副本，清理无引用副本 | 独立执行现有定向测试并审阅 SQL | 通过 |
| 内存临时草稿保护；Input §4 | 检查 secretComposer 路径、volatileDrafts 和 entries 的保留 / 清空生命周期 | 当前内存草稿中的 upload 被加入保留集；关闭 Project 不删除 entries；最终退出前先停扫描和等待队列 | 独立源码检查；未单独注入秘密问题 UI | 通过（代码范围） |
| 孤儿与中断写入；task 本轮完善 | 过期完整对、单独 data、单独 metadata；任一部分仍新鲜；未知文件 | 只删除过期自有 UUID 文件组；部分新鲜时保留；未知文件保留 | 现有测试 + 独立真实文件系统探针 | 通过 |
| Project 隔离与符号链接；task 安全边界 | 另一 Project 使用同一个 UUID 引用；数据文件 / 缓存根使用 symlink | 跨 Project 引用不保护当前 Project 的副本；解析拒绝数据 symlink；扫描不进入根 symlink，外部内容不变 | 独立真实文件系统探针 | 通过 |
| 暂存输入边界；task 安全边界 | 空文件与 10 MiB + 1 字节 | 均拒绝，未创建附件目录 | 独立真实文件系统探针 | 通过 |
| 扫描 / 暂存 / 解析并发和退出；task 本轮完善 | 同时暂存与收集；启动两次；推进小时计时器；dispose 后再次操作 | 单例队列顺序执行；启动只登记一次；dispose 停止计时器并等待既有队列，拒绝新操作 | 独立执行现有测试并检查 IPC wiring | 通过 |
| 引用源读取失败；task 数据保护 | references 回调失败后再解析现存附件 | 扫描在删除前失败；后续操作仍可执行，队列未永久拒绝 | 独立执行现有测试 | 通过 |

## 独立执行记录

1. 由 W1 执行以下定向回归，结果 **4 个文件、121 项通过**，耗时 4.02 秒：

   ```sh
   pnpm --filter @ai-studio/desktop exec vitest run \
     src/main/services/session/pasted-attachments.test.ts \
     src/main/services/session/session-ipc.test.ts \
     src/main/services/session/session-service.test.ts \
     src/main/ipc/registry.test.ts
   ```

2. W1 通过 Node 将实际 `pasted-attachments.ts` 用现有 Vite 所依赖的 esbuild 转译到内存，对隔离临时目录执行 5 项额外探针；只将 `@shared` 的 10 MiB 常量导入替换为同值常量，未替换被测方法或文件系统。全部通过，临时目录和服务随后清理：

   ```text
   PASS empty and oversized staging refused with no cache creation
   PASS symlink data target refused without reading or changing target
   PASS metadata-only interrupted write reclaimed
   PASS same UUID in another Project does not inherit retention
   PASS root symlink never traversed during collection
   {"independentProbes":5,"allPassed":true}
   ```

### 受评审源码指纹

后续源码变化后应判断是否需复验；此处不包含主代理之后的界面或启动修复。

| 文件（均位于 `apps/desktop/src/main/`） | SHA-256 |
|---|---|
| `services/session/pasted-attachments.ts` | `ffcda07a4657159a5782bdbcd6e23963fe39f419ef589a38f10761f06b31e853` |
| `services/session/store.ts` | `d96774ade5c2cd2274b9aff8cdd070a0915b2b8bbdfd46abdbf78ef357017415` |
| `services/session/session-service.ts` | `216c4880f1b0fc59a558c882e7e48f48d26e7a813a1c50da3d1816aafe9823c6` |
| `ipc/session.ts` | `8c17fc6de8bdd857acb9fa6d42d1ffcfe71ec40c4451e349cb8ca524b2108435` |

## 第二轮：引用交互与 Skill 内容接口（历史基线）

主代理按用户 2026-10-31 的后续纠正扩展本任务：引用具有类型标记，悬停显示真实内容，点击在侧边栏打开。W1 已独立检查 `ReferenceText.tsx`、`reference-preview.ts`、`ReferenceInspector.tsx`、Composer / store 编辑接缝与 `getSkillContent` 的 IPC / 主进程读取边界，未参与实现。

- 2026-10-31 21:38 定向回归 **6 个文件、189 项通过**，见 [W1-reference-regression.log](evidence/W1-reference-regression.log)。范围包含引用 hover / 文件打开、Skill opaque ID 预览与键盘打开、旧请求失效、引用整项删除、草稿持久化与 Session / IPC 回归。
- 主进程读取仅接受 Project、CLI 和 opaque Skill ID；重新查询原生目录并只匹配 enabled Skill，展示层不提交本机文件路径。内容限 256 KiB，非普通文件和包含 NUL 的内容被拒绝；读取后再次检查 Project 可操作性。现有真实临时文件测试覆盖跨 Project / 路径伪造、过大内容、二进制与禁用 Skill。
- 当轮尚未操作实际窗口；mirror 排版、可点击区域、长文本滚动、草稿恢复及 Skill 查看器与普通 Files 入口切换当时均未计为通过。后续新编辑器界面结果见第三轮。
- 当轮反馈缺陷：Skill 查看器取代整个 Files 面板时，显式“从 Files 添加文件”或其他文件打开入口未清除 inspector 状态，可能仍显示 Skill 而不展示目标文件或树。修复与复验见下文。

### 第二轮缺陷修复与基线变动

- 主代理在实际应用复现 Skill inspector 遮挡明确 Files 动作，随后将 Composer 的 Files 入口统一交给 `showTool`；Tools 的 `toolSelected` 按 Project 清理 inspector 并保留既有 Diff callback，关闭 Project 也清理 inspector；打开 Skill 时先选择 Files，再设置新 inspector。W1 已只读核对修复并独立执行 **3 文件、41 项回归通过**，结果见 [W1-inspector-regression.log](evidence/W1-inspector-regression.log)。界面复验仍待新版本交接。
- 用户随后指出行内标签边框紧贴文字、整体拥挤。Main Agent 决定以可编辑区域与原子标签替代 textarea 镜像；因此本节第二轮 `ReferenceText` 的测试仅保留为旧实现基线，不能证明后续新编辑器通过。W1 暂停界面检查，待新基线完成后独立复验。

## 第三轮：原子标签编辑器独立复验（2026-11-01）

### 环境与方式

- Main Agent 明确交接窗口后，由 W1 独占 `.runtime/attachment-review/Electron.app`，加载本 worktree 原子标签编辑器构建，CDP 9341；本地开发签名副本不作为打包分发验证。
- Project：`/private/tmp/studio-attachment-acceptance`。草稿：`请检查 @附件 样例.txt $check-attachment`，文件与 Skill 来自真实本地夹具。
- 使用 `agent-browser` 实际 hover / click / Session 切换；macOS 快捷键使用原生 CUA `super`（Cmd）按键。未通过 DOM 注入草稿或触发内部业务状态；未以 `Ctrl` 验证替代 macOS 快捷键。

### 界面结果

| 场景 | 实际结果 | 证据与结论 |
|---|---|---|
| 标签排版与类型 | file 有 `@` 标记，Skill 有 `$` 标记；实心编辑标签具实际内边距和相邻间距，无镜像重叠 | 已查看三张截图；通过 |
| 文件 hover 与点击 | hover 显示 `Attachment fixture token: paste-check-7319`；点击在 Files 选中对应文件并打开真实内容 | [文件 hover](evidence/W1-file-hover.png)；通过 |
| Skill hover 与点击 | hover 显示真实 frontmatter 和正文；点击侧栏显示只读 `SKILL.md` 内容 | [Skill hover](evidence/W1-skill-hover.png)、[Skill 侧栏](evidence/W1-skill-inspector.png)；通过 |
| Skill inspector 后明确打开 Files | 打开 Skill 后，通过 Context 的“从 Files 添加文件”显示项目树；再点文件标签显示该文件 | 原缺陷实际界面复验通过 |
| 原生 `Cmd+A`、输入、`Cmd+Z` | 正确聚焦消息纯文本后，全选只替换草稿；逐次撤销恢复原文与两个引用标签 | [界面操作记录](evidence/W1-atomic-editor-ui.md)；通过 |
| 原生 `Cmd+C/V/Z` | 全选复制后在末尾粘贴得到普通 `@` / `$` 文本；原有两个标签保留；一次撤销去掉整次粘贴 | [界面操作记录](evidence/W1-atomic-editor-ui.md)；通过 |
| 删除与连续空行 | 行尾 Backspace 整项删除 Skill，`Cmd+Z` 恢复；两次 `Shift+Enter` 保留空行，输入后撤销恢复两引用 | 实际 AX / agent-browser snapshot；通过 |
| Session / 新对话草稿隔离 | 切换既有 Session 显示其自身草稿；返回 New Chat 恢复原文与 file / Skill 两标签 | 实际 snapshot；通过，不等同完整退出重启 |

### 最终补丁与自动化复核

- W1 独立运行最终 `reference-text.test.tsx`：**1 文件、7 项通过**，见 [W1-atomic-editor-regression.log](evidence/W1-atomic-editor-regression.log)。覆盖真实内容接口、旧请求失效、原子选择与纯文本剪贴板、IME 不重绘、浏览器行包装 / 空 BR、剪切→撤销→重做→超长回滚后的 Skill 身份。
- 超长输入拒绝分支先将 `painted.current` 同步为最新已提交的 text / references，再重绘；回滚后的 DOM reference 索引对应同一身份表，新的回归验证幸存 Skill 不被错误分配为 file。
- placeholder 由已提交 `text.length === 0` 的 `data-empty` 决定，CSS 读取该属性；不依赖浏览器是否遗留单个 `<br>`。最终源码与测试复核通过，独立窗口验证仍以本节标明的构建基线为限。
- 已复核本验收文件的当前结论、历史未覆盖项和缺陷状态，消除“未操作窗口”对当前结论的误导；task / plan、负责规格及路线图由 Main Agent 同步，不由 W1 改写。

## 第四轮：Codex 普通文件输入纠正（2026-11-01）

- Main Agent 使用 Project 外 Finder 文件暂存，移除自造源文件后发送，旧映射的 Codex 0.166.0 回答未看到附件。该结果由 Main Agent 观察，W1 未操作该回合，不将其写成独立真实验收。
- W1 依据 OpenAI Docs 工作流核对公开官方仓库的锁定版本源码：[UserInput 目标语义](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/user_input.rs)、[模型内容转换](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/models.rs#L2044-L2101)及[协议说明](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/docs/protocol_v1.md#userinput-items)。普通 `Mention` 不直接产生模型内容，不能用其表示任意本机文件；同版 `Text` 直接产生模型 InputText。该发现解释了旧映射为何不足，不声称已穷举所有原生扩展注入路径。
- W1 只读复核 `mapping.ts`、`types.ts`、`provider.test.ts`、桌面 `file-reference.ts` 以及 Input / Tools / Adapter 负责规格和 Codex README 的最终 diff：**通过，无新增阻塞**。shared `attachments` 保留可信文件身份；只有 Codex `kind=file` 序列化为明确说明“不内联内容”的本机路径文本；image / skill 原生输入不变。不扩权、不直接读取文件内容、不新增 shell 拼接。
- 独立运行 `pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex/provider.test.ts`：**1 文件、66 项通过**，见 [W1-codex-file-mapping-regression.log](evidence/W1-codex-file-mapping-regression.log)。普通发送及 steer 验证相同映射、附件单独发送 / 多路径 / 默认名、name / path 的引号、换行及 NEL / LS / PS 单行 JSON、image / skill 原生形态均通过。
- 文档一致性复核：Adapter §3.13 持有当前转换及依据；Input 与 Tools 引用该负责段落；Tools §5.3 明确保留旧 0.163.0 证据并指出未排除项目目录文件发现。旧历史结果未篡改，也不再用来证明 Project 外缓存接收。详细指纹与技术边界见 [W1 映射评审](evidence/W1-codex-file-mapping-review.md)。
- 当轮技术复核时真实回合仍由 Main Agent 执行；后续成功证据检查见第五轮。W1 未操作该回合或发送模型请求，人工验收仍待用户明确确认。

## 第五轮：最终构建窗口补验与证据复核

- Main Agent 再次明确交接最终构建窗口后，W1 原生粘贴 32 行隔离文本，编辑区保持高度上限并能手动滚动至第 32 行，原文和两个原子引用未丢失；一次撤销恢复原始草稿。见 [滚动到底](evidence/W1-final-long-scroll.png)。
- `Cmd+A` / Backspace 清空后实际 placeholder 显示，Send 禁用；`Cmd+Z` 恢复两引用；随后点击文件标签恢复 Files 查看器并归还窗口。见 [空草稿提示](evidence/W1-final-placeholder.png)。
- 同次操作发现非数据损失的编辑体验缺陷：一次粘贴长文本后 selection 已到末尾，但视口仍停留第一行，caret 未滚入视口。已反馈 Main Agent；当时图片实际剪贴板入口也缺少操作证据。两项后续结果如下，历史观察保留。
- Main Agent 修复 `revealEditorCaret`：只调整编辑器自身 scrollTop，不滚动应用其他区域；折叠 Range 按可见矩形滚动，末尾空行无矩形时有 fallback。`insertText` 将 selection 放到新增 text node 末尾，再发布与显示 caret；`selectEditor` 恢复折叠 selection 后也显示 caret。W1 只读复核并独立重跑 **7 项编辑器回归通过**，见 [最终日志](evidence/W1-final-caret-regression.log)。
- W1 在新构建原生一次粘贴 32 行，**未手动滚动即显示第 25～32 行，caret 清楚位于第 32 行末尾**，一次 Cmd+Z 恢复原草稿与两标签。已实际查看[修复截图](evidence/W1-final-caret-visible.png)，原失败场景复验通过。
- W1 由 Finder 打开隔离 PNG 到 Preview，原生 Cmd+A / Cmd+C 复制位图，再回 App Cmd+V。显示的是剪贴板自动命名 `图片 · image.png`，在正文上方；移除图片标签后正文与 file / Skill 两标签不变。已查看[位图粘贴截图](evidence/W1-native-bitmap-paste.png)。该测试是实际位图来源，不是 Finder 复制 PNG 文件的替代结果，也未发模型请求。
- 最后点击 file 标签，恢复 Files 文件查看器；草稿保留 `请检查 @附件 样例.txt $check-attachment`，明确归还窗口。没有剩余阻塞发现。
- W1 已独立阅读 [Main 的真实链路记录](evidence/W0-real-cli.md)，并实际打开 [缓存唯一来源关键截图](evidence/W0-cache-only-codex.png)：截图确实展示读取应用数据目录缓存路径、回复 `cache-receive-9531` 与 8 秒 Done；不是从 Project 原文件读取。另核对 Main 的 214 / 66 定向结果、类型检查和构建日志均为通过。
- 按 Task Protocol “同一代码基线已有有效结果可引用”，本任务已经独立评审受影响源码 / 自动化并实际执行核心 UI，无须仅为形式再发一次相同真实模型请求；Main 自检与 W1 独立执行 / 证据检查分别标明。该判断不扩大为里程碑、打包分发或人工验收通过。
- 最后语义复核已核对 Session §5.4，当前转换改为引用 Adapter，粘贴附件只保存 opaque 身份；Input / Tools / Adapter / Codex README 与本记录无当前 mention 误述。`docs/08` 是明示 2026-10-19 的静态历史快照，保留原基线合理。负责规格、路线图及任务归档由 Main Agent 处理。
