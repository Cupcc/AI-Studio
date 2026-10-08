# D20261009 Project View 渲染方式与安全沙箱

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 日期 | 2026-10-09 |
| 关联 | FR-VIEW-002（P1）、FR-VIEW-003、FR-VIEW-004；UX D-06；Shell Spec v01 第 7 节；AC-06；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2 节与第 7 节第 3 项；[T20261009-project-view](../../tasks/T20261009-project-view/task.md) |
| 取代 | — |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。本草稿未经人确认，不得作为实现依据。

## 背景

04 第 2 节规定：任何由 AI 生成的 HTML / JavaScript 都不得直接获得 Node.js、文件系统或完整 IPC 权限。04 第 7 节第 3 项要求确定 AI Generated View 的 HTML 渲染及安全沙箱方案。

需要同时满足：

- FR-VIEW-003：Agent 可以调整布局、添加节点、关系图、表格、图表，修改内容结构和视觉呈现。
- FR-VIEW-004：事实写在数据里，展示写在 View 里；修改事实更新数据，修改视觉更新 View（存储见 [D20261009-project-knowledge-storage](D20261009-project-knowledge-storage.md)）。
- UX D-06 / 第 6 节：Preview 只读，支持滚动与缩放；Agent 更新后自动刷新并显示“已更新”时间；渲染失败时保留上一次成功渲染并显示错误提示。Shell Spec v01 第 7 节：示例数据标注“示例数据”。
- 01 第 7 节把链路写作“Project Knowledge → Structured Data → View Rendering → AI Generated UI”；原型 `render.js` 说明了预期的呈现范围，仅作示意。

威胁模型：View 内容最终来自 Agent，而 Agent 会读取项目文件、网页和依赖，存在提示注入。可信边界应假定“Agent 输出的 View 可能是恶意的”：它不得获得 Node、文件系统或 preload 暴露的 IPC，不得向外发送数据，也不得影响外壳（导航、弹窗、窃取焦点、遮盖界面）。Preview 位于持有 preload 的主窗口内，边界必须在渲染方式上建立，而不是依赖 Agent 的自觉。

## 决定

采用两层模型。**V1 P0 只实现第一层**，第二层的安全规格先定下来，启用时机另行确认。

### 第一层：声明式 View Definition + 受信 React 组件（V1 默认）

1. View Definition 是经 Schema 校验的 JSON。Agent 只能选择组件、布局属性、数据绑定和样式变体，不能提供可执行代码、HTML、SVG 或任意 CSS。
2. 初版组件词汇（示意，最终随 Schema 定）：布局 `stack`、`grid`、`section`；内容 `text`（受限 Markdown 子集）、`keyValue`、`badge`、`stat`、`progress`；数据 `table`、`list`、`timeline`、`steps`、`graph`（节点与边，自动布局，可按字段分组）、`chart`（少数基础图表）。组件通过 `Knowledge id:JSON Pointer` 绑定数据，版式信息（位置、颜色、图表类型）只出现在 View Definition。
3. 渲染全部在主 Renderer 内由客户端代码完成：文本只经 React 文本节点输出，不使用 `dangerouslySetInnerHTML`；Markdown 子集不允许原始 HTML；链接仅允许 `http(s)`，点击后由主进程校验并交给系统浏览器（Electron 检查清单 #15）；图片仅允许 `data:` 或经受控读取的项目内相对路径，不允许远程 URL；样式只接受枚举值（设计 token 变体），不接受任意样式字符串。关系图的版式由渲染器的布局库计算，不让 Agent 写坐标。解析 Agent 文本的第三方图表库（如 Mermaid）不进入主 Renderer。
4. 缩放与滚动由 Preview 容器实现（容器缩放 + 滚动，`graph` 自带平移缩放）。控件形式 UX 未定。
5. 应用随版本内置五个默认 View 的 Definition。Agent 在 `views/<id>.view.json` 写入的是覆盖版本，缺失时用内置默认。因此 Knowledge 生成后 Preview 即可呈现，生成指令不必同时产出视觉。
6. 失败处理（UX D-06）：JSON 解析、Schema 校验、绑定解析或渲染异常中任何一项失败，整页视为渲染失败，保留上一次成功渲染并显示错误条。没有上一版时（例如首次打开就是无效文件）：只有 Definition 无效则用内置默认外观渲染并显示错误条；Knowledge 无效则只显示错误说明（与“尚未生成”的空状态区分）。不做“局部降级”。
7. “示例数据”标注：任一被绑定的 Knowledge 的 `example` 为 `true` 时，Preview 顶部显示标注。
8. Overview 中的 Recent Sessions、Needs Input、Recently Completed 来自客户端 Session 数据（UX 第 6 节），由客户端在固定区域渲染，不属于 View Definition，Agent 无法修改或读取其数据；Knowledge 为空时同样显示。

FR-VIEW-003 的覆盖与限制：

| 能力 | 第一层如何满足 | 限制 |
|---|---|---|
| 调整布局 | 改变组件树的嵌套、顺序、列数、折叠 | 只有组件提供的布局属性，没有像素级控制 |
| 添加节点、关系图 | Knowledge 增加节点与边，`graph` 自动呈现 | 版式由渲染器决定 |
| 添加表格、图表 | `table`、`chart` 绑定到数据字段 | 图表种类限于词汇表，新增种类要随应用发布 |
| 修改内容结构 | 改组件树与绑定 | 同上 |
| 修改视觉呈现 | 切换变体（密度、强调、分组、方向等） | 限于设计 token，不开放任意 CSS（与 UX 第 8 节“安静、低噪”一致） |

这是本决定相对“AI 直接写 HTML”最大的取舍，已列入未决问题 1。

### 第二层：沙箱 HTML（预留，规格先定，启用另行确认）

适用于词汇表无法表达的 View，例如 P1 的自定义 View。View Definition 声明 `format: "html"`，指向 Agent 写的 HTML 文件。安全规格：

1. 通过自定义协议（如 `studio-view://`）加载，由主进程在响应头下发 CSP：`default-src 'none'`，仅放开 `style-src 'unsafe-inline'`、`script-src 'unsafe-inline'`、`img-src data: blob:`、`font-src data:`，并设 `connect-src 'none'`、`form-action 'none'`、`base-uri 'none'`、`frame-src 'none'`、`object-src 'none'`。禁止网络出站，数据无法外泄。不使用 `srcdoc`（继承父页面环境，相对 URL 按父页面解析）。
2. 嵌入方式为 `<iframe sandbox="allow-scripts">`：不带 `allow-same-origin`（内容得到永不同源的特殊来源，不能读取父页面 DOM、存储和 Cookie），不带 `allow-popups`、`allow-top-navigation`、`allow-forms`、`allow-modals`、`allow-downloads`。`allow-scripts` 与 `allow-same-origin` 不得同时出现。
3. 不开启 `nodeIntegrationInSubFrames`，iframe 内没有 preload 暴露的 API；主进程所有 IPC 处理器校验 `senderFrame`，拒绝来自该 iframe 的请求（Electron 检查清单 #17、#20）。拒绝一切会话权限请求，拦截导航与新窗口。
4. 数据通道：宿主在加载后用 `postMessage` 传入已校验的 Knowledge 与主题变量；iframe 到宿主只接受 `ready`、`error`、`resize` 三类消息，经 Schema 校验，其余丢弃。没有“调用主进程”的消息。
5. 双缓冲：新版本在隐藏 iframe 加载，收到 `ready`（有超时）才替换；超时或 `error` 时保留旧版并显示错误条，满足 D-06。
6. 不向该层提供任何客户端 Session 数据。
7. 若 Electron 原型表明同进程的 iframe 隔离不足，则同一规格迁移到无 preload、独立 partition 的 WebContentsView（见备选方案）。

以上规格在启用前须在 Electron 原型中验证：自定义协议响应头 CSP 的实际效果、沙箱 iframe 对 IPC 的隔离、导航与弹窗拦截。

## 备选方案

| 方案 | 放弃原因 |
|---|---|
| 只有沙箱 HTML：所有 View 都由 Agent 写 HTML / JS | 表达最自由，但：事实容易被直接写进 HTML，FR-VIEW-004 无法由规格强制；关系图靠 Agent 手写 SVG 坐标，版式质量和一致性不稳定；校验只能判断“是否加载成功”，无法给 Agent 具体的修正反馈；与白色安静的设计 token 难以统一；安全面最大。作为第二层保留，不作 V1 基线 |
| 独立的 WebContentsView（无 preload、独立 partition）承载 HTML | 进程隔离最强。但原生子视图一般叠放在 DOM 之上，外壳的菜单、对话框、提示和分栏拖拽手柄可能被遮挡（推断，需用真实窗口确认）；每个 Project 的每个 View 一个 WebContents，资源与生命周期复杂；需要同步边界、焦点和缩放。保留为第二层的升级路径；Browser Preview 虽已使用 WebContentsView，但那是整块替换 Preview 区域的预览页，场景不同 |
| `srcdoc` + `sandbox` iframe | 内容继承父页面的策略环境，相对 URL 按父页面解析；CSP 只能靠宿主在首个元素注入 `<meta>`，第三方测试显示有效但需在 Electron 复验。自定义协议加响应头更可靠 |
| `<webview>` 标签 | Electron 检查清单 #11、#12 不推荐；DOM 内可被脚本创建 |
| 在主 Renderer 内直接用 `innerHTML` 渲染经过净化的 HTML | 净化器是单点防线，一旦绕过即获得 preload 暴露的全部能力 |
| 离屏渲染 HTML 为图片再显示 | 失去清晰缩放和文本选择，实现复杂，仍需要一个渲染进程承载不可信 HTML |
| 采用 Mermaid / Vega 等文本规格并在主 Renderer 直接解析 | 这类库解析 Agent 文本，历史上有多起注入类漏洞公告；放进主 Renderer 等于扩大受信代码面。需要时只放进第二层的 iframe |
| 整套采用 A2UI 等现成的声明式协议 | 采用其“宿主发布受信组件目录”的思路，但 V1 的词汇是项目专用的，协议仍在演进；等词汇稳定后再评估是否对齐 |
| 单个组件出错时局部降级，其余照常渲染 | 会呈现与 Knowledge 不一致的半成品页面，与 D-06“保留上一次成功渲染”不符 |

## 影响

- 需要定义 View Definition 的 JSON Schema、组件词汇、绑定语法和应用内置默认 Definition（后续 `specs/project-view/spec.md`）。
- T20261009-app-skeleton：主进程 IPC 统一校验 `senderFrame`；为第二层预留自定义协议注册与会话级 CSP 钩子（第一层不需要）；Renderer 的 `sandbox`、`contextIsolation` 保持开启。
- T20261009-project-shell：Preview 容器包含错误条、“已更新”时间、“示例数据”标注、缩放；更新不改变右侧当前显示的内容（P-B）。
- 图表、关系图的实现库选型留到实现阶段，要求不执行 Agent 提供的代码、不发起网络请求。
- 第一层不依赖 HTML 沙箱，因此 V1 P0 不被 Electron 沙箱验证阻塞；FR-VIEW-002 的自定义 View 若需要超出词汇表的呈现，再启用第二层。
- 若人要求 V1 就支持自由 HTML，则第二层规格变为 V1 必做项，并需要 Electron 原型验证后再确认。

## 未决问题

| 问题 | 推荐 |
|---|---|
| V1 是否接受“Agent 只能在受信组件词汇内设计 View”，自由 HTML 推迟到 P1 | 接受。理由：满足 FR-VIEW-003 列出的能力、强制 FR-VIEW-004、关系图版式稳定、安全面最小。01 第 7 节与 04 第 7 节的“AI Generated UI / HTML 渲染”措辞偏向 HTML，这点需要人确认 |
| 第二层何时启用 | 随 FR-VIEW-002 自定义 View，或评审默认五个 View 时发现词汇明显不足时启用 |
| 内置默认 Definition 由应用提供、Agent 的文件只是覆盖，是否可接受 | 可接受；这是技术设计，不改变 FR，但改变“生成”指令的内容，需要人知晓 |
| Overview 客户端区域放在 Preview 的什么位置 | 固定放在 Definition 渲染内容之后（与原型一致），不由 Agent 控制 |
| 缩放控件形式（捏合、快捷键、按钮） | UX 未定，留给 Shell / 高保真设计 |
| 图表词汇范围与布局库 | 实现阶段按五个默认 View 的需要确定，不提前承诺 |

## 依据

- 需求与界面：FR-VIEW-003、FR-VIEW-004；[03. UX Specification](<../03. UX Specification.md>) 第 6 节、第 8 节、D-06；[Shell Spec v01](../../design/components/shell-spec-v01.md) 第 7 节；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2 节；[01. Product Definition](<../01. Product Definition.md>) 第 7 节。
- 调研记录：[research.md](../../tasks/T20261009-project-view/research.md) 第 3.2 节。
- 官方与公开资料：[Electron Security 检查清单](https://www.electronjs.org/docs/latest/tutorial/security)；[Electron webPreferences（nodeIntegrationInSubFrames）](https://www.electronjs.org/docs/latest/api/structures/web-preferences)；[Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)；[MDN iframe（sandbox、csp、srcdoc）](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)；[MCP Apps 概览](https://modelcontextprotocol.io/extensions/apps/overview)；[A2UI 发布说明](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/)；[Simon Willison：meta CSP 在沙箱 iframe 中的测试](https://simonwillison.net/2026/Apr/3/test-csp-iframe-escape/)（第三方测试）。
- 原型：`design/prototypes/studio-prototype-v01/render.js`（仅示意）。
