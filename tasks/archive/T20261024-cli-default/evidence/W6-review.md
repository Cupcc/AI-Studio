# W6 CLI 管理独立复核（2026-10-27）

- 验收者：`/root/cli_review`；未参与实现，源码只读。
- 基线：`53baac0697edb5a14124292ba931ae4004ca23c4`；任务计划的 Main 未提交更新不影响源码。
- 环境：macOS arm64；Node/Vitest，本轮未发送模型请求。

## 静态与自动化

- 独立阅读主进程 SessionService、typed IPC、Renderer store / CliSettings、Codex 登录解析及设置 / Chat 负责规格。
- `pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex/provider.test.ts`：65/65 通过。
- `pnpm --filter @ai-studio/desktop exec vitest run src/main/services/session/session-service.test.ts src/renderer/src/features/session/session.test.tsx src/renderer/src/features/settings/settings.test.tsx`：137/137 通过。
- `pnpm --filter @ai-studio/desktop exec vitest run src/main/services/session/session-ipc.test.ts`：16/16 通过。
- 检查：启用列表保存先于内存更新与广播；空列表不调用 Provider；检测 generation 丢弃禁用/重新添加期间旧结果；create 前后检查 enabled；已有 Session send 不加 enabled 限制；草稿 fallback 保留正文 / 附件，重置模型 / effort；新默认不改已有明确草稿；IPC 输入限制枚举与字段。
- 未发现新的阻塞缺陷。测试为模拟 Provider / API，不能证明远端认证有效。
- `git diff --check`：通过。
- `pnpm check:docs`：0 new issue(s); 4 baseline issue(s) unchanged or removed。

## 打包

- `pnpm package`：通过，当前 `1.0.0` 未签名 arm64 应用目录已构建。
- 后续原生冒烟 / 实际 UI 等待窗口时段，完成后补记。

## 当前真实本地检测（无模型请求）

- 当前构建 Adapter 的 `CodexProvider.checkAvailability({includeModels:false})`：可执行路径 `ok`，Codex CLI `0.164.0`，登录 `logged_in / api_key`，版本兼容性仍为 `untested`（tested `0.163.0`）。
- 未记录原始登录输出 / 凭据；此结果仅证明本机状态解析成功，不证明远端 key 或模型请求有效。
