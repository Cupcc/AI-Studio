# Icons

存放应用图标、可编辑矢量源文件与使用场景效果图。命名、版本和审阅遵循[设计索引](../README.md)第 5 节。

## 本机采用

用户 2026-10-13 对话「把 app-icon-bubble-v01 这个作为本机 icon，配置好」，确认本机采用标准浅色版「对话气泡」v01（2026-10-13 确认）：[PNG](app-icon-bubble-v01.png) · [SVG](app-icon-bubble-v01.svg)。此确认范围为本机使用；其他探索版本继续保留。

应用使用的 PNG 副本为 [`apps/desktop/build/icon.png`](../../apps/desktop/build/icon.png)；开发 Dock 与 macOS 打包配置见[桌面端说明](../../apps/desktop/README.md#2-目录)。设计稿更新后，在仓库根执行 `cp design/icons/app-icon-bubble-v01.png apps/desktop/build/icon.png` 同步。

用户在上述配置后要求实现图标随颜色模式切换（2026-10-13 确认）：深色使用 [bubble 深色 PNG](app-icon-bubble-v01-dark.png) · [SVG](app-icon-bubble-v01-dark.svg)，应用副本为 [`apps/desktop/build/icon-dark.png`](../../apps/desktop/build/icon-dark.png)。同步命令：`cp design/icons/app-icon-bubble-v01-dark.png apps/desktop/build/icon-dark.png`；颜色模式与生效范围见[外观规格](../../specs/settings/spec.md#fr-set-002-外观主题)。

## 方案索引

| 方案 | 版本 | 状态 | 文件 | 依据 |
|---|---|---|---|---|
| 应用图标「玻璃工作台」 | v01 | 探索中 | [SVG](app-icon-glass-v01.svg)；[PNG](app-icon-glass-v01.png)；[尺寸预览](app-icon-glass-v01-preview.png)；[Dock 效果图](app-icon-glass-v01-in-dock.png)；[设计说明](app-icon-glass-v01.md) | 用户 2026-10-12 要求基于 v04 设计图标、预览 Dock 浅深模式，并移入本目录、保存 SVG |
| 应用图标「对话气泡 / 窗口缩影 / 层叠玻璃」三选一，各含浅色与深色 | v01 | 探索中 | [对比页](app-icon-concepts-v01.html)；[尺寸预览](app-icon-concepts-v01-preview.png)；[Dock 效果图](app-icon-concepts-v01-in-dock.png)；[设计说明](app-icon-concepts-v01.md)（逐个 SVG / PNG 与生成脚本见其“交付”） | 用户 2026-10-12 要求基于 v04 设计图标，并把所有版本保存到本目录 |

玻璃工作台 v01 的 SVG 是原生成 PNG 的可编辑矢量重绘，尺寸预览与 Dock 效果图展示的是 PNG 方案；对话气泡等三个方案的 SVG 由脚本生成，PNG 由 SVG 导出。两组 Dock 图均为合成示意。
