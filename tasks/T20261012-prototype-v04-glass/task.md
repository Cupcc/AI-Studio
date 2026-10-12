---
id: T20261012-prototype-v04-glass
status: verifying
fr: []
ac: []
specs: []
created: 2026-10-12
---

# 交互原型 v04：统一毛玻璃外观

## 收尾

- 主 Agent 自检完成；外观已于 2026-10-12 确认（见已确认事项），只剩在线原型发布，任务保持 `verifying`。本任务只交付供对比的原型，不涉及功能，不需要独立 AI 验收（[Acceptance](../README.md#验收范围与独立性)：过程任务可自检收尾）。
- 基线：未提交改动，范围为 `design/prototypes/studio-prototype-v04*`、[原型说明](../../design/prototypes/README.md#studio-灰度交互原型-v04)与本任务目录。
- 在线原型尚未发布：2026-10-12 发布时 claude.ai 返回 403（见执行记录），恢复访问后发布 v04，并把 v03 的在线原型恢复为白色原样式。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 是否采用 v04 的统一毛玻璃外观？ | v03 与 v04 都保留，作为白色与毛玻璃两种外观主题，默认毛玻璃，在新增的设置中切换（2026-10-12 对话：“原型v03 和v04 都可以保留吗？ 作为 appearance theme”“添加设置功能模块，支持主题选择与切换”）。文档修订与桌面端实现由 [T20261012-settings-theme](../archive/T20261012-settings-theme/task.md) 负责；后续增加颜色模式，“白色”主题更名为“纯色”（提案） |
| 采用时内容层用哪一档？ | 适中，且不放进设置（2026-10-12 对话选择） |

## 目标

2026-10-11 用户在对话中要求“原型设计中参考 chatgpt desktop 将左侧边，改为毛玻璃效果”；看过后认为“风格不统一，有些不协调”，要求“改一版全局统一风格的我看看”，并指出“聊天对话框主体部分”也要统一。2026-10-12 用户要求“我需要对比两个风格，保留两个原型”。本任务把统一毛玻璃外观做成 v03 的副本 v04，v03 保持白色原样式，供并排对比。

## 范围

- 做：
  - `design/prototypes/studio-prototype-v04.html` 与 `studio-prototype-v04/`：从 v03 复制，只增加外观样式与演示控制中的外观说明、内容层浓淡、示例壁纸；v03 文件不改（[design README](../../design/README.md) 第 5 节）。
  - 在原型索引登记 v04，列出与已确认基线的差异。
  - 发布 v04 在线原型。
- 不做：
  - 修改 Product Definition、Visual Direction、Shell Spec（等评审结果）。
  - 布局、交互和数据的任何改动；桌面端实现；深色主题。

## 依据

- 用户对话要求：见目标（2026-10-11、2026-10-12）。
- 参考：ChatGPT Desktop 侧边栏的毛玻璃（[Visual Direction](../../design/visual-direction.md) 第 3 节：ChatGPT Desktop 为主要参考，占 60%）。
- 被挑战的已确认基线：[Product Definition](<../../docs/01. Product Definition.md>) 第 8 章原则 23；Visual Direction 第 1 节当前取值（暖中性灰色板，2026-10-09 确认，高保真阶段可调整）与第 2 节；[Shell Spec v02](../../design/components/shell-spec-v02.md) 第 2、3 节。
- 原型约定：[prototypes README](../../design/prototypes/README.md) 第 2 节。

## 验收标准

- [x] v04 与 v03 的 HTML 只在样式表末尾的外观一节、版本标识与脚本路径上不同；v04 的 `data.js`、`views.js` 只改了首行注释；v03 文件与提交版本一致（用户 2026-10-12 要求保留两个原型）。
- [x] 外观覆盖顶栏、左侧导航、Conversation、右侧区域 / 边栏、启动页、消息与代码块等内容面板、菜单与对话框；演示控制可调内容层浓淡、切换示例壁纸。证据：[View Mode](evidence/W1-unified-glass-view-1440.jpg)、[Session 与 Diff 边栏](evidence/W1-unified-glass-session-1440.jpg)、[壁纸 B · 通透](evidence/W1-unified-glass-wallpaper-b-clear-1440.jpg)。
- [x] 玻璃上的次要文字对比度不低于 4.5:1（WCAG AA）：两张壁纸 × 三档浓淡下最低 5.22:1。
- [x] 1024 宽度无横向滚动，Conversation 与右侧区域不低于 Shell Spec v02 第 2 节最小宽度：Conversation 367、右侧区域 401。证据：[1024 布局](evidence/W1-unified-glass-1024.jpg)。
- [ ] v04 在线原型发布并登记链接；v03 在线原型恢复为白色原样式。
- [x] 人对比 v03 / v04 后决定是否采用：两者都保留为外观主题（见已确认事项）。

## 技术决定

| 决定 | 依据 | 决策者 / 日期 |
|---|---|---|
| 浏览器中以示例壁纸代替窗口后方的桌面：`#app` 画壁纸并整体模糊一次，再叠一层玻璃色和很淡的颗粒；顶栏、导航与边距共用这一层，不在各区域分别用 `backdrop-filter` | 静态背景下效果与 `backdrop-filter` 相同，只有一层，没有接缝；颗粒消除 8 位渐变色带 | AI，2026-10-11 |
| 菜单、对话框与演示控制面板用真实的 `backdrop-filter` | 它们浮在可变内容上，需要模糊下方实际内容 | AI，2026-10-11 |
| 关系图节点与时间线圆点保持近不透明 | 避免连线从半透明面板下透出 | AI，2026-10-11 |
| 证据截图存为 JPEG | 颗粒层使 PNG 每张约 1.4 MB，JPEG 约 0.2 MB | AI，2026-10-12 |

## 执行记录

- 2026-10-11：先按“将左侧边改为毛玻璃”直接修改了 v03，并重新发布到 v03 的在线链接（第 3 版）。
- 2026-10-11：按“全局统一风格”扩展为统一外观（第 4 版：玻璃外框 + 白色内容卡片）；用户指出对话主体仍未统一后，内容卡片改为半透明磨砂层，内容面板、分隔线与 Hover 改为半透明，加内容层三档浓淡（第 5 版）。这些改动当时都写在 v03 中，带“原样式”切换。
- 2026-10-12：用户指出“你直接改的v03? 没有copy一份？ 我需要对比两个风格，保留两个原型”。把当时的 v03 复制为 v04，删去“原样式”切换与只为切换保留的样式，外观固定开启；v03 的 HTML、`app.js`、`render.js`、原型说明与 v03 任务记录恢复为提交 85c6f8a 的版本，相关记录与证据移到本任务。
- 自查（实现者自检，非独立验收）：本地静态服务 + Playwright 1.63 + 本机 Chrome。v03：标题与 `#app` 无外观类，Session 页面为白色原样式。v04：Overview、Session + Diff 边栏、新对话草稿、Architecture 关系图、导航 CLI 菜单、组件清单对话框、导航折叠、启动页；演示控制切换浓淡与壁纸后 `#app` 的 `data-layer` / `data-wall` 随之变化，“重置原型”恢复为适中 / 壁纸 A；1024 下 Conversation 367 / 右侧区域 401、页面宽度 1024；两份原型均无页面错误与 404（favicon 除外）。
- 2026-10-12：发布 v04 新在线原型与恢复 v03 在线原型均失败，claude.ai 返回 `deploy 403: Request not allowed`，列出 Artifact 也返回 403。v03 在线链接目前仍是第 5 版（毛玻璃）。恢复访问后：发布 v04 并替换原型索引中的“在线原型待发布”，用提交版本的 v03 文件重新发布 v03 链接。
