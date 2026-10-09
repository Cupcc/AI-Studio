# 验收：T20261009-session-slice

> 写入者：W6，未参与实现。日期：2026-10-09。状态：独立验收进行中，待最终集成与人工签收；不据此标记 task 为 done。

## 当前结论

独立持久化 / 分页窄测试通过；发现首条消息创建与 Rename 的旧 IPC 返回覆盖新终态两项问题，等待实现修复。W5 最终提交尚未返回，按主代理指示未对中间版本运行完整门禁 / Electron 模拟 Provider 场景，因此目前不能宣称本 task 验收通过。

- 已检查基线：`c1c0fa9`（合入 `c44d840` 与 `004703e`）。独立 `foundation-verification` worktree。
- 没有新增真实 CLI / 模型调用。Adapter 的真实验证结论与配额 / 调用预算限制见 [Adapter acceptance](../T20261009-agent-adapter/acceptance.md)。这些证据不能代替本 task 的真实 UI 场景。
- 复核过程、问题复现、代码边界与待运行用例见 [W6-review.md](evidence/W6-review.md)。

## 验收标准

| 标准 | 来源 | 当前结论 | 证据 / 后续 |
|---|---|---|---|
| Codex New Chat 创建、Running 与流式 Conversation | AC-02；task 真实场景 1 | 真实 UI 场景未运行；存在 create 状态竞争，待修复 | [失败窄测试](evidence/W6-renderer-narrow.log)；[测试源](evidence/W6-renderer.test.ts)；后续模拟 / 真实分别记录 |
| Codex / Claude 同 Project 并行，切换不打断 | AC-03；task 真实场景 2 | 待最终模拟 E2E；真实场景未运行 | Adapter 层隔离证据见 Adapter acceptance，不能认定完整 UI AC 通过 |
| 后台完成绿色点，显式打开显示最新且清除 | AC-04；FR-STATE-005；S-Q1 | 待最终模拟 E2E；真实场景未运行 | [已备窗口补充用例](evidence/W6-session.spec.ts)，尚未运行 |
| 后台等待输入、点开直接看到等待内容 | AC-05；FR-STATE-002 | 待最终模拟 E2E；真实场景未运行 | 需按下列 Needs Input 细则验证 |
| 草稿不是 Session、首条发送才创建、Default CLI / 菜单 / 不可用原因 | FR-CHAT-001/002；D-01/D-11；chat spec | 草稿磁盘保存窄测通过；完整 UI 待验 | [持久化测试](evidence/W6-backend.test.ts)、[结果](evidence/W6-backend-results.json) |
| CLI 锁定与下一轮 Model Selector | FR-CHAT-003；FR-INPUT-002 | 待最终门禁与模拟 E2E | 实现 / 现有单测已读，尚未独立全套运行 |
| 五态、查看清除、失焦 / 最小化、前台返回不清除 | FR-STATE-001～006；session §2.11/3.1；S-Q1 | 等待 create / Rename 状态竞争修复；真实窗口补充待跑 | [窄测失败](evidence/W6-renderer-narrow.log)、[补充脚本](evidence/W6-session.spec.ts) |
| Needs Input 卡片 / 输入框答复，多请求；打开不清除 | FR-STATE-002；D-03；I-Q2 | 待最终门禁与模拟 E2E | 含 `004703e` 提交接受 / 同步终态顺序修复，尚未独立完整执行 |
| Error 摘要 / 详情 / 重试；同 native ID 重发失败原消息 | FR-STATE-003；D-04；S-Q2 | native ID 磁盘继续窄测通过；错误重试 UI 待验 | [持久化日志](evidence/W6-backend-narrow.log)；原生 Provider 真实限制见 Adapter acceptance |
| 打开直接底部、流式跟随、向上停跟随、回到最新 | FR-SESSION-001；Shell §5 | 待 W5 最终滚动修复与模拟 E2E | 当前提交尚不能用于最终结论 |
| Done / 已停止完成行与时长 | FR-STATE-007；S-Q9 | Done 行持久化窄测通过；界面 / Stop 待验 | [持久化结果](evidence/W6-backend-results.json) |
| 单轮 Stop 隔离、关闭目标 Project 停止、重开保留对话 | FR-INPUT-001；FR-SESSION-003；FR-PROJ-002 | 待最终集成门禁 / 模拟 E2E | 历史 Adapter Stop fixture 独立证明仅覆盖 Adapter 层 |
| 最近用户消息日期 / 倒序、Agent 不改变排序、CLI / 单个点 / Rename | FR-NAV-003；D-12/P-D；NAV-Q4 | 磁盘标题 / 排序窄测通过；Rename response 竞争待修复；UI 待验 | [backend 窄测](evidence/W6-backend-narrow.log)、[renderer 窄测](evidence/W6-renderer-narrow.log) |
| 重启摘要 / 消息 / 完成行 / 提醒、原 native ID 懒恢复 | session §2.1/2.14；02 §6 | **独立窄测通过（模拟 Provider）**；完整 Electron 重启待验 | [测试源](evidence/W6-backend.test.ts)、[日志](evidence/W6-backend-narrow.log)、[结果 JSON](evidence/W6-backend-results.json) |
| Tab / 折叠按钮点、关闭 / 退出确认使用真实 Session 数据 | D-07/D-10/D-14；project-shell 接入 | 待最终集成 E2E | 历史 Project acceptance 的 Session 接口替身证据不代表此次集成通过 |
| 单 CLI 崩溃隔离、不影响其他 Session / Project | 04 §6 稳定性 | 待最终独立门禁 / 模拟场景 | 已审查退出归一化路径，尚未完成集成验证 |
| 全转移 / 分组 / 草稿单测；模拟 Provider AC-02～AC-05 E2E；大量历史 | task 最后一项；NAV-Q12 | 2,000 摘要磁盘恢复与 1,202 transcript 分页独立通过；完整门禁 / 实际 DOM 待验 | [结果 JSON](evidence/W6-backend-results.json)、[已备 Electron 2,000 历史用例](evidence/W6-session.spec.ts) |

## 未完成与限制

- 等 W5 最终提交及两项 renderer 竞争修复后，合入并独立执行 typecheck、workspace 单测、desktop build、模拟 Provider Electron AC-02～AC-05 与 W6 补充用例，逐张目视检查截图。
- 当前 W6 Electron 脚本尚未运行，不能以脚本内容认定场景通过，也没有尚未生成的截图链接。
- 真实 Codex / Claude UI AC 尚未运行；Claude 成功流与恢复等受既有配额限制，修正后的真实 Codex 精确 Stop 尚未重验；版本与证据范围以 Adapter acceptance 为准。
- 未决非阻塞产品问题仍按 task 授权使用 spec 推荐，没有把草稿改成确认。

## 复跑窄测试

从仓库根执行：

```sh
pnpm --dir apps/desktop exec vitest run --config "$PWD/tasks/T20261009-session-slice/evidence/W6-vitest.config.ts" --root "$PWD"
pnpm --dir apps/desktop exec vitest run --config "$PWD/tasks/T20261009-session-slice/evidence/W6-backend.config.ts" --root "$PWD"
```

完整 Electron 补充用例需先 build，再以绝对路径运行 `W6-playwright.config.ts`。启动参数固定注入模拟 Provider，不调用模型。

## 签收

- 状态：尚未完成最终独立验收；待人工签收。
- 人工确认日期：尚无。
