# 验收：T20261009-project-shell

> 写入者：W3（GPT-6.1 Sol high），未参与实现。验收日期：2026-10-09。状态：待人工签收；不据此标记 task 为 done。

## 结论与复核方式

本 task 壳层范围内的 11 项标准通过。AC-01 的真实 Session / CLI / 工具内容不在本 task 范围，不能由占位页面测试认定完整产品验收通过。

- 基线：`8774bc1`；后续合入 `4e21581`、`4c66414`（Adapter 修复与规格回写，没有改变本次 Project 实现）。工作目录为独立 `foundation-verification` worktree。
- 独立执行 `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`、desktop build；desktop 80 项和 Adapter 175 项单测通过。依赖与锁文件无修改。
- 为遵守证据写入范围，复制现有 `apps/desktop/e2e/{app,project}.spec.ts` 到本 task 的 W3 证据，调整模块 / 应用路径与截图前缀，新增不可读目录检查和布局测量输出。9 项 Electron 测试通过；原生目录选择器替换为指定临时目录，其余路径校验、SQLite、IPC、窗口与 UI 为真实实现。没有调用模型。
- 复核实现、单测断言和新截图，不以 W2 报告作为通过证据。六张图已逐一目视检查：无重叠、横向溢出或标题 / 工具按钮截断；工具与 Conversation 内容仍是明确的占位。

| 验收标准 | 来源 | 结论 | 证据 |
|---|---|---|---|
| 三目录同时打开、Tab 切换；Main Canvas 与右侧状态互不影响 | task 标准 1；AC-01；project §2.2.6 | 通过（View / 草稿；Session 占位的持久化另有单测） | [W3-e2e.log](evidence/W3-e2e.log) 三 Project 用例；`project-service.test.ts` 保存 / 重开三种 canvas；`shell.test.tsx` 三 Project 隔离 |
| 启动页 Tab、最近 Projects、单一 `+` 启动页、最后 Project 关闭后窗口保留、已打开目录转到既有 Tab | task 标准 2；FR-PROJ-001；D-09；PROJ-Q2 | 通过 | [W3-e2e.log](evidence/W3-e2e.log)；[可复跑脚本](evidence/W3-project.spec.ts) |
| 符号链接 / 等价路径不重复，非目录 / 不存在 / 不可读不创建 Project | task 标准 3；project §2.1.3 | 通过 | [W3-e2e.log](evidence/W3-e2e.log) 路径用例含实际 chmod 不可读目录；`project-service.test.ts` 记录数断言与 macOS identity 分支 |
| 重启恢复 Tab 集合 / 顺序 / 当前 Tab、重新打开恢复 canvas / 右侧状态；首次 Overview，目标缺失回落 | task 标准 4；FR-PROJ-003；PROJ-Q1/Q8 | 通过（Session 缺失通过注入接口检验） | [W3-e2e.log](evidence/W3-e2e.log) 真实重启 / 关闭再打开；`shell.test.tsx` 缺失 Session；`rules.test.ts` 未知 View / 损坏状态；`project-service.test.ts` 数据库 reopen |
| Session / View 右侧状态分别保存，last_tool 共享，导航进入 View 显示 Preview | task 标准 5；PROJ-Q3 | 通过 | `rules.test.ts` 模式转换断言；`shell.test.tsx` 与 [W3-e2e.log](evidence/W3-e2e.log) 三 Project 模式 / 工具状态 |
| 非当前 Tab 单一注意力点；Running 不显示；可替换 Session 数据源，更新不改变布局 | task 标准 6；FR-PROJ-002；D-07 | 通过（汇总由 Session 接口负责） | `integration.tsx` / `AttentionDot.tsx` / `TopBar.tsx` 审查；`shell.test.tsx` 非当前点、当前点隐藏与动态更新；[单测记录](../T20261009-agent-adapter/evidence/W4-unit.log) |
| Running / Needs Input 关闭确认；确认才调用停止；失败保持 Tab | task 标准 7；FR-PROJ-002；D-10 | 通过（Session 停止接口为替身） | `close-flow.test.ts` 计数重查、只停目标 Project、失败 / 超时；`shell.test.tsx` 取消、焦点、重试后关闭；[单测记录](../T20261009-agent-adapter/evidence/W4-unit.log) |
| New Chat、五个 Views、Sessions 容器 / 分隔线、当前 View 高亮、折叠入口与点、窗口级跨重启偏好 | task 标准 8；FR-NAV-001/002；D-14 | 通过 | [六张截图](#布局记录)；`shell.test.tsx` 折叠点 / 跨 Project；[W3-e2e.log](evidence/W3-e2e.log) 折叠重启恢复 |
| 区域尺寸 / 范围 / 压缩顺序符合规格，1024 / 1280 / 1440 留证 | task 标准 9；Shell §1.2/1.3 | 通过 | [布局记录](#布局记录)；[W3-e2e.log](evidence/W3-e2e.log) 实测；`rules.test.ts` 560 首选宽压缩后不改保存值 |
| Agent / 后台事件不切换 Workspace 的 Tab、canvas、工具 | task 标准 10；01 §8 原则21/22；project §2.3.1 | 通过（本 task 注意力接口事件） | `shell.test.tsx` attention 更新前后 windowState 不变；`store.ts` / `integration.tsx` 审查；focus 与 userOpenedSession 分离测试 |
| Project 识别、保存 / 恢复、Tab 单测；三 Project / 重启 Playwright | task 标准 11；AC-01 | 通过 | [W3-typecheck.log](evidence/W3-typecheck.log)、[全 workspace 单测](../T20261009-agent-adapter/evidence/W4-unit.log)、[W3-e2e.log](evidence/W3-e2e.log) |

## 布局记录

下面数值为 CSS px。左侧导航均为 248、顶栏为 40、Main Canvas 顶栏为 48；没有自动折叠或关闭区域，workspace scrollWidth 与窗口宽度相等。测试中的用户首选 View Conversation 为 450、Session 边栏为 410，重启保存值保持，不因临时压缩写回。

| 模式 | 窗口 | Conversation 区域 | 右侧区域 | 截图 |
|---|---|---|---|---|
| Project View | 1024×640 | 376 | 400 | [W3-view-1024.png](evidence/W3-view-1024.png) |
| Project View | 1280×800 | 450 | 582 | [W3-view-1280.png](evidence/W3-view-1280.png) |
| Project View | 1440×900 | 450 | 742 | [W3-view-1440.png](evidence/W3-view-1440.png) |
| Session / 草稿 | 1024×640 | 400 | 376 | [W3-session-1024.png](evidence/W3-session-1024.png) |
| Session / 草稿 | 1280×800 | 622 | 410 | [W3-session-1280.png](evidence/W3-session-1280.png) |
| Session / 草稿 | 1440×900 | 782 | 410 | [W3-session-1440.png](evidence/W3-session-1440.png) |

1024 下 View 右侧先到 400，再将 Conversation 压至 376；Session 先将边栏压至 376，使 Conversation 保留 400。Session 正文容器代码限制最大 720，Conversation 区域本身可更宽。

## 未覆盖与边界

- 本次 Project 验收基线未接真实 Session 状态 / History / 草稿 / Conversation 和停止实现。注意力与阻塞 Session 关闭流程只验证接口、UI 和主进程编排；后续集成的优先级汇总、后台 CLI 不受影响及查看清除见 [Session task 验收](../T20261009-session-slice/acceptance.md)。
- Project View Preview 与 Files / Diff / Browser / Terminal 内容为占位；本次验证区域选择、展开、工具与宽度保存。
- macOS 已执行；其他平台、系统 TCC 隐私弹窗、已打开目录运行中卸载 / 移动、宿主异常崩溃不在此验收证据内。
- 视觉参数是中性临时 Token；Shell 尺寸仍继承探索中设计状态，本次通过不构成设计确认。
- PROJ / NAV 未决问题仍按 task 许可采用 spec 推荐；没有将它们改为人工确认。

## 复跑

从仓库根运行 `pnpm --filter @ai-studio/desktop run build`，再运行 `pnpm --dir apps/desktop exec playwright test --config ../../tasks/T20261009-project-shell/evidence/W3-playwright.config.ts`。临时用户数据 / Project 在系统临时目录，测试结束清理。

## 签收

- 状态：待签收。
- 人工确认日期：尚无。
