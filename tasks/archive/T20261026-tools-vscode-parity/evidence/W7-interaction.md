# W7 最终交互复验（2026-10-28）

W7 `/root/tools_verify` 未参与实现，源码只读。使用当前重新构建的 Electron 应用；同基线的 15 项 E2E 和 arm64 包冒烟分别见 W7-e2e.log、W7-packaged-smoke.json。代码与构建物 hash 见 W7-baseline.json。

## 隔离与方法

- 仓库外临时 Project `W7 Alpha` / `W7 Beta`，独立 userData；仅准备 Git 文件、忽略目录、本地 HTTP fixture、原生目录选择器返回值和 1440×900 窗口。未注入 Renderer 产品状态。
- agent-browser 0.40.0，命名 session `w7-tools-69318e1a0224`，CDP 9477；常规点击 / 输入 / 悬停 / 截图由 agent-browser 执行；CUA 补 Command 点击和原生菜单。
- 模拟 Session Providers，Terminal 为真实本地 zsh。先在 Terminal 输入 `exec env PS1='%# ' HISTFILE=/dev/null zsh -f`，后续命令不保存用户历史。未发送模型请求，未使用个人账号。

## 操作与结果

1. 从“打开本地目录”进入 W7 Alpha，选择 Files、展开 src。AX 名称为 `src，包含修改`、`a.ts，已修改`、`new.ts，未跟踪` 和 `build，已忽略`；`.git` 不出现。截图 W7-files-git-aria.png 已查看，视觉与 AX 相符。
2. 切换 Terminal，用 `printf '%s\n' 'src/中文.ts:3' 'src/with space.ts:4'` 输出两条链接。agent-browser 悬停出现下划线，CUA Command 点击分别打开 Files 中的 `src/中文.ts` 与 `src/with space.ts`。截图 W7-terminal-chinese-open.png 第 3 行被选中；W7-terminal-space-open.png 第 4 行被选中，两张均已查看。
3. 在 Files 的 `with space.ts` 行真实右键，原生菜单选择“在 Finder 中显示”。Finder 的 src 窗口选中 `with space.ts`，预览显示 34 bytes，与临时文件相符；CUA 截图已目视检查。只关闭本次新开的 src 窗口。
4. 同一行真实右键选择“在 VS Code 中打开”。VS Code 收到正确完整路径并弹一次性外部应用确认。在 W7 的下一动作前，CUA 报告用户改变应用；重新观察时该临时文件已打开，窗口 URL 指向 W7 Alpha 的 `src/with space.ts`，编辑器正文为 `// first` / `// second` / `// third` / `space`。没有修改免询复选框、信任设置或文件；仅关闭本次 fixture Tab。该外部确认的消失属于外部操作，不记为人工产品接受。
5. 切换 Browser，从可见网址框输入 `example.com` 并回车。地址自动变为 `https://example.com/`，标题 Example Domain、正文和 Learn more 链接正常加载；CUA 查看完整应用截图，agent-browser 另保留嵌入页面截图 W7-browser-external.png 并查看。本次只是无账号的单次手工冒烟，不把外站作为自动化依赖。
6. 用应用退出菜单，经“停止并退出”结束 1 个临时 Terminal；随后通过 PID 存活检查确认测试应用已退出。已关闭测试服务器并释放原生窗口，未关闭用户其他应用。

## 原生系统废纸篓

GUI 的删除确认与树刷新由 W7-e2e.log 的 Files 场景覆盖（测试替换 trash 为隔离目录）。真实系统 API 另外用独立无窗口 Electron 脚本调用 `shell.trashItem`，仅处理本轮创建的唯一临时文件：源路径消失，`~/.Trash` 的同名文件内容精确匹配。结果见 W7-native-trash.json。没有通过 GUI 删除用户数据，也没有把 E2E 替身当作真实废纸篓证据。
