# 设置与外观

## 文档信息

| 项目 | 内容 |
|---|---|
| 模块 | `settings` |
| 文档状态 | 草稿（SET-Q1～Q5 与外观决定已于 2026-10-12 确认；SET-Q6、Q7 待确认） |
| 覆盖需求 | FR-SET-001～FR-SET-002 |
| 相关验收 | AC-08 |
| 相关设计 | [Shell Spec v02](../../design/components/shell-spec-v02.md) 第 12 节；[交互原型 v04 / v03](../../design/prototypes/README.md#3-原型索引)；[Visual Direction](../../design/visual-direction.md) 第 1 节 |
| 来源 | 02 第 2 节“设置与外观”；[DEC-12](<../../docs/07. Decisions.md#dec-12-外观主题与设置>)；用户 2026-10-12 对话 |

## 1. 问题记录

### 1.1 未决问题

| 编号 | 问题 | 建议答案与依据 | 决策方（人 / AI） | 阻塞实现 |
|---|---|---|---|---|
| SET-Q6 | 非毛玻璃主题的名称 | **（提案）** 由“白色”改为“纯色”：增加深色模式后，该主题在深色下是深灰底，“白色”名不副实；浅色模式下仍是交互原型 v03 的白色外观 | 人 | 否（已按提案实现） |
| SET-Q7 | 深色模式的取值 | **（提案）** 没有深色原型。纯色深色参考 ChatGPT Desktop 的中性深灰（底色 #212121）；毛玻璃深色为原生深色材质，面板为半透明白、内容层略深，背景颜色为同色相的深色渐变；次要文字与背景对比度不低于 4.5:1（实测最低 4.78:1） | 人 | 否（已按提案实现） |

### 1.2 已确认

| 编号 | 问题 | 回答（确认日期） |
|---|---|---|
| SET-C1 | 保留哪些外观 | 交互原型 v04 的毛玻璃与 v03 的白色（2026-10-12）；后者的名称见 SET-Q6 |
| SET-C2 | 设置入口与形式 | 左侧导航左下角（同 ChatGPT Desktop）、菜单栏“设置…”、⌘,；应用内对话框，左侧分类、右侧内容，点选立即生效（2026-10-12） |
| SET-C3 | 默认主题 | 毛玻璃（2026-10-12） |
| SET-C4 | 毛玻璃浓淡 | 固定为适中，不放进设置（2026-10-12） |
| SET-C5 | 系统“降低透明度” | 毛玻璃显示为纯色外观，设置中注明原因，系统选项关闭后自动恢复（2026-10-12） |
| SET-C6 | 毛玻璃背景颜色 | “毛玻璃目前没有背景颜色，也支持选择多种背景颜色的选择”（2026-10-12）；色板见 SET-Q5 |
| SET-C7 | 颜色模式 | “默认跟随系统设置，也可以支持3种模式的选择”：跟随系统（默认）/ 浅色 / 深色，作用于整个应用及其原生菜单、对话框和窗口材质（2026-10-12） |
| SET-Q1 | 左下角入口的形式 | 导航底部固定一行“⚙ 设置”，高 32，样式同 Project View 项，不随 Session History 滚动（2026-10-12 对话“accept”） |
| SET-Q2 | 导航折叠时是否在顶栏补设置按钮 | 不补，用菜单栏或 ⌘, 打开（2026-10-12 对话“accept”） |
| SET-Q3 | 点击对话框外是否关闭 | 关闭（2026-10-12 对话“accept”） |
| SET-Q4 | 主题选项的呈现 | 两张并排选项卡，含缩略示意与名称，当前项带勾选；毛玻璃标“默认”（2026-10-12 对话“accept”） |
| SET-Q5 | 毛玻璃背景颜色的色板、默认值与透出程度 | 极光（默认，v04 示例壁纸 A）、薄荷（壁纸 B）、晚霞、海雾、无（只有原生材质）；颜色为模糊的浅色渐变，上覆 v04 的玻璃色与细颗粒，以 85% 不透明度叠在原生材质上；色块只在主题为毛玻璃时显示（2026-10-12 对话“accept”） |

### 1.3 技术决定

| 编号 | 决定与依据 | 决策者与日期 |
|---|---|---|
| SET-T1 | 毛玻璃用 `BrowserWindow` 原生 vibrancy，跟随窗口激活状态变化（失焦时系统自动减弱）；纯色外观移除材质并把窗口背景设为该模式的底色（浅 #ffffff / 深 #212121），避免闪现其他颜色。依据：v04 原型说明的未实现项 | AI，2026-10-12 |
| SET-T2 | 颜色模式写入 `nativeTheme.themeSource`（取值同为 `system` / `light` / `dark`），由它驱动窗口材质、原生菜单与对话框以及页面的 `prefers-color-scheme`；是否使用深色读 `nativeTheme.shouldUseDarkColors`。替代此前“固定浅色”的决定（SET-C7） | AI，2026-10-12 |
| SET-T3 | 偏好存 `app_meta`：`settings.appearance.theme`（`glass` / `solid`）、`settings.appearance.glassColor`（SET-Q5 的取值）、`settings.appearance.mode`（`system` / `light` / `dark`）；读到未知值时按默认处理 | AI，2026-10-12 |
| SET-T4 | Renderer 在首次渲染前读取外观并设置 `<html data-theme data-scheme data-glass-color>`，样式只依赖这三个属性；不改页面地址（E2E 校验入口地址为 `app://studio/index.html`）。窗口在主进程创建时已按实际外观设置材质与底色 | AI，2026-10-12 |
| SET-T5 | E2E 在主进程中覆盖 `nativeTheme.prefersReducedTransparency` 与 `shouldUseDarkColors` 并发出 `updated`，模拟“降低透明度”与系统深浅色；产品代码不加测试开关 | AI，2026-10-12 |

## 2. 职责与边界

- 负责：设置入口与对话框；外观偏好（主题、毛玻璃背景颜色、颜色模式）的读取、保存与广播；根据偏好与系统状态（深浅色、“降低透明度”）计算实际外观并应用到所有窗口。
- 不负责：各功能自身的配色（由 Token 统一提供）；Default CLI、导航折叠等既有偏好（仍由各自模块负责）；自定义颜色或图片背景。

## 3. 行为细则

### FR-SET-001 设置入口

1. 入口：
   - 左侧导航底部固定“设置”行（SET-Q1）；
   - 菜单栏应用菜单“设置…”，快捷键 ⌘,；启动页、导航折叠时同样可用（SET-Q2）。
2. 设置对话框：
   - 模态，居中，宽 640、高 520，窗口较小时不超出窗口；标题“设置”，右上角关闭按钮。
   - 左列分类：V1 只有“外观”，默认选中；右列依次为“模式”“主题”“毛玻璃背景”。
   - 已打开时再次触发入口不重复打开。
   - 关闭：关闭按钮、Esc、点击对话框外（SET-Q3）；关闭后焦点回到打开前的元素。
   - 打开时焦点在当前选中的模式上；每个单选组一个 Tab 停留点，Tab 焦点限制在对话框内。
3. 其他对话框（关闭 Project、退出确认）显示时，设置入口不响应。

### FR-SET-002 外观主题

1. 模式（SET-C7）：“跟随系统”（默认）、“浅色”、“深色”，分段单选组。跟随系统时，系统切换深浅色后应用立即跟随，无需重启。
2. 主题：“毛玻璃”（默认）与“纯色”（SET-Q6），以单选卡片呈现（SET-Q4）：方向键在选项间移动并选中，点击或空格选择。两种主题在两种模式下都有对应外观（SET-Q7）。
3. 选择后立即保存并应用到所有窗口：
   - Renderer 切换 `<html>` 的外观属性；
   - 主进程设置或移除窗口材质与底色，并更新原生 UI 的深浅色。
   - 不改变 Project、Session、草稿、布局与滚动位置；对话框保持打开。
4. 实际主题 = 偏好为毛玻璃且系统未开启“降低透明度”时为毛玻璃，否则为纯色；深浅色由模式决定。
5. 系统开启“降低透明度”：
   - 偏好仍显示为毛玻璃，选项下方提示“系统已开启“降低透明度”，当前显示为纯色外观。”；
   - 系统选项变化时实时更新，无需重启。
6. 毛玻璃背景颜色（SET-C6、SET-Q5）：主题为毛玻璃时，主题选项下方显示“毛玻璃背景”单选组；点选立即生效、应用级保存。选纯色主题时隐藏该组，但保留所选颜色；系统开启“降低透明度”时颜色不显示。深色模式下各颜色为同色相的深色渐变。
7. 保存失败时：保持原外观，在设置中显示“未能保存外观设置”；不重试。
8. 启动：主进程读取偏好、应用模式并以对应外观创建窗口；Renderer 在首次渲染前应用外观。

## 4. 状态与数据

```ts
type ThemePreference = 'glass' | 'solid'
type GlassColor = 'aurora' | 'mint' | 'sunset' | 'haze' | 'none'   // SET-Q5
type ColorMode = 'system' | 'light' | 'dark'                       // SET-C7
interface AppearanceState {
  theme: ThemePreference          // 用户选择；默认 'glass'
  glassColor: GlassColor          // 毛玻璃背景颜色；默认 'aurora'
  mode: ColorMode                 // 颜色模式；默认 'system'
  reducedTransparency: boolean    // 系统“降低透明度”
  dark: boolean                   // 当前使用深色（强制深色，或跟随系统且系统为深色）
  effective: ThemePreference      // 实际主题，见 FR-SET-002 第 4 条
}
```

- 持久化：`app_meta`（SET-T3），应用级，所有窗口共用。
- Renderer：设置 store 保存 `AppearanceState` 与对话框开关；`<html>` 的 `data-theme` 取 `effective`，`data-scheme` 取 `dark`，`data-glass-color` 取 `glassColor`。

## 5. 接口与事件

IPC 契约 `settings`（[DEC-02](<../../docs/07. Decisions.md#dec-02-进程边界与类型化-ipc>)）：

| 成员 | 类型 | 说明 |
|---|---|---|
| `getAppearance` | invoke `void → AppearanceState` | 当前状态 |
| `setTheme` | invoke `{ theme } → AppearanceState` | 校验取值后保存并应用；外观变化时广播 `appearanceChanged` |
| `setGlassColor` | invoke `{ color } → AppearanceState` | 同上，保存毛玻璃背景颜色 |
| `setMode` | invoke `{ mode } → AppearanceState` | 同上，保存颜色模式并写入 `nativeTheme.themeSource` |
| `appearanceChanged` | event `AppearanceState` | 偏好或系统状态（深浅色、“降低透明度”）变化时发送给所有窗口 |
| `openRequested` | event `void` | 菜单栏“设置…” / ⌘, 触发，Renderer 打开对话框 |
