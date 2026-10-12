# 应用图标：对话气泡 / 窗口缩影 / 层叠玻璃 v01

- 状态：探索中，待人工审阅；2026-10-12。
- 需求来源：用户 2026-10-12 对话「基于 worktree v04 原型设计风格，设计应用 icon」，以及「所有版本都保存到 design/icons 里面」。本次交付为图标设计稿，不涉及 FR / AC 行为变更。
- 视觉来源：`chore/worklines-integration` worktree，提交 `988700a`，`design/prototypes/studio-prototype-v04.html` 的 `.skin-glass` 样式、示例壁纸 A / B 与适中内容层；与 `feat/settings-theme` 中的 v04 HTML 内容相同。深色版本参考 [Visual Direction](../visual-direction.md) 第 1 节“毛玻璃 · 深色”提案（SET-Q7）。
- 与 [玻璃工作台 v01](app-icon-glass-v01.md) 为同日并行的另一组探索，互不替代。

## 交付

| 方案 | 浅色 | 深色 | 其他 |
|---|---|---|---|
| A 对话气泡 `bubble` | [SVG](app-icon-bubble-v01.svg) · [PNG](app-icon-bubble-v01.png) | [SVG](app-icon-bubble-v01-dark.svg) · [PNG](app-icon-bubble-v01-dark.png) | 壁纸 B 配色：[SVG](app-icon-bubble-v01-wall-b.svg) · [PNG](app-icon-bubble-v01-wall-b.png) |
| B 窗口缩影 `window` | [SVG](app-icon-window-v01.svg) · [PNG](app-icon-window-v01.png) | [SVG](app-icon-window-v01-dark.svg) · [PNG](app-icon-window-v01-dark.png) | — |
| C 层叠玻璃 `layers` | [SVG](app-icon-layers-v01.svg) · [PNG](app-icon-layers-v01.png) | [SVG](app-icon-layers-v01-dark.svg) · [PNG](app-icon-layers-v01-dark.png) | — |

- 对比页：[app-icon-concepts-v01.html](app-icon-concepts-v01.html)，直接用浏览器打开，引用同目录 SVG；每个方案可切换浅色 / 深色，含 96、48、32、16px 与 Dock 示意。
- 效果图：[尺寸预览](app-icon-concepts-v01-preview.png)（360、128、64、32、16px，浅色与深色背景）；[Dock 浅深模式](app-icon-concepts-v01-in-dock.png)（合成示意，最左为占位图标）。
- 源文件：SVG 由 [app-icon-concepts-v01.gen.cjs](app-icon-concepts-v01.gen.cjs) 生成，在仓库根目录执行 `node design/icons/app-icon-concepts-v01.gen.cjs design/icons` 重新输出；修改图形请改脚本，不直接改 SVG。PNG 与效果图由 Chrome 渲染 SVG 导出（1024 × 1024，透明背景）。
- SVG 画布：1024 × 1024，主体为 824 × 824 的超椭圆（n = 5，近似 macOS 连续圆角），位于 (100, 100)，下方带投影；只用路径、渐变和滤镜，无位图、字体或外部资源。

## 设计

三个方案共用一层底座：v04 壁纸 A 的六个径向渐变（`#a9c1f2`、`#d3bff0`、`#c4d3f6`、`#b9dced`、`#f4c6b2`、`#efcde3`，底色 `#e3e5ee`）经模糊、饱和度 1.55 后，叠 22% 的 `#f4f4f2` 着色、细颗粒和顶部高光，边缘为上亮下淡的白色描边。面板沿用 v04 磨砂面板做法：白色 80% → 56% 渐变、顶部亮边、柔和投影。图形使用界面正文色 `#0d0d0d`。

- **A 对话气泡**：带尾巴的磨砂气泡中放 `>_`，表达和本地 CLI Agent 对话是主要入口。小尺寸辨识度最好；符号与终端类应用相近，靠气泡外形区分。
- **B 窗口缩影**：一扇磨砂窗口，左侧对话提示符与文字行，右侧 Preview 面板中的 Overview 格子与进度条，对应 Project View 的左右布局。含义最直接；32px 以下细节糊成色块。
- **C 层叠玻璃**：三层错位磨砂面板对应多个 Project / Session，最前一层为 `>` 加四角星光标。最贴近 v04 “玻璃上再叠一层磨砂”；四角星是常见 AI 符号，独特性一般。

深色版本：同色相压暗偏冷的壁纸（`#3a4f86`、`#55437e`、`#34416e`、`#2d5a6c`、`#6e4a52`、`#5a3f66`，底色 `#24252b`），着色 30% 的 `#1c1c1e`；面板为白色 20% → 10%，图形改为 `#f2f2f2`。

## 自检与待定项

- 用 Playwright 截取 worktree 中的 v04 原型对照取色；在浅色 / 深色背景检查 360、128、64、32、16px，并合成浅深 Dock 示意。
- 初稿背景中部出现横向色带，已改为渐隐的径向渐变；深色初稿发棕，已改为冷色深色壁纸。
- 32px 下 A、C 可辨认提示符，B 只剩色块；16px 下三者细节都很弱。采用任一方案都需为 16、32px 单独调整笔画与留白。
- 尚未接入应用或生成 ICNS；不代表打包图标已验收。macOS 26 的 Icon Composer 浅色 / 深色 / 着色外观未制作。
- 未决问题：采用哪个方向（含玻璃工作台 v01），由用户决定；不阻塞本次探索稿交付。
