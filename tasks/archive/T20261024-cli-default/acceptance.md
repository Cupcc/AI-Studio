# 验收：T20261024-cli-default

## 未覆盖与待决事项

- 本文件保留 W2 历史评审，并由 W7 核对 W6 的当前分支证据、W8 完成打包跨重启界面复验；不等同人工产品接受。
- 已完成独立 Electron 界面操作、W6 打包冒烟 / 设置截图及 W7 / W8 打包跨重启复验。真实模型调用及非 CLI 相关历史 UI 未覆盖。
- **人工功能验收：已验收（2026-10-29）**，范围与依据见[人工功能验收](#人工功能验收)。
- 本轮未发送真实模型请求，不外推真实会话链路或 Codex 全协议通过。
- 原工作树包含思考强度 UI 等无关改动，不纳入本次 CLI 管理验收。

## AI 结论与运行环境

- 当前结论：通过（本次 CLI 管理 / 默认 / 检测范围；不代表整项任务中的其他历史 UI 或真实模型链路验收）。
- 验收者：W2 `/root/cli_management_review`，未参与代码实现，源码只读。
- 日期与基线：2026-10-25；`fix/cli-management` worktree 最终未提交差异（Main 已报告 check:code、CLI E2E 4/4 通过）。继承此前未提交基线，不表示无关差异都已验证。
- 环境：macOS，本地 Node / Vitest 与实际 renderer store 的 Vite SSR 加载；模拟 API / Provider，不操作用户真实会话。
- 依据：[任务场景](task.md#验收场景)、[设置规格](../../../specs/settings/spec.md#cli-管理与默认-cli2026-10-25-确认)、AC-02 / AC-08。

## 中间检查结果

| 场景 | 方法与结果 | 结论 |
|---|---|---|
| 主进程启用列表 / 检测范围 | 阅读 `SessionService`：持久化先于内存更新，禁用项跳过检查，逐 Provider revision 丢弃切换期间的旧结果；新建前后校验启用，已有 Session send 不加启用限制 | 通过 |
| 相关测试 | 独立执行 5 个受影响 Vitest 文件，共 176 项通过 | 通过 |
| 迟到草稿与取消启用 | SSR 重放挂起 `getDraft`，广播 disabled 后返回旧草稿；归一为可用默认并重置 model/effort | 通过 |
| 恢复请求合并与 revision | SSR 重放 Provider generation 变化；恢复请求重读最新默认，不丢失合并事件 | 通过 |
| View 新建 CLI 选择器 | `ProjectView.tsx` 仅显示已添加 Provider | 通过 |

## 最终复验

| 场景与来源 | 操作 | 预期 / 实际 | 结论 | 证据 |
|---|---|---|---|---|
| 设置布局；CLI spec §3 | 独立连接 Electron CDP 9397，当前深色模式打开设置并进入 CLI | 标题栏右上固定“重新检测”；内容下分“已添加 / 未添加”；快照显示两组和固定按钮 | 通过 | [W2-cli-independent.png](evidence/W2-cli-independent.png) |
| 默认切换 | 点击已添加 Codex 行 | Codex 勾选为默认，Claude 取消勾选；列表顺序和右侧移除操作保持 | 通过 | CDP accessibility snapshot 2026-10-25 |
| 跨组移除 | 点击“移除 Claude Code” | Claude 从“已添加”移到“未添加”，出现“添加 Claude Code” | 通过 | CDP accessibility snapshot 2026-10-25 |
| 跨组添加 | 点击“添加 Claude Code” | Claude 回到“已添加”，不自动覆盖当前 Codex 默认 | 通过 | CDP accessibility snapshot 2026-10-25 |
| 深色模式 | 初始设置快照检查“深色” checked=true | 主题在深色模式可读，CLI 分组正常显示 | 通过 | CDP accessibility snapshot 2026-10-25 |
| 代码 / 状态回归 | 重新执行 5 个受影响 Vitest 文件 176 项；独立 SSR 重放 W2-F1/F2 | 全部 176 项通过；迟到草稿与合并恢复两个场景通过 | 通过 | Main 的 check:code 及 W2 独立命令输出 |

最终复验结论：W2-F1（迟到草稿）、W2-F2（合并恢复）和 W2-F3（View 选择器过滤）均已修复并由独立测试复验；本次 UI 也由未参与实现的 W2 通过 CDP 独立操作。剩余产品人工验收和其他历史范围仍由 Main 按任务记录，不在本独立结论内。

## 缺陷与复验

- **W2-F1**：已修复并复验；loadDraft/startDraft 归一当前 disabled CLI，保留文字 / 附件并重置模型 / effort。
- **W2-F2**：已修复并复验；fillMissingClis 在 provider generation 变化时重读，不丢弃最新默认恢复。
- **W2-F3**：已修复并复验；Project View 新建 CLI 选择器过滤 disabled Provider。

## 2026-10-28 W7 当前基线复核

- 验收者：W7 `/root/cli_verify`，未参与实现，源码只读。
- 当前源码基线：`53baac0697edb5a14124292ba931ae4004ca23c4`；`apps/` / `packages/` 无未提交 diff。文档 / 任务更新不改变该源码基线；包 hash 见 [baseline](evidence/W7-baseline.json)。
- 独立阅读 CLI 管理负责规格、主进程启用 / 默认 / 检测及 Renderer 设置实现，未发现新增阻塞问题。W6 的 218 项相关测试结果见 [原始独立记录](evidence/W6-review.md)，同源码基线复用，不重复运行。
- 独立查看 W6 两张打包截图：Codex 显示可用并为默认，已添加 / 未添加分组及固定“重新检测”按钮正常；重检后仍为可用。保留 [初始设置](evidence/W6-packaged-cli.png) 与[重检设置](evidence/W6-packaged-cli-rechecked.png)。
- W6 打包冒烟报告经复核为 `ok: true`、`isPackaged: true`、arm64；SQLite、PTY、Terminal 屏幕、登录 Shell、Renderer / Preload 均通过，启动最小 PATH 不含 CLI 时仍发现本机 Codex 0.164.0。原始报告已转存 [W7 保留副本](evidence/W7-w6-packaged-smoke.json)（只把本机主目录前缀换成 `~`），不代表发送模型或远端认证有效。
- 跨重启复验 fixture 从 W6 隔离测试数据库备份，保留其中的本地测试 Project 和初始 Codex 启用状态；不复制用户 profile。W7 从可见 UI 移除 / 重新添加 Codex；后续独立复核结果见下节。

## 2026-10-28 W8 打包跨重启最终复核

- 验收者：W8 `/root/tools_verify`，未参与 CLI 管理实现，源码只读；复用上述源码基线及 W6 测试 / 打包冒烟证据，未发送模型请求。
- W8 独立查看 W7 三张原始截图，并接管第二次重启后的实际打包窗口（CDP 9457）；下表区分继承证据复核与本轮实际 UI 观察。

| 场景 | 观察与结果 | 证据 |
|---|---|---|
| 全部移除 | W7 截图独立复核：已添加为空，Codex 移至未添加；草稿仍保留 | [全部移除](evidence/W7-packaged-all-removed.png) |
| 禁用状态跨重启 | W7 截图独立复核：重启后无可选 CLI、草稿仍为 `W7 keep draft across CLI changes` | [禁用后重启](evidence/W7-packaged-disabled-restart.png) |
| 添加后恢复 | W7 截图独立复核：重新添加 Codex 后恢复 CLI、真实模型标签和发送入口，草稿保留 | [恢复草稿](evidence/W7-packaged-recovered-draft.png) |
| 启用状态再次重启 | W8 实际窗口独立观察：项目 `project`、完整草稿与 Codex View CLI 保留，Send 可用；Settings 已添加只有 Codex 且为默认，未添加为空，重新检测按钮固定显示 | [重启后草稿](evidence/W8-packaged-draft-second-restart.png)、[设置](evidence/W8-packaged-enabled-second-restart.png)、[界面快照](evidence/W8-packaged-draft-second-restart.txt) |

当前技术结论：**通过**本次 CLI 添加 / 移除、默认、检测及草稿跨重启保留范围。W2 历史缺陷结论、同源码基线 W6 测试和打包冒烟仍有效；真实模型链路未复验，人工功能验收仍待人工完成。

## 人工功能验收

- 状态：**已验收（2026-10-29）**。
- 依据：用户在三个 worktree 技术收尾报告后明确回复「验收通过，合入main」。
- 接受范围与基线：`9c678a6` 的 CLI 管理、应用级默认、Codex 本地检测和草稿恢复；沿用本文件独立验收的范围与未覆盖项。
- 本次确认授权合入 main；真实模型链路、非 CLI 历史 UI 和发布范围按原负责记录保留。
