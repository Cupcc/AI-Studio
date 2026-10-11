# W1 真实 AC-06 环境准备（2026-10-11）

## 授权与探测

用户对各 CLI 最多两轮真实调用回复“允许，gpt-6-luna low, haiku-5.5 low”。基线 `d49fec3`，本轮没有改产品代码。Main Agent 准备环境与配置，W2 独占用户入口操作和全部四轮上限；W1 不发送用户输入。

安全过滤的 Provider availability 结果：Codex CLI `0.162.1` available / logged_in；Claude Code `2.1.296` available / logged_in。只保存状态，不保存认证输出或身份。登录不代表配额可用。

原生模型目录探测无用户 prompt：Codex 返回 `gpt-6-luna`（GPT-6 Luna）；Claude 返回 `haiku`（Haiku 5.5）。Claude 原生模型固定为 `claude-haiku-5-5`，不使用不同代际的模型。官方文档支持 [GPT-6 Luna low](https://developers.openai.com/api/docs/models/gpt-6-luna)、[Codex model_reasoning_effort](https://learn.chatgpt.com/docs/config-file/config-reference)、[Claude Haiku 模型与 effort 参数](https://code.claude.com/docs/en/model-config)；实际本地 CLI 目录与 help 也已核对。

## 隔离与配置边界

- 两个仓库外 fixture：`/tmp/studio-ac06-real.zrj4BN/Codex Payment` 与 `Claude Payment`；各自独立 `README.md` 和三个合成 payment 源文件，无真实业务数据、凭据或预填 Knowledge。
- userData 独立在同一临时根目录，开发构建 Electron/CDP 9337，不使用模拟 Provider 开关。
- 原生目录选择器只返回 fixture（先 Codex、后 Claude）；用户操作、发送、审批和 View 切换均由 agent-browser 操作可见 UI。
- 应用无 effort UI；验收 harness 只在真实 Provider 的 create/resume 参数中注入 Codex `effort: low` 和 `model_reasoning_effort: low`，Claude `CLAUDE_CODE_EFFORT_LEVEL=low` 与 `ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5`。不改全局配置，不注入 Session 状态、不替换模型响应、不生成 Knowledge。
- 发送前强制要求 UI 模型为 `gpt-6-luna` 或 `haiku`，拒绝默认模型回退；持久预算护栏在调用真实 `sendUserInput` 前累加，每 CLI 最多 2 次（失败提交也计数），第三次被拒绝。配置与安全过滤的提交/终态信息写入 fixture `audit.jsonl`，计数写入 `budget.json`。
- 实际执行脚本副本：[W1-real-harness.mjs](W1-real-harness.mjs)。仅作为本次证据；再次运行前仍须核对授权、fixture 与已有预算计数，不能删除计数来规避上限。
- Harness 使用真实 Provider、Adapter、原生 CLI 与应用完整文件监视/渲染链路，但显式测试参数不证明未设置 effort 时的默认值。关闭重开 Project 是原生 Session resume；不等同于应用退出/打包验证。
- 首次 harness 启动在配置阶段因 Electron evaluate 不支持 dynamic import 失败，未发送输入；改用 `process.getBuiltinModule` 后成功。未改产品代码。
- 首次 UI 发送在真实 Provider 创建前被 fixture 护栏拒绝：Project 将 `/tmp` 规范化为 `/private/tmp`。修正为两个 fixture 根目录的 realpath 精确比对后重启；该次未进入 CLI、未消耗调用额度。保留失败 Session 作为测试准备证据，新 View 草稿重新验证首条 Context。

真实调用结果及截图由 W2 的验收记录负责。临时项目与原生 CLI 测试会话会留存以供复核；不删除用户的其他会话或配置。

## 源文件基线

W1 在首次调用后核对与创建时留存的哈希一致；W2 在四轮完成后独立计算当前六个文件，并与 W1 提供的初始值核对一致。初始哈希来源为 W1，不声称由 W2 在调用前采集。两个 fixture 的初始合成源码相同：

| 文件 | SHA-256 |
|---|---|
| `src/payment/api.ts` | `7d03354f01bea800410b7c412eefbb024a267a70b5cc8dfb89ae5e14eaebdeae` |
| `src/payment/service.ts` | `0be06895e09db0ada350b51dfbe55cea8d6abcbbf35597aa97ad93956b87e00a` |
| `src/payment/store.ts` | `b2d95c51e4803d6c3d2cb10d76850f0347e35685a65da652fbe0b8ebcaf1ad4a` |
