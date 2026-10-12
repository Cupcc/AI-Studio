# 应用图标：玻璃工作台 v01

- 状态：探索中，待人工审阅；2026-10-12。
- 需求来源：用户 2026-10-12 对话「基于 worktree v04 原型设计风格，设计应用 icon」。本次交付为图标设计稿，不涉及 FR / AC 行为变更。
- 视觉来源：`feat/settings-theme` worktree，提交 `c38171e`，`design/prototypes/studio-prototype-v04.html` 的 `.skin-glass` 样式、默认壁纸 A 和适中内容层。读取时该 worktree 无未提交修改；与 `worklines-integration` 中的 v04 HTML 内容相同。设计时主 checkout 尚无 v04，故记录分支与提交定位来源；2026-10-13 整合后可直接查看[已保留的 v04 原型](../prototypes/studio-prototype-v04.html)。
- 交付：[透明 PNG](app-icon-glass-v01.png)、[可编辑 SVG](app-icon-glass-v01.svg)、[浅深背景及尺寸预览](app-icon-glass-v01-preview.png)、[Dock 浅深模式效果图](app-icon-glass-v01-in-dock.png)。PNG 由内置 image_gen 生成；SVG 为依照 PNG 手工重绘的矢量版本，玻璃渐变与阴影近似原稿，非像素级转换。
- 实际画布：1254 × 1254px，带 alpha 通道；生成工具返回尺寸与提示词中的目标尺寸不同。
- SVG 画布：1024 × 1024，透明背景，使用路径、渐变和滤镜；无嵌入位图、字体或外部资源依赖。依照用户 2026-10-12 对话要求统一移入 `design/icons/` 并补充 SVG。

## 设计

圆角方形底座承载两层错位的磨砂面板，表达项目工作区与 CLI 会话。前层使用深灰 `>_` 作为主要识别符号。依据 frontend-design 的主体提炼与克制原则，省略微型工具栏、代码行和装饰符号。

色彩来自 v04：珍珠灰 `#E4E5EA`、淡蓝 `#A9C1F2`、冰蓝 `#B9DCED`、薰衣草紫 `#D3BFF0`、浅桃 `#F4C6B2`；符号以 `#262626` 为目标。色值为生成指导，并非成图每个像素的精确值。

## 自检与待定项

- 使用 agent-browser 查看实际 v04 原型，并检查图标在浅色 / 深色背景的合成效果及 128、64、32、16px 尺寸。
- 32px 下终端符号仍可识别；16px 下玻璃层次较弱，菜单栏应用需另行设计简化单色稿。
- 图片查看器的透明区域预览出现杂色；浏览器实际 alpha 合成未见对应杂色，浅深背景证据见尺寸预览。
- 尚未接入应用或生成 ICNS；不代表打包图标已验收。
- 未决问题：是否采用此方向，由用户审阅；不阻塞本次探索稿交付。

## 生成记录

工具：内置 image_gen；透明背景开启。第二次生成仅要求清理外缘，交付第二次结果。

### 初稿提示词

```text
Use case: logo-brand
Asset type: macOS application icon for AI Developer Studio.
Design a single polished icon based on its v04 prototype: quiet unified frosted glass, translucent white layers, neutral charcoal graphics, softly diffused pale blue, lavender and peach.
One centered rounded-square macOS tile, straight-on view, fills 84% of a square 1024x1024 canvas with equal transparent margins. Inside, two overlapping large workspace panels: rear pane offset slightly up and right, front pane offset slightly down and left. Front pane is a milky frosted-white rounded rectangular terminal workspace carrying a bold charcoal command chevron and short underscore >_. Rear pane is pale translucent blue glass, with only its upper and right portion showing. Geometric, simple, no miniature UI. Glyph has crisp thick strokes with gently rounded ends and must remain legible at 32px.
Palette: pearl #E4E5EA, cloud blue #A9C1F2 upper left, ice blue #B9DCED upper right, lavender #D3BFF0 lower left, very subtle peach #F4C6B2 lower right. Muted luminous colors beneath milky glass. Charcoal #262626 glyph.
Restrained satin frosted glass, broad soft light, fine bright rim, subtle inset edge and small ambient shadow. Flat frontal arrangement with just enough depth, no perspective tilt.
Exactly one icon, no board, no caption, no name, no lettering except graphical >_, no watermark, robot, brain, sparkles, stars, neon, vivid rainbow, dramatic chrome, thick bevels, toolbar dots or code lines. Outside rounded-square icon must be true alpha transparency. Finished app icon concept with disciplined negative space.
```

### 外缘修订提示词

```text
Edit this app icon. Preserve the interior design exactly: pastel blue lavender peach rounded-square glass tile, two overlapping frosted workspace panels, charcoal >_ terminal mark, frontal layout and proportions. Change ONLY the exterior alpha edge: eliminate ALL scattered white patches, colored specks, wisps and fragments outside the rounded square. The icon must have an immaculate continuous smooth rounded-square silhouette with anti-aliased edges; everything beyond its boundary must be fully transparent (alpha 0). NO external shadow, NO glow, NO particles, NO haze, NO exterior reflection. Clean app icon cutout. Keep the thin bright rim INSIDE the tile. Preserve genuine transparency.
```
