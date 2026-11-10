# 验收：T20261111-workbench-plugins

## 未覆盖与待决事项

本次约定的构建版插件机制及直接回归已完成，AC-WB-01、02、06、08 机制分项通过独立验收，当前没有未关闭的技术阻断。人工产品验收仍待进行。前次锁屏阻断的 11 条 Session 用例已在解锁后保持原生焦点断言补跑通过；Composer 基线输入失败经局部修复后，原用例及直接影响回归通过。历史失败与关闭依据见[继续验收](#继续验收w5)。

范围依据 [05 §6.1](<../../../docs/05. Acceptance Criteria.md#61-插件机制阶段>)及 [task](task.md)。五图业务、出图工具、位置与产物协议、AC-WB-07 安全专项、分享、完整多实例管理、完整包卸载和实例删除均后置，不能据本次机制分项通过认定整个 AC 或业务交付。当前仅验证构建应用，打包版与发布未覆盖。

Harness 对照使用官方源码 `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。W3 核对本地 checkout HEAD 并直接读取 Creator skill、入口注册、模块生命周期及 UI/Agent 操作约定。未运行 Harness，未在上游安装或生成插件。来源事实与链接由 [Harness 调研](../../../docs/references/deepseek-harness/README.md)维护，本记录不声称两款应用实机逐项比较。

## 人工功能验收

- 状态：待人工验收。
- 范围：本次构建版最小工作台插件机制；版本和证据见下节。
- 人工记录：2026-11-11 用户确认按 09 推进并授权开发，不代表功能已被人工接受。体验入口见 [report](report.md#人工体验入口)。

## AI 结论与运行环境

- 总体结论：通过，仅限本次约定的构建版最小插件机制及直接影响回归。W5 在输入修复后独立复验，原 55 项直接回归均已有按影响复用的有效通过结果。五图业务、打包版和人工产品验收不在此结论内。
- 验收者：首轮 W3 `harness_comparison` 与继续验收 W5 `final_review`，均未参与产品实现。W5 仅更新本记录与 W5 证据，并独立复验输入修复。
- 日期与基线：2026-11-11，`feat/workbench-plugins` worktree。W3 基线为 `5524c4c29ab1cdd591688d07f3ec5f79d7dedad8` 加工作台实现及修复，见 [W3 构建清单](evidence/W3-final-build-hashes.json)。W5 基线为 `5c3f7b1f8666300e346dcaad988073920a7e58db` 加 `useSuggestions.tsx` 和新增相邻测试的未提交 diff。当前构建见 [W5 SHA-256 清单](evidence/W5-final-build-hashes.json)及[基线比对](evidence/W5-baseline-summary.json)。
- 平台与应用：macOS 26.6，arm64，Electron 44.4.5 构建应用。当前构建包含前次插件修复及本轮候选引用光标修复。
- Provider：W3 使用真实 Codex CLI `0.167.0`，应用默认模型 `GPT-6.1-Sol`，完成创建及续聊修改两轮，无认证或配额错误。隔离数据库为一个 Session、两个 completed 回合，见[W3 保存状态摘要](evidence/W3-final-persisted-state.json)。W5 使用模拟 Provider 配置，但没有发送模型消息，最终为零 Session、零回合，见[W5 保存摘要](evidence/W5-final-persisted-state.json)。真实结果按影响复用，不把 W5 模拟配置计作真实 CLI 验证。没有执行 Claude 或出图路径。
- 交互：agent-browser `0.41.2`，独立 session 为 W3 `wb-review-3e0740df96a0` 与 W5 `wb-review-w5`。两轮均从实际 Electron 用户入口操作，验收者查看了各自关键截图。Playwright 只用于启动、目录选择 fixture、窗口尺寸、正常退出和媒体诊断，没有代替被验收的产品操作。

W3 测试使用两个隔离临时 Project 和独立 userData，位置见 [W3 launcher 记录](evidence/W3-launch.json)。目录选择器返回测试目录；包错误、脚本错误、旧状态版本按钮和同包复制仅写测试草稿。安装、预览、应用、停用、保存及 Project 切换均从可见 UI 执行。没有注入产品实例、会话结果或模型回复。全部测试进程已正常退出，fixture 保留供复核。

## 验收结果

| 场景与来源 | 操作与实际结果 | 结论 | 证据 |
|---|---|---|---|
| 架构与 Harness 原则；spec §9 | 独立检查服务、IPC、SDK、包校验、页面桥、Session 分派与说明。没有图片必需字段或后端代码加载；未引入 Cordis、profile patch、DI 容器或模块图。实例路由不扩充默认五个 View 列表 | 机制通过 | [实现契约](../../../specs/workbench/spec.md#9-fr-wb-001006008-最小插件机制实现契约)、本记录 Harness 对照 |
| AC-WB-01 模板创建 | 从添加工作台选模板，操作计数和笔记后添加。预览时没有实例或 Session；添加后导航出现正确实例，草稿已保存状态被带入 | 通过 | [预览](evidence/W3-template-preview.png)、[添加后](evidence/W3-template-installed.png) |
| AC-WB-01 真实 AI 创建和修改 | 用户发送前只有可编辑草稿。真实 Codex 读取 GUIDE、Schema、SDK 和模板，生成 `W3 阅读计数`；应用重启后续聊改为 `W3 阅读进度`，版本 1.0.2。实际预览可点击、保存、再添加，最终计数 2 和笔记保留 | 通过 | [发送前](evidence/W3-ai-before-send.png)、[创建会话](evidence/W3-real-codex-create.txt)、[修改会话](evidence/W3-real-codex-modify.txt)、[修改预览](evidence/W3-real-modified-preview.png)、[最终实例](evidence/W3-final-restored-reading.png) |
| AC-WB-01 包错误反馈 | 编辑草稿注入非法 JSON，刷新后明确显示清单错误；“将错误填入对话”追加具体原因并保留原文。修复后重试成功。最后构建再次复验，错误不再包含 Electron 远程调用包装 | 通过 | [原错误](evidence/W3-manifest-failure.png)、[最终错误文案](evidence/W3-final-error-copy.png) |
| AC-WB-02 只应用预览过的包 | 预览后在测试草稿改变清单，未刷新便点击应用。宿主拒绝并要求刷新，原实例不变；重新预览后可应用 | 通过 | [拒绝未预览修订](evidence/W3-unpreviewed-update-rejected.png)、[最终 E2E](evidence/W0-workbench-delivery-e2e.log) |
| AC-WB-02 编辑隔离 | 编辑草稿改标题，并将草稿计数写为 2；返回原实例仍是旧标题、计数 1。应用后原实例换标题但仍保留计数 1 和原笔记 | 通过 | [原实例未变](evidence/W3-original-instance-isolated.png)、[应用后](evidence/W3-applied-current-instance.png)、[数据库摘要](evidence/W3-final-persisted-state.json) |
| AC-WB-02 同包实例与 Project 隔离 | 用 UI 创建额外草稿，复制相同 pluginId 和原包文件，再预览添加。原实例更新后，同 Project 第二实例保留旧包和空状态。另一个 Project 添加同包、保存独立笔记，回原 Project 状态不变 | 通过 | [同包 fixture](evidence/W3-second-instance-fixture.json)、[另一实例](evidence/W3-same-package-other-instance.png)、[跨 Project](evidence/W3-cross-project.png)、[原 Project 未变](evidence/W3-cross-project-original-unchanged.png)、[最终绑定与状态](evidence/W3-final-persisted-state.json) |
| AC-WB-06 保存及恢复 | 切换、停用再启用恢复已保存内容。首轮仅终止测试 Electron 后，最终构建恢复草稿、Session 草稿及停用状态；后续正常 `app.close` 再启动，恢复四个实例、固定包修订、计数及笔记，未新增模型回合 | 通过 | [停用](evidence/W3-disabled.png)、[修复构建恢复](evidence/W3-final-build-restored.png)、[正常退出后恢复](evidence/W3-final-restored-reading.png)、[最终数据库](evidence/W3-final-persisted-state.json) |
| AC-WB-06 保存失败 | 测试页面按钮先用当前 stateRevision 写计数 2，再用旧 revision 写 999。第二次失败，页面及宿主显示原因，接受的计数 2 保留；重新打开仍读已保存状态 | 通过 | [旧版本被拒绝](evidence/W3-stale-state-rejected.png)、[观察记录](evidence/W3-observations.md) |
| AC-WB-08 SDK 和对话草稿 | 页面读取、写入及订阅反映真实状态。分别在新会话草稿和已有真实 Session 使用 `setDraft`，均保留原文并追加页面内容，没有自动发送 | 通过 | [已有 Session 草稿](evidence/W3-session-draft-preserved.png)、[最终回合数](evidence/W3-final-persisted-state.json) |
| AC-WB-08 生命周期和 Session | 真实 Codex 创建期间切换页面、停用另一实例，再从历史会话点“在 View 中打开”。Session 继续完成，返回正确工作台草稿。停用和 Project 切换卸载 iframe，重新打开无重复更新；迟到请求和回包的处理另核对自动化及源码 | 通过 | [运行中停用](evidence/W3-session-running-page-disabled.png)、[真实会话](evidence/W3-real-codex-create.txt)、[竞态检查](evidence/W0-revision-races-check.log) |
| AC-WB-08 页面异常和重试 | 草稿注入带明确标记的脚本异常。宿主区分包检查通过与页面运行失败，并禁用应用；对话和状态保留。去除异常后重试正常 | 通过 | [页面运行错误](evidence/W3-runtime-failure.png)、[唯一页面异常日志](evidence/W3-page-errors.log) |
| 外观与可用性 | 通过设置切换纯色浅色及毛玻璃深色，核对主要操作和错误。标题单行修复已复验。暗色 iframe 经去除工具默认浅色模拟后，原生媒体查询为 dark，页面暗色可读 | 通过 | [浅色](evidence/W3-solid-light.png)、[原生暗色采样](evidence/W3-before-agent-browser-theme.json)、[原生暗色](evidence/W3-native-dark-before-browser.png)、[暗色页面细节](evidence/W3-plugin-dark-media.png) |
| 自动化与直接回归 | W3 阅读日志与断言后复用类型检查、71 脚本单测、609 桌面单测及修订/文案局部测试。W5 核对补跑日志和原生焦点断言，原 55 项直接回归按用例名去重后全部有有效通过结果。修复后的 Composer、Files、CLI default、Workbench 13 项通过；W5 独立复跑输入 6 项通过 | 通过 | [受影响检查](evidence/W0-affected-check.log)、[解锁后 11 项 Session](evidence/W0-e2e-unlocked.log)、[修复后 13 项](evidence/W0-e2e-caret-regression.log)、[55 项逐条汇总](evidence/W5-regression-summary.json)、[独立输入测试](evidence/W5-input-unit.log) |
| 本轮共享输入修复 | 连续选择文件、输入含空格目录并继续筛选、再选择文件后连续键入，顺序正确。选择引用后切换到 Architecture 草稿，输入落在新草稿；返回原草稿时引用和文字保持 | 通过 | [目录候选](evidence/W5-space-directory.png)、[连续输入](evidence/W5-continuous-input.png)、[切换草稿](evidence/W5-switched-draft.png)、[持久化原文及引用](evidence/W5-final-persisted-state.json) |
| 本轮工作台代表流程 | 模板预览保存 count=1 和笔记，页面填入对话保留已有引用与文字。添加实例后再次填入草稿，导航往返、停用启用及正常重启均恢复计数、笔记和独立草稿，未创建 Session | 通过 | [模板与草稿](evidence/W5-template-draft.png)、[导航恢复](evidence/W5-instance-navigation.png)、[正常重启](evidence/W5-restored-instance.png)、[W5 观察记录](evidence/W5-observations.md) |

## Harness 对照结论

| 固定版本的机制原则 | 本产品实际结果与差异 |
|---|---|
| Creator 先准备普通会话草稿，用户发送后执行 | 实际 AI 创建入口先填 Composer；真实 Codex 创建和续聊均沿用普通 Session，历史可以找到 |
| AI 读取开发资料、模板和实际能力，再修正运行结果 | 真实会话读取当前宿主 GUIDE、Schema、SDK 类型及模板；生成页面经宿主预览运行，后续修改沿用同一草稿。接口范围固定，无需增加运行时反射或 MCP |
| 稳定导航标识关联页面 | instanceId 决定导航与 Project 绑定；同包不同实例可独立使用。默认五个 View 保留 |
| 安装、启用、加载、可用性分别验证 | 实际验证包错误、脚本错误、停用、保存失败和操作成功，UI 未以文件存在或已添加替代可用性 |
| Host 统一执行数据操作 | 本期页面状态写入统一进入 Workbench 服务和 SQLite；没有另建 UI 数据写入通道。AI 业务数据提交尚未接入，不声称已经与页面操作对齐 |
| 清理注册和资源，保留错误与重试 | iframe 卸载取消监听和订阅；旧页回包不回写新页；关闭或停用页面不调用 Session Stop。无后台插件或共享模块系统，故不复制上游模块清理框架 |
| Harness 的首次预览安装到 profile | AI Studio 按已确认方案使用独立草稿预览后添加至 Project；编辑应用保留目标实例状态，不改同包其他实例。该差异已真实验证 |

最小机制符合本次授权范围，没有以 Harness 为由扩大为框架兼容、插件市场或任意后端扩展。这里的通过仅覆盖固定源码原则与本产品实际机制。

## 修复复验与证据边界

预览修订校验、ready 与保存竞态由实现 team 修复。W3 在修复构建独立复验了文件变化拒绝应用、重新预览后应用、状态恢复和实际错误。异步时序由相关自动化断言补充；W3 读取测试源码和实际日志，没有以实现者口头报告替代检查。最后错误文案仅改变展示，重新构建后复验具体清单错误及正常恢复，最终 hash 已更新。

W3 未参与这些修复。所有故障仅存在于隔离测试草稿，最终已修复；同包和跨 Project fixture 使用可核对的同一 pluginId 和原始包 hash。只读数据库摘要仅含测试工作台状态和回合计数，不含连接配置或凭据。

媒体诊断确认了工具差异：默认 Playwright/CDP 浅色模拟曾使 iframe 保持浅色。最后 launcher 使用 `colorScheme: null`，在连接 agent-browser 之前读取 `nativeTheme.themeSource=dark`、`shouldUseDarkColors=true`，宿主和 iframe 的 dark 查询均为 true，iframe 背景为 `rgb(32, 37, 31)`。该诊断只改变测试媒体配置，没有修改产品数据或样式。[采样与原生截图](evidence/W3-before-agent-browser-theme.json)

W3 没有观察到未注入的页面异常。页面异常日志只有故障 fixture 的 `W3 intentional runtime failure`；启动后采集窗口未产生 warning/error console 记录。这个结论不覆盖启动监听安装前的控制台。

首轮关键截图由 W3 查看，操作与 fixture 细节见 [W3 观察记录](evidence/W3-observations.md)。首轮整体为部分通过，直接回归当时有效通过 43/55，另 11 项被锁屏阻断、1 项为 Composer 基线失败。本轮关闭过程如下，原日志与原基线继续保留。

## 继续验收（W5）

W5 `final_review` 在 2026-11-11 独立读取输入修复、测试源码、W3 观察记录、真实会话文本、状态摘要及关键截图，未参与修复。输入修复删除候选选择后的延迟 `requestAnimationFrame`，改为在 React 提交后的 layout effect 定位，核对草稿、CLI、文本与 active 状态后才操作当前编辑器。没有发现阻断问题。W5 单独运行 6 条行为测试通过，实际界面完成上表两条本轮场景。

历史失败没有撤销或改写：

- [锁屏前置阻断](evidence/W0-native-focus-blocker.txt)导致首轮 11 条 Session 未进入用户步骤。解锁后的[原用例补跑](evidence/W0-e2e-unlocked.log)11 条通过，`app.isActive()`、窗口焦点与 `NSWorkspace` 前台 PID 断言保留。W5 读取这些断言及日志，不用 CDP 操作代替原生焦点验证。
- [干净基线 Composer 失败](evidence/W0-baseline-composer.log)证明输入逆序原已存在，解锁后仍失败。本轮只修复共享输入候选的光标竞争，`composer.spec.ts` 原用例保持不变。[单项复验](evidence/W0-e2e-caret.log)及[13 项直接影响回归](evidence/W0-e2e-caret-regression.log)通过。可控时序的单测与实际连续键入共同覆盖该问题。
- [逐用例汇总](evidence/W5-regression-summary.json)将首轮、针对复跑及本轮日志按用例名称去重，原 55 项均已有有效通过结果，未把重复执行累加为新增覆盖。输入修复不涉及真实 CLI Adapter、Workbench 服务、IPC、包及状态协议；本轮重新验证其 Composer 接缝，其他有效结果按直接影响范围复用。

当前 123 个构建文件中，全部 7 个非 Renderer 文件与 W3 最终清单一致。Renderer 因输入修复重新构建，当前 hash 已另存，未声称前次完整构建 hash 仍相同。W3 的真实 Codex 创建、修改及机制故障证据保留原基线，本轮没有重跑付费请求。

W5 使用单独临时 Project 和 userData，见[启动记录](evidence/W5-launch.json)。fixture 只准备两个引用测试文件、原生目录选择器返回值和窗口尺寸。页面预览、保存、填草稿、添加、导航、停用与启用均经可见 UI 操作。所有 W5 关键截图已查看，未见遮挡或内容丢失。监听安装后无页面异常或 warning/error 控制台记录；这不覆盖安装监听前的启动输出。应用经 `app.close()` 正常退出，agent-browser 已关闭。

本轮将 AI 机制验收更新为通过。人工产品验收、打包版及开头列明的后续业务和安全专项保持未覆盖，由 Main Agent 按任务协议办理技术收尾。
