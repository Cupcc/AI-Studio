# 验收：T20261111-workbench-web-format

## 未覆盖与边界

- 本任务只验证统一网页插件格式。列表管理属于并行任务；不扩展隐藏、重排或预设编辑行为，不验证图片业务、其他 CLI、Developer ID 签名、公证或发布。
- 实际 Codex 只运行两轮只读上下文请求，分别来自 Business Flow 和自定义随手记实例；不重新覆盖完整 CLI 能力或要求模型重写插件包。
- 实际 `.app` 检查仅覆盖本机 arm64、本次本地 ad-hoc 处理后的产物及 Architecture、Overview、随手记三个页面。原 `identity:null` 产物签名无效，Main Agent 对本地测试产物重新 ad-hoc 签名后才可启动；没有修改仓库签名配置，也不代表分发验证通过。
- 独立手工坏 JSON 回退和 Overview 打开 Session 的补充尝试因 Project 意外切换、重复标题旧引用而未计为通过；这两项由独立真实服务／页面单测及 Main Agent 实际 Electron E2E 覆盖，见下列证据，不以手工尝试补记。

## 人工功能验收

- 人工产品验收：待人工验收。
- 文档 diff：待用户审阅；用户明确统一格式的方向不代表已接受本次具体交付。

## AI 结论与环境

- 最终结论：通过。本任务的统一网页格式、直接回归、所选实际 UI、两类真实 Codex 上下文与本地打包页面检查均有证据；发现的透明按钮文字已修复并独立复验，无未解决的本任务代码阻塞项。
- 验收者：`/root/rationale`，未修改生产实现；此前提供历史调查、验收范围与只读评审。
- 基线：2026-11-11，HEAD `6e891415117a1efb6469620702b0c67870e18709` 加本任务未提交差异。启动前已有工作基线与本次交付差异由 Main Agent 单独保存，不相互归属。
- 平台：Darwin arm64。直接 Node/SQLite 测试和 jsdom 测试使用模拟 Provider；开发构建和 `.app` UI 使用实际 Provider，Codex CLI `0.167.1`，保持界面 `GPT-6.1-Sol（默认）`，未调整模型、强度或连接配置。
- 源码、构建与本地测试 `.app` 的 SHA-256 见[最终哈希](evidence/W3-final-source-build-hashes.json)。`app.asar`、可执行文件和签名资源分别记录，不能把未处理产物的启动失败算作最终通过。

## 独立检查结果

| 场景与来源 | 操作及实际结果 | 方式 | 结论 | 证据 |
|---|---|---|---|---|
| 用户“内置的组件应该也是自定义网页的方式，统一格式” | 独立检查五个 manifest、HTML/JS/CSS、PackageRuntime、统一资源注入、SDK、WorkbenchPage 和通用快照；370 个源文件中没有原生预设 Renderer 或 Overview 内容组件，所有包共用相同 JS/CSS 产物 | 实际源码与产物检查 | 通过 | [结构脚本](evidence/W3-format-audit.mjs)、[检查及包哈希](evidence/W3-format-audit.json) |
| 文件资源、last-good、稳定 ID 与虚拟预设 | 独立运行真实宿主、KnowledgeResources、Schema、IPC、SDK、包状态与恢复测试 | Node/SQLite；Session 为 FakeProvider | 通过 | [W3-independent-focused.log](evidence/W3-independent-focused.log) |
| 同一页面 SDK、复制包、作用域和状态 | 独立运行生成的 browser page、页面桥、store、conversation、组件测试；包括复制 Architecture 包的真实服务与复制 Overview 的浏览器脚本、声明能力控制、跨 Project Session 拒绝、迟到页面拒绝及 SDK1 兼容 | 真实服务与 jsdom | 通过 | 同上，13 文件共 70 测试通过 |
| 预设以普通网页载入；FR-VIEW | 依次点击五个预设，均使用 `app://workbench` iframe；发送前没有 Session、数据库预设实例或 `.ai-studio` 目录。Architecture 的外部 Knowledge、SVG 与表格在 iframe 显示；最终 `.app` 也读取到恢复后的同一文件 | agent-browser + 外部数据 fixture | 通过 | [无副作用检查](evidence/W3-dev-open-side-effects.json)、[Architecture](evidence/W3-dev-architecture-data.png)、[实际包](evidence/W3-packaged-architecture.png) |
| 原 SDK1 自定义页面 | 从模板创建、通过 iframe 保存 WEB_PACKAGE_NOTE、增加计数至 1、添加为实例；完整应用切换到实际 `.app` 后仍读取原笔记和计数 | agent-browser，实际宿主及 SQLite | 通过 | [开发构建保存](evidence/W3-dev-template-saved.png)、[打包恢复](evidence/W3-packaged-custom.png)、[持久化记录](evidence/W3-real-saved-state.json) |
| 预设包可作为自定义页面 | 由 UI 创建普通模板草稿，再把最终 Overview 完整包作为明示的测试文件复制进去；字节一致，刷新后在普通自定义草稿中执行 Overview、三类 Session 分组，随后可添加为自定义实例。未新增宿主特权通道 | agent-browser + 明示包文件 fixture；服务测试另覆盖复制包 live 实例 | 通过 | [精确复制哈希](evidence/W3-copied-overview.json)、[自定义草稿中的 Overview](evidence/W3-dev-copied-overview.png) |
| 透明按钮文字修复 | 原毛玻璃浅色按钮文字为 rgba(0,0,0,0)；Main 修改语义 Token 并重建后，浅色白字／深色深字均可见，opacity 均为 1，已查看两张截图 | agent-browser，设置界面切换浅深色 | 通过 | [浅色](evidence/W3-final-light-button.png)、[深色](evidence/W3-final-dark-button.png)、[浅色样式](evidence/W3-final-light-button-style.txt)、[深色样式](evidence/W3-final-dark-button-style.txt) |
| 预设真实首条上下文 | 实际 Business Flow 发送只读标记请求，答复 `WEB_PACKAGE_PRESET_OK \| Business Flow`；originViewId 与附加的知识路径一致 | 真实 Codex，经应用 UI | 通过 | [答复文本](evidence/W3-dev-preset-real.txt)、[截图](evidence/W3-dev-preset-real.png)、[保存记录](evidence/W3-real-saved-state.json) |
| 自定义真实首条上下文 | 实际随手记发送只读标记请求，答复 `WEB_PACKAGE_CUSTOM_OK \| 随手记 \| WEB_PACKAGE_NOTE`，正确读取 SDK 保存状态 | 真实 Codex，经应用 UI | 通过 | [答复文本](evidence/W3-dev-custom-real.txt)、[截图](evidence/W3-dev-custom-real.png)、[保存记录](evidence/W3-real-saved-state.json) |
| `.app` 真实读取与执行 | 实际本地 `.app` 经 LaunchServices 启动，私有端口 53052 的 PID 44373 与 dist 应用可执行文件匹配；Architecture、Overview 和自定义页面均实际加载。Overview Session 分组在 iframe 中，字体响应 200，页面连接与动态内容证明 SDK/JS 已执行，不依赖源目录 | agent-browser，实际 ad-hoc `.app`，未使用 Node inspector 或运行时注入 | 通过 | [启动绑定](evidence/W3-packaged-launch.json)、[Architecture](evidence/W3-packaged-architecture.png)、[Overview](evidence/W3-packaged-overview.png)、[自定义](evidence/W3-packaged-custom.png)、[响应摘要](evidence/W3-packaged-resource-responses.json) |

## Main Agent 自动化补充证据

这些是 Main Agent 的检查，不计入上述独立运行的 70 项测试。评审者检查了实际日志及场景代码；同一基线的有效结果按 Task Protocol 复用。

- [affected-check](evidence/W3-main-affected-check.log)：74 脚本测试、555 应用测试通过；初次 Electron 有 30 项通过，含五预设 iframe、复制 Architecture 的订阅、复制 Overview 的 SDK 会话打开、新建未发送草稿与三个自定义机制场景。
- AC-06 的旧父 DOM 定位修正为 iframe 后，[局部复验](evidence/W3-main-preset-recheck.log)通过。另一个既有 PTY 场景初次报告 closed context，[保持逻辑的独立重跑](evidence/W3-main-runtime-recheck.log)通过。32 个已选择 E2E 场景有有效通过记录。
- [最终构建](evidence/W3-main-final-build.log)及[最终打包](evidence/W3-main-final-package.log)保留具体命令结果；命令成功不代替 `.app` 实际启动检查。

## 测试准备边界

[W3-ui-launch.mjs](evidence/W3-ui-launch.mjs) 使用隔离临时 Project 和 userData，移除模拟 Provider 开关。仅替换原生目录选择返回值、窗口尺寸和焦点，不注入应用状态、宿主响应或模型结果。外部 Architecture Knowledge 和复制 Overview 包均为明示的测试文件。

初期固定 9485 端口出现无法归因的页面切换；随后改用 OS 分配端口并逐次核对监听 PID。开发构建端口 49905 的 PID 28686 与自身 launcher 相符，记录见[启动历史](evidence/W3-launch-history.jsonl)。该进程后续意外退出，未继续重试其 GUI，见[诊断](evidence/W3-unexpected-dev-exit.json)。最终 `.app` 端口与路径另行核对，未操作其他会话。

实际包使用[可重跑启动脚本](evidence/W3-packaged-launch.py)，复用自己的 QA userData 恢复 Project，无 Picker 或行为注入。[HAR](evidence/W3-packaged-network.har)只记录元数据、大小和响应状态，不包含响应体或凭据。关键截图已查看。两轮实际 CLI 的工具行均为 reasoning，没有命令、文件或其他执行工具。自己的 `.app` 与 agent-browser 已关闭。

## 缺陷与复验

1. **生成按钮文字透明**：`style.css` 用透明的 `--color-pane` 作为字色，证据为[原始样式](evidence/W3-generate-button-style.json)与[原截图](evidence/W3-dev-preset-real.png)。Main 改为 primary/on-primary 语义 Token，评审者在最终构建的毛玻璃浅、深两种模式独立复验通过。
2. **未处理 `.app` 无法启动**：LaunchServices 未创建进程，直接执行退出 137，原[签名校验](evidence/W3-packaged-signature.log)报 `code has no resources but signature indicates they must be present`。Main 仅对本地测试产物作 ad-hoc 处理，仓库配置不变；评审者[严格校验](evidence/W3-final-packaged-signature.log)通过，再实际运行三个所需页面。此结论只适用于记录哈希的本地处理产物。
