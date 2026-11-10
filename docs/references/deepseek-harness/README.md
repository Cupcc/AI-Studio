# DeepSeek Harness 插件与工作台调查

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 文档职责 | 记录 DeepSeek Harness 的源码事实、复用价值与调查边界；AI Studio 的确认依据见 [09](<../../09. Workbench Discussion.md>)，详细行为由[工作台规格](../../../specs/workbench/spec.md)维护 |
| 调研日期 | 2026-11-10 |
| 源码基线 | 官方仓库 `deepseek-ai/deepseek-harness`，commit `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` |
| 调查方式 | 阅读固定版本的官方文档、入口源码、包声明与出货的 Creator skill；未安装依赖、启动 Harness、生成或安装插件，也未执行上游测试 |
| 需求来源 | 2026-11-10 用户对话：调查 Harness 左侧入口、自定义插件与 AI 创建流程，落稿至本地 references，并更新工作台讨论稿 |

## 1. 调查结论与范围

Harness 已提供一条明确的扩展路径：插件包声明浏览器入口，宿主发布模块，客户端注册导航项和主面板，Creator 会话协助编写并安装插件。左侧入口与主面板通过相同 ID 关联；创建入口只准备草稿，生成结果仍需安装和验证。

本文覆盖 `ui-sidebar`、`ui-layout`、`ui-entry-customization`、`ui-plugin-manager` 的相关入口代码，`modules` 的契约与清理代码，以及 Host Plugin Manager、Creator skill、示例包和许可文件。后文“来源事实”来自这些文件，不代表实机观察。上游将项目标为 developer preview，并明确预告兼容性破坏，不能把当前契约视为稳定插件标准。[项目定位与状态][project]

## 2. 来源事实：左侧入口如何打开主面板

| 环节 | 代码行为 | 固定版本依据 |
|---|---|---|
| 插件声明入口 | 向根作用域的 `sidebar.panellist` 列表注册图标组件，注册选项包含 `id`、`label` 和可选 `order`。图标是组件参数，并非清单里的图标 URL。 | [侧栏契约][sidebar-contract]；[Plugin Manager 入口注册][manager-entry] |
| 插件声明面板 | 在根作用域的 `main` keyed slot 注册页面组件，`key` 与导航项 `id` 一致。Plugin Manager 使用同一个 `PANEL_ID` 注册 `PluginManagerPage` 与 `PluginsPanelIcon`。 | [主面板与入口注册][manager-entry] |
| 侧栏生成列表 | `syncPanels` 读取 slot 注册项，解析本地化标签并按 `order` 排序，订阅注册与语言变化。点击回调交给 `ctx.layout.selectPanel(id)`。 | [侧栏组装代码][sidebar-code] |
| 布局选择面板 | `selectPanel` 先检查对应 `main` 项是否存在。不存在时抛错并保留原选择；存在时更新布局选择。 | [选择逻辑][layout-select] |
| 主区域呈现 | `MainPanel` 订阅 `activePanelId`，用 `renderSlot('main', …, { entryKey })` 呈现对应组件；未选择全局面板时使用 `conversation`。 | [主区域渲染][main-render] |

这条路径把导航和内容分开注册。其契约不要求面板必须属于某个 Session。Plugin Manager 的整组注册还受 `pluginManager/listBundles` 访问能力控制，说明“包存在”“当前能访问”“侧栏显示”是不同条件。[Plugin Manager 注册范围][manager-entry]

侧栏取消固定只隐藏入口，不删除主面板、注册或当前选择；固定偏好保存在页面内存，插件重载后重置。这是该版本的产品行为，不能据此推定持久化工作台导航已具备。[固定与取消固定][sidebar-contract]

## 3. 来源事实：用户通过 Creator 创建插件

### 创建入口先准备会话草稿

用户打开左侧导航下的 **More**，选择 **Create your plugin**。会话视图和右侧工具区也有同类入口，各自填入不同的简短提示语。左侧入口的中文提示语是“创建一个带左侧栏入口的 DSH 插件。”[入口说明][create-doc]；[提示语][create-copy]

`createPlugin` 调用 `uiWorkspace.startSession(undefined, { agentPreset: 'cordis', prompt, whenDraftExists: 'append' })`。它打开新会话或复用可用的空会话，并把提示语放入草稿；已有草稿保留正文、引用和附件，再追加一段文字。入口不会自动发送消息，用户仍需检查并发送。[创建代码][create-code]；[草稿行为][create-doc]

`startSession` 需要可用 Workspace。该入口没有显式指定 Workspace，代码依次使用当前 Session 所属 Workspace、最近使用的 Workspace。带提示语但找不到 Workspace 时，代码通知 `draft.workspaceRequired` 并返回。[Workspace 前置条件][workspace-create]

### 发送之后由 Agent 编写与安装

上游出货的 `cordis-plugin-development` skill 规定以下流程。这是给 Creator Agent 的工作指令，不是本次观察到的执行结果，也不是生成成功保证。[Creator 工作流程][creator-skill]

1. 明确用户所需结果与目标区域，查询 `cordis_inspect_list`、`cordis_inspect_query`；UI 插件查询实际 slot、注册选项和 props。
2. 在普通工作区编写 bundle，包含包声明、patch 和必要的 Host、Client 文件。检查语法、清单、标题、描述、图标与导出资源。
3. 调用 `plugin_manager`，以 `action: install_bundle` 和绝对包目录安装到当前 profile。
4. 检查结果中的 `application` 与 `warnings`，再核对运行时注册、实际能力和用户可见页面。安装成功或 slot 注册成功都不足以证明 UI 可用。

Creator 提供只读运行时查询，浏览器侧查询需要连接的页面。实际修改 profile 由 Plugin Manager 负责。其工具在非 Full access 环境下需要调用批准，依赖构建脚本还有单独的批准机制；这些是上游执行限制，本次没有触发这些操作。[运行时查询][inspect]；[管理工具权限][host-manager]；[依赖构建脚本][build-approval]

## 4. 来源事实：包与宿主的职责

| 层次 | 负责内容 | 边界 |
|---|---|---|
| 可安装 bundle | `package.json` 的 `dsh.bundle.patch` 指向组合补丁，补丁插入或覆盖插件行。示例还声明 `exports`、资源和发布文件。 | 只有 `dsh.client` 不等于可由 Plugin Manager 安装的 bundle。普通依赖缺少 bundle patch 会被拒绝。 |
| 浏览器声明 | `dsh.client` 声明 `platform: 'web'`，包导出 `./client`；非基线运行时模块请求放入 `dsh.client.external`。 | 浏览器模块需要既有构建产物；声明不负责生成 UI，也不声明安全权限。 |
| Host 模块系统 | 读取声明，组成 boot graph，按依赖提供 `/plugins` 下的构建产物。 | Host 发布和浏览器加载分属两端。 |
| Client 模块系统 | 加载并注册 lazy factory，在首次导入或 materialize 时执行模块主体；动态分块在需要时请求。 | 不等于“点击侧栏才加载整个插件”。启动阶段会先传输入口工厂。 |
| UI 插件管理页 | 展示清单、设置、安装进度和管理操作，通过 Remote 调用 Host。 | 没有 managed profile 时不可用；页面显示不是运行状态的唯一证据。 |
| Host Plugin Manager | 安装、保存 bundle 选择或插件 `disabled` 覆盖、应用配置、卸载及报告结果。 | 变更属于 profile，影响该 profile 的会话，不是单一 Project 的局部开关。 |

包结构见[出货示例清单][template-manifest]与[组合补丁][template-patch]；模块声明、构建及加载见[客户端模块契约][modules-contract]；管理页与安装条件见[管理页说明][manager-doc]、[Host 管理契约][host-manager]。

安装输入支持 npm spec、本地目录、Git 与 tarball。Host 管理器按输入形式检查元数据，并通过包管理器执行安装；支持这些来源不意味着每个来源都能在下载前完整验证。[安装输入与检查][install-check]

### 启用、停用和卸载并不相同

- 安装保存包依赖；安装新 bundle 默认启用。bundle 开关修改 `dsh.profile.bundles` 的选择，单个插件开关修改 profile patch 的 `disabled`。停用保留依赖。[选择与覆盖][selection]
- 启用记录是期望状态，不能代替加载结果。`enabled` 可以为真而 bundle 仍报错；未开启 HMR 时，保存的变更需重启才生效。[管理状态][selection]；[Host 应用时机][host-manager]
- 页面随 Host 模块图协调加载状态。停用时删除 Loader entry，等异步 effects 清理后再移除不再使用的模块和样式；其他活动入口仍使用的共享模块保留。页面同步失败可重试，重试不改变 Host 启用状态。[客户端生命周期][modules-contract]
- 清理代码等待 fiber 的 `inertia`，并按包 ID 删除 `style[data-plugin]`。插件作者仍须把监听器、计时器等资源纳入 `ctx.effect` 或 `ctx.on` 的生命周期并返回清理函数。[清理实现][cleanup-code]；[UI 插件资源约定][ui-authoring]
- 卸载依次取消 bundle 选择、卸载运行时贡献、执行包移除、发布解析结果。步骤失败保留已经完成的变更并报告余下状态，不提供完整事务回滚。[卸载与失败语义][remove]
- Host release 以版本和 commit 标识。页面遇到不同 release 时保持旧插件，刷新页面才加载新 release；失败重试不能替代跨 release 刷新。[release 边界][modules-contract]

## 5. 来源事实：执行边界与许可

这些插件通过 Cordis Context、共享模块表和宿主服务组合。Host Plugin Manager 明确说明，安装的 Host 代码在宿主进程内执行，处于 Workspace sandbox 外。浏览器插件模板也直接使用页面 React 与 slot 服务。因此，slot 注册、模块依赖声明和 effect 清理都是组合与生命周期机制，不能当作不可信插件的隔离边界。[Host 执行边界][host-manager]；[浏览器运行方式][ui-authoring]

固定版本的根 `LICENSE` 是 MIT，版权人为 DeepSeek，文本要求在副本或实质部分保留版权与许可声明。所读 `ui-plugin-manager/package.json` 也声明 MIT。[根许可证][license]；[示例包许可与依赖][manager-package]

根许可不能覆盖全部依赖。`THIRD_PARTY_NOTICES.md` 说明第三方项目仍按各自许可发布，清单覆盖直接依赖及另列的分发内容，完整 npm 传递依赖由锁文件记录。该文件还列出 vendored Cordis、Loader 等基础库及其 MIT 许可；本次未逐项审计所有依赖或二进制分发内容。[第三方声明与范围][notices]

## 6. 我们的判断：哪些做法值得参考

以下是基于上述源码的适配判断，不是上游承诺，也不新增 AI Studio 的已确认需求。AI Studio 的详细行为由[工作台规格](../../../specs/workbench/spec.md)维护，原型范围由[路线图 §4.2](<../../06. Development Roadmap.md#42-自定义工作台原型>)维护。

| AI Studio 相关模块 | 可参考的做法与收益 | 适配成本或限制 |
|---|---|---|
| 工作台导航与主区域 | 以稳定 ID 对应导航项和面板，让新增工作台有固定入口，不必修改侧栏组件的业务分支。 | 可借鉴小型注册契约；现有导航、Project 绑定和面板状态仍需本项目定义。 |
| Session 与 Composer | 创建入口把目标区域与请求带入可审阅草稿，再进入普通 Agent 会话，保留修改请求的机会。 | Harness 的 `cordis` preset、Workspace 选择及 draft API 依赖自身会话系统，不能直接接入现有 CLI Adapter。 |
| 插件设置与状态 | 分开呈现包是否安装、是否启用、Host 是否应用、页面是否加载，能解释“已安装但未出现”的问题。 | Profile patch、Remote、Loader 和页面图协调是成套机制；移植管理页本身无法获得这些能力。 |
| 生命周期与恢复 | 跟踪注册、订阅、样式和任务的释放顺序，保留错误与重试入口，避免重复启用留下旧资源。 | 必须覆盖 AI Studio 自己的 IPC、文件监听与预览资源；上游 cleanup 只认识上游资源。 |
| Project View 与产物 | 将面板容器和面板内容拆开，为不同工作视图保留一致入口与退出方式。 | Harness 的根作用域 slot 不自动提供项目数据隔离、产物绑定或项目间切换语义。 |

建议先提取上述契约与行为，再结合现有桌面架构实现范围明确的宿主。直接整体复制 `ui-plugin-manager` 或 `modules` 会引入 Cordis、Loader、Remote、模块表、构建协议和 profile 配置体系。包清单已显示这些耦合，而且上游仍处于 developer preview。[管理页依赖][manager-package]；[模块两端与加载器][modules-internals]；[项目状态][project]

若后续确定复制具体代码，先列出目标文件、运行时依赖和分发资源，再保留对应版权与许可声明并核对依赖许可。本次只调研，没有复制上游实现或引入依赖。

## 7. 后续调查

本轮已回答左侧入口到面板、Creator 草稿入口、包声明和生命周期职责。下一轮如需评估真实体验，应在隔离的测试 profile 中走通创建、检查草稿、生成、安装、打开、停用、再启用与卸载，并观察缺少 Workspace、加载失败、断线和版本变化。这些步骤尚未执行，不能列为通过。

调查提供源码参考，不代替本产品的权限、分发或兼容性决定。已确认方向见 [09](<../../09. Workbench Discussion.md>)，后续技术核实与产品细节见[工作台规格 §1](../../../specs/workbench/spec.md#1-职责与后续事项)；其他项目的调查顺序见[参考项目索引](../README.md#建议先展开的调查)。

[project]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/README.md#L5-L15
[sidebar-contract]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-sidebar/README.md#L40-L44
[manager-entry]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-plugin-manager/src/client/index.ts#L106-L174
[sidebar-code]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-sidebar/src/client/index.ts#L53-L92
[layout-select]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-layout/src/client/service.ts#L71-L78
[main-render]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-layout/src/client/AppFrame.tsx#L45-L50
[create-doc]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-entry-customization/README.md#L29-L37
[create-copy]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-entry-customization/src/client/locales.ts#L2-L20
[create-code]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-entry-customization/src/client/index.ts#L40-L65
[workspace-create]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-workspace/src/client/navigation.ts#L337-L365
[creator-skill]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md#L8-L32
[inspect]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/extensions/tool-cordis/README.md#L12-L28
[host-manager]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md#L14-L33
[build-approval]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md#L72
[selection]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md#L40-L48
[template-manifest]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/preset/agent-preset/skills/cordis-plugin-development/templates/decoration/package.json#L1-L21
[template-patch]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/preset/agent-preset/skills/cordis-plugin-development/templates/decoration/cordis.patch.yml#L1-L3
[modules-contract]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/modules/README.md#L28-L59
[manager-doc]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-plugin-manager/README.md#L28-L34
[install-check]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md#L46-L50
[cleanup-code]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/modules/src/client/entry-lifecycle.ts#L9-L27
[ui-authoring]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/preset/agent-preset/skills/cordis-plugin-development/references/ui-plugin.md#L3-L13
[remove]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/boot/plugin-manager/README.md#L186-L197
[license]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/LICENSE#L1-L21
[manager-package]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/ui-plugin-manager/package.json#L37-L77
[notices]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/THIRD_PARTY_NOTICES.md#L4-L26
[modules-internals]: https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/client/modules/README.md#L71-L95
