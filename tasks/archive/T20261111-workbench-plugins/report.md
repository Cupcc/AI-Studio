# 工作台插件机制交付记录

## 当前结果

最小工作台插件机制已完成技术验收，AC-WB-01、02、06、08 的本期分项及55个直接回归场景都有有效通过结果。W3验证真实Codex创建与修改，W5复核输入修复并独立操作当前构建。结论与适用基线由 [acceptance.md](acceptance.md)负责，人工产品验收仍待进行。

入口为 Project 导航的“添加工作台”。可从模板或 AI 对话创建，预览后添加；从实例“编辑工作台”进入独立草稿，预览后应用。页面可保存当前实例 JSON 状态和填写可编辑对话。停用页面保留状态与普通 Session。

实现采用独立 Workbench 服务、固定资源修订、SQLite 草稿/实例状态、`app://workbench` 页面与小型 SDK。应用校验已预览版本，编辑不改变其他实例。详细契约由 [workbench §9](../../../specs/workbench/spec.md#9-fr-wb-001006008-最小插件机制实现契约)维护。

## 验证与边界

- [首轮受影响检查](evidence/W0-affected-check.log)：Node/Web/E2E 类型、脚本71项和桌面609项单测通过。
- [最后构建的插件 Electron 主流程](evidence/W0-workbench-delivery-e2e.log)：3项通过，覆盖模板、状态、停用、重启、编辑、错误恢复与预览后文件变化拒绝应用。
- [修订与竞态回归](evidence/W0-revision-races-check.log)、[宿主修订校验](evidence/W0-revision-host-check.log)：已预览版本校验、页面重新就绪、保存提示和目录刷新修复通过。
- [扩大直接范围回归](evidence/W0-e2e-regression-initial.log)及[针对性复跑](evidence/W0-e2e-recheck.log)：有效结果按同一代码/构建基线复用，不因提交重复全量。
- [原生焦点前置阻断](evidence/W0-native-focus-blocker.txt)是首轮历史记录。解锁后原生断言未变，11条Session用例全部通过，见[补跑](evidence/W0-e2e-unlocked.log)。
- [既有Composer基线失败](evidence/W0-baseline-composer.log)促使本轮修复候选选择后的延迟光标恢复。原E2E断言保持不变，[单项复验](evidence/W0-e2e-caret.log)及[直接影响范围13项](evidence/W0-e2e-caret-regression.log)全部通过；W5另验证当前构建的输入和工作台流程。

真实 Codex 创建、修改与实际 UI 操作由未参与实现的 W3 独立记录。对照来源是固定 Harness 源码与开发规范，不声称两款产品实机逐项比较。打包与发布没有纳入本次构建版机制验证。

## 人工体验入口

在仓库根目录先运行 `pnpm build`，再运行 `pnpm --filter @ai-studio/desktop exec electron . --studio-user-data-dir=/tmp/ai-studio-workbench-review`，使用独立宿主数据目录。打开隔离 Project 后从“添加工作台 → 从简单模板开始”体验预览、保存和添加；真实 AI 创建继续使用用户已有 CLI 连接。完整备份需保留项目中的工作台文件和宿主 SQLite 状态。

五图出图、图片产物绑定与历史、包导入导出、完整管理/删除、安全专项和默认 View 迁移仍属于后续阶段。

## 文档复核

已核对 01/02 的产品范围、03 的交互分期、04 的通用技术边界、05 的机制分项、06 的下一步/整体/模块/阶段/验收状态、DEC-28、09 确认记录及工作台/导航/Session/Input/Project View 接缝。09 按本次明确确认标记为已确认；AI 实现选择写入 spec §9，不将实现或技术验收等同人工产品验收。历史业务候选与既有功能验收基线保持原范围。
