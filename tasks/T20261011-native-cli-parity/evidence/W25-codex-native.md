# W25：Codex 原生对话、Stop、模型、并发与进程隔离复验（2026-10-18）

## 基线

- 主分支提交：`88bbe2c`。
- macOS 15.6 arm64，Node 26.10.0。
- 实际 CLI：`codex-cli 0.163.0`；仓库生成协议类型：`0.161.0`。
- Adapter 真实回合使用 `gpt-6-astra`、`high`，所有项目均为系统临时目录，未读取或写入仓库文件。
- 结构化结果见 [W25-codex-native.json](W25-codex-native.json)。

## 结果

| 场景 | 结果 | 关键事实 |
|---|---|---|
| Adapter 六回合综合套件 | 通过 | 目录读取、流式输出、跨 Runtime 原 ID 恢复、同轮拒绝后文字续写、当前命令 Stop、保留此前后台服务、同线程继续和合成进程退出均通过；共 6 回合。 |
| Adapter 两回合 Stop 套件 | 通过 | `stop.status=stopped`、`cleanup=confirmed`；当前命令退出、此前服务保留、同一 Runtime、唯一 interrupted 终态和进程退出均通过。 |
| Adapter 同 Session 第二模型 | 通过 | 目录 8 个模型，默认 `gpt-6.1-sol`；下一轮切换到 `gpt-6-astra`，两轮均 completed，终态报告对应模型，同一 native Session 保持。 |
| 原生并发隔离 | 通过 | 两个不同 Thread / Project 的 `turn/started` 在首个 `turn/completed` 前均出现，两个回合分别完成。 |
| 原生中断与崩溃恢复 | 通过 | 中断后同 Thread 继续；杀掉一个 Runtime 后另一 Runtime 仍健康，原 Thread ID 可恢复并继续。 |

## 结论

本轮 Main Agent 技术复验补齐了当前 V1 Codex 范围内的真实 Stop、第二模型、并发隔离、Runtime 崩溃恢复和进程清理证据。它更新了真实版本和方法子集的当前事实，不把 `0.163.0` 结果外推为完整 `0.161.0` 协议兼容，也不把 Codex 结果扩展到 Claude Code。

## 保留边界

- 生成协议仍锁定 `0.161.0`；未执行的方法、全部原生配置 / 工具面以及其他 CLI 版本兼容性仍待单独核对。
- 从未被快照观察到的脱离后代、外部 MCP 进程树和宿主异常崩溃后的清理不在证明范围内。
- 本轮一次默认 integration 命令也尝试了 Claude Code；因 `auth_required / oauth_org_not_allowed` 阻断，按 DEC-16 不计入当前 V1，也未重试。
- 该记录是 Main Agent 技术复验，不替代独立 AI 验收、人工产品验收或最终打包验证。
