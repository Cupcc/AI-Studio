# W24：真实 Codex 应用 UI 与四工具综合复验（2026-10-18）

## 基线与环境

- 源码：`f0f3a8c0af54cd150985a4a4cea476984357e9a0`，Electron 主包 `apps/desktop/out/main/index.js` SHA-256 为 `69ddcf8923e28ffc21409b7b0d1c93dba98c7685e44c16b86cc96079ce59639e`。
- macOS 15.6 arm64，Electron 44.4.5，Node 26.10.0，pnpm 12.10.1，Codex CLI 0.163.0，协议类型 0.161.0。
- 应用通过隔离 `--studio-user-data-dir` 启动，Project 和本地 HTTP 服务均位于系统临时目录；未设置 `STUDIO_E2E_PROVIDERS`，没有使用模拟 Provider。

## 真实应用 UI 结果

1. 普通发送：从 Files 选择带空格的 `reference note.txt`，点击“添加到对话”，发送读取请求；Codex 从应用提交的原生引用中找到 `ui-steer-amber-542`，UI 显示完成回合和“查看本轮变更”。
2. 同轮追加：新建 Codex 回合，先执行 `sleep 30`；Running 期间从 Files 添加 `steer reference.txt`，发送追加请求。UI 只有一个该回合的“查看本轮变更”入口；Codex 在同一回合内读到并返回 `ui-steer-same-turn-731`，回合耗时 49 秒并完成。截图：[same-turn](W24/codex-ui-steer-same-turn.png)。
3. Files 与 Diff：只读查看器显示引用内容；将临时 Project 初始化为 Git 并提交基线后修改 `native.txt`，项目 Diff 显示 `HEAD (main @ 5f16427)` 下 `native.txt` 的 `+1/-0`，文件 Diff 显示 `after-change`。截图：[project Diff](W24/codex-ui-project-diff.png)。
4. Browser：Terminal 启动 `python3 -m http.server 48765 --bind 127.0.0.1`，Browser 仅访问 `http://127.0.0.1:48765/`，独立 WebContentsView 显示目录列表；随后切换回应用窗口，未自动打开外部地址。截图：[Browser](W24/codex-ui-browser-local.png)。
5. Terminal 与生命周期：真实 PTY 输出 `W24-TERMINAL-OK`；创建第二个 Terminal Tab，关闭时出现确认，确认后保留 Terminal 1；Ctrl-C 停止本地 HTTP 服务；关闭 Project 显示确认并确认后回到启动页。截图：[Terminal](W24/codex-ui-terminal-tabs.png)。

完整结构化结果、临时 fixture、token 和截图哈希见 [W24-real-codex-ui.json](W24-real-codex-ui.json)。

## 结论与边界

- **本轮 AI 技术复验：通过。** 应用内 Codex 普通文件引用、Codex Running 同轮追加、Files、项目 Diff、Browser 本地预览、Terminal 多实例及 Project 关闭接缝在同一隔离应用中取得结果。
- 这项结果补齐“应用 UI 的 Codex 真实运行中追加引用”与“四工具综合技术验收”的技术证据；不代替 Claude Code 真实验收、Codex Stop / 第二模型 / 并发等原生对齐专项，也不构成新增本轮 Diff 的人工产品验收。
- 本轮只执行用户已授权的 Codex 真实调用；没有创建 Release，也没有改变版本、签名、公证或发布范围。
