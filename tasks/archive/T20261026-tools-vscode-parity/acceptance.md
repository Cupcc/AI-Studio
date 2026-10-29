# 验收：T20261026-tools-vscode-parity

## 未覆盖与待决事项

- 当前授权范围的 AI 技术验收已完成；真实网站账号登录与各网站兼容性仍未覆盖，不作为本轮技术阻塞。
- Browser 本地持久数据由隔离 HTTP fixture 覆盖，另以 `example.com` 作单次无账号外站冒烟；不代表真实账号登录兼容性。Finder / VS Code 的真实菜单路径已补查，VS Code 一次性外部确认后的文件打开由独立观察确认，未改永久设置。
- `.git` / 符号链接 / 并发写入与关闭等安全边界由独立源码评审和实际文件测试覆盖；原生菜单已用 CUA 检查。GUI 删除确认沿用隔离替身 E2E，真实 `shell.trashItem` 另对唯一临时文件执行并核对系统废纸篓，不删除用户文件。macOS 13 实机未覆盖。

## 人工功能验收

- 状态：**已验收（2026-10-29）**。
- 依据：用户在三个 worktree 技术收尾报告后明确回复「验收通过，合入main」。
- 接受基线：`e5cc05d`；授权按贡献指南整理并合入 main，保留本文件列明的真实网站账号、兼容性与 macOS 13 等未覆盖项。
- 范围：Files / Diff / Terminal / Browser 的 VS Code 基本操作与 Search（FR-TOOL-001～005；DEC-25）。本文件的 AI 技术结论不代表人工接受。

## AI 结论与运行环境

- 当前结论：**通过（本次授权的工程工具范围）**。W5 发现的六项缺陷已由 Main 修正，W7 独立复验通过；本轮人工确认见[人工功能验收](#人工功能验收)。
- 验收者：W5（`/root/code_todos`）初轮；W7（`/root/tools_verify`）最终复验，均未参与功能实现或修复；仅写本文件和各自证据。
- 日期与基线：初轮 2026-10-27 `997bce7`；最终复验 2026-10-28，`997bce7` 加当前未提交的六项修正，源码 / 构建物 hash 见 [W7 baseline](evidence/W7-baseline.json)。W7 从当前源码重新打包，源码在验证期间未改。
- 平台与形态：macOS arm64；Electron 构建应用，1440×900 内容尺寸；临时 Project 和 userData 位于仓库外。
- 方法：初轮 agent-browser CDP 9437；最终命名 session / CDP 9477，agent-browser 点击、输入、悬停和截图，CUA 补充 Command 点击、原生菜单与系统应用。fixture 只准备隔离数据和目录选择器 / 窗口，不注入产品状态。Session Provider 模拟，Terminal 与文件 / HTTP 实际运行，未调用真实 CLI / 模型。

## 验收结果

| 场景与来源 | 操作与预期 | 实际结果 | 方式与结论 | 证据 |
|---|---|---|---|---|
| Files Git 状态 / 被忽略项；FR-TOOL-001 | 打开 Files；修改文件与父目录标色，build 被忽略 | src 标修改色，build 变灰，`.git` 不显示；旧版无障碍名称缺少 Git 状态已交回修正 | agent-browser；中间基线通过视觉项 | [初始树](evidence/W5-files-start.png) |
| Files 同名冲突；FR-TOOL-001 / TOOLS-Q11 | 选中 src/a.ts，新建同名文件；不得覆盖 | 提示“已存在，未覆盖”，文件原内容保持 | agent-browser + 文件读取；通过 | [冲突提示](evidence/W5-files-conflict.png) |
| Files 原生菜单；FR-TOOL-001 | 右键 a.ts，核对菜单 | 打开 / 固定打开 / VS Code / 默认应用 / Finder / 集成终端 / 添加到对话 / 剪切复制粘贴 / 两种路径 / 重命名 / 删除均出现；未安装项按本机已安装状态显示 | CUA AX 与目视检查；通过菜单呈现 | 见下节原生菜单观察记录 |
| Quick Open；FR-TOOL-001 | 原生 ⌘P 输入 `中文:1`，回车 | 仅匹配 src/中文.ts；打开只读查看器；被忽略文件未列入候选 | CUA 快捷键 + agent-browser；通过 | [快速打开](evidence/W5-quick-open.png) |
| Search；FR-TOOL-005 | 搜索 needle，点击第 2 行结果 | 1 文件 / 2 结果；忽略 build，结果在 Files 打开 a.ts | agent-browser；通过 | [分组结果](evidence/W5-search.png) |
| Diff 控件；FR-TOOL-002 | 列表切树；选择 a.ts | 目录分组、只读查看器、前后变更、行内、折叠与打开 Files 控件均可见 | agent-browser；初轮当时待最终 E2E，后续 W7 同一构建的 15 / 15 回归已通过 | [W7 最终回归](evidence/W7-e2e.log) |
| Browser 地址 / 隔离；FR-TOOL-003 | 输入无协议的 127.0.0.1:port/login，再点页面链接 | 自动补 http；下一页收到 fixture Cookie；网页中 require / window.studio 均为 undefined | agent-browser；通过 | [网页](evidence/W5-browser.png)、[Cookie 与隔离](evidence/W5-browser-cookie-page.png) |
| Browser 收藏 / 多 Tab / 权限；FR-TOOL-003 | 收藏；点击网页 popup；请求通知后拒绝 | 收藏状态切换；popup 变新 Tab；显示网站权限卡，拒绝后页面收到 denied | agent-browser；通过 | [权限卡](evidence/W5-browser-permission.png)、[多 Tab](evidence/W5-browser-tabs.png) |
| 安全与逻辑修正回归 | Files、Search、Browser、Terminal links、Files panel 的当前修正测试 | 5 文件 / 180 项通过（08:16:57 基线） | W5 独立执行；通过该基线测试 | [日志](evidence/W5-targeted-tests.log) |

### 原生菜单观察记录

CUA 于第一轮实际窗口 a.ts 右键后读到原生菜单：打开、固定打开、在 VS Code 中打开、用默认应用打开、在 Finder 中显示、在集成终端中打开、添加到对话、剪切、复制、粘贴（剪贴板空时禁用）、复制路径、复制相对路径、重命名…、删除。原生菜单关闭后返回原文件树，未触发用户文件操作。

## 缺陷与复验

1. **Git 状态没有进入树行无障碍名称。** 旧版 a.ts 只有视觉 M 与 title。已交回实现者添加 `aria-label`；W7 最终构建复验通过，见下节。
2. **Terminal 文件链接不支持中文与含空格的路径。** 独立复现：`src/中文.ts:3` 被识别为 `.ts`，仓库这种绝对含空格路径被截成尾部。已交回实现者补 Unicode、引号、转义空格、绝对空格路径；当前相关单测通过，实际 Terminal W7 最终构建复验通过，见下节。
3. **并发 rename / move 可覆盖同名目标；长复制可能合并外部新目录。** 旧实现为 exists → rename。已交回实现者改为 Project 队列、macOS `renameatx_np(RENAME_EXCL)` helper 与私有副本原子发布；W5 已独立读 helper / 构建 / 资源路径，当前并发文件、目录、悬空链接与复制竞态测试通过。W7 重新打包后的实际 helper 加载与拒绝覆盖 smoke 通过。
4. **Quick Open 关闭时仍可能启动索引。** 已交回实现者增加初始 abort 检查、索引 controller 与关闭取消；对应测试通过。
5. **Project 根被替换成外部符号链接时，Search / Quick Open 没有 canonical-root 检查。** Main 已加固定根身份原生启动器；W7 源码检查及真实本地回归通过，覆盖替换为外部链接和校验后替换。

6. **Search 长单行可越过匹配上限并阻塞主进程。** 独立调用内置 rg，20,000 个 `a` 的一行产生 20,000 个 submatch / 978,500 字节 JSON，`--json` 下列宽参数不构成输出上限；原代码在上限检查前为每个匹配解码整个前缀，具有平方增长成本。Main 已加 JSON 单记录 / 总输出上限并线性转换、转换前截断；W7 回归确认 20,000 同行匹配只计 10,000，200,000 同行匹配在解析前停止并标限额，见最终测试；初始证据保留于[独立探针](evidence/W5-search-cap-probe.json)。


## W7 最终复验（2026-10-28）

| 场景与来源 | 独立操作 / 实际结果 | 结论 | 证据 |
|---|---|---|---|
| 六项修正与安全边界；FR-TOOL-001 / 005 | 阅读当前 helper / Files 队列 / 索引取消 / Search 原始输出限额；运行 Files operations、Search、Terminal links、Files panel 4 文件 126 项，均通过；包含文件 / 目录 / 悬空链接竞争、外部复制目标竞争、关闭排队、根替换与高密度单行 | 通过 | [针对性回归](evidence/W7-targeted-tests.log)、[基线](evidence/W7-baseline.json) |
| 最终原生构建 / 包加载 | 当前源码重新 `pnpm package`；`pnpm smoke:packaged` PASS，`ripgrep` / `filesRename` / SQLite / PTY / 屏幕模型 / Preload / Renderer 均 true | 通过 | [打包](evidence/W7-package.log)、[包冒烟](evidence/W7-packaged-smoke.json) |
| AC-07 工程工具回归 | 同一构建运行 files / diff / runtime-tools / vscode-parity，15 / 15 通过；覆盖 Files 文件操作、只读 Diff 控件、Browser 共享重启 / Tab / 权限、Terminal 链接 / 查找 / 清屏 / 分屏和关闭清理 | 通过 | [Electron 结果](evidence/W7-e2e.log) |
| Git 无障碍名称 | 实际 Files 展开 src，AX 区分“包含修改 / 已修改 / 未跟踪 / 已忽略”，视觉状态相符 | 通过 | [Files](evidence/W7-files-git-aria.png)、[操作记录](evidence/W7-interaction.md) |
| Terminal 中文及含空格路径 | 实际 Shell 输出后，悬停 + Command 点击；Files 分别打开中文文件第 3 行、含空格文件第 4 行；截图已查看 | 通过 | [中文第 3 行](evidence/W7-terminal-chinese-open.png)、[空格第 4 行](evidence/W7-terminal-space-open.png) |
| Finder / 外部 VS Code | 从真实原生菜单显示 Finder 并选中正确文件；VS Code 收到正确完整路径，外部一次性确认消失后独立看到正确 fixture 内容；未改永久设置，未写文件 | 通过（单机路径） | [原生交互记录](evidence/W7-interaction.md) |
| 无账号外站 | 在内置 Browser 输入 `example.com`；自动补 `https://`，实际加载 Example Domain；不访问个人账号 | 通过 | [嵌入页面](evidence/W7-browser-external.png)、[操作记录](evidence/W7-interaction.md) |
| 真实系统废纸篓 | 无窗口 Electron 调用相同 `shell.trashItem` 处理唯一临时 fixture；源消失、系统废纸篓同名内容一致；GUI 确认 / 树刷新另由 E2E 覆盖 | 通过（API 与 UI 分层） | [真实 Trash](evidence/W7-native-trash.json) |

W7 未改源码。六项问题均关闭；原生窗口及测试服务器已结束。W5 的历史结果保留其原基线，当前结论以本节和源码 hash 为准。任务状态与归档由 Main 按 Task Protocol 决定，本文不表示人工产品接受。
