# W4 生命周期复查与 R1 / R2 修复

- 日期：2026-10-09。
- 复查基线：主分支 `7a5fb3a` 的关闭接线；后续合入 `234ed32` 的 Adapter exports 修复。
- 范围：Session 后端关闭 / 重开、Stop 失败、idle Runtime 释放、并发退出、清理等待；FR-PROJ-002、FR-SESSION-002～003、FR-INPUT-001、FR-STATE-002～003。
- 使用 Vitest skill：采用独立 config 与模拟 Provider，具体行为断言，不运行真实模型调用。
- 本文为实现者的验证记录，不修改独立验收结论或 task 状态。

## 首次只读复现

在未修复的 SessionService 上执行 `W4-lifecycle.config.ts`，6 项断言通过：4 项正常路径确认，另 2 项明确断言下列缺陷确实存在。

| 编号 | 复现过程 | 修复前观察 |
|---|---|---|
| R1 | 让 Adapter cleanup 等待；将 close-flow UI 超时缩短为 1ms；关闭返回 failed 后再释放 cleanup；再次发送 | Running / Needs Input 数量已归零，发送仍抛出 `Project 正在关闭`。底层 stopProjectTurns 成功后保留 closing；已超时的调用方不再执行 projectClosed |
| R2 | 秘密问题卡片答复在途；dispose 停止本轮并返回；关闭 SQLite；最后让 Provider 答复完成 | 答复回调仍执行 clearComposer，返回 `Error: database is not open`。同类迟到答复也可能清除下一轮新草稿 |

首次复现命令（本文件组原始断言版本）：

```sh
pnpm --filter @ai-studio/agent-adapter build
pnpm --filter @ai-studio/desktop exec vitest run --root ../.. --config tasks/T20261009-session-slice/evidence/W4-lifecycle.config.ts
```

结果：1 文件，6 项通过；断言中原 R1 预期 send 抛关闭错误，原 R2 预期返回数据库关闭错误。问题先报告主 Agent，获准在 W4 原后端范围修复后才修改实现。当前同名证据测试已改为修复后期望，可重复运行。

## 修复

- R1：`closing` 从布尔集合改为 Project 操作计数。每个 stopProjectTurns 在其真实操作结束的 finally 中释放自身计数；UI 超时不会过早释放正在清理的锁。projectClosed 另持外层计数，覆盖停止到 idle Runtime 释放之间的全部时间；重叠停止操作不会解除其他操作的锁。
- R2：答复前捕获 Runtime 与 generation。答复完成后，只有服务尚未销毁、Runtime/generation/原 turn 仍匹配、未停止且请求确实 answered 时，秘密答复才清理草稿。迟到答复无需接触数据库。
- 正式单测新增关闭超时迟到成功、数据库关闭后秘密答复、原 Runtime 下一轮草稿保护；强化重叠操作与释放 idle Runtime 期间禁止提交。

## 修复后验证

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | 通过，Adapter 与 desktop 全 TypeScript 项目 |
| `pnpm --filter @ai-studio/desktop exec vitest run src/main/services/session src/main/services/project/close-flow.test.ts src/main/shutdown.test.ts` | 4 文件，37 项通过 |
| `pnpm --filter @ai-studio/desktop exec vitest run --root ../.. --config tasks/T20261009-session-slice/evidence/W4-lifecycle.config.ts` | 1 文件，6 项通过 |

确认行为：关闭确认前无 Stop；仅停止目标 Project；Runtime 释放完成后才能关闭；idle 关闭无需确认并保留 transcript；重开沿原 native ID 恢复；显式 Stop 失败返回 failed、记录一次 Error、可重试；重复 will-quit 不绕过清理，SQLite 仅在 feature 清理后关闭一次。

## 清理等待的边界

- close-flow 的 10s 是界面等待期限；它不会强行终止底层清理。R1 修复保证期限之后的真实结果能释放操作锁。
- SessionService 的 dispose 没有额外统一总 deadline，等待 Provider 的有界操作结束。当前 Adapter 默认 startup 30s、request 60s；Stop interrupt 10s、terminal 15s、cleanup 10s、recovery 60s；Controller dispose 20s。应按实际顺序累计，不能宣称整个应用固定 10s / 20s 内退出。
- 主 shutdown handler 等待 feature dispose 后关闭 SQLite；在途异步秘密答复由 R2 的身份检查阻止迟到写入。
- Adapter 的 `dispose(): Promise<void>` 为不抛错误契约，Controller 会把 driver.dispose 失败/超时转为 diagnostic；Codex / Claude idle disposal 也可能只报告未确认退出。当前接口无法让 Session Manager 将“idle 资源释放完成”提升为“操作系统确认零存活进程”。本次仅验证模拟资源释放时序；未运行真实 CLI 进程清理，未扩大配额验证范围。该边界已报告主 Agent。
