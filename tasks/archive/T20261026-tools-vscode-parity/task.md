---
id: T20261026-tools-vscode-parity
status: done
fr: [FR-TOOL-001, FR-TOOL-002, FR-TOOL-003, FR-TOOL-004, FR-TOOL-005]
ac: [AC-07]
specs: [specs/tools/spec.md, specs/project/spec.md]
created: 2026-10-26
---

# 工程工具对齐 VS Code 基本功能

## 收尾

2026-10-28 Main Agent 核对已授权第 1～3 步交付、W5 / W7 独立验收与六项缺陷复验后完成技术收尾；独立结论与人工功能验收入口见 [acceptance.md](acceptance.md)。2026-10-29 用户明确「验收通过，合入main」，本轮人工验收已通过并获准合入；接受范围见验收记录，不改变发布边界。

## 目标

四个工程工具具备 VS Code 用户默认会有的基本操作，并新增全文搜索；保持对话为主的界面层级和既有安全隔离，不做应用内文件编辑或 Git 写操作。

## 范围

依据用户 2026-10-26 对话（见「已确认事项」），分三步交付，每步可独立验收：

- **第 1 步：基本操作**
  - Files：右键菜单（新建文件 / 文件夹、重命名、删除到废纸篓、复制 / 剪切 / 粘贴、复制路径 / 相对路径、在 Finder 中显示、在终端中打开、用 VS Code 或默认应用打开、添加到对话）；拖拽移动；多选；工具栏新建 / 全部折叠；⌘P 快速打开；Git 状态着色、被忽略项变灰；按类型区分的文件图标；查看器的跳转到行、代码折叠、自动换行、Markdown / 图片预览。
  - Diff（只读）：列表 / 树视图；并排 / 行内切换；上一处 / 下一处变更；折叠未改动区域；从 Diff 打开文件。
  - Terminal：可点击链接（本地地址 → 内置 Browser，其他网址 → 系统浏览器，`文件:行号` → Files 定位）；⌘F 查找；⌘K 清屏；右键菜单；Tab 重命名与前台进程名；从 Files 拖入路径。
  - Browser：任意 http / https 网址并自动补全协议；后退 / 前进 / 停止；DevTools；用系统浏览器打开；页面缩放；下载前询问；所有 Project 共享且跨重启保存的浏览数据，提供清除入口。
  - 快捷键：沿用 VS Code（⌘P、⌘⇧E、⌃⇧G、⌃`、⌥⌘/ 等）。
- **第 2 步：全文搜索**（FR-TOOL-005）：⌘⇧F；正则 / 大小写 / 整词、包含 / 排除；遵守 .gitignore；结果按文件分组，点击在 Files 中定位到行；Files 右键「在文件夹中查找」。使用 ripgrep。
- **第 3 步：分屏与浏览器补充**：Terminal 分屏（⌘\）；Browser 多 Tab、历史与收藏、按网站询问权限。
- 不做：应用内编辑与保存；Diff 中的暂存 / 取消暂存 / 放弃 / 提交及 push / pull / 分支操作；调试器；扩展；Problems / Outline。

## 依据

- FR-TOOL-001～005、[工具规格](../../../specs/tools/spec.md)（本轮修订见 §1.2 TOOLS-Q8～Q12、§5.4）。
- [DEC-25](<../../../docs/07. Decisions.md#dec-25-工程工具对齐-vs-code-基本功能>)；Diff 只读仍按 FR-TOOL-002 / DEC-08。
- 参考：[VS Code Integrated browser](https://code.visualstudio.com/docs/debugtest/integrated-browser)（任意 http / https / file 地址、DevTools、global / workspace / ephemeral 存储模式、按网站权限）。

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 范围 | 「对齐vscode的基本功能啊，files右键功能呢都没有，browser必须切http前缀，还只能打开本地网页。其他的你都要和vscode对齐」（2026-10-26） |
| 全文搜索 | 纳入，放在第二步；接受新增 ripgrep 依赖（2026-10-26） |
| 文件编辑 | 不做，提供用外部编辑器打开（2026-10-26） |
| 推进方式 | 文档与开发同一分支推进，文档 diff 与代码一起审阅（2026-10-26） |
| Browser 登录数据 | 所有 Project 共享保存（2026-10-26） |
| Diff Git 操作 | 保持只读（2026-10-26） |

## 验收标准

来源：AC-07 2026-10-26 补充、FR-TOOL-001～005。

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| Files 右键文件管理（FR-TOOL-001） | Git fixture Project；右键新建文件 / 文件夹、重命名、复制粘贴、拖拽移动、删除 | 树即时刷新；删除进入废纸篓；同名冲突给出原因不覆盖；`.git` 与 Project 外路径不可操作 | 主进程单测（路径与符号链接边界）、E2E、agent-browser 截图 |
| 快速打开（FR-TOOL-001） | ⌘P 输入片段 | 模糊匹配文件名与路径，回车在 Files 打开；遵守 .gitignore | 单测（评分）、E2E |
| Git 装饰（FR-TOOL-001） | 修改 / 新增 / 忽略文件 | 树中颜色与字母与 Diff 一致，被忽略项变灰 | E2E |
| 外部打开（FR-TOOL-001） | 右键「在 Finder 中显示」「用 VS Code 打开」 | 调用系统对应应用；未安装 VS Code 时不显示该项 | 单测（命令构造）；人工检查 |
| Diff 视图控制（FR-TOOL-002） | 打开多处修改的文件 | 并排 / 行内、上一处 / 下一处、折叠未改动区域可用；仍无写操作 | E2E |
| Terminal 链接与查找（FR-TOOL-004） | 终端输出 `http://localhost:port` 与 `src/a.ts:3` | ⌘+点击分别打开内置 Browser 与 Files 第 3 行；⌘F 查找高亮；⌘K 清屏后重新附着不恢复旧内容 | 单测（链接解析）、E2E |
| Browser 任意网址（FR-TOOL-003） | 输入 `example.com`、`192.168.x.x:3000`、`localhost:5173` | 分别补 `https://` / `http://` 并加载；后退前进停止、DevTools、系统浏览器打开可用；网页仍无 Node / IPC | 单测（地址规则）、E2E（本地页面）、真实外站人工检查 |
| Browser 共享登录（FR-TOOL-003） | 在 Project A 登录本地测试站点后重启应用，在 Project B 打开 | Cookie 保留且共享；清除浏览数据后失效 | E2E（本地 Set-Cookie 页面） |
| 全文搜索（FR-TOOL-005） | ⌘⇧F 搜索文本 / 正则，设置包含排除 | 结果分组与计数正确，点击定位；被忽略文件不出现；超时与上限明确提示 | 单测、E2E |
| 回归（AC-07 既有） | 运行既有 runtime-tools / files / diff E2E | 全部通过 | `pnpm test`、`pnpm test:e2e` |

## 技术决定

- 右键菜单采用原生菜单（Electron `Menu.popup`），与 VS Code 在 macOS 的默认一致，并避免被 Browser 原生视图遮挡；菜单经类型化 IPC 返回所选项 ID，不提供通用执行接口（AI 决定，2026-10-26）。
- 文件写操作沿用 Files 的 Project 相对路径校验：拒绝 `.git`、Project 外与跨符号链接的路径；删除使用系统废纸篓；同名冲突不覆盖（AI 决定，2026-10-26）。
- Browser 使用单一持久分区 `persist:studio-browser`，依赖已开启的 Cookie 加密 fuse；导航仅接受 http / https，其他协议仍提示用系统应用打开（AI 实现选择，范围依据用户 2026-10-26 确认）。

## 进度

- 2026-10-26：建立 worktree 与任务记录；文档按确认范围更新（待审阅）。
- 2026-10-26：第 1～3 步均已实现（Files 文件管理 / ⌘P / Git 着色 / 预览；Search；Diff 视图控制；Terminal 链接 / 查找 / 清屏 / 重命名 / 分屏；Browser 任意网址 / 共享持久数据 / 多 Tab / 历史收藏 / 按网站权限）。自检：`pnpm typecheck` 通过；单元测试 1271/1272（失败项为未改动的 Diff git-runner 并发计时用例，单独重跑 3/3 通过）；E2E files / diff / runtime-tools / vscode-parity 共 15 项通过；打包 `pnpm package` + `pnpm smoke:packaged` PASS（含 ripgrep）。
- 2026-10-26 当日未完成：agent-browser 走查只做到 Files；原生菜单、独立验收、§5.4 回写、文档复核与 Git 状态无障碍名称留待后续。后续结果见下方续推与收尾，不把当日记录作为当前待办。

## 2026-10-26 提交整理

用户明确「如果是大改动且没有完成，先保留。不要并入 main 了」。本任务继续 `in_progress`；代码与证据保留于 `feat/tools-vscode-parity` 和现有独立 worktree，已 rebase 到只含已完成局部修正的 main，不合入 main、不标记验收通过。提交整理核对 FR-TOOL-001～005 / AC-07、DEC-25、Tools spec 与路线图下一步 / 模块状态：确认范围保留，独立验收、未完成交互走查与 §5.4 回写仍由本任务跟踪；模块索引补齐 FR-TOOL-005。历史 E2E / 打包结果保持原基线，不作为本轮合入或人工验收证明。

## 2026-10-27 续推

依据本轮用户「没完成的worktrees 继续推进」，在原 worktree 继续，保留不合入 main 的约束。Main 修复 W5 独立审查发现的 Git 状态无障碍名称、Terminal 中文 / 空格路径链接、文件变更并发覆盖、索引关闭取消、Search / Quick Open 根目录替换隔离及单行高密度匹配的内存 / 转码边界。

- 文件变更增加 Project 串行队列；重命名 / 移动使用 macOS 排他重命名辅助程序，复制通过私有暂存目录排他发布，不覆盖外部进程抢先创建的目标；关闭等待已开始变更，拒绝旧排队请求。
- Search / Quick Open 使用固定根目录身份的原生启动器，不通过可替换的路径作为子进程 cwd；返回前再核对根目录身份，关闭取消索引。
- 开发者自检：`pnpm check:code` 通过（36 scripts / 257 Adapter / 1288 Desktop），此前针对性回归、类型检查及构建通过；完整日志位于 `.runtime/w0-continue-check-code.log`。W5 独立复验与最终包 / Terminal 交互仍在执行，最终结论见 [acceptance](acceptance.md)。
- 文档同步：补齐 Tools §5.4 的实际接口、限额、辅助程序构建及安全边界；更新 §1.1、§2、Browser §3 / §4.3 的旧导航和分区表述，§5.1 历史实现保留并标明由 §5.4 取代；桌面 README 补构建要求。路线图核对下一步、整体概况、§3.3 工具、阶段 3 与 AC-07，保留旧验收基线，新范围链接本任务。FR / AC / DEC-25 的已授权行为没有改变，其他历史证据不外推；规格 diff 仍待人工审阅。

- W5 末轮补查发现 ripgrep JSON 不受列宽参数约束；Main 已增加单记录 / 总输出限额、在偏移转换前截断子匹配并改为线性扫描，零条可显示结果时仍提示限额。20,000 同行匹配精确限制为 10,000，200,000 同行匹配在 JSON 解析前停止；相关回归 7 项与类型检查通过，最终门禁按该新增修复基线重跑。
- 固定根目录启动器接入后，打包冒烟夹具路径也改用 realpath，避免 macOS `/var` 别名被误判为根目录替换；重新打包后 `ripgrep` 与 `filesRename` 均须在 `smoke:packaged` 中为通过。

## 2026-10-28 技术收尾

W7（未参与实现）独立执行 126 项相关单测、15 项 Files / Diff / Runtime / VS Code 对齐 Electron 回归，均通过；从当前修复源重建 arm64 包并通过 `ripgrep` / `filesRename` / 原生依赖冒烟。实际界面复验覆盖 Git 无障碍名称、中文 / 含空格 Terminal 文件链接及正确行定位、Finder 文件选中、VS Code 显示正确文件、外站协议补全与加载；真实 Electron 废纸篓 API 用临时 fixture 验证，GUI 删除确认由既有 E2E 覆盖。六项缺陷均由独立验收复核，证据基线和剩余体验边界见 acceptance。

最终提交门禁的完整基础检查通过：脚本 36 / Adapter 257 / Desktop 1289，工作区类型检查通过；归档后 Markdown 链接无新增问题，保留 4 项既有基线问题。提交信息首次仅因正文行长被拒，改为符合 commitlint 的分行正文后重试，不跳过 hooks。

文档收尾复核：核对 FR-TOOL-001～005 / AC-07 与 DEC-25，更新 Tools §1～5.4 的当前行为、接口与限额；修正 Project §4.2 的 Search 与已确认 PROJ-Q3 表述，Project View 的工具接缝；补 UX 需求映射 / 工具入口 / 设计交付与技术要求工具列表，以及设计索引 / Shell §8～9 的 Search、Terminal 分屏。路线图下一步、整体概况、模块 §3.3、阶段 3、AC-07 均指向本轮独立结论，旧包 / 旧人工验收保留原基线；新范围人工体验仍待验收。未修改静态架构快照和历史原型，避免将新增实现回填为旧版事实。规格 / 设计 diff 仍待人工审阅。

## 2026-10-29 人工验收与合入准备

人工接受范围与原始 `e5cc05d` 基线由 [acceptance](acceptance.md#人工功能验收)负责。Main 在已整理的 CLI / Claude main 基线上重放工程工具改动，源码没有文本冲突；AC 文档保留 Search 的 AC-07 映射与 CLI 的 AC-08 映射，路线图保留三项人工状态及 Claude 的 V1 边界。已核对下一步、整体、模块、阶段和 AC-07；历史本轮 Diff / 图片 / Skill / v06 验收不在此次三任务确认中，不扩大其状态。按贡献指南压为一个目标提交，快进合入后执行完整组合验证与 CI。

本任务已于 2026-10-29 快进合入本地 main；最终源码等同性、初轮失败与修复 / 复验、组合包结果见[主线组合验证](plan.md#2026-10-29-main-组合验证)。
