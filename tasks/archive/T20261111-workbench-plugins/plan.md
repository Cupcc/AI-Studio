# 执行计划

## 阶段

1. 已完成：规则、方案与 Harness 源码核对，确定最小模块边界。
2. 已完成：共享契约、后端/UI 并行实现、Session 与验证选择器接入。
3. 已完成：局部自动化、真实 CLI 与 UI 检查；解锁回归及共享输入光标修复均通过。
4. 已完成：W3/W5独立机制与直接回归验收、文档和diff复核；Main Agent按协议技术收尾并归档，人工体验单列。

## Workers

| 编号 | Agent | 写入范围 | 集成方式 |
|---|---|---|---|
| W0 | Main | shared/workbench/types.ts、shared/ipc/workbench.ts、shared/project、Session 接缝、注册、影响映射、spec/docs、task/plan | 主任务 worktree |
| W1 | architecture_scout | main/services/workbench、main/ipc/workbench、数据库迁移、security/hardening 协议接缝、SDK/模板资源 | 独立 worktree；按范围 patch 集成 |
| W2 | renderer | renderer workbench、Navigation、Project View/Workspace 分派、主题 CSS、electron.vite.config.ts、workbench E2E | 独立 worktree；按范围 patch 集成 |
| W3 | harness_comparison | 独立验收 acceptance.md 与 W3 evidence | 实现完成后在集成版本串行验证 |

## 进展

- 2026-11-11：从 main `5524c4c` 创建 `feat/workbench-plugins` 于同级 worktree，复制原有方案文档基线；pnpm 冻结依赖安装完成。原主目录不切分支、不覆盖已有修改。
- 对照范围为 Harness `fcc0ad4` 源码/开发规范 + 本产品真实 UI，不把上游官方演示当实测证据。
- W0：共享 types/IPC 冻结，扩展 builtin/custom View 分派、Session 开发上下文与 app 协议注册。初轮 Session 与共享 Project 测试 4 文件 113 项通过；影响映射测试 15 项通过。W1/W2 并行实现中。
- W2 首版集成：动态工作台导航、模板/AI 创建、编辑/预览/应用、iframe bridge、状态与错误反馈、停用/启用、返回 View 已实现。Worker web/E2E typecheck 及相关 renderer 7 文件 63 项测试通过，Electron 待集成宿主后统一运行。
- W1 首版集成：真实文件包、不可变修订、SQLite 草稿/实例状态、SDK/开发资料、错误诊断与停用接口完成。首次添加保留预览已保存状态，编辑应用保留实例实时状态。
- 集成自检通过：受影响 Node/Web/E2E 类型检查，脚本 71 项、桌面 56 文件 609 项单测；workbench Electron E2E 2/2。证据位于 evidence/W0-affected-check.log 与 W0-workbench-e2e.log。W3 已取得独占 UI 时段，执行真实 Codex 和独立界面验收。
- 复核发现并用真实 fs/SQLite 复现：预览后文件变化，applyDraft 会采用未预览修订。正在修为必传 expectedPackageRevision；Renderer 换修订时必须重置页面就绪状态。由 W1/W2 分别修复，W3 复验后才能收尾。
- W2 追加复现：换包修订时沿用旧 ready、隐藏期间保存完成后提示不恢复、catalog 在途读取吞掉后续 changed。均由真实组件/store 测试证实，正在当前范围修复。W3 模板流程已通过，真实 Codex 创建处理中；独立验收尚未宣告通过。
- 修复集成：apply 必须匹配已预览 hash；包修订变化重置页面 ready；读取恢复保存提示；目录刷新合并一次重读并在关闭时失效。更新后 Workbench UI/服务 7 文件29项、host相关6文件34项和 Node/Web/E2E 类型检查通过。待 W3 当前真实回合结束后构建复验。
- W3 真实 Codex 首轮创建已成功，实际页面计数/笔记可保存，SDK setDraft 保留当前 Session 草稿且不发送；执行期间切页与停用另一实例不误停会话。截图检查发现长标题挤压“新对话”按钮，W2 加局部不换行样式，待最终构建复查。当前串行运行11个直接相关E2E文件（55项），含主题/布局与Settings颜色检查。
- 扩大直接范围回归首轮 41/55 通过：1条IPC白名单需加新workbench模块；1条CLI设置键盘操作缺少enabled等待；1条composer End键后未确认光标导致引用逆序。修正测试同步，保留行为断言并针对性复跑。
- 另11条Session全部在beforeEach窗口激活失败。独立原生诊断确认系统锁屏、loginwindow在前台，Electron和AppKit均无法取得焦点。已异步请用户解锁；不移除/模拟原生焦点断言，不将未执行场景算通过。证据W0-native-focus-blocker.txt。
- 针对复跑：IPC显式白名单与CLI初始化等待修正通过，View布局在glass/solid通过；composer光标用例仍失败。已新建干净5524c4c worktree、冻结安装构建并运行原用例，在同一219行得到完全相同逆序，证明为基线已有问题。撤回试验性composer测试修改，不扩大为输入编辑器修复；证据W0-baseline-composer.log。
- 最终构建包含全部插件修复及标题局部样式，W3已接回UI窗口，继续真实修改/应用/同包隔离及故障恢复。新建基线worktree仅用于验证，无源码修改。
- W3报告第二轮真实Codex修改成功，新增实例可用；未预览修订拒绝、坏清单/脚本错误恢复、旧状态写入拒绝、草稿/原实例隔离及真正同包第二实例隔离均已从UI验证。正在完成跨Project、正常重启及最终外观检查。
- 最后一处文案修正仅去掉Electron IPC错误包装，相关工作台Renderer15项通过；待W3让出窗口后构建并复查错误提示，不改变通用协议或行为。
- 最后交付构建完成，错误文案已去除Electron IPC包装；工作台Electron E2E 3/3通过（W0-workbench-delivery-e2e.log）。W3正在对该构建做正常重启恢复与错误文案抽查，然后更新独立结论。系统仍锁屏，未重复运行依赖原生焦点的11条用例。
- 文档收尾复核补正根README的“原型建设前”、05追踪矩阵的“未执行”、workbench/navigation中仍待设计的SDK/iframe/接缝描述；09确认范围与当前技术结果分别记录。路线图同步下一步、整体、模块、阶段和验收进度，明确核心机制通过但任务verifying。
- W3独立验收已冻结：AC-WB-01/02/06/08机制分项通过；整体部分通过，任务verifying。真实Codex两轮completed，真正同包与跨Project共4实例隔离、正常/异常退出恢复、主题和故障均留证；最终构建123文件hash已保存。测试Electron/CDP/agent-browser已退出，故障fixture已恢复。当前43/55直接扩展E2E有效通过，11项锁屏前置未覆盖，1项Composer基线失败单列。

## 继续验收（2026-11-11）

用户要求 continue 后，确认系统已解锁且最终构建123个文件hash与验收基线一致。仅补跑11条Session和失败的Composer用例。Composer在解锁后仍出现引用输入被延迟光标恢复打断，作为共享输入区的局部修复处理，保持原用例和产品行为标准，不新增功能或架构。

| 编号 | Agent | 本轮写入范围 | 集成方式 |
|---|---|---|---|
| W4 | renderer | useSuggestions.tsx、相邻聚焦测试；必要的composer E2E同步 | 新独立worktree workbench-input-fix，Root集成 |
| W3 | harness_comparison | acceptance.md 与 W3证据续记 | 独立复验，未参与产品修复 |
- 解锁后的补跑：11条Session E2E全部通过，原生app活跃/窗口焦点/系统前台PID断言保持不变；同次Composer仍失败。123个构建文件hash与前次独立验收完全一致，既有机制证据继续有效。日志W0-e2e-unlocked.log；W4正在用可控时序测试修复输入光标竞争。
- W4最小修复仅useSuggestions.tsx和新增6项测试：删除候选选择的延迟rAF，在React提交后的layout effect同步定位并限定草稿/CLI/文本/active；原行为测试先红4项，修后输入48项通过。Root集成重建后原Composer E2E原样通过（W0-e2e-caret.log）。服务重启后核对产物及日志，未重复已完成动作。
- 原team会话随服务重启结束，分配W5 final_review作为新独立验收者，未参与实现。写入范围仅acceptance.md及W5 evidence；复核前次W3证据和本轮原生回归，实际操作候选引用与代表性工作台路径。Root先串行跑直接影响E2E，再交UI窗口。
- 修复后直接影响范围composer/files/cli-default/workbench E2E 13/13通过，原Composer输入顺序断言未改。当前55个直接场景均有有效通过结果，未受候选定位改动影响的范围复用前次证据。W5正在当前构建实操候选输入与工作台，并独立记录。
- 集成前只读复核：main原始18份文档与开工快照逐字一致，原架构task两文件与交付内容一致，main暂存区为空，.env.local仍未跟踪；无新增未知变更。计划在最终提交通过门禁后，为这20个明确文件保存并核验独立快照，再仅fast-forward合入。

- W5已冻结：当前构建机制AI总体通过，独立6项测试和实际输入/工作台UI复验通过，55项回归逐场景去重均有有效通过结果。所有测试应用退出。Main完成最终事实与链接复核，任务done并归档。
