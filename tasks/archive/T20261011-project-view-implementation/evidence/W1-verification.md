# W1 final verification — 2026-10-11

基线：`feat/project-view` 的 `810d230` 加本任务实现 diff；macOS arm64，构建后 Electron，模拟 Provider。没有真实模型请求。

## 最终结果

```text
pnpm typecheck && pnpm test
exit 0
Agent Adapter: 15 test files, 181 tests passed
Desktop: 26 test files, 178 tests passed

pnpm --filter @ai-studio/desktop test:e2e
exit 0
28 passed (55.3s)

node .runtime/check-project-view-docs.mjs
7 documents, 114 local links checked; 0 errors

git diff --check
exit 0
```

Electron 包括新 `project-view.spec.ts` 两场景：普通 Session 写文件后自动刷新、last-good、工具稳定、历史入口、Context、重启，以及移除 Context 不初始化辅助文件、View 草稿隔离。其余 26 项覆盖原有原生依赖、安全、Project、Session 和多宽度布局。

## 失败与复测

- 第一轮全套暴露旧 API key 列表和 Architecture/Progress 模糊选择器；更新为新类型化 API 和精确按钮名称，没有削弱沙箱规则。
- 一轮 27/28 失败于旧 Session 前台完成应无未读提醒。临时焦点诊断观察到原生窗口 `blur` / `hide`，而 DOM 仍 `hasFocus=true`；进程检查确认另一 `test-workflow` 工作树同时运行 Playwright Electron。
- 未停止他人进程。待其退出后删除全部临时诊断及焦点 workaround，同一原断言单跑 `1 passed (4.0s)`，再全量 `28 passed (55.3s)`。最终 `e2e/session.spec.ts` 与基线无 diff；没有修改产品已读/未读规则。
- 新 View 移除标签测试先前揭示狭窄 Composer 标签区与模型选择器重叠；CSS 修复后新两场景及独立实际交互通过。Diagram 连线布局经截图检查修正；节点超限不再静默截断。

独立技术与用户入口验证见 [W2 review log](W2-review-log.md)。W1/W2 截图均在本目录，真实 CLI、打包应用和人工产品验收不在本轮通过结论内。
