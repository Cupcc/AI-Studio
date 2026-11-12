# Visual Direction

## 文档信息

| 项目 | 内容 |
|---|---|
| 产品 | AI Developer Studio |
| 版本 | V1.0 |
| 状态 | 基于已确认需求整理；当前视觉参数见第 1 节 |
| 依据 | [Product Definition](<../docs/01. Product Definition.md>) 第 2、8 章；[UX Specification](<../docs/03. UX Specification.md>) 第 3–8 章 |

## 1. 高保真阶段待确定

| 项目 | 需要确定的内容 |
|---|---|
| 色彩 | 背景、文字、分隔线、选中状态、状态色的具体色值 |
| 字体 | UI 与代码字体、字号、字重、行高 |
| 间距 | 页面留白、列表行高、组件内边距 |
| 尺寸 | 左侧导航宽度、Context Panel 宽度、Conversation 内容宽度（初稿见 [Shell Spec v01](components/shell-spec-v01.md) 第 2 节） |
| 布局 | Project View 的 Conversation / Preview 比例及窄窗口表现（初稿见 [Shell Spec v01](components/shell-spec-v01.md) 第 2 节） |
| 组件外观 | 圆角、边框、图标、Hover、Focus 与 Disabled 表现 |

当前取值以[交互原型 v01](prototypes/README.md) 为基线（2026-10-09 确认），后续排版调整见第 1.1 节，字体族见第 1.2 节；高保真阶段可继续调整。保留暖中性灰色板、7～16px 圆角、1.4px 线性图标。

外观由主题（毛玻璃 / 纯色）与颜色模式（浅色 / 深色，默认跟随系统）组合而成（FR-SET-002；[DEC-12](<../docs/07. Decisions.md#dec-12-外观主题与设置>)，2026-10-12 确认，本次 diff 待审阅）：

| 外观 | 取值来源 | 要点 |
|---|---|---|
| 毛玻璃 · 浅色（默认主题） | [交互原型 v04](prototypes/README.md#studio-灰度交互原型-v04)，内容层浓淡固定为“适中” | 窗口为 macOS 原生材质，其上为可选背景颜色（v04 示例壁纸 A / B 等浅色渐变，或“无”；见 [settings spec](../specs/settings/spec.md) SET-Q5）；内容层为白色 26% 透明度；面板为半透明白色；分隔线、Hover、选中为半透明黑色叠色；中性灰文字，次要文字与背景对比度不低于 4.5:1 |
| 纯色 · 浅色 | 交互原型 v01～v03 | 上段基线：白色背景、暖中性灰色板 |
| 纯色 · 深色 | 已确认（SET-Q7、DEC-20，2026-10-18） | 底色 #212121、导航 #1a1a1a、顶栏 #171717；中性灰文字，次要文字 #9a9a9a |
| 毛玻璃 · 深色 | 已确认（SET-Q7、DEC-20，2026-10-18） | 原生深色材质（实测约 #2c2b29），背景颜色为同色相的深色渐变；面板为半透明白、内容层略深；次要文字 #b0b0b0 |

四种组合的次要文字与背景对比度均不低于 4.5:1（毛玻璃以比实测更不利的灰度代替原生材质测量，最低 4.78:1）。

各外观的色值均集中在桌面端 `tokens.css`；结构差异见 [Shell Spec v02](components/shell-spec-v02.md) 第 12 节。确认后的组件参数收录到 [components](components/README.md)，采用的主界面版本登记在 [设计索引](README.md)。

### 1.1 阅读舒适度调整（2026-11-11）

依据：用户对照腾讯云 Octop 后反馈界面字体细小，并在本轮方案后回复「apply, implement」。授权实施下表的排版调整；实现后的视觉效果已于 2026-11-12 人工验收（[集中验收记录](../.agents/archive/tasks/T20261112-dev-acceptance/task.md)），本文 diff 待审阅。历史原型保留原基线。

| 层级 | 当前采用值 |
|---|---|
| 聊天正文与输入文字 | 15px，常规 400 字重；Markdown 正文保持 1.7 行高 |
| 导航、常用按钮、模型选择 | 14px；选中导航与主要按钮用 500 字重 |
| 说明、工具活动、代码块 | 13px；对话表格沿用常用 UI 字号 |
| 时间、计数等元信息 | 12px；紧凑 CLI 缩写徽标保持原尺寸 |
| 导航与菜单分组标题 | 12px / 600；正文小标题 17px / 600 |

字体族按第 1.2 节，不整体加粗正文。模型选择、工作台草稿入口与空态关键说明使用较强的现有文字色；保留低频元信息的 muted 层级。工作台宿主字号接入共享 Token，插件自带页面的排版由插件负责。

玻璃颗粒的 SVG alpha 系数从 0.07 降至 0.025，降低文字背后的纹理干扰；保留玻璃主题的内容层、背景颜色与布局尺寸。布局检查覆盖 1024 / 1280 / 1440 宽度，主题检查覆盖纯色 / 毛玻璃与浅色 / 深色组合。此次不改变 CLI、会话或工具行为。

### 1.2 系统字体优先（2026-11-12）

依据：用户 2026-11-12 确认“优先系统字体，失败回退内置字体”（[DEC-30](<../docs/07. Decisions.md#dec-30-工作台宿主精简系统字体与中文界面>)），修订第 1 节原有的 IBM Plex 基线。实施见[界面规范化任务](../tasks/T20261112-workbench-ui-polish/task.md)；实现后的视觉效果已于 2026-11-12 人工验收，本文 diff 待审阅。历史原型保留原基线。

| 用途 | 字体顺序 |
|---|---|
| 界面 | 系统界面字体（`system-ui`），其后为简体中文字体（苹方、冬青黑体、微软雅黑、Noto Sans SC），最后回退内置 IBM Plex Sans |
| 代码、Terminal 与编辑器 | 系统等宽字体（`ui-monospace`、SF Mono、Menlo、Consolas），最后回退内置 IBM Plex Mono |

字号、字重与行高沿用第 1.1 节。中文字体紧跟系统界面字体，使汉字显示不依赖页面语言设置。内置 Plex 只含拉丁子集，仅在需要时加载。Electron 所用的 Chromium 不支持 `ui-monospace`，SF Mono 需用户自行安装，因此 macOS 上等宽字体实际为 Menlo。预设工作台页面共用同一界面字体顺序；选品等插件页面的排版由插件负责。

## 2. 视觉目标

以中性色为主，营造安静、专业、轻量、低视觉噪音的桌面工作环境：默认毛玻璃外观，可在设置中切换为纯色外观；颜色模式默认跟随系统（第 1 节）。Conversation 是主要交互入口，工程工具按需展开。

设计时关注：

- 对话阅读舒适，内容拥有足够留白；
- 层级通过间距、字号和克制的背景变化表达；
- 区域边界保持轻量，选中状态清晰；
- 状态色用于提醒需要关注的事件；
- 控件数量和信息密度遵循 UX Specification 的轻量界面要求。

## 3. 参考方向

以下比例来自 Product Definition，用于表达参考重点。

| 参考 | 比例 | 重点观察 |
|---|---:|---|
| ChatGPT Desktop | 60% | 对话阅读、输入区、导航与留白 |
| OpenDesign | 25% | Workspace 工作方式、对话与 Preview 的协作 |
| Cursor | 15% | Files、Diff、Browser、Terminal 的工程工具呈现 |

具体截图及参考说明统一收录在 [references](references/README.md)。

## 4. 界面构图

- 顶部：Project Tab Bar，用于 Project 切换。
- 左侧：Project Views 与 Session History，层级清晰、宽度稳定。
- 中央：Main Canvas，承载主要内容。
- 右侧：可折叠 Context Panel，由用户主动打开和切换。

Session Mode 以 Conversation 为主体，输入区固定在对话区域下方，Model Selector 位于输入区内部。

Project View Mode 使用左 Conversation、右 Preview 的布局。Conversation 保留完整纵向空间，Preview 保留足够的二维展示空间。Preview 示例用于说明呈现方式，实际内容可由 AI 根据 Project Knowledge 动态生成。

## 5. 状态表现

| 状态 | 基线中的建议表现 | 相关需求 |
|---|---|---|
| Running | 中性色 Spinner 或动态点 | FR-STATE-001 |
| Needs Input | 黄色 / 橙色小状态点，清晰提示等待内容 | FR-STATE-002 |
| Completed Unread | 绿色圆点；点击 Session 后清除 | FR-STATE-004、FR-STATE-005 |
| Error | 红色状态点 | FR-STATE-003 |
| Normal History | 无状态标识 | FR-STATE-006 |

颜色控制在局部提醒范围；状态点的位置与大小应保证 Session 标题可读。
