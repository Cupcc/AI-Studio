# 执行计划：T20261023-v06-ui-effort

## 方案

沿用 v06 灰度 / 毛玻璃、IBM Plex Sans / Mono、720px 消息宽度和 32px 控件行。动效集中于 max / ultra 的四格信号，使用 CSS transform / opacity，不添加动画依赖或动画 React 状态。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 主 Agent：Composer、候选、effort 动效与集成 | features/input/、session/store.ts 与相关交互测试、模拟 Provider fixture、专项 E2E、task.md / plan.md | 可运行 UI、验证证据 | — | done |
| W2 | 对话布局与空状态 | 独立 worktree：Conversation.tsx、session.css（不改 Composer 样式段）、alignment.spec.ts；追加 ProjectView.tsx / project-view.css | 底部草稿、精简顶栏、示例及布局回归 | — | done |
| W3 | 对齐授权与设计 / 规格同步 | 主任务 worktree：docs/*.md、design/*.md / components/*.md / prototypes/README.md、specs/*/spec.md；不改代码和任务 | 负责文档同步、保留历史基线 | — | done |
| W4 | 独立代码评审与 Electron 交互验收 | acceptance.md、evidence/W4-*；只读代码 | 独立结论与界面证据 | W1 / W2 集成后 | done |

## 进度与决定

- 2026-10-23：核对仓库规则、v06 与生产差异；已同步 main，创建隔离 worktree。用户本次明确授权对齐 v06，无需再次确认既有居中草稿的替代；原生目录未提供能力时如实显示边界。

- 2026-10-23：W2 对话与 Project View 补丁已集成；W3 完成负责文档及路线图五个状态面的同步。W4 独立评审已报告并复核无障碍当前值、文件上限、候选关闭与旧 View 标签规则修复。
- 2026-10-23：专项与布局 / Session / View 回归首轮 25/26；未读标记断言两次失败，失败瞬间的原生焦点未捕获，原因未确认；W2 旧 Composer 单次通过，临时诊断重建后的本轮代码也单次通过且 native / Renderer viewing 均为 true。未更改未读规则，当时最终重跑待完成。专项已通过四外观、减少动态效果、effort 重启恢复与文件候选异常。

- 2026-10-23：基础检查通过（36 / 257 / 1176）；W4 实际界面发送后，根 Agent 与 W4 交叉核对 native foreground 为 false、document.hasFocus 为 true、系统前台为 loginwindow。当时原生前台完成场景待用户解锁，已异步提出环境恢复请求；不调整产品未读规则。候选面板追加动态高度观察与带空格目录导航边界验证。

- 2026-10-23：最终 Composer / 设置专项 8 / 8；用户回复 continue 后确认 macOS 前台已不再是 loginwindow，开始全量 Electron 回归，W4 等待独立原生前台补验。

- 2026-10-23：全量 Electron 53 / 53 通过。W4 独立原生前台发送复验通过，发送至完成的 70 次系统前台采样均为测试 Electron，完成后无未读点。W3 最终只读语义复核无额外冲突；主 Agent 完成路线图五状态面、View 草稿修订及任务收尾，按协议归档，人工产品验收保持待进行。
