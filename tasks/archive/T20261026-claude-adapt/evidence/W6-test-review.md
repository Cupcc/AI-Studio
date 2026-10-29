# W6 I-Q2 测试与结果独立复核

- 日期：2026-10-28；验收者：`/root/cli_verify`，未参与生产实现或 W5 的测试修正。
- 方法：独立逐行查看 `provider.integration.test.ts` 最终 diff、W5 调查报告及三份运行日志；未额外发送真实模型请求。
- 基线：`e85d64f` 加该集成测试文件未提交 diff。`apps/` 与 Adapter `src/` 没有本轮修改。

## 语义检查

原场景把新行为指令“回复指定代码”放进拒绝说明；W5 原场景诊断中模型明确描述收到了该说明，但没有回显 marker，同回合已经 completed。该诊断支持测试语义混杂的判断，不能解释 W4 两次未记录终点 pending 状态的历史超时。

最终场景先由人类消息要求被拒后报告原因，拒绝说明只提供唯一原因数据；它仍测试 `replyWithText` 的拒绝 / 传话链路。没有删除或放宽 marker 包含、`disposition: declined`、`input.resolved: declined_with_text`、同回合 `turn.completed: completed`、目标文件不存在等断言；还增加待审批命令必须精确等于 `touch declined-command-ran.txt` 的检查。新增 pending 立即失败保留命令未批准状态，并给出请求类型诊断，不替用户批准。

诊断开关记录事件类型、相对时间、状态和请求种类枚举；没有新增 prompt、工具输入或响应正文输出。未改 SDK、生产协议映射或版本分类。

## 日志核对

| 运行 | 直接观察到的结果 | 适用边界 |
|---|---|---|
| W5 原场景诊断 | 5/6 通过；I-Q2 在 3.637 秒 declined_with_text、11.910 秒 completed，失败于 marker 断言 | 本轮未重现历史超时，不能据此唯一归因 |
| W5 修改后的完整套件 | 6/6 通过，66.65 秒；I-Q2 记录 declined_with_text、completed、agentUsedText | 在随后精确命令断言 / 命令独立行之前的基线 |
| W5 最终 I-Q2 定向 | 1/1 通过、5 跳过，7.13 秒；3.480 秒 declined_with_text、5.547 秒 completed | 覆盖最终 I-Q2 diff；不是最终完整套件重跑 |

结论：测试修正合理，现有证据足以证明上述具体运行通过；生产代码没有本次发现指向的协议映射缺陷。保持 W4 两次历史超时未唯一归因、完整套件与最终定向复验各自基线、2.1.312 未验证的限制，不据此扩大 testedVersions、V1 发布或人工验收结论。
