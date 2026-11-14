# 验收：T20261114-file-editing

## 未覆盖与待决事项

- 未运行 Playwright Electron E2E、vm-ci 和 vm-ui，也没有操作真实应用。原因是委派约束：VM 名额正被其他进程占用。界面行为只按代码和实现者的单元测试判断，包括未保存圆点、Tab 关闭询问、冲突横幅、比较视图、关闭 / 退出确认框的按钮与失败列表。AI 交互验收以实现者的 vm-ui 证据为准，本评审不替代。复测条件：在 VM 中从可见入口执行编辑保存、外部修改冲突、关闭 Tab / Project、退出四个场景，并补做 B1 的复现步骤。
- 原生退出对话框（`askNative`，窗口未加载时使用）只审了代码。
- Agent 并发写入用 `beforeWrite` 测试钩子和 fake files API 模拟，没有用真实 CLI。
- 未审 Markdown 预览渲染、`files.css` 样式和文案措辞。
- 无需人工决定的产品问题。B1 的修复方式由实现者选择。

## AI 结论与运行环境

- 总体结论：**通过**（单元测试层；界面交互验收见“未覆盖与待决事项”）。首轮有 1 个阻断项（B1），已在 `55cd6b2` 修复并复验通过；非阻断项见“后续项”。
  - 主进程写入边界未发现阻断问题。`files:write` 只接受 Project 相对路径，逐级 lstat，打开使用 `O_NOFOLLOW_ANY`；符号链接、`.git`（含大小写变体）、FIFO 和目录都被拒绝。写入前在已打开的描述符上核对 inode 与版本，被删除的文件以 `O_EXCL` 排他重建。编码与 BOM 可往返，IPC 输入校验严格。
  - 关闭 / 退出流程中，只要 Renderer 已登记未保存文件，确认框就会列出它们；“保存并关闭 / 退出”中有任何文件保存失败、冲突或忙，都不会继续关闭或退出。
  - B1（已修复）：首轮发现，每次保存或撤销回原文之后，下一段输入最多约 150 ms 不进入 Files store。在这段时间内，退出或关闭 Project 不会询问，磁盘刷新会直接替换这段输入。
- 评审者：独立 Review Agent（Claude 子代理），未参与实现，未修改被评审代码。
- 日期与代码基线：2026-11-14；分支 `feat/file-editing`，commit `de937dd`；评审范围为 `git show de937dd`。评审开始时 worktree 干净。评审期间，另一进程在 `code/CodeViewer.tsx`（`data-editable`）和 `code/code.css`（编辑器焦点外框）留下了未提交改动；这两处不属于本次评审范围，也不影响以上结论。复验基线为 `55cd6b2`，只看 `git show 55cd6b2` 中 B1 的修复及其直接影响。焦点外框改动随同一提交合入，不属于 B1；它只去掉可编辑查看器的外框，只读查看器和对比视图不受影响，没有破坏功能。
- 平台与应用形态：macOS 26.6 arm64。只做了单元测试层的检查（vitest node + jsdom）和临时探针，没有启动开发 / 构建 / 打包应用，没有运行 E2E 或界面检查。
- Provider 与 CLI：不适用。没有涉及 CLI 链路，Agent 写入是模拟的。
- 执行的检查（目录 `apps/desktop`）：
  - `pnpm --filter @ai-studio/desktop exec vitest run src/main/services/files src/main/services/project/tool-close.test.ts src/renderer/src/features/tools/files src/renderer/src/features/tools/code src/renderer/src/features/project/shell.test.tsx src/shared/project`：32 个文件、591 项全部通过。
  - 临时探针，放在会话 scratchpad，未提交：
    - 主进程写入：硬链接、版本检查后的原位写入、孤立代理项 / NUL、重建权限、写入时父目录被改名。
    - 编辑会话与 store 联动：用 fake Monaco 加 fake files API 模拟保存后再输入、期间发生外部写入。结果见 B1 与后续项。
  - 复验（基线 `55cd6b2`）：
    - `pnpm --filter @ai-studio/desktop exec vitest run src/renderer/src/features/tools/code src/renderer/src/features/tools/files`：16 个文件、341 项全部通过。
    - 重跑 B1 探针，`dirty` 按 store 是否有 draft 传入。

## 阻断项与复验

| ID | 问题与复现 | 修复提交 | 复验结论 | 证据 |
|---|---|---|---|---|
| B1 | **保存（或撤销回原文）后的下一段输入最多约 150 ms 不进入 store，期间退出 / 关闭不询问，外部刷新会覆盖这段输入。**<br>原因：`code-session.ts:75,89` 的 `reported` 只在会话第一次修改时立即上报；之后只有 `show()` 换入不同文本（`:108`）才会重置。保存成功（`files-store.ts:749-753` 删除 draft）或撤销回原文（`:715`）后，Viewer 文本与模型相同（`FileViewer.tsx:100`），`CodeViewer.tsx:57` 不会调用 `show()`，`reported` 仍为 true，于是下一次修改只启动 150 ms 定时器。这段时间里 store 没有该文件的 draft，`files/integration.ts:18-28` 报给主进程的未保存列表为空。<br>后果 1：按 ⌘Q（`quit-flow.ts:40,116`）或 ⌘W 关闭 Project（`close-flow.ts:25-27`）都只看主进程登记。菜单快捷键不会让编辑器失焦，没有补报。没有其他资源时直接退出或关闭，输入丢失；有运行中的 Session / Terminal 时确认框会出现，但不列出该文件，也没有“保存并退出”按钮。<br>后果 2：这段时间里 Agent 写入同一文件时，读取结果把 Viewer 文本换成磁盘内容，`show()`（`code-session.ts:105-109`）清掉待报修改并 `setValue`。输入被磁盘内容替换，没有未保存标记，也没有冲突提示。<br>复现：打开 `src/a.ts`，输入一个字符（立即显示未保存），按 ⌘S（标记消失）。再输入一个字符，150 ms 内按 ⌘Q（只开这一个 Project，没有运行中的 Session / Terminal）：应用直接退出，没有确认框，第二个字符没有写入磁盘。后果 2 的复现：同样保存后再输入一个字符，150 ms 内由外部写入该文件：编辑器显示外部内容，输入消失，没有任何提示。<br>探针结果：保存后输入的瞬间 store 中 draft 数为 0；外部刷新后模型值为 `"agent text"`，没有 draft。<br>与已确认的 TOOLS-Q13 不符：“有未保存修改时关闭 Project 或退出应用，在确认框中列出”，以及“不静默覆盖”。影响限于每次保存或撤销回原文后约 150 ms 内的输入。<br>建议：文件在 store 中回到没有 draft 的状态后，下一次修改立即上报。做法可以是 Viewer 把“有无 draft”传给编辑器，变为干净时重置 `reported`；也可以改为首沿节流。同时补一条“保存后再输入立即标为未保存”的测试。可选：主进程统计未保存文件前，先请 Renderer 刷新编辑器。 | `55cd6b2` | **通过**。复验只看修复 diff 及其直接影响。<br>修复做法：`code-session.ts` 去掉 `reported`；文件没有 draft 时（`!editing().dirty`）每次修改立即上报，有 draft 后才按 150 ms 合并。`FileViewer` 传入 `dirty={!!draft}`，`CodeViewer` 通过 ref 读取 `dirty`。store 变化会触发 React 19 的同步渲染，在下一个输入事件之前更新 ref，所以事件发生时读到的值是当前的。FileViewer 是唯一使用可编辑模式的地方。<br>直接影响：保存后、撤销回原文后、“放弃我的修改”后，下一次修改都在同一事件里成为 draft，并同步上报给主进程，后果 1 消除。有 draft 期间才合并上报，此时主进程已登记该文件，确认框出现时编辑器失焦会补报，“保存并关闭 / 退出”保存的是最新文本。外部写入在有 draft 时按冲突处理，后果 2 消除。<br>代价：只是文件刚变干净后的第一次修改多一次上报。<br>测试：新回归测试覆盖保存后的情形；撤销回原文走同一条件，由探针覆盖。 | 探针重跑：保存后输入的瞬间 store 中 draft 数为 1；150 ms 内外部写入后，模型保留 `const a = 23`，draft 带冲突 `v3`；放弃修改后、撤销回磁盘文本后，下一次修改都立即成为 draft。code / files 单元测试 16 个文件、341 项通过。 |

## 后续项

非阻断，不在本分支修，也不触发复验。

1. **用废纸篓删除有未保存修改的文件或其所在目录时，修改被直接丢弃**：`file-actions.ts:78-82` 对被删除路径直接调用 `closeTab`，删除确认框也不提未保存修改。VS Code 遇到这种情况会单独提示“正在删除有未保存修改的文件”。建议在删除确认中列出这些文件或单独询问。
2. **关闭或退出清理失败后，主进程的未保存登记已被清空**：
   - `ipc/index.ts:39-48` 用 allSettled，无论其他工具是否失败，都会执行 `files.closeProject/closeAll`，而这两个函数会清空登记（`service.ts:334,341`）。
   - 随后如果因“终端未退出”等原因关闭 / 退出失败（`close-flow.ts:42-44`、`quit-flow.ts:85-91`），Project 仍然打开，Renderer 的 draft 也还在；但 `files/integration.ts:17-26` 只在 draft 路径集合变化时才重报。
   - 用户先选“不保存”、遇到清理失败、取消，再继续编辑同一批文件，之后退出或关闭时这些文件不会被列出。建议在关闭 / 退出失败后让 Renderer 重报。
3. **硬链接**：写入保留硬链接（`write.ts:66-85` 不检查 nlink）。如果 Project 内有指向 Project 外文件的硬链接，保存会改写外部文件，探针已确认。这与 VS Code 一致，前提是链接已经存在，读取路径同样会读到外部内容。如需严格做到“不写出 Project”，可拒绝 `nlink > 1` 或给出提示。
4. **TOCTOU**：版本核对后、写入前发生的原位外部写入会被覆盖（`write.ts:76-78`，探针用 `beforeWrite` 确认）。窗口为毫秒级，属于与 VS Code 相同的乐观并发。
5. **非原子写入**：原位“先写后截断”不是原子操作（`write.ts:78-79`）。写入中途出现 ENOSPC / EIO 时，文件会是新内容前缀加旧内容尾部。结果报 `failed`，修改留在编辑器里，重试会先报冲突。可以在失败文案中提示磁盘文件可能不完整。
6. **`conflict` 注释与实际行为不符**：`shared/tools/files.ts:161` 称 `conflict`“nothing was written”。但写后路径校验失败时（`write.ts:83-84`，例如写入期间父目录被改名），字节已经写进原 inode。探针中文本写进了改名后的 `d-old/a.txt`。修正注释即可。
7. **重建文件不保留权限**：重新创建被删除的文件时使用 `0o666 & umask`（`safe-path.ts:121`），原来的可执行位等权限丢失，探针结果为 755 → 644。
8. **NUL 与孤立代理项**：编辑器里可以输入 NUL 或孤立代理项，保存后文件分别被判为 `binary` 和 `unsupported_encoding`，无法再在查看器中打开，探针已确认。可以在保存前拒绝或提示。
9. **磁盘变为不可显示时没有冲突横幅**：Agent 把有未保存修改的文件改成二进制、超过 1 MiB 或不支持的编码时，`files-store.ts:374` 只把 Viewer 设为 unavailable，没有调用 `diskIs`，所以不出冲突横幅。普通保存仍会被主进程报为冲突，不会静默覆盖。
10. **保存中改名后 draft 卡在保存中**：保存进行时文件被改名（`moved`），迁移到新路径的 draft 仍带 `saving: true`；保存结果按旧路径处理（`files-store.ts:749-753`）。新路径的 draft 会一直处于保存中，保存和放弃按钮都不可用，只能关闭 Tab。触发窗口很窄。
11. **写入卡住时无法取消**：选“保存并退出 / 关闭”后，如果某次写入卡住（写入走 Project 队列，没有超时，见 `service.ts:158`），确认框按钮全部禁用，无法取消。
12. **模型缓存未按规格释放**：`closeTab`、`forget` 先调用 `releaseCodeModels`，编辑器卸载时 `code-session.ts:141` 又把模型放回缓存。关闭的 Tab / Project 的模型因此会留到 LRU 淘汰，与 §5.5 的“关闭 Tab 或 Project 时释放”不符。有文本比对，不会显示错误内容。
13. **偏好加载晚于用户切换**：`loadPreferences`（`files-store.ts:694-698`）如果晚于用户本次的切换返回，会用已存的值覆盖本次选择。
14. **测试缺口**：
    - 以下行为都没有单元测试：Renderer 上报未保存路径（`files/integration.ts`）、`saveAndQuit`，以及会话在保存后再次输入的行为（B1）。
    - FIFO 只测了 lstat 阶段的拒绝，没有测检查之后才换入的 FIFO。
