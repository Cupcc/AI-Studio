# 工作台列表管理独立验收

## dev 集成后的验证入口

2026-11-11 用户要求只提交、集成和处理冲突，组合后的界面由用户自行验证。以下独立结论保留原实现基线，不代表当前标准网页包与管理功能组合已获验收。当前入口为主目录 dev 的 `pnpm dev`；人工产品验收已于 2026-11-12 通过，见[集中验收记录](../../.agents/archive/tasks/T20261112-dev-acceptance/task.md)；集成范围见[dev 任务](../../.agents/archive/tasks/T20261111-dev-integration/task.md)。

## 边界与人工验收

- 人工产品验收已于 2026-11-12 通过，见上节。本记录为独立 AI 技术检查，不代替用户体验与文档 diff 审阅。
- 范围为 [workbench §9.8](../../specs/workbench/spec.md#98-fr-wb-001006008-工作台列表管理)，不扩展到跨项目移动、包卸载、永久文件清理或页面内部业务编辑。
- 本轮不修改 CLI 协议；普通会话不误停由模拟 Provider 集成测试检查。没有在本轮重新发送真实模型请求，也没有生成或验收新打包应用。
- 三项首轮发现已独立复验通过。用户同日追加“添加入口位于列表下方、展开不改变既有布局”的要求，等待最终界面版本及串行窗口后继续检查，不能据此关闭任务。

## 验收者与基线

验收者为 `management_review`，未参与产品实现；仅编写本记录及 `evidence/W1-*` 的独立场景和证据。平台为 macOS arm64；源码基线为 `6e89141` 加工作区中上一轮统一宿主及本轮管理改动。最终源文件摘要与构建基线将在界面复验后记录。

## 独立检查进度

| 检查 | 独立操作与结果 | 证据 |
|---|---|---|
| 直接回归 | 独立运行 Workbench、数据库、Renderer 与 Shell 受影响测试，73 项通过 | [局部测试](evidence/W1-independent-tests.log) |
| 旧数据库升级 | 使用不含导航迁移的旧 schema 安装实例并保存状态，再应用新迁移，内容、状态版本与默认目录保持 | [复验日志](evidence/W1-node-recheck.log)、[独立测试](evidence/W1-extra.node.test.ts) |
| 顺序事务失败 | SQLite trigger 注入中途写入失败，移动操作报错且原顺序完整保留 | [复验日志](evidence/W1-node-recheck.log) |
| 新实例追加 | 首轮发现未管理项目中应用草稿会把新实例放到草稿前，已交 Main 修复；独立场景复验通过 | [初轮失败](evidence/W1-extra-node.log)、[复验](evidence/W1-node-recheck.log) |
| 异步选中 | 首轮证明移除响应覆盖较新的用户选择，已交 Main 修复，独立复验通过 | [独立场景](evidence/W1-extra.renderer.test.tsx)、[失败日志](evidence/W1-extra-renderer.log) |
| 键盘焦点 | 首轮证明重命名取消后焦点落到 body，已交 Main 修复，独立复验通过 | [失败日志](evidence/W1-extra-renderer.log) |
| 修复复验 | 独立额外测试 5/5 通过，覆盖追加顺序、升级、回滚、较新选中及取消后的焦点 | [最终额外场景](evidence/W1-final-extra.log) |
| 实际界面 | 待最终底部添加浮层版本及 Main 释放窗口后独立执行 | 待补 |

独立测试配置为 [W1-review.config.ts](evidence/W1-review.config.ts)。原始失败日志保留当时结果，不因后续修复改写为通过。
