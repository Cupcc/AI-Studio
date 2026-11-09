# Finder 粘贴、重启恢复与缓存唯一来源接收

- 执行者：Main Agent，自检；独立评审见 [acceptance.md](../acceptance.md)。
- 日期：2026-11-01；macOS arm64；Codex CLI 0.166.0；本地开发签名运行器 `.runtime/attachment-review/Electron.app` 加载 composer-inline worktree 的最终构建，非打包分发验证。
- 项目：`/private/tmp/studio-attachment-acceptance`。所有发送内容均为本轮创建的测试夹具，无用户业务文件或凭据。
- 操作使用 agent-browser 与原生 Finder / Electron CUA；未注入内部业务状态或调用 IPC 代替可见入口。

## 首次发现与修复

首次从 Finder 粘贴 Project 外文件，App 正确暂存，但 Codex 回复“当前未看到附加文件”。此前 Project 内同名夹具返回 token 的结果不能证明缓存文件已提供给 CLI。

核对 [Codex 0.166.0 UserInput](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/user_input.rs#L45-L54) 与[模型内容转换](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/models.rs#L2044-L2101)：`mention` 用于 app / connector / plugin 等显式选择，普通文件路径不会直接成为模型内容。修正 Adapter 的 `kind=file`：使用明确标识本机文件引用的 JSON name / path 文本；不嵌入全文、不改变 CLI 权限；图片与 Skill 保留原生输入。共享 `attachments` 契约保持结构化。

定向自动化及 W1 独立复核覆盖普通 / steer、附件单独发送、默认文件名、多路径、中文空格、引号、换行与 NEL / LS / PS 单行转义。历史 0.163.0 mention 验证保留原基线，不作为本轮缓存接收证据。

## 修复后实际操作

1. 在仓库外创建 `/tmp/studio-paste-source/缓存 接收.txt`，内容为 `Cache-only token: cache-receive-9531`；此前失败轮使用不同 token。
2. App New Chat 输入“只读取附加文件，返回其中的 token；不要修改任何文件，也不要搜索其他目录。”，请求中未包含源文件路径、缓存路径或 token。
3. Finder 前往 `/tmp/studio-paste-source`，选择中文空格文件，原生 `Cmd+C`；App 聚焦输入区原生 `Cmd+V`，可见文字上方的附件与移除按钮。
4. 只读核对 App 已写入的缓存副本与夹具字节一致；随后以 shell 移除本轮自造源文件，并确认其不存在。
5. 从 Electron 菜单正常退出 App，重新打开，确认文字与附件标签恢复。无原始文件可重新读取。
6. 通过 App 的 Send 发起真实 Codex 回合。界面显示 Codex 执行：

   ```text
   cat '/Users/Chris/Library/Application Support/AI Developer Studio (Dev)/attachments/d9527acc129e891daa24c603371d014516882a0b526826ab35bb9551d598154b/0cff207a-c89a-4bd6-9c5d-7bbab04254b5.data.txt'
   ```

7. 实际回复 **`cache-receive-9531`**，8 秒完成；未观察到项目文件修改。已查看[关键截图](W0-cache-only-codex.png)，确认读取的是缓存路径、回复 token 与完成状态。
8. 回 New Chat，经真实 `@` / `$` 候选恢复 `请检查 @附件 样例.txt $check-attachment`，留作人工验收，不发送该草稿。

## 范围

- Main Agent 已验证 Finder 文件粘贴、行内两类标签完整重启恢复，以及带缓存附件草稿完整重启后真实 Codex 接收；W1 的独立执行范围另记，不能互相替代。
- W1 已从 Preview 原生复制位图并在 App 粘贴、移除，独立证据见 [acceptance.md](../acceptance.md)；图片转交由自动化覆盖，本轮未执行真实图片模型回合。Claude 结构化附件仍明确拒绝，不将 Codex 结果外推。
- 原始文本文件已移除；缓存因历史用户消息与回合输入引用而保留。无引用孤儿 / 中断残片的回收由缓存定向测试及独立文件系统探针验证，未以等待 24 小时替代自动化时钟验证。
- 没有进行打包分发、全量回归或人工产品验收。
