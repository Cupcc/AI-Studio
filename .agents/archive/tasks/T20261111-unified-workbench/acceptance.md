# 验收：T20261111-unified-workbench

## 未覆盖与边界

- 本任务验证预设与自定义工作台架构统一，不扩展图片业务、管理功能或人工验收范围。Claude Code 真实模型请求与打包应用未执行；本次没有修改 Adapter 或模型配置。
- 实际 Codex 仅覆盖预设 Architecture 和已安装模板实例的首条上下文，各一轮；没有重新要求模型创建或改写插件包。固定包修订、异常与 CAS 由真实本地服务测试覆盖，普通 Session 并发和 Stop 的直接自动化由 Main Agent 另行记录，不扩大为完整双 CLI 验收。
- 人工产品验收见下节；AI 检查不代表人工已接受。

## 人工功能验收

- 人工产品验收：已验收。2026-11-12 用户回复“所有待验收均已验收通过”，体验版本为主目录 `dev` @ `872978b`，见[集中验收记录](../T20261112-dev-acceptance/task.md)。
- 范围：本次统一“工作台”导航、预设与自定义工作台的打开、对话及状态恢复；可按下列截图和操作从主工作区体验。
- 文档 diff：待用户审阅。功能交付的人工验收不代表文档差异已审阅。

## AI 结论与运行环境

- 总体结论：通过，本任务的统一架构、直接回归、真实 Electron 操作和实际 Codex 两类首条上下文符合授权范围；无阻塞发现。
- 验收者：`/root/rationale`，未参与生产实现；此前只调查历史与架构、检查文档一致性。
- 日期与基线：2026-11-11，HEAD `6e891415117a1efb6469620702b0c67870e18709` 加本任务未提交差异；实施前已有其他未提交基线不计入任务改动。源文件与构建 SHA-256 见 [W3-review-baseline.json](evidence/W3-review-baseline.json)。
- 平台：Darwin arm64；Electron 本地构建，非打包应用。
- Provider：单元测试使用 FakeProvider；界面启动脚本删除 `STUDIO_E2E_PROVIDERS`，使用实际 Provider。Codex CLI `0.167.1`，登录状态检查成功；界面保持 `GPT-6.1-Sol（默认）`，未调整模型、强度或连接配置，不记录登录响应或凭据。

## 验收结果

| 场景与来源 | 操作与实际结果 | 验证方式 | 结论 | 证据 |
|---|---|---|---|---|
| 同一宿主与公共契约；workbench §9.7 | 独立读取公共类型、预设声明、WorkbenchService、两个内部 runtime、IPC、Project 生命周期、Session 回调与 Renderer 集成；374 个源文件扫描未发现旧公共宿主符号或内部 runtime 对外导入；唯一目录、引用、事件及 store 一致 | 实际源代码检查与可重跑扫描 | 通过 | [结构检查结果](evidence/W3-architecture-audit.json)、[脚本](evidence/W3-architecture-audit.mjs) |
| 虚拟预设、稳定 ID、无导航副作用；FR-VIEW-001/002 | 独立运行宿主、IPC、Schema、恢复与 Session 测试，包含目录不插入预设实例、打开不创建会话或事实文件、可移除首条上下文、last-good、关闭后迟到读取、固定修订和 CAS | 真实 Node 服务和 SQLite；Session 为 FakeProvider | 通过 | [W3-independent-unit.log](evidence/W3-independent-unit.log) |
| 共用 Renderer store 与 SDK 1；§9.7 | 独立运行 store、navigation、preview、conversation 和页面桥测试，覆盖目录失效重读、较旧快照拒收、Project 关闭、声明式错误回退、iframe 保存与卸载、SDK 1 page payload | jsdom 与模拟 IPC | 通过 | 同上；15 文件共 154 测试通过 |
| 对话内工作台标签与来源跳转 | Main 修正旧“当前 View”与“在 View 中打开”后，独立运行 Session/Markdown 直接回归 | jsdom 与模拟 IPC | 通过 | [W3-context-label-unit.log](evidence/W3-context-label-unit.log)，2 文件 46 测试通过 |
| 产品概念与文档归属；DEC-29 | 复核 01～06、DEC-29、09/WB-Q8 与相关 spec；此前“默认 View 不迁移”、旧公共目录/API、错误信息架构层级和状态摘要均已修正，历史记录保留原基线 | 独立文档复核 | 通过 | 负责文档最终差异 |
| 预设导航、无自动生成；FR-VIEW-001/002 | 从打开本地目录入口进入隔离 Project，点击 Business Flow、Architecture；同一“工作台”导航显示五个预设，Session 列表为空，`.ai-studio` 尚不存在 | agent-browser；真实构建和实际 Provider，未发送模型请求 | 通过 | [预设截图](evidence/W3-preset-business-flow.png)、[文件检查](evidence/W3-open-side-effects.json) |
| 文件监视、last-good 与恢复；DEC-07 | 在外部写入 Architecture Knowledge，界面显示 GOOD 标记；改为坏 JSON 后显示局部错误且保留 GOOD；再写入 RECOVERED 标记后自动恢复。Conversation 保持 | agent-browser + 明示的外部文件 fixture | 通过 | [正常](evidence/W3-knowledge-good.png)、[坏文件回退](evidence/W3-knowledge-last-good.png) |
| 模板创建、状态与统一导航；AC-WB-01/06 | 点击添加工作台→简单模板，在 iframe 保存笔记并增加计数至 1，添加至项目；同一列表出现实例和设计草稿，切换 Overview 后重新打开，状态保持 | agent-browser，所有保存通过页面 SDK 和宿主 | 通过 | [已保存实例](evidence/W3-custom-instance-saved.png)、[保存值](evidence/W3-saved-state.json) |
| Overview 宿主摘要；PV-Q6 | 打开 Overview；Recent Sessions、Needs Input、Recently Completed 仍显示宿主管理的真实 Session 摘要 | agent-browser | 通过 | [Overview 摘要](evidence/W3-overview-session-summary.png) |
| 停用、启用与编辑草稿隔离；AC-WB-02/08 | 停用后 iframe 卸载，启用恢复原笔记；进入编辑工作台，仅把草稿状态改成 DRAFT_ONLY_STATE 并保存，再应用；现有实例仍保留原笔记和计数。该操作没有改写包文件 | agent-browser | 通过 | [已停用](evidence/W3-custom-disabled.png)、[应用后保留原实例状态](evidence/W3-edit-applied-preserved-live-state.png) |
| 重启恢复；AC-WB-06 | 关闭并重启同一隔离 userData；选中的随手记实例、计数 1、原笔记、统一导航及最近对话入口恢复 | agent-browser，完整应用重启 | 通过 | [重启截图](evidence/W3-restarted-custom.png)、[界面快照](evidence/W3-restarted-custom.txt) |
| 实际 Codex 预设首条上下文；DEC-06/§9.7 | 在 Architecture 草稿保留上下文标签，发送只读标记请求；实际答复 `UNIFIED_PRESET_CONTEXT_OK \| Architecture`，回合完成 | 实际 Codex 经应用 UI；默认模型 | 通过 | [答复](evidence/W3-preset-real-response.txt)、[截图](evidence/W3-preset-real-response.png) |
| 实际 Codex 自定义首条上下文；§9.7 | 在随手记实例草稿发送只读标记请求；实际答复 `UNIFIED_CUSTOM_CONTEXT_OK \| 随手记 \| UNIFIED_NOTE_20261111`，正确读取宿主保存状态并完成 | 实际 Codex 经应用 UI；默认模型 | 通过 | [答复](evidence/W3-custom-real-response.txt)、[截图](evidence/W3-custom-real-response.png)、[持久化记录](evidence/W3-saved-state.json) |

## 界面准备边界

[W3-ui-launch.mjs](evidence/W3-ui-launch.mjs) 使用隔离临时 Project 与 userData，保留实际 Provider。测试替身仅返回原生目录选择结果并设置窗口尺寸和焦点；不注入应用状态、不替换网络或模型响应、不通过内部接口代替用户行为。外部 Knowledge 文件写入与坏 JSON 是独立标明的测试数据。界面操作由 agent-browser 执行，已查看关键截图。启动和重启见[运行记录](evidence/W3-launch-history.jsonl)。

实际两轮的 `originViewId` 分别为 `architecture` 与保留稳定 ID 的自定义实例，`viewContextAttached` 均为 true。转录中的工具行均为 Codex 的 reasoning 项，没有命令、文件或其他执行工具。检查记录不保存密钥、账户信息或完整本机配置。应用与 agent-browser 验收会话已关闭。
