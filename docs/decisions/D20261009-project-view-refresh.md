# D20261009 Project View 数据刷新与权限边界

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 日期 | 2026-10-09 |
| 关联 | FR-VIEW-003、FR-VIEW-004、FR-VIEW-006、FR-SESSION-003；UX 第 6 节“Project View 空状态与更新”、D-06；Shell Spec v01 第 7 节；AC-06、AC-07；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2、4 节与第 7 节第 7、11 项；[T20261009-project-view](../../tasks/T20261009-project-view/task.md) |
| 取代 | — |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。本草稿未经人确认，不得作为实现依据。

## 背景

04 第 7 节第 11 项要求确定 Project View 数据的自动更新时机及权限边界。已确认的行为约束：

- Project Knowledge 尚未生成时不自动启动生成，Preview 显示空状态和“生成 <View>”入口，由用户在普通 CLI Session 中发送（FR-VIEW-003；D-06）。
- Preview 只读；Agent 更新 Knowledge 或 View 后自动刷新并显示“已更新”时间，刷新不改变 Workspace 布局；渲染失败时保留上一次成功渲染并显示错误提示（UX 第 6 节；D-06）。
- Project View 里的对话是普通 CLI Session，不得有隐藏的聊天系统（FR-VIEW-006）；AI 不主动改变 Workspace 布局（原则 22；AC-07）。
- Overview 的 Recent Sessions、Needs Input、Recently Completed 来自客户端 Session 数据，Knowledge 为空时也直接显示（UX 第 6 节）。
- 多个 Session 可并行并共享目录（FR-SESSION-003）；同文件冲突检测是 04 第 7 节第 7 项的独立待决事项。

存储位置和格式见 [D20261009-project-knowledge-storage](D20261009-project-knowledge-storage.md)，渲染与沙箱见 [D20261009-project-view-rendering](D20261009-project-view-rendering.md)，注入见 [D20261009-project-view-context](D20261009-project-view-context.md)。

## 决定

1. **写入者与边界**。`.ai-studio/` 内各文件的写入者见 [D20261009-project-knowledge-storage](D20261009-project-knowledge-storage.md) 决定第 2 项：Knowledge 与 View Definition 只由 Agent（在用户发起的普通 Session 中，经 CLI 文件工具）或用户手工写入，客户端只写自有的指南、Schema 与 `.gitignore`。其余边界：

   | 对象 | 写入者 / 规则 |
   |---|---|
   | Session、`origin_view_id`、未读与 Needs Input 状态、View 缓存、UI 状态 | 客户端（SQLite），不写入项目目录 |
   | Overview 的 Recent Sessions、Needs Input、Recently Completed | 客户端渲染，数据取自 Session 记录；不属于 Knowledge 或 View Definition，Agent 不可读写（见渲染决定第一层第 8 项） |
   | Preview | 只读：无写文件、无新建 Session、无调用主进程的能力；唯一的外向动作是点击链接，经主进程校验 `http(s)` 后交给系统浏览器 |

2. **客户端从不自行触发 AI 生成**：不建后台 Session，不自动发起回合。Knowledge 为空、过期或校验失败时，客户端只显示状态；“生成 <View>”只是把可编辑文本填入输入框，由用户发送。文档未定义“知识过期”提示，V1 不增加。
3. **读取范围与安全**：客户端只读取 `<Project>/.ai-studio/knowledge` 与 `views`。读取前对路径做 `realpath` 校验，必须仍在项目目录内（Agent 可以创建指向项目外的符号链接）；限制单文件大小与文件数量；超限视为校验失败。
4. **刷新触发**（任一触发都走同一条读取—校验—提交管线，结果以内容哈希去重）：
   1. 打开 Project（以及恢复 Project Tab）时扫描一次；
   2. Project 打开期间监视 `.ai-studio/`（`fs.watch` 或同类，去抖约 300 ms；目录晚于监视创建时，监视项目根的该目录出现）；
   3. 该 Project 的任一 Session 回合结束时补扫一次；
   4. 窗口重新获得焦点时补扫一次（`git checkout` / `git clean` 批量改动、睡眠唤醒可能丢失监视事件）。

   监视在 Project 打开期间运行，不限于 Preview 当前可见；渲染只在 Preview 可见时进行。
5. **校验与提交**：`JSON.parse` → 应用内置 Schema（不使用项目内副本）→ 跨文件绑定检查 → 通过则提交为新版本，更新缓存，向 Renderer 推送，“已更新”时间取参与文件中最新的修改时间。校验失败：保留上一次成功版本（内存与 SQLite 缓存），Preview 顶部显示错误条，列出出错的文件、JSON 路径与原因，不弹窗、不切换界面。Schema 版本高于本应用支持的版本时，提示需要更新应用，同样保留上一版，不改文件。
6. **多步更新的抖动处理**：文件工具不是原子写入，一次回合中 Agent 通常先后改 Knowledge 与 View Definition，中间状态会暂时不一致。规则：有效更新立即应用；错误提示延后展示，直到该 Project 没有 Running Session，或文件内容稳定超过约 1.5 秒。
7. **刷新不改变布局**：更新到达时，如果右侧区域当前显示的是 Files / Diff / Browser / Terminal，不切回 Preview（P-B；AC-07）；只更新数据和时间戳。
8. **并发编辑**：每个 View 一个文件缩小冲突面；Agent 指南要求编辑前重读、局部修改、只改自己负责的文件；客户端不加锁、不合并（Agent 的文件工具绕过客户端）。覆盖写入造成的丢失由 04 第 7 节第 7 项的总体方案处理；上一次成功版本的缓存保证 Preview 不因某一次错误写入而空白。
9. **最小权限汇总**：Renderer 保持 `sandbox`、`contextIsolation`，不接收 Node 能力；Preview 的数据来自主进程的单向推送；Agent 内容中不含可执行代码（第一层）或被隔离执行（第二层，见渲染决定）；客户端不扩大用户 Session 的沙箱或审批设置。

## 备选方案

| 方案 | 放弃原因 |
|---|---|
| Knowledge 为空或过期时，客户端自动启动隐藏 Session 生成 | 违反 FR-VIEW-003（不自动生成）、FR-VIEW-006（不得有隐藏聊天系统）与 D-06 |
| 只在回合结束时刷新 | FR-VIEW-005 的设计目的是“一边描述修改需求，一边观察 View 更新”，要求中途可见；回合结束仅作补扫 |
| 定时轮询 | 空转开销和延迟都高于监视 + 补扫 |
| 只依赖监视事件，不补扫 | 批量文件操作、睡眠唤醒会丢事件 |
| 客户端对 Knowledge 加锁、串行化，或自研写入工具 | Agent 用自己的文件工具写入，绕过锁；自研工具违背原则 19、20 |
| 客户端自动修复、规范化或迁移 JSON | 与 Agent 并发写同一文件会互相覆盖；改动用户可见文件需要先确认 |
| 校验失败时渲染能解析的部分 | 呈现与 Knowledge 不一致的半成品；D-06 要求保留上一次成功渲染 |
| 让 Preview 回调主进程执行动作（打开文件、新建对话、切换工具） | 扩大 IPC 攻击面，也可能被数据驱动改变布局；V1 只允许点击链接 |
| 把 Session 数据交给 View Definition 绑定，由 Agent 摆放 | Session 标题可能含敏感信息，会进入由 Agent 控制的渲染层；Overview 三块保持客户端固定区域 |

## 影响

- T20261009-app-skeleton：主进程需要项目内目录监视、哈希去重和 SQLite 缓存表；IPC 增加 `projectView` 的单向推送通道，并校验 `senderFrame`。
- T20261009-session-slice：向 View 刷新管线发出“回合结束”事件，并读出“该 Project 是否有 Running Session”。
- T20261009-project-shell：Preview 容器接收更新时不改变右侧当前内容；错误条与时间戳的位置按 Shell Spec v01 第 7 节。
- 后续 `specs/project-view/spec.md`：错误信息格式、去抖参数、上限数值、监视实现选型。
- 用户在应用之外用 CLI 修改 `.ai-studio/` 时，同样会触发刷新，这是预期行为。

## 未决问题

| 问题 | 推荐 |
|---|---|
| 是否需要“知识可能已过期”的提示 | 不需要；文档没有定义，也会诱导自动化。若人要求，需先作为新需求写入 FR |
| 错误提示延后展示的参数（约 1.5 秒与 Running 判定）是否合适 | 先采用，用真实多步更新的 Session 在原型中校准 |
| 校验失败后是否提供“让 Agent 修复”的快捷入口 | 暂不提供（文档未定义）；若提供，只能像“生成”入口一样填入输入框、由用户发送 |
| 用户手工编辑文件也算“用户更新”（04 第 5 节）是否足够 | 足够：V1 的 Preview 只读，用户修改走对话或直接编辑文件 |

## 依据

- 需求与界面：FR-VIEW-003～006、FR-SESSION-003；[03. UX Specification](<../03. UX Specification.md>) 第 5 节（P-B）、第 6 节、D-06；[Shell Spec v01](../../design/components/shell-spec-v01.md) 第 7 节；[01. Product Definition](<../01. Product Definition.md>) 第 8 节原则 19、20、22；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2、7 节；[05. Acceptance Criteria](<../05. Acceptance Criteria.md>) AC-06、AC-07。
- 调研记录：[research.md](../../tasks/T20261009-project-view/research.md) 第 3.4 节；本机沙箱探测 [W1-view-probes-results.json](../../tasks/T20261009-project-view/evidence/W1-view-probes-results.json)。
- 官方资料：[Electron Security 检查清单](https://www.electronjs.org/docs/latest/tutorial/security)（#13、#14、#17、#20）。
