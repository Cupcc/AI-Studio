---
id: T20261113-four-column-layout
status: done
next: none
waiting:
paths:
  - apps/desktop/src/shared/project/**
  - apps/desktop/src/renderer/src/app/**
  - apps/desktop/src/renderer/src/features/project/**
  - apps/desktop/src/renderer/src/features/tools/**
  - apps/desktop/src/renderer/src/features/workbench/**
  - apps/desktop/src/main/services/browser/index.ts
  - apps/desktop/src/main/services/project/**
  - apps/desktop/e2e/**
  - apps/desktop/README.md
  - docs/03. UX Specification.md
  - docs/07. Decisions.md
  - specs/project/spec.md
  - specs/navigation/spec.md
  - specs/project-view/spec.md
  - specs/workbench/spec.md
  - design/components/shell-spec-v02.md
evidence: 受影响的单元测试与 E2E 在本机 VM CI 通过；VM 界面检查在 1024 / 1280 / 1440 宽度下截图核对四列、自动折叠导航与工具栏浮层
risk: normal
fr: [FR-VIEW-005, FR-PROJ-003, FR-TOOL-001]
ac: [AC-06]
specs: [specs/project/spec.md, specs/project-view/spec.md, specs/navigation/spec.md]
created: 2026-11-13
---

# 工作台与右侧工具栏分列

## 收尾（2026-11-13）

- 复核：Main Agent 自检后集成。按 [Task Protocol](../../../../tasks/README.md#验收范围与独立性)，本次是一般界面改动，不涉及数据删除、权限或进程隔离，不安排独立评审；`ui_state` 只新增一个带默认值的字段，旧字段读取时忽略。
- 自动化：桌面类型检查；`shared/project`、project、tools、input、workbench、session 及主进程 project / browser 的单元测试通过。改动的 9 个 E2E spec 在本机 VM 首轮运行 1794547090889 中只有 `runtime-tools.spec.ts` 两项失败，原因是 1280 宽打开工具后导航按新规则折叠、用例仍去点导航按钮；改为较宽窗口启动。affected 运行 1794547820463 在 1440 下又有一项失败：工具栏按压缩顺序变为 344，颜色探针那一行折行；改为 1600 启动，工具栏保持默认 400。最终通过的运行编号记在集成提交的 `CI-Run`。
- AI 界面检查：VM 中模拟 Provider、开发构建，用 `open-project` 注入目录选择结果，宽度由 agent-browser 的 `set viewport` 模拟。逐项核对 1440 四列（导航 248、Chat 440、工作台 400、工具栏 344）、1280 导航自动折叠、1024 工具栏浮层、窄窗口手动展开导航后浮层保留、关闭工具栏后导航恢复、关闭与重新打开工作台、文件内容占用工作台位置、切到对话模式工具栏保持。截图见 [evidence/](evidence/)。检查中发现从导航切回工作台时打开的文件仍盖住工作台，已修复并补单测与 E2E 断言。
- 未覆盖：真实 CLI 链路不受影响，未运行；深色与纯色外观只由 alignment E2E 覆盖布局，未逐一截图；真实窗口拖拽缩放未在界面检查中操作（E2E 用 `setContentSize` 覆盖）。
- 人工功能验收：待用户在 dev 体验，体验步骤见集成提交。本条不代表已验收。

## 目标

用户 2026-11-13 提出并确认：工作台模式下，右侧工具栏不再与工作台共用右侧区域，改为“导航 | Chat | 工作台 | 工具栏”四列。工具栏在两种模式下同宽、同位置，避免工具占满工作台宽度而过宽；工作台关闭时，空间交给 Chat。决定见 [DEC-33](<../../../../docs/07. Decisions.md#dec-33-工作台与右侧工具栏分列>)。

## 范围

- 做：
  - 状态：工具栏的开关、当前工具与宽度在两种模式间共用一份（按 Project 保存）；新增工作台列的开关，从导航进入工作台时打开。
  - 布局：工作台列独立，带自己的标题栏与关闭按钮；Chat 顶栏提供工作台开关；工作台关闭时 Chat 按对话模式铺开。
  - 空间不足：依次压缩工作台、工具栏、Chat 到最小，再自动折叠左侧导航，仍不足时工具栏以浮层盖在工作台上。
  - Files 查看文件时，文件内容列在工作台模式下临时占用工作台的位置。
  - 同步规格、设计组件说明与决定记录；更新受影响的单元测试与 E2E。
- 不做：
  - 不改工具本身的内容与资源生命周期，不改工作台页面、SDK 与 IPC 契约。
  - 不改从导航再次点击当前工作台的行为（NAV-Q5 仍为忽略）。

## 依据

- 用户 2026-11-13 对话：提出四列方案；确认列顺序、窄窗口处理、文件内容列、工作台可单独关闭、工具栏状态两种模式共用；补充“过窄时左侧可以自动折叠”。
- 取代 P-B（[03 第 5 节](<../../../../docs/03. UX Specification.md#5-context-panel-交互模型>)）、PROJ-Q3（[project spec](../../../../specs/project/spec.md)）以及 Shell Spec v02 §2.3 “不因空间不足自动折叠左侧导航”。
- AC-06：从导航打开工作台即看到页面，仍然成立。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 四列（DEC-33） | 1440 宽，导航展开，打开工作台后点顶栏右侧边栏按钮 | 导航、Chat、工作台、工具栏并列；工具栏宽度与对话模式相同（默认 400） | E2E + VM 界面检查截图 |
| 工具栏共用状态（DEC-33） | 对话模式打开 Terminal，再从导航进入工作台 | 工作台与 Terminal 同时显示；关闭工具栏不影响工作台 | 单元测试 + E2E |
| 工作台开关（DEC-33） | 工作台标题栏点关闭；再点 Chat 顶栏的工作台按钮 | 关闭后 Chat 占满，正文最大 720 居中；再次打开恢复原宽度 | E2E + VM 界面检查 |
| 进入工作台（AC-06） | 工作台关闭后，从导航进入另一个工作台 | 工作台列重新打开并显示页面 | 单元测试 + E2E |
| 自动折叠导航（DEC-33） | 1280 宽，工作台模式打开工具栏 | 导航自动折叠，顶栏显示展开按钮与新对话按钮；关闭工具栏或窗口变宽后导航恢复；保存的折叠偏好不变 | 单元测试 + VM 界面检查 |
| 浮层（DEC-33） | 1024 宽，工作台模式打开工具栏 | 导航自动折叠，工具栏浮在工作台右侧，Chat 与工作台不低于最小宽度，无横向滚动 | VM 界面检查 |
| 文件内容列（DEC-33） | 工作台模式打开 Files 并点击文件 | 文件内容占用工作台位置；关闭文件后工作台回来 | E2E |
| 重启恢复（D-15） | 设置工作台关闭、工具栏打开后重启 | 状态按 Project 恢复 | E2E |

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 是否把右侧工具栏与工作台分成四列 | 是；列顺序为导航 \| Chat \| 工作台 \| 工具栏（2026-11-13） |
| 窄窗口怎么办 | 先压缩各列到最小；过窄时左侧导航可以自动折叠；仍不足时工具栏浮层（2026-11-13） |
| Files 文件内容列放在哪 | 工作台模式下临时占用工作台的位置（2026-11-13） |
| 工作台能否单独关闭 | 能，关闭后空间给 Chat（2026-11-13） |
| 工具栏状态是否两种模式共用 | 是，取代 PROJ-Q3（2026-11-13） |
| Browser、Diff 在工作台模式下最宽 560 的代价 | 接受；用户说明日常打开工作台时一般收起右侧，需要时才展开（2026-11-13） |

## 技术决定

AI 在授权范围内的决定（2026-11-13）：

- 压缩顺序中工具栏排在工作台之后、Chat 之前，沿用原 Shell §2.3“先压右侧再压 Conversation”的次序。
- `ui_state` 的 `schemaVersion` 不变：新增 `workbench_open`（默认打开），旧版本的 `view_right_area` 读取时忽略，其余保存的状态照常恢复；不算数据迁移。
- 导航自动折叠是 Renderer 的临时状态（`navSpaceShort`、`navKeptOpen`），不写入窗口级 `navCollapsed`。折叠期间用户点展开即保持展开，直到空间恢复或用户再折叠；此时工具栏浮层。
- 工作台列关闭只改变布局：对话仍是该工作台的对话，发送时的工作台上下文规则不变。
- 文件内容列打开时工作台页面用 CSS 隐藏而不卸载，关闭文件后页面状态保留；此时工具栏不浮起，三列共同压缩。宽度计算把文件内容列当作工作台，同样保留 400 最小宽度。
- 进入工作台（导航或“在工作台中打开”）时收起文件内容、保留文件标签，让工作台显示在前，满足 AC-06“打开即看到页面”；在同一工作台内切换对话不收起。由 VM 界面检查发现（切回工作台时文件仍盖住工作台）。
- 工作台列标题栏去掉工具切换组；“更多操作”之后是“关闭工作台”×。Chat 顶栏的“工作台”按钮常驻，按下状态表示工作台打开。
- 浮层工具栏使用弹层的磨砂底色与阴影；毛玻璃下普通面板是透明的，浮起时必须有底色。
- E2E 新增 `showTool` 辅助函数：工具栏关闭时先点顶栏“右侧边栏”，再点工具图标，与用户操作一致。

## 文档同步

已核对并更新：03 第 3、5、6 节与第 10 节 P-B；07 新增 DEC-33；Shell Spec v02 第 1、2.2、2.3、8、9、12 节；project spec PROJ-Q3、3.4、4.2、4.3、5.5；navigation spec 3.2.2、3.4、5.4 与名称对照；project-view spec 第 2 节与 FR-VIEW-005；workbench spec §9.7 与选品页面的窄宽度说明；桌面端 README 第 6 节。

保留不改：02 FR-VIEW-005（左 Conversation、右 Preview 仍成立）与 Context Panel 操作原则；05 AC-06 / AC-07；07 DEC-30 的原文（决定记录保留原结论）；工具规格（只链接 UX 第 5 节）；线框图与原型的历史版本。
