# 验收：T20261112-workbench-lifecycle

## 未覆盖与待决事项

- 未运行 Playwright Electron E2E，也未用 agent-browser 操作应用：委派要求避免抢占用户机器的窗口焦点。[Acceptance](../README.md#acceptance) 要求界面改动由 AI 实际操作，本评审只查看了实现者截图（[添加浮层](evidence/W1-add-panel.png)、[恢复与删除](evidence/W1-removed-restore-delete.png)、[删除确认](evidence/W1-delete-confirm.png)、[选品直接添加](evidence/W1-selection-added-directly.png)），独立界面复验记为未覆盖。复测条件：在不影响用户的时段或隔离环境中，从可见入口执行添加浮层、选品直接添加、再次编辑复用、删除确认（含运行中会话提示）四个场景。
- 实现者报告的 E2E 结果（`workbench` 4 项、`product-selection` 4 项、`project-view` 5 项）未复跑，本评审只审阅了 E2E 用例的改动。
- 深色与纯色外观下的添加浮层和删除确认未检查。
- 真实 CLI 未验证。本次未改 CLI 链路；删除时停止会话由 IPC 集成测试（FakeProvider 加真实 SessionService）覆盖。
- 待人工决定：
  - F1 的存量草稿清理规则：清理会删除旧流程留下的草稿记录（文件保留）。建议由主 Agent 提出识别规则，再请用户确认。
  - F2 中对已移除实例应用编辑草稿时的预期行为。
  - F3 是否也停止从该实例的编辑草稿发起、仍在运行的会话。

## 人工功能验收

- 状态：待人工验收
- 范围与版本：工作台生命周期调整（草稿关闭与复用、App 模板直接添加、已移除实例永久删除、添加浮层结构）；证据基线 `b7901cc`；未覆盖项见上节。
- 人工记录：暂无人工反馈，待验收。体验入口为主目录 dev 的 `pnpm dev`，操作见[任务](task.md#验收场景与结果)。

## AI 结论与运行环境

- 总体结论：**部分通过**。需求 1–4 的新流程在单元测试、探针和代码审阅范围内与规格一致：草稿添加或应用后关闭、首次添加接替位置与名称、编辑草稿复用、选品直接添加与重名编号、永久删除的校验、停止、删除及保留范围、对话框角色的添加浮层。嵌套 SAVEPOINT 的回滚和外键顺序正确。F1（中）使存量 Project 的遗留草稿继续显示，并让“预览新版选品画布”打开旧版本，与规格 §9.9 和 WB-Q3.2 不符，需修复后复验。其余 F2–F5 为低级别。未发现数据丢失、崩溃或跨 Project 越权类问题。
- 验收者：独立 Review Agent（Claude 子代理）；未参与实现，未修改生产代码。
- 日期与代码基线：2026-11-12；分支 `fix/workbench-lifecycle`，commit `b7901cc`（基线 `4dbe536`），worktree 无未提交改动；评审范围为 `git diff 4dbe536 b7901cc`。
- 平台与应用形态：macOS 26.6（Darwin 25.6.0）arm64；未启动应用。只运行 Node/SQLite 与 jsdom 单测，使用已构建的 `apps/desktop/out/workbench-packages`。
- Provider 与 CLI：单测中为 mock / FakeProvider（IPC 集成测试使用真实 SessionService）；未使用真实 CLI。
- 执行的检查（目录 `apps/desktop`），日志见 [W2-unit-typecheck.log](evidence/W2-unit-typecheck.log)、[W2-review-probes.log](evidence/W2-review-probes.log)：
  - `pnpm exec vitest run src/main/services/workbench src/renderer/src/features/workbench src/renderer/src/features/session`：16 个文件、145 项全部通过。
  - `pnpm exec tsc --noEmit -p tsconfig.node.json && pnpm exec tsc --noEmit -p tsconfig.web.json`：退出码 0。
  - 评审探针 P1–P7（[脚本](evidence/W2-review-probes.test.ts)、[配置](evidence/W2-review-probes.config.ts)，运行时放在 `apps/desktop/.runtime/review-probe/`）：使用临时数据库、项目目录和预设包副本，包括故障注入、模拟旧版改绑数据和模板版本变化。

## 验收结果

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| 草稿添加或应用后关闭（WB-Q3.2；规格 §9.2、§9.8） | 模板草稿首次添加；实例的编辑草稿应用 | 草稿记录与导航行删除，草稿文件保留；首次添加带入草稿状态，编辑应用保留实例状态 | `package-runtime.ts:146-163` 与 `workbench-service.ts:251-266` 在同一事务内写实例、删草稿、转移或删除导航行；相关单测通过 | 单测（Node/SQLite）+ 代码审阅 | 通过 | [W2-unit-typecheck.log](evidence/W2-unit-typecheck.log) |
| 首次添加接替位置与名称，编辑应用保留实例名称（§9.8） | 两个草稿中添加第一个；草稿改名后添加；编辑草稿改名后应用 | 实例占原草稿位置并继承改名；编辑应用后实例名称不变，草稿导航行删除 | `puts a first-added instance…`、`renames presets…` 通过 | 单测 | 通过 | 同上 |
| 再次“编辑工作台”复用未应用草稿（§9.4） | 同一实例连续编辑两次；应用后再编辑；升级草稿与 ai 编辑草稿并存 | 同一“实例 + 来源 + 基础修订”只有一份草稿；应用后新建；基础修订变化后不复用 | `reopens one edit draft per instance and source…` 通过 | 单测 | 通过（新流程数据） | 同上 |
| 复用时不覆盖已输入内容（§9.4） | 复用的草稿对话框已有文本时再次编辑 | 保留文本，不写入预置提示 | `actions.ts:17` 只在文本为空时预填；`loadDraft` 优先使用内存草稿 | 代码审阅；无自动化测试（F5） | 通过（仅代码审阅） | — |
| 模板升级预览与存量草稿（§9.9；WB-Q3.2） | 旧版留下的改绑草稿；或升级草稿未应用期间 App 模板更新；点击“预览新版选品画布” | 预览当前 App 模板；存量 Project 列表只保留实例 | 复用旧草稿并显示旧版本；遗留草稿仍在列表中 | 探针 P3、P4 | **不通过（F1）** | [W2-review-probes.log](evidence/W2-review-probes.log) |
| App 模板直接添加、可重复、重名编号（§9.8、§9.9） | 连续添加；隐藏后再添加；已有实例改名占用编号；重启 | 不产生草稿；追加到末尾并打开；“选品工作台 2/3”写入名称覆盖；重启保持 | `adds App templates directly…`、IPC `validates template…` 通过；P7 跳过被占用编号 | 单测 + 探针 | 通过 | 同上 |
| 永久删除的入口校验、停止与删除范围（WB-Q12.1；§9.8） | 未移除时删除；删除预设；停止失败；正常删除 | 前两项拒绝；停止失败时不删除；只停止本实例 running / needs_input 会话；删除实例、状态、执行关联、目标草稿和导航行；保留会话历史、包文件与草稿文件 | 服务单测覆盖全部分支；IPC 集成测试中被停会话变为 `none`，`originViewId` 保留，其他工作台会话仍运行；删除后旧快照读取被拒绝 | 单测（FakeProvider + 真实 SessionService） | 通过（F3 待人工决定） | [W2-unit-typecheck.log](evidence/W2-unit-typecheck.log) |
| 事务回滚与外键（`PRAGMA foreign_keys = ON`） | 在导航行改写、执行关联删除处注入失败 | 外层 SAVEPOINT 回滚内层已 RELEASE 的写入；连接不残留事务；可重试 | P1：实例未写入，草稿仍在，`isTransaction=false`，重试成功。P2：实例、目标草稿、导航全部保留。删除顺序为先草稿后实例，满足 `workbench_drafts.target_instance_id` 外键 | 探针 + 代码审阅 | 通过 | [W2-review-probes.log](evidence/W2-review-probes.log) |
| IPC 输入校验与跨 Project 隔离 | 非法模板 ID、多余字段、预设或草稿 ID；用其他 Project 的 ID 删除 | 在边界拒绝；服务层再次校验 | `addTemplate` 只接受 `product-selection` 与固定键；`deleteInstance` 经 `parseInstanceWorkbenchRef`，服务层再校验 custom、hidden 并在停止后复查；他项目删除被拒 | 单测 + 代码审阅 | 通过 | 同上 |
| 添加浮层结构（§9.8 浮层说明） | 打开“+” | 三组；目录行单行，已添加预设显示“已添加”并禁用；只有新建两项带说明；`role="dialog"`；Esc 关闭并聚焦“+”；已移除行提供“恢复”和“删除…” | `navigation.test.tsx` 通过；实现者截图与描述一致 | jsdom 单测；查看实现者截图，未独立操作界面 | 通过（界面交互未独立复做） | [W1-add-panel](evidence/W1-add-panel.png)、[W1-removed-restore-delete](evidence/W1-removed-restore-delete.png) |
| 应用后的视图交接与已移除项跳转（§9.8 技术决定） | 草稿应用时目录事件先于 IPC 回复到达 | 不闪到首项，停在新实例 | 主进程先发事件再回复；Renderer 先处理回复并 `enterView`，`list` 回复随后到达；草稿视图另有宿主 pending 守卫。对已移除实例应用编辑草稿时会跳到首项（F2） | 代码审阅；E2E 由实现者运行 | 通过（F2 为边界） | — |
| 来源已不在列表的会话（§9.8） | 会话的来源工作台被删除、移除或草稿已关闭 | “在工作台中打开”禁用并提示 | `Conversation.tsx:19-28` 已实现；无测试 | 代码审阅 | 通过（仅代码审阅） | — |
| 文档与代码一致 | 对照本提交改动的 02、05、06、09、工作台规格、导航规格 | 描述与实现一致 | 除 02 FR-WB-006 自相矛盾外一致 | 文档审阅 | 部分不通过（F4） | — |

## 缺陷与复验

当前状态：均待修复或待决，未复验。

| 编号 | 严重度 | 位置 | 失败场景 | 建议 |
|---|---|---|---|---|
| F1 | 中 | `apps/desktop/src/main/services/workbench/package-runtime.ts:98-101`（复用查询）；入口为 `renderer/src/features/workbench/host.ts:81-85` 与 `WorkbenchPreview.tsx:23-25`；遗留数据由 `4dbe536` 的 `package-runtime.ts:150` 产生 | 第一种情况是存量数据，用户已有 Project 即属此类。旧版添加选品后，草稿被改绑为 `source=template`、`target=实例`、`base=实例当前修订`。本提交没有迁移，“草稿：选品工作台”仍留在列表中，用户反馈的现象 2 对已有 Project 仍存在。模板版本更新后点击“预览新版选品画布”，`createDraft` 命中复用条件，打开这条旧草稿，显示的是实例当前的旧页面。应用后版本不变，升级提示仍在，要再点一次才得到新版。P4：复用为 true，预览 0.0.1，模板为 0.0.2。第二种情况是新数据：升级草稿未应用期间 App 更新了模板，再次点击仍打开上一版模板生成的草稿（P3：显示 0.0.2，模板已为 0.0.3）。现有单测 `previews the latest selection template…` 只在新流程下（草稿已删除）通过，未覆盖这两种情况。 | 对带 `templateId` 的升级请求不复用，或只在草稿 manifest 版本等于当前 App 模板版本时复用。另外增加一次性清理，处理旧流程遗留的已应用草稿记录与导航行（文件保留）；识别规则需避开用户仍在编辑的草稿，由用户确认。修复后复验 P3、P4 与 `previews the latest selection template…`。 |
| F2 | 低 | `renderer/src/features/workbench/host.ts:70-71`；`WorkbenchNavigation.tsx:28-36`；`package-runtime.ts:150-152` 不检查实例是否已移除 | 实例 X 有编辑草稿 D。用户移除 X 后 D 仍在列表，打开 D 点“应用更改”：应用成功，D 关闭，Renderer 切到 X。X 已隐藏、不在目录中，导航效果随即把视图换到首项，没有任何提示，X 仍在“已移除”中（P5）。改动前草稿保留在列表中，用户停在原处。 | 应用前提示或阻止，或应用后提示“工作台已移除”并提供恢复；属于用户可见行为，需人工确认。 |
| F3 | 低（待人工决定） | `apps/desktop/src/main/services/workbench/workbench-service.ts:294`（只匹配实例 viewId）；`:301-304`（同时删除指向它的草稿） | 对 X 执行“编辑工作台”，在草稿 D 中让 AI 修改页面，该会话 `originViewId=workbench-draft:D` 且仍在运行。随后移除并删除 X：D 的记录被删除，会话仍继续写 `drafts/D` 并产生费用，结果已无法预览或应用；确认框的“将停止 N 个会话”也不计入它。字面范围（“从该实例发起”）已满足，但与 WB-Q12.1 的理由“避免继续生成无法写回的结果及后续费用”不一致。 | 由用户决定是否把指向该实例的草稿发起的运行中会话一并停止并计入提示。 |
| F4 | 低（文档） | `docs/02. Functional Requirements.md:978`（FR-WB-006） | 同一段前面新增了“删除只对已移除的自定义实例提供，先停止其运行中的 Session…”，句末仍保留“永久删除及包卸载继续后置”，前后矛盾。 | 句末改为只把包卸载与包、草稿文件的彻底清理列为后置，与规格 §9.8 末段及 09 WB-Q12.2 一致。 |
| F5 | 低（测试证据） | `renderer/src/features/workbench/actions.ts:17`；`host.ts:70-71`；`WorkbenchNavigation.tsx:33`；`renderer/src/features/session/Conversation.tsx:19-28` | 以下声明没有单测：“不覆盖已输入内容”、应用后先切实例再刷新及宿主 pending 守卫、“在工作台中打开”禁用。E2E 只断言应用后 `aria-current`，编辑复用场景没有先输入文本再复用。当前结论只来自代码审阅。 | 补 jsdom 单测作回归保护，不阻塞本次结论。 |

另有以下观察，不计为缺陷：

- 删除实例和应用草稿后，宿主只发 `catalog` 事件，不为已删除或已关闭的视图发快照事件（P6）。Renderer store 会保留这些视图的旧快照，但它们已不在目录中，“在工作台中打开”也已禁用，没有可见影响。
- 删除确认框里的运行会话数在打开时计算（`WorkbenchNavigation.tsx:62`），打开期间不会刷新。宿主删除时按实时列表停止，不影响正确性。
- 删除与页面发起的 `startAgent` 交错时，`onCreated` 内的 `agentPort` 校验会因实例不存在而抛错，Session 创建事务随之回滚（`session-service.ts:240-249`），不会留下孤立执行。
