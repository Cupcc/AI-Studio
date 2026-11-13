export const AUTHORING_GUIDE = `# AI Studio 工作台开发说明 · SDK 1

宿主提供普通 HTML/CSS/JavaScript 页面插件。无需 npm、构建工具或后端进程。可使用多个包内静态文件；入口必须为 HTML。

## 包布局

- manifest.json：按 manifest.schema.json 描述 schemaVersion、pluginId、version、sdkVersion、title、entry、capabilities。
- index.html（或 entry 指定的 HTML）：页面；CSS、JS、图片可以是包内相对路径。
- 不要把 node_modules、构建缓存、凭据或项目文件复制进包。每个文件不超过 2 MiB；包不超过 16 MiB 或 128 个文件。
- 宿主检查所有包文件及入口，拒绝绝对路径、..、符号链接和特殊文件。HTML 的本地 src/href（包括脚本、样式和图片）应指向存在的包内文件。
- 宿主不会运行安装脚本、Node 插件或后端代码。不要访问 window.studio、数据库或其他实例。
- 这里只在草稿目录中编辑，已应用 packages 目录由宿主维护。应用更新由用户在预览后触发；不要直接改 packages 或 SQLite。

## 页面 SDK

宿主在页面入口之前注入 window.workbench；不需要自行加载 SDK。完整签名见 sdk.d.ts。

- getInstance()：返回当前绑定目标、manifest、state、stateRevision、pageUrl、enabled，以及已声明能力提供的 resources。
- updateState(state, expectedRevision)：写当前目标的 JSON 状态并返回新快照。期望版本必须与最近快照一致；冲突时重新读取、让用户确认后重试，不能悄悄覆盖。状态上限 1 MiB。
- subscribe(listener)：接收当前目标状态更新，返回取消订阅函数；页面卸载时清理监听。用新的快照更新显示。
- setDraft(text, options?)：填入可编辑的对话草稿。options.target 可选 current（默认，当前对话）或 new（当前工作台的新对话草稿）。它不发送请求、不调用模型。用户仍需点击 Send。
- openSession(sessionId)：将当前 Project 的已有 Session 打开到工作台对话列，不发送消息或调用 Stop。需要 session.open 能力。
- startAgent(request)：需要 agent.execute，且仅已添加实例可调用。请求字段 requestId（稳定唯一编号）、key（业务节点）、title、text、model（可空）；复用宿主 Codex Provider 创建真实会话。由用户点击执行触发，重复编号复用同一执行。
- listAgents() 返回当前实例的请求与 Session 摘要；getAgent(requestId) 返回该执行的最近 transcript（最多 500 项）；stopAgent(requestId) 停止对应 Session。结果、审批和错误来自实际 Provider；通过 openSession 处理需输入与重试。后台执行不消耗未发送的 Composer 草稿。
- project.knowledge.read：与 manifest.knowledgeViewId 一起声明，在 resources.knowledge 接收相应项目知识和 Definition 的校验快照。支持 overview、progress、architecture、agent-team、business-flow。快照带 loading、stale、empty、ready、error 状态；错误时保留上一版有效 snapshot。页面应显示错误并继续呈现有效内容，不自行读取项目文件。
- project.sessions.read：在 resources.sessions 接收当前 Project 的最小 Session 摘要，包含 id、title、activity、status、lastOutcome、updatedAt、lastUserMessageAt、createdAt；无完整对话或凭据。
- resources 的变化通过现有 subscribe 推送，不改变 stateRevision；stateRevision 只用于 JSON 状态写入冲突检查。
- appearance 提供当前外观的 dark 和 CSS variables；页面可用于匹配宿主主题。App 预设与自定义包使用相同清单、页面 SDK、资源能力和加载方式。
- 能力按实际使用在 manifest 声明。未声明的资源不会提供；只声明读取资源不会授予写入、打开 Session 或发送消息的能力。

每个页面只绑定一个目标。草稿预览的状态与实例状态隔离；首次添加保留草稿中已保存的状态，编辑应用保留实例当前已保存状态。页面应兼容空对象并提供默认显示。包版本变化不会自动迁移状态，请保持已有字段可读。

页面中的原生 title 提示在宿主里不显示。只有图标的按钮用页面内提示显示名称，并保留 aria-label；拖动、平移等基本操作不写常驻说明。

页面启动、刷新、切换或恢复不能自动发起模型请求。异步 API 必须显示真实错误；不要把文件生成成功、包校验成功和页面操作成功混为一谈。

## 创建与验证

1. 读取本目录的 manifest.schema.json 和 sdk.d.ts；模板见 template.html。
2. 编辑用户指定的草稿目录，保留 manifest.json 与有效入口。版本有变化时更新 version。
3. 写完整文件后，在宿主点击“刷新预览”。宿主返回包校验或页面运行错误；根据具体错误修正草稿。
4. 在预览中实际操作按钮与保存状态，并确认重新打开仍能恢复。
5. 用户选择添加或应用后才更新项目实例；不能仅凭文件存在报告已添加或验收完成。

开发资料由当前宿主版本维护。不要猜测不存在的 SDK、命令桥或 MCP；图片生成、位置绑定、市场、导入分享和通用后端插件不在 SDK 1 的范围。
`
