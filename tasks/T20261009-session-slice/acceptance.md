# 验收：T20261009-session-slice

> 写入者：W6，未参与实现。日期：2026-10-09。状态：最终独立验收记录，待人工签收；不据此标记 task 为 done。

## 结论与范围

**部分通过：实现与本地模拟自动化通过，task 要求的真实 CLI AC-02～AC-05 未运行，不能认定完整 AC 通过。** 独立发现的实现缺陷均已修复并复验，目前没有剩余已复现的本地自动化阻断。

- 独立 `foundation-verification` worktree；最终代码基线 `188bd1d`，随后合入仅文档与证据变更的 `e8c4812`。没有修改实现、spec、task 或 plan。
- Session 测试使用模拟 Provider，Electron、IPC、SQLite、原生窗口为真实实现；没有新增模型调用。实际 CLI 的历史证据与限制以 [Adapter acceptance](../T20261009-agent-adapter/acceptance.md) 为准。
- 阅读实现与断言、控制异步顺序的独立探针、独立运行门禁和逐张目视检查截图共同作为证据；实现 worker 的报告不替代独立复跑。

## 最终门禁

| 验证 | 结果 | 证据 |
|---|---|---|
| 全 workspace 类型检查 | 通过 | [W6-typecheck.log](evidence/W6-typecheck.log) |
| 全 workspace 单测 | Adapter 181、desktop 130 通过 | [W6-unit.log](evidence/W6-unit.log) |
| Adapter / desktop build | 通过；最终完整 E2E 也重新构建 | [Adapter build](evidence/W6-adapter-build.log)、[desktop build](evidence/W6-build.log) |
| 完整 Electron 门禁 | 19/19（app 6、Project 3、Session 10）通过，32.0s | [W6-final-e2e-fixed.log](evidence/W6-final-e2e-fixed.log) |
| W6 原生窗口与 2,000 History 补充 | 2/2 通过，9.6s | [W6-e2e-final-supplement.log](evidence/W6-e2e-final-supplement.log)、[脚本](evidence/W6-session.spec.ts) |
| W6 跨 Project 注意力与关闭补充 | 1/1 通过，2.5s | [W6-attention-close-e2e.log](evidence/W6-attention-close-e2e.log) |
| W6 response / 关闭 / 持久化窄测 | renderer 2/2、backend 3/3 通过 | [renderer](evidence/W6-renderer-fixed.log)、[backend](evidence/W6-backend-close-fixed.log)、[SQLite 结果](evidence/W6-backend-results.json) |

app 冒烟含真实 Electron 主进程 SQLite、node-pty、登录 Shell 环境；安全用例含 Renderer 无 Node / 原始 IPC、可信 Preload API、外源导航与新窗口拒绝。此处没有重新打包或启动最终打包产物。

## 按 task 标准验收

来源为 [task](task.md)、[05 AC](<../../docs/05. Acceptance Criteria.md>)、[session](../../specs/session/spec.md)、[chat](../../specs/chat/spec.md)、[input](../../specs/input/spec.md)、[navigation](../../specs/navigation/spec.md) 与 [Shell §5/6](../../design/components/shell-spec-v01.md)。下表“模拟通过”不改变真实 AC 的结论。

| 标准 | 来源 | 结论 | 独立证据 |
|---|---|---|---|
| Codex New Chat、Running、历史与流式 Conversation | AC-02；FR-CHAT-001/002、FR-SESSION-001、FR-STATE-001 | 真实未覆盖；模拟通过 | 完整门禁 AC-02；[完成界面](evidence/W6-conversation-stream-completed.png) |
| 同 Project Codex / Claude 并行，切换不打断 | AC-03；FR-SESSION-003、FR-CHAT-003 | 真实未覆盖；模拟通过 | 完整门禁 AC-03 同时 Running、单轮 Stop 隔离；[截图](evidence/W6-parallel-session-stop.png) |
| 后台完成绿色点，打开最新并清除 | AC-04；FR-STATE-004/005、FR-SESSION-001 | 真实未覆盖；模拟通过 | 完整门禁 AC-04；[打开结果](evidence/W6-background-completion-opened.png) |
| 后台 Needs Input，打开直接看到等待内容 | AC-05；FR-STATE-002 | 真实未覆盖；模拟通过 | 完整门禁 AC-05；[审批](evidence/W6-needs-input-approval.png)、[文字答复](evidence/W6-needs-input-text-reply.png) |
| 草稿不是 Session；首条发送才创建；Default CLI、菜单、默认选择、禁用原因 | FR-CHAT-001/002；D-01/11；chat §2 | 通过（模拟） | AC-02、重启 E2E；renderer / 服务单测；W6 SQLite 草稿持久化 |
| 创建后 CLI 锁定；Model 下一轮生效 | FR-CHAT-003、FR-INPUT-002 | 通过（模拟） | 完整门禁 Rename/model/relaunch；[截图](evidence/W6-session-resume-draft-model.png) |
| 五态与查看清除；失焦 / 最小化不算查看；前台返回不清除 | FR-STATE-001～006；session §2.11/3.1；S-Q1 | 通过（模拟及真实窗口） | 状态转移 / IPC 单测；完整门禁 blur；W6 实际 minimize/hide 后未读保留、显式重开清除；[最小化](evidence/W6-unread-minimize.png)、[隐藏](evidence/W6-unread-hide.png) |
| Needs Input 卡片 / 输入框答复；多请求；仅打开不清除 | FR-STATE-002；D-03；I-Q2 | 通过（模拟） | AC-05 与多审批输入框 E2E；服务 / renderer 单测；Adapter 输入竞态独立复核见其 acceptance |
| Error 摘要、详情、重试；原 native ID 重发失败消息；查看清提醒 | FR-STATE-003/005；D-04；S-Q2 | 通过（模拟） | 完整门禁 Error/retry 断言原 ID；[截图](evidence/W6-error-details-retry.png) |
| 打开在底部；流式跟随；上滚停止；回到最新 | FR-SESSION-001；Shell §5 | 通过（模拟） | 完整门禁长 Conversation 滚动；[暂停跟随截图](evidence/W6-conversation-scroll-paused.png) |
| Done / 已停止完成行与时长 | FR-STATE-007；S-Q9 | 通过（模拟） | 创建 / Stop / Project 关闭 E2E；W6 SQLite 保留完成行；服务单测 |
| Stop 只作用于当前轮；关闭目标 Project；保留记录、重开续聊 | FR-INPUT-001、FR-SESSION-003、FR-PROJ-002；04 §4 | 通过（模拟；真实进程边界见 Adapter） | AC-03、idle/running 关闭重开；[idle](evidence/W6-project-reopen-idle.png)、[running](evidence/W6-project-reopen-running.png)；W6 两目标轮次停止而另一 Project 的 Running / native ID 保持 |
| 最近用户消息日期分组 / 倒序；Agent 不改排序；CLI / 单点 / Rename | FR-NAV-003；D-12/P-D；NAV-Q4 | 通过（模拟） | presentation / renderer / 服务单测；重启 Rename E2E；W6 旧 Rename response 竞争探针及离屏 Rename 锚点 |
| 重启摘要 / 对话 / 完成行 / 提醒；原 ID 懒恢复 | FR-SESSION-002；session §2.1/2.14；02 §6 | 通过（模拟） | 重启 / 重开 E2E；W6 真实 SQLite 重开2,000摘要、1,202 transcript，页长≤500，ID 唯一且 sequence 连续；草稿 / 标题 / 未读 / native ID 保留；启动不调用 Provider，下一轮传入原 ID |
| Tab / 折叠点与关闭 / 退出确认使用真实 Session 数据 | D-07/10/14；project-shell 接入 | 通过（模拟；退出编排含单测 / 审查） | W6 聚合 Running=1、Needs Input=1，非当前 Tab / 折叠单点、当前 Tab 无点、关闭计数2、取消 / 确认隔离；[折叠点](evidence/W6-attention-tab-fold.png)、[关闭确认](evidence/W6-close-counts-two.png)；close-flow 单测与主进程退出流程复核 |
| 单 CLI 失败不崩溃，不影响其他 Session / Project | 04 §6 | 通过（模拟 / OS fixture） | 服务隔离单测、Error/retry E2E；Adapter 独立 OS 进程隔离探针；未注入真实 CLI 推理崩溃 |
| 全转移 / 排序 / 草稿单测；模拟 AC-02～05；大量 History | task 最后一项；NAV-Q12 | 通过（上述范围） | 最终门禁；W6 2,000 History 实际 DOM 23行、scrollTop=50,000px、总高64,048px；离屏 Rename 不改锚点；10次 RAF 等待0.5～11.9ms，为单机器观察，非普遍帧率保证 |

本地测试源主要为 `apps/desktop/src/main/services/session/{session-service,session-ipc}.test.ts`、`apps/desktop/src/shared/session/presentation.test.ts`、`apps/desktop/src/renderer/src/features/session/session.test.tsx`、`apps/desktop/src/main/services/project/close-flow.test.ts` 与 `apps/desktop/e2e/session.spec.ts`。状态优先级、全转移、输入提交 / 原生撤回、草稿与排序断言已审查。

## 缺陷闭环与证据区分

| 独立发现 | 修复 | 修前 / 修后 |
|---|---|---|
| 首条 create 与 Rename 的旧 IPC snapshot 覆盖新终态 | `7a5fb3a` | [两例失败](evidence/W6-renderer-narrow.log) → [同探针2通过](evidence/W6-renderer-fixed.log) |
| Adapter exports 无 CommonJS 条件，Electron main 启动失败 | `234ed32` | [实际启动 stderr](evidence/W6-launch-diagnostic.log) → [四入口 require 成功](evidence/W6-require-exports.log)及最终 Electron 门禁 |
| 关闭超时后迟到 Stop 保留关闭锁；dispose 后迟到私密答复写已关闭数据库 | W4 `a2dd106`，集成为 `e4bd3c4` | [两例失败](evidence/W6-backend-close-before.log) → [同探针3通过](evidence/W6-backend-close-fixed.log) |
| macOS restore 后 Renderer 前台仍为 false，显式点击不清未读 | `36abe65` | [原生与 Renderer 矛盾记录](evidence/W6-focus-diagnostic.log) → [minimize/hide 两路径通过](evidence/W6-e2e-final-supplement.log) |

另保留三种 harness 问题，不归产品缺陷：W6 过早读取目录 bootstrap（[日志](evidence/W6-e2e-fixed.log)）；原 Project E2E 未等待目录打开即切 Tab（[18/19日志](evidence/W6-final-e2e.log)，`188bd1d` 后19/19）；追加检查把 create 时未绑定的 null native ID 当作稍后期望值（[修前](evidence/W6-attention-close-before.log)，等待绑定采样并增加失败清理后1/1）。完整过程见 [W6-review](evidence/W6-review.md)。

截图均来自 W6 独立运行；部分由本次完整套件产生的 `W5-*` 文件改名前缀保存，未使用实现 worker 的历史截图。全部15张已目视检查：无重叠、横向溢出或输入区遮挡。滚动截图顶部正文裁切是所在滚动位置。截图与自动化通过不构成设计确认。

## 未覆盖与签收

- 真实 Codex / Claude UI AC-02～AC-05 均未运行。Claude 历史成功流式 / Resume / 模型切换 / 工具 Stop 受 quota 阻断；登录可用不证明额度可用。Codex 六回合预算已耗尽，修正后的精确 Stop 仅 OS fixture / 模拟通过；安装 `0.162.0` 与历史 / 协议 `0.161.0` 不同，没有当前版本真实兼容证明。详见 [Adapter 边界](../T20261009-agent-adapter/acceptance.md#未覆盖与边界)。
- 最终打包、签名公证、其他平台、宿主异常崩溃、未观察到的脱离后代 / 外部 MCP 进程树未覆盖。Project View / Context 工具的内容实现不在本 task 范围。
- spec 非阻塞推荐依 task 授权实现，仍待确认；未修改任何草稿为已确认。人工签收日期：尚无。真实复测与阶段性验收是否接受由人决定。

## 复跑

仓库根先运行 `pnpm typecheck`、`pnpm test`、`pnpm test:e2e`。独立探针：

```sh
pnpm --dir apps/desktop exec vitest run --config "$PWD/tasks/T20261009-session-slice/evidence/W6-vitest.config.ts" --root "$PWD"
pnpm --dir apps/desktop exec vitest run --config "$PWD/tasks/T20261009-session-slice/evidence/W6-backend.config.ts" --root "$PWD"
pnpm --dir apps/desktop exec playwright test --config "$PWD/tasks/T20261009-session-slice/evidence/W6-playwright.config.ts"
```

最后一条使用前面构建产物；脚本显式注入模拟 Provider，无模型调用。
