# Agent To-dos

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `agent-todos` |
| 文档状态 | 草稿 |
| 覆盖需求 | FR-TODO-001～FR-TODO-009 |
| 相关验收 | [AC-TODO-01～06 草案](<../../docs/05. Acceptance Criteria.md#5-agent-to-dos-增量验收草案>)；不追溯改变 V1 AC-01～AC-08 |
| 相关设计 | 待建立 To-dos 交互稿；现阶段复用 Shell / Project / Session 结构 |
| 来源 | [02. Functional Requirements 第 8 节](../../docs/02.%20Functional%20Requirements.md#8-后续阶段agent-to-dos)；[DEC-26](../../docs/07.%20Decisions.md#dec-26-agent-to-dos-完整借鉴与分阶段建设)；用户 2026-10-31 确认 |
| 规划入口 | [路线图 §4.1](<../../docs/06. Development Roadmap.md#41-agent-to-dos-分阶段建设规划>)唯一负责建设顺序与阶段状态 |

本文件细化方案为提案，不因“完整借鉴”的范围确认而自动成为逐条人工确认。尚无实现；下列默认值和安全 / 兼容取舍在所属阶段开始前审阅，已确认的功能是否纳入不再重问。

## 1. 问题记录

### 1.1 未决问题

| 编号 | 问题 | 建议答案与依据 | 决策方（人 / AI） | 阻塞实现 |
|---|---|---|---|---|
| TODO-Q1 | 非 Git / 无首个提交的项目如何运行任务？ | 可建任务、看收件箱；隔离写入执行前明确提示 Git 前提，不自动初始化仓库或退回共享目录。普通 Session 不受此限制 | 人；AI 验证兼容边界 | 阶段 2；不阻塞本次规划 |
| TODO-Q2 | 总收件箱覆盖范围与已关闭项目生命周期？ | 包含所有已登记 Project 的任务和普通 Session 注意力，按身份去重；关闭 Tab 不删除任务。关闭仍运行的项目先确认停止，自动队列暂停，显式启用后恢复；退出应用不承诺常驻守护 | 人 | 阶段 1 的范围 / 阶段 2 的生命周期；不阻塞规划 |
| TODO-Q3 | 自动化默认与错过排程、自动合入门禁？ | 各开关默认关；预览触发范围。一次性漏跑补一次、周期漏跑合并为一次待确认；自动合入须有可信绿色检查、无待答复、无外部不可信来源，失败等待用户 | 人 | 阶段 5；不阻塞规划 |
| TODO-Q4 | 外部平台写操作、PR 交付完成与清理默认？ | 明确仓库 / 分支 / 权限；PR 发布不自动表示已合并，清理前保留可恢复提交；外部 Issue / PR 不进入无人审阅合入，webhook 验签 / 去重 | 人；AI 负责具体鉴权实现 | 阶段 6；不阻塞规划 |
| TODO-Q5 | 各阶段交付哪些 CLI、并发默认及发布版本？ | 优先按现有已验证 CLI 构建首个闭环；每个后续 CLI 独立验证。建议初始每项目 1、全局 2 个执行槽，可配置；版本号 / 发布时间不先绑定 V1.1 | 人 | 各执行阶段开工 / 发布前；不阻塞规划 |
| TODO-Q6 | 合入策略、冲突修复后的再次审阅与清理？ | 默认人工批准；基线变化或冲突修复后重新检查 / Review。提供 squash 与保留历史，但尊重目标仓库规则；默认保留未交付分支，有未提交变更时拒绝清理 | 人 | 阶段 3；不阻塞规划 |

### 1.2 已确认

| 编号 | 问题 | 回答（确认日期） |
|---|---|---|
| TODO-Q0 | 是否完整借鉴 Codeg To-dos，并包含跨 Project 总收件箱？ | 是；用户原话见 DEC-26（2026-10-31）。阶段顺序、默认值及版本号不是该句的逐项确认。 |

## 2. 职责与边界

- 负责：把用户明确交给 Agent 的工作单元持久化、排队、执行、恢复、审阅、交付和跨 Project 注意力聚合。
- 不负责：替代普通 Session 或本仓库 Task Protocol；强制 Epic / Story / Sprint；把 Codeg 全产品的移动端、服务端、多 Agent 编排等额外纳入此次 To-dos 规划；改变底层 CLI 原生配额或权限。
- 应用 To-do 的 Done、仓库开发 task 的 done、人工功能验收是三种事实，不互相代写；`tasks/` Markdown 不作为运行队列数据库，Project Progress 可引用结果但不复制控制状态。

## 3. 行为细则

### FR-TODO-001 任务记录与来源

以 FR-TODO-001 为范围。创建只保存草稿 / 待办，不启动 CLI；Start 时冻结实际有效 Agent 配置、输入引用和目标，界面显示继承还是覆写。消息转任务保留来源链接，不复制整个会话；附件须持久可读，路径失效时不能悄悄丢弃。Agent 创建任务的工具单独授权，不因开放进度上报就获得启动 / 调度权。

### FR-TODO-002 状态与生命周期

建议主状态 `todo → queued → setting_up → running ↔ awaiting_input → to_review → delivering → done`；失败 / 中断 / 取消为有原因的旁路。编辑草稿独立保存；deferred、archived 是标记，不能删除真实状态。Delivering 区分本地合入 / PR 发布，合并失败回 Review，已成功交付但清理失败不回滚交付事实。

同一任务只有一个活动执行尝试；一次尝试可包含多个原生回合，不把等待用户和回合终止混同。`task_progress`、`task_complete` 仅在对应任务尝试中暴露：进度可记卡片，success / needs_review 最多转 Review，blocked 记录阻塞原因；不直接设置 Done。无报告时用实际回合结果 / 变更 / 错误决定 Review 或中断，不解析一句“完成”作为交付证明。重复及迟到报告须按 attempt 身份拒绝或幂等处理。

### FR-TODO-003 跨 Project 总收件箱

总收件箱回答“哪里需要我”，全部任务视图回答“工作进行到哪里”。分开的筛选共用记录，不维护两份待办。任务关联 Session 的等待事件用 task / request ID 去重；普通 Session 用 session / request 或 turn ID。查看普通完成提醒按原语义清除，待答复、待审阅不会因读过而消失；后台合入是进行中状态，失败才需处理。

跨 Project 跳转需恢复原布局和收件箱筛选 / 滚动位置；路径丢失仍展示历史并标注不可执行，不能自动注册替代目录或启动 CLI。延后仅影响提醒显示，不等于完成；新一轮等待或失败重新产生注意力。空列表、加载失败、筛选无结果须分别呈现。

### FR-TODO-004 隔离执行

第一次允许写入执行时就具备 Worktree。将逻辑 Project 与实际 execution root 分开：Session 属于原 Project，但 cwd 指向受管理 checkout，不能把每个 Worktree 冒充新 Project。锁定 base branch / commit；init 成功后才启动 Agent，Stop 要覆盖 init 和任务进程。

普通 Project 的未提交内容不会自动带入新 checkout，启动前说明。Worktree 位于受管理目录，按 Git common-dir 识别同仓库；并发不能绕过同分支和路径约束。共享端口 / 外部数据库 / 凭据仍需项目自己的隔离配置，不能用 Worktree 宣称安全沙箱。[Git 官方 Worktree 文档](https://git-scm.com/docs/git-worktree)

### FR-TODO-005 审阅门与交付检查

任务 Diff 与已有“项目 Diff / 原生轮次 Diff”并存：基于任务记录的 base，包含已提交、暂存、未暂存、未跟踪文件，明确忽略项和二进制 / 大文件降级；不把起点已有 PR 的全部改动误归为 Agent 新增。检查记录绑定 attempt、base / task commit 与工作区内容快照；跟进或基线更新使旧绿灯失效。

无改动问答任务经用户 Review 后 Complete；有未交付变更不能用 Complete 隐藏，用户可明确 Abandon 并选择保留成果。用户预设自动 Review / 合入策略只在后续阶段启用，不等于独立 AI 验收或人工产品接受。

### FR-TODO-006 跟进、恢复与失败

按 FR-TODO-006 的四意图区分授权；Double-check 可以执行必要诊断，但不顺带修复。Resume 可用则复用原 Session；不可用时明确记录新 Session 关联，不冒充原 Session ID。基于能力探测提供恢复前压缩，不能向不支持的 CLI 发送猜测命令。

重启时核对进程和持久记录，未确认退出前不得重复启动；孤儿 Worktree / 分支可人工恢复或清理。丢失 checkout 时只从已记录分支恢复已提交工作，未提交内容无法保证恢复，必须明确告知。Stop 保留分支和结果，Cancel 停用待触发计划，Retry 是用户新授权而非自动重发。

### FR-TODO-007 队列、并发和排程

先做手动队列 / 并发，再开放无人值守规则。调度器在主进程持有，不依赖 Renderer 挂载；按 Project 与全局双层容量调度并避免某个 Project 长期占满。Ready / queued / setting_up 有不同含义；拖拽启动是显式执行动作，不能仅改变列的显示。

自动处理、定时启动、周期自动化分别启用并记录授权。计划保存时区、下一次触发和幂等键，测试睡眠唤醒、重启、时钟变化和重复 webhook。调度槽位是本地资源控制，不是模型 token / 费用护栏；需要原生审批则进入收件箱，不为无人值守升级权限。自动化可创建待审阅任务或启动普通 Session，后者清楚显示没有任务交付门，不能默认继承 Git 写入授权。

### FR-TODO-008 Merge、PR 与串行落地

合入按真实仓库身份串行化，即使同仓库用两个 Project 别名打开也不能并发写 refs。开始前检查目标分支 / HEAD、脏文件、index、Git 正在进行的操作；拒绝覆盖用户工作。Agent 可在隔离分支协助冲突修复，但可信服务检查授权与 Git 结果；冲突引入新改动时再次检查 / 审阅。Squash 用实际树 / 差异核对交付，不能只看 HEAD 移动或要求原分支 ancestry。

合入策略服从目标仓库规则；本仓库仍遵循 CONTRIBUTING 的线性历史，功能支持 full history 不授权改变本仓库 main。默认不 push；PR 发布 / 更新需明确 repo / remote / base / head / fork，网络超时先查询是否已成功，避免重复创建。

GitHub 先做纵向闭环，再补 GitLab 与 Gitea / Forgejo：浏览 / 筛选条目、fix / plan / review-and-fix / review-only 转任务、手动创建和更新 PR、规则扫描 / webhook 与可追踪回写。外部正文一律视为不可信输入；凭据留 OS 安全存储、日志脱敏，来源不得更改合入目的地或权限。仓库评论、关闭条目等写操作遵循逐次或显式规则授权。

### FR-TODO-009 设置、模板和清理

以 FR-TODO-009 为范围。继承设置与本次执行实际快照同时展示；修改全局默认不追溯重写历史。任务模板只填入编辑器，不立即启动。阶段提示只能追加业务指令，不能覆盖客户端校验和用户审批；来自仓库的 init / preflight 命令先经过项目可信确认。

清理需要同时检查活动进程、未提交 / 未跟踪内容、未交付提交与可恢复引用；删除记录、删除 checkout、删除 branch 分开授权。清理失败独立展示并可重试；归档保留记录和会话，不触发删除。Done / 暂缓 / 已取消在界面与统计上不能混成“成功完成”。

## 4. 状态与数据

FR-TODO-001～009：技术方案草案，SQL schema 在阶段 0 / 1 实现设计时确定；不一次迁移所有远期功能。

| 对象 | 保存职责 |
|---|---|
| Task | Project、目标、来源、当前状态、配置意图、deferred / archived；不复制 transcript |
| Attempt | 执行 / Retry / Follow-up / Merge 次数、Session 关联、配置快照、开始 / 结束 / 结果；一个 Task 可有多个 Session，既有 App Session ↔ 原生 Session 仍为 1:1 |
| TaskEvent | 递增序号、attempt、事实 / Agent 报告 / 用户操作及来源；与状态在同事务提交，不能只凭最后一条日志重建完整状态 |
| WorktreeBinding | repo 身份、execution root、base ref / SHA、task branch、交付 SHA 与清理结果 |
| Check / Delivery | 被检查的内容版本、检查结果、审阅 / 合入 / PR 状态；不与清理混写 |
| InboxEntry | 从 Task / Session 状态派生并去重，仅持久化必要的用户可见性偏好 |
| Schedule / Template / ForgeLink | 后续增量引入；规则版本、授权、触发幂等键、来源 / 目标标识，不保存明文凭据 |

事务领取执行权、防重复命令和重启对账必须先于自动化；日志与 diff 按需读取，历史任务分页查询。

## 5. 接口与事件

FR-TODO-001～009：阶段 1 提供任务 CRUD / 筛选、总收件箱和导航；阶段 2 接入 `start / stop / retry / followUp / complete / cancel`、Worktree 与检查；后续按路线图加合入、队列、排程和仓库接口。Renderer 只消费类型化命令与快照，主进程校验 Project / task / attempt 身份、版本和权限；拒绝任意 shell / 路径 IPC。

建议服务边界为 TaskService（状态）、TaskScheduler（领取 / 调度）、WorktreeService（Git 资源）、DeliveryService（合入 / PR）、InboxQuery（注意力投影）；复用现有 Session / Adapter、Diff 与数据库服务，不为 To-dos 重做 CLI 协议或迁移到 Tauri / ACP。跨模块接口、迁移和清理属于后续独立技术评审内容，本次仅交付规划。
