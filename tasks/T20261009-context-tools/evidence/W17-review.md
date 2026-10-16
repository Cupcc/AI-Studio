# W17 阶段 1 独立界面验收（Files + 项目 Diff + 文件引用，模拟 Provider）

验收者：W17（未参与实现，只写 `evidence/W17-*` 与 `acceptance.md` 的阶段 1 一节；未改任何源码 / task.md / plan.md / docs / specs；未 `git add` / `commit`）。日期：2026-10-15。
基线：`feat/files-diff` HEAD `b2d5fd4`（工作区除 W16 / W17 证据外干净）。开发构建 `apps/desktop/out/`（`out/main/index.js` 2026-10-15 10:39:06，`out/renderer/index.html` 10:39:11；`src/` 没有比它更新的文件）；打包应用 `apps/desktop/dist/mac-arm64/AI Developer Studio.app`（`app.asar` 10:39:17，未运行 `pnpm package`）。
平台：macOS 15.6 arm64、Electron 44.4.5（Playwright `_electron` 启动，隔离 `--studio-user-data-dir`）、Node v26.10.0、Git 2.39.2（Apple Git）。Provider：模拟 Session Provider（`STUDIO_E2E_PROVIDERS=1`），没有任何真实 Codex / Claude CLI 或模型调用。

## 方法与注入范围

- fixture：[W17-gui-fixture.mjs](W17-gui-fixture.mjs)。只注入：目录选择器 stub（经控制端口登记目录，目录必须位于 `os.tmpdir()` 下的 ROOT）、`STUDIO_E2E_PROVIDERS=1`、隔离 userData。控制端口（仅 127.0.0.1）另外提供：`window-size`（BrowserWindow.setContentSize）、`window-close`（触发应用自己的 close 处理，即隐藏窗口）、`window-show`（`app.emit('activate')`，走应用自己的 activate 处理）、`app-quit`、只读 `info` / `webcontents`，以及只读观察 `observe-on` / `obs-log`：在主进程给 `fs.opendir` / `readdir` / `open` / `lstat` / `stat` / `readlink`（含 promises 版）加「记录后原样转发」的包装，只记录 ROOT/projects 之下的路径，用来证明惰性读取；`child_process.spawn` 的包装没有记录到 git 调用（打包后的主进程以解构方式取得 `spawn`，包装在其之后才安装），git 进程改用 `ps` 核对。所有 Files / Diff / Session 操作都经 agent-browser 在真实界面里点击 / 按键完成（CDP 输入事件，不使用 osascript 按键）。
- fixture 数据：[W17-fixtures.mjs](W17-fixtures.mjs) 在 ROOT/projects 下创建 Project / Git 仓库；Git 一律 `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null`、固定作者、`-c core.autocrlf=false`。
- 辅助：[W17-helpers.sh](W17-helpers.sh)、[W17-files-probe.js](W17-files-probe.js)、[W17-monaco-probe.js](W17-monaco-probe.js)、[W17-monaco-contrast.mjs](W17-monaco-contrast.mjs)（复用 [W5-png-contrast.mjs](W5-png-contrast.mjs) 的 PNG 解码与 WCAG 公式）、[W17-pj.mjs](W17-pj.mjs)。脚本里的 scratch 绝对路径仅供复现参考。
- 截图：`screencapture -x -o -l<窗口ID>`，窗口 ID 来自 `BrowserWindow.getMediaSourceId()`；每张保留的截图都已查看，只含应用窗口；未保留的已不入库。
- 方法踩坑：agent-browser 的 `find role button click --name "Files"` 按子串匹配，会点到 `关闭 W17 Files Normal`（误关了一个空 Project，没有数据损失），之后全部用 `--exact`；`click` 对被裁剪的树行会落空，需先 `scrollintoview`。

## Part 1：Files 正常（开发构建，毛玻璃浅色，窗口 1280×800）

1. 惰性树（AC-07）：打开 Files 时观察到的主进程读取只有 Project 根（`lstat` 根 + 一次 `opendir` 根）。展开 `src`、`src/lib` 各只触发一次对应目录的 `opendir`，没有递归；折叠再展开 `src` 没有任何读取（使用缓存）。证据：[W17-files-first-open-r1.png](W17-files-first-open-r1.png) 与会话内的 `obs-log` 输出（转写在结果表）。大目录（30000 个条目）与 2000 条截断见 Part 2。
2. 文件查看：点击 `src/index.ts` 后 Monaco 首次渲染第一行约 560 ms（从 pointerdown 到出现 `.view-line`，开发构建）；字体 `"IBM Plex Mono", ui-monospace…` 12px，有行号，只读，8 种 token 颜色（毛玻璃浅）；composer 里没有出现文件标签（只有既有的「当前 View · Overview」标签）。证据：[截图](W17-files-view-ts-glass-light-r1.png)。
3. 外观矩阵（毛玻璃 / 纯色 × 浅 / 深，真实像素）：token 文字相对其真实背景 75 个 span 全部 ≥ 4.5:1，名义对比度最小值 5.89（毛玻璃浅）/ 6.29（毛玻璃深）/ 5.68（纯色深）/ 7.04（纯色浅）；最远像素法（含抗锯齿，偏保守）最小 6.16 / 7.76 / 7.2 / 7.3。证据：[W17-monaco-token-contrast-r1.json](W17-monaco-token-contrast-r1.json)、[毛玻璃深](W17-files-view-ts-glass-dark-r1.png)、[纯色浅](W17-files-view-ts-solid-light-r1.png)。
4. 键盘（WAI-ARIA tree）：Home / End / ↑ / ↓ 移动焦点；→ 在已展开目录进入首个子项，← 在已展开目录折叠、在已折叠目录或文件跳到父目录；Enter / Space 对目录切换展开、对文件打开查看器（焦点留在树上）；整棵树只有一个 `tabindex=0`（roving），Tab 顺序为树 → 分隔条 → 添加到对话 → 关闭查看器 → Monaco 文本框，Shift+Tab 回到被选中的树行。无障碍树：`tree "项目文件"`、`treeitem`（`level` / `expanded` / `selected`）、`separator "调整文件树与查看器的高度"`（valuenow / min / max）、`region "文件查看器"`、Monaco 文本框名称 `文件内容：app.py`。
5. 实时刷新：从外部新建 / 重命名 / 删除 `src` 下文件，树在约 0.26 s 内更新，只重新读取 `src`（根没有重读）；外部改写已打开的 `app.py`，查看器内容与大小（101 B → 58 B）自动更新；外部删除已打开的文件，查看器显示「文件已不存在 / app.py」并去掉「添加到对话」，选择被清除。证据：[外部改写](W17-files-external-edit-r1.png)、[已删除](W17-files-open-file-deleted-r1.png)。
6. 状态保持：选择 `src/index.ts` 后切到 Diff、Browser 再回 Files，展开（`src`、`src/lib`）、选择与查看内容保持，回到 Files 时重新读取根、三个已展开目录与已打开文件各一次；两个 Project 标签互相切换，各自的展开与选择保持；窗口隐藏（应用自己的 close 处理）再显示后保持。窗口显示后焦点落在左上角「折叠导航」按钮（见缺陷 W17-F6）：[截图](W17-files-after-hide-show-r1.png)。
7. 空目录显示「空目录」；分隔条键盘 ↑ ↓（步长 5）/ Home / End 与指针拖动都有效，范围 20–80（已用真实鼠标事件验证拖动到边界被夹紧）；侧栏宽度 320 与 560（`调整右侧边栏宽度`，键盘每步 10）下 Files 面板 `scrollWidth == clientWidth`，工具条、徽标、查看器头部都不溢出：[320](W17-files-sidebar-320-r1.png)、[560](W17-files-sidebar-560-r1.png)。侧栏分隔条不支持 Home / End（既有 Shell 行为，非本阶段）。

## Part 2：文件失败状态（开发构建）

逐个点击 `W17 Files Failure` 根目录的 32 个文件，记录查看器状态：[W17-files-failure-matrix-r1.jsonl](W17-files-failure-matrix-r1.jsonl)。
- 二进制（`bin.dat`）：「二进制文件，不显示内容」；非法 UTF-8（`bad-utf8.txt`）：「非 UTF-8 编码，无法显示」；UTF-16 LE / BE 带 BOM、UTF-8 BOM：正确解码并在头部显示 `UTF-16 LE (BOM)` 等；CRLF 显示 `CRLF`，混合换行显示「混合换行」。
- 大小限制：`exact-1MiB.txt`（1,048,576 B）可查看；`over-1MiB-by-1.txt`（1,048,577 B）与 1.3 MiB 文件显示「文件过大（x MiB），超过 1 MiB 的查看上限」。
- 无权限（`chmod 000`）：「无权限读取此文件」；无权限目录：「无权限读取此目录」。
- 符号链接（链接到文件、到目录、到 Project 外、悬空、互指环）：都列出（斜体 + 「链接」徽标，title 显示 `符号链接 → <目标>（未跟随）`），点击显示「符号链接未跟随，无法查看」，没有「添加到对话」，不展开链接到目录的符号链接。FIFO：徽标「特殊」，「不是普通文件，无法查看」。[截图](W17-files-failure-symlink-bidi-r1.png)。
- 名称：空格、前导 `-`、通配符 `glob[1]*?`、`:(top)`、`--output=x.txt`、CJK、emoji、制表符（显示为 `␉`）、换行（`␊`）、BEL（`␇`）、251 字符 + `.txt`（255 字符）均可列出并查看。缺陷：RLO（U+202E）按原样显示，名称读成 `rlotxt.eman`（W17-F1）；NEL（U+0085）与 LS（U+2028）没有像其他控制字符一样显示为可见符号（W17-F2）。
- 超过 2000 项（`many`，2500 个文件）：只显示 2000 项并给出「目录条目过多，仅显示前 2000 项」，但被省略的 500 项散落在整个名称范围里（例如 `f0042`–`f0047`、`f0050`…），不是「前 2000 项」（W17-F4）：[截图](W17-files-truncated-2000-r1.png)。
