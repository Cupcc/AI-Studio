---
id: T20261114-resizable-columns
status: done
next: none
waiting:
paths:
  - apps/desktop/src/shared/project/**
  - apps/desktop/src/main/ipc/project.ts
  - apps/desktop/src/renderer/src/app/shell.css
  - apps/desktop/src/renderer/src/styles/tokens.css
  - apps/desktop/src/renderer/src/features/project/**
  - apps/desktop/src/renderer/src/features/**/*.test.ts*
  - apps/desktop/e2e/project.spec.ts
  - apps/desktop/e2e/alignment.spec.ts
  - design/components/shell-spec-v02.md
  - docs/07. Decisions.md
  - specs/project/spec.md
  - specs/navigation/spec.md
evidence: 本机 VM CI affected 通过；VM 界面检查用鼠标拖动导航、Chat、工具栏三条分隔线并截图
risk: normal
fr: [FR-PROJ-003]
ac: [AC-01]
specs: [specs/project/spec.md, specs/navigation/spec.md]
created: 2026-11-14
---

# 列宽拖拽对齐 VS Code

## 收尾（2026-11-14）

- 复核：Main Agent 自检后集成。按 [Task Protocol](../../../../tasks/README.md#验收范围与独立性)，本次是一般界面改动，不涉及数据删除、权限或进程隔离，不安排独立评审；`WindowState` 只新增一个可为空的 `navWidth`，旧数据读取为默认值，不算数据迁移。
- 自动化：桌面类型检查；`shared/project`、project、tools、input、session 及主进程 IPC / project 的单元测试通过。本机 VM CI affected 运行 1794621981514（4c719af）失败：CSS 的列最小宽度 Token 仍是旧值，工作台压到 320 时工具栏被挤出窗口；alignment 的文件内容列仍断言旧的 400。修正后 1794622377314（edf234d）通过。集成用的运行编号记在集成提交的 `CI-Run`。
- AI 界面检查：VM 中模拟 Provider、开发构建，用 `open-project` 注入目录选择结果，宽度由 agent-browser 的 `set viewport` 模拟，拖拽用真实鼠标事件（`mouse down / move / up`）。1600 宽四列下：把 Chat 右边缘向右拖 300 并经过工作台 iframe，工作台到 320 后工具栏接着让到 284，拖动中显示 2 宽分隔线；导航右边缘拖到 328；工具栏左边缘拖到 584（超过原上限 560）；双击导航边缘恢复 248；把 Chat 拖过最小值后导航接着让到 200。1280 与 1024 宽导航自动折叠，1024 下工具栏不浮起、无横向滚动；Session Mode 1440 下导航与工具栏边缘可拖。Chat 320、工作台 320、工具栏 284、导航 200 时顶栏与 Composer 均完整。截图见 [evidence/](evidence/)。第一次检查发现上述 Token 问题，修复后重测。
- 未覆盖：真实 CLI 链路不受影响，未运行；深色与纯色外观只由 alignment E2E 覆盖布局；Files 文件内容列打开时的拖拽只由 alignment E2E 的键盘操作覆盖；选品工作台页面在 320 宽下未截图核对（workbench spec 要求窄列时两组悬浮条不重叠）。
- 后续项（非阻断）：`workbench.spec.ts:84` 在 1794622377314 中重试后通过，失败在刚加载的工作台页面上的第一次点击（“增加一次”未计数），与 README 记录的首次点击落到宿主 iframe 的情况一致，该用例未先调用 `hoverInPage`；与本次分隔线无关，另开修复。
- 人工功能验收：待用户在 dev 体验，体验步骤见集成提交。数值（未决问题第 1 条）待用户确认。本条不代表已验收。

## 未决问题

| 问题 | 推荐答案与依据 | 决策方（人 / AI） | 是否阻塞 |
|---|---|---|---|
| 各列拖拽范围取多少 | 导航 200–480；Conversation 列最小 320；工作台列最小 320；右侧边栏最小 280；去掉 560 上限。依据：VS Code 侧栏最小 170、编辑区最小 220，本应用的 Composer 与工具栏顶栏在这些宽度下仍完整 | 人 | 否，先按推荐实现 |
| 拖拽能否把导航或右侧边栏直接拖到收起（VS Code 的 snap） | 本次不做，导航与边栏仍用按钮收起；需要时另开任务 | 人 | 否 |

## 目标

用户 2026-11-14 提出：“fix 窗口左右拖动的问题，现在都固定死了。非常不方便，参考优秀设计，能copy就copy代码。”四列都打开时各列最小值之和接近常见窗口宽度，分隔线只能把相邻一列压到最小，导航也不能拖，所以分隔线几乎拖不动。决定见 [DEC-34](<../../../../docs/07. Decisions.md#dec-34-列宽拖拽对齐-vs-code>)。

## 范围

- 做：
  - 分隔线移植 VS Code `SplitView.resize`：对侧各列由近及远依次让出宽度，剩余宽度的列最先让。
  - 导航右侧边缘可拖拽，宽度为窗口级偏好（`WindowState.navWidth`）。
  - 下调拖拽最小值、去掉固定上限；导航自动折叠仍按 DEC-33 的宽度判断。
  - 分隔线外观与操作按 VS Code sash：8 命中区、悬停 300 ms 显示线、双击复位、拖动时锁定光标并屏蔽 iframe。
  - 同步 Shell Spec v02 §2.2–2.3、project spec 3.4 / 4.2 / 4.3、navigation spec 与决定记录；更新单元测试与 E2E。
- 不做：
  - 不引入 allotment / react-resizable-panels（理由见 DEC-34）。
  - 不做拖到阈值自动收起（snap）。
  - 不改 Files 文件内容列的 CSS 压缩方式。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 推挤（DEC-34） | 1440 宽，工作台与工具栏都打开，向右拖 Chat 右边缘 100 | Chat 550，工作台到 320 后工具栏接着变窄 | 单元测试 + E2E（鼠标拖过工作台 iframe） + VM 界面检查 |
| 导航可拖（DEC-34） | 拖导航右边缘；重启 | 导航宽度跟随并在重启后保持；拖动导航不会触发自动折叠 | 单元测试 + E2E + VM 界面检查 |
| 双击复位与键盘（DEC-34） | 双击分隔线；聚焦后按方向键 | 恢复默认宽度；每次移动 10 | 单元测试 |
| 窗口变窄（DEC-33） | 1024 / 1280 / 1440，工作台模式打开工具栏 | 1280 起导航折叠；1024 各列不低于新最小值且工具栏不浮起 | 单元测试 + alignment / project E2E |
| 重启恢复（D-15） | 拖拽后重启 | Project 级宽度与窗口级导航宽度都恢复 | E2E |

## 技术决定

AI 在授权范围内的决定（2026-11-14）：

- 自动折叠阈值用默认导航宽度 248 与 DEC-33 的折叠宽度（360 + 400 + 320），不用拖拽最小值：窄窗口先收起导航，各列不必压到最小；也不用拖拽后的导航宽度，否则把导航拖宽会让它在拖动中自己折叠。若用导航最小值，纯色外观 1280 宽时导航不再折叠，与 DEC-33 不同。
- 拖拽结束时保存行内所有有宽度的列的当前值（VS Code 也保存实际尺寸），预览与松手后的布局完全一致，不会因某列此前被窗口压缩而在松手时跳动。
- 浮起的右侧边栏不参与推挤，只改变自身宽度。
- 拖动的事件监听挂在 window 上，分隔线在拖动中被卸载时也能结束拖动并清除光标锁定。
