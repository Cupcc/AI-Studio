# 工作台架构统一计划

## 方案

采用单一 WorkbenchService 与两种内部运行方式。统一目录、定位、快照、IPC、事件、生命周期、上下文和 Renderer store。声明式知识内容与 Web 页面保留各自数据所有者。详细长期契约写入 workbench spec，候选草图保留在本地 `.runtime/unified-workbench/`。

比较过全部迁入 iframe 的方案。该方案还需独立浏览器构建、资源打包、Knowledge 到 SDK 状态投影，并重新验证主题、缩放与 Overview 摘要。选择内部运行方式适配，在同一宿主内保留已验证能力；采纳另一候选显式标注来源及管理类型的设计。两个候选都拒绝只合并导航而保留两套公共宿主。

## 写入分工

| Agent | 独立 worktree | 写入范围 |
|---|---|---|
| Main | unified-workbench | docs/specs/README、scripts、E2E、任务记录及集成 |
| host_flow | unified-workbench-host | desktop shared/main 与对应测试 |
| ui_flow | unified-workbench-ui | desktop renderer 与对应测试 |
| 独立 Review | 只读实现，写 acceptance.md | 独立架构、回归和界面验收 |

三个 worktree 均基于开始时的 main 和主工作区未提交基线。worker 不提交或改动任务记录，Main 按独占路径复制变更并统一验证，只向主工作区回传本任务差异。

## 进度

| 日期 | 阶段 | 结果 |
|---|---|---|
| 2026-11-11 | Ground | 两个只读探索分别追踪宿主与 Renderer，历史检查确认 WB-Q8 是阶段安排；本轮指令解决迁移。 |
| 2026-11-11 | Sketch / Agree | 两个独立候选完成，按所有权、行为、接口、成本和兼容性选用内部运行方式方案。技能默认模型不可用，采用继承模型；未执行跨模型评判。用户未要求实现前检查点，按本轮指令继续。 |
| 2026-11-11 | Implement | 宿主先发布共享契约，Renderer 跟随契约迁移；Main 同步影响映射、E2E 和负责文档。 |
| 2026-11-11 | 集成与自检 | Node/Web/E2E 三项类型检查、72 项脚本与 615 项受影响应用单测通过；当前构建完成。46 个选中 Electron 场景的有效通过结果分批保留，详见 task 与验收。 |
| 2026-11-11 | 焦点问题复核 | 初轮 11 个会话场景受锁屏阻断；用户回复已解锁后补测。最后一个场景显示原生窗口在发送后失焦，后台未读符合规则；相同测试在执行期间不插入其他工具调用后通过，未改焦点逻辑或断言。 |
| 2026-11-11 | 独立验收 | 结构审计与独立单测通过；Review Agent 正在实际 UI 与 Codex 首条上下文验收。 |
| 2026-11-11 | 独立 UI 与真实链路 | Review Agent 通过真实 Electron 操作预设、知识回退、自定义保存、切换、停用、编辑应用、Overview 摘要及重启恢复；两个真实 Codex 首轮分别识别 Architecture 与随手记的已保存笔记。未扩大图片业务或其他 CLI 验收范围。 |
| 2026-11-11 | 收尾 | 独立验收通过，任务 done 并归档；负责文档与最终 diff 复核，回传主工作区且保留原有修改。人工产品验收及文档审阅待用户进行。 |
