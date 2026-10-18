# W27：新增原生会话能力独立复验

## 未覆盖与结论边界

- 独立 Review Agent，未参与应用源码实现；2026-10-18 在 `AI Stduio.worktrees/v1-closure` 检查 `dc66a16` 加 Main Agent 的未提交 diff。
- 本记录覆盖独立自动化与只读接缝检查；**尚未取得 GUI 使用权，未启动 Electron，未发送真实 CLI / 模型请求**。实际 Codex UI、原生 Rule / Skill 自动加载、必要权限 / 问题实触发、最终安装包仍需后续验证。
- 采用真实 SessionService / SessionController / SQLite，以及模拟 Provider / JSON-RPC；OS 崩溃探针使用自建真实 Node 进程。模拟结果不代替真实 Codex 或 Electron 验收，不表示人工产品验收。
- 当前总体为：**受影响自动化范围通过；完整里程碑尚未验收完成**。历史初查与发现见 [W27-scope-audit.md](W27-scope-audit.md)，清理缺陷及修复过程见 [W27-ownership-review.md](W27-ownership-review.md)。

## 独立执行结果

从 worktree 根目录执行：

```sh
pnpm --filter @ai-studio/agent-adapter exec vitest run --root "$PWD" --config "$PWD/tasks/archive/T20261009-v1-foundation-slice/evidence/W27-vitest.config.ts"
```

2026-10-18 **18:06:58 +08**，Vitest 5.0.3，**4 文件、19 项通过，2.62 秒**。其中 [W27-native-input.test.ts](W27-native-input.test.ts) 为本轮新增的 10 项独立检查；原有 9 项进程与退出检查同时复验。`git diff --check` 通过。

| 场景 | 实际结果 |
|---|---|
| Skill 目录和身份 | Renderer 仅收到 opaque ID / name / description，不包含实际路径；同 ID 即使伪造 name，Adapter 仍使用当次目录中的真实 name / path；重复 ID 去重 |
| Project 隔离 | 同一 Skill 的另一 Project ID 不匹配；跨 Project 选择在创建前拒绝，不新增 Session |
| 普通发送 | 目录中已删除 / 禁用的 Skill 在创建前拒绝；保存的文本与标签保留，无新 Runtime / Session |
| Running 输入 | 追加前再次查询目录；失效 Skill 不调用 steer，不新增未被接受的用户消息，草稿保留 |
| Retry | 已失败回合的 Skill 被禁用后，重试拒绝且保留原失败回合；重新启用后重试使用原生附件并创建新的客户端轮次 |
| 图片与文件双角色 | resolver 将两个别名合成同一文件时，明确选择的 file mention 与 localImage 均交付；非原生附件策略明确拒绝图片，不静默丢弃 |
| 公开输出存储 | public reasoning delta 被完整快照替换；tool result 保留正文；服务重建后两者的 transcript ID、顺序及内容一致 |
| effort 接收时快照 | Runtime 启动未完成时改选，不改变已接受回合的 effort；后续回合采用新选择；null 默认复位状态可持久保存 |
| 原生 effort 默认 | 初始未选择不传 effort；显式复位且 config 没有 effort 时，从 actual model 的原生目录默认值解析，无硬编码 |
| 公开 reasoning 索引 | content / summary 分开累积，按索引排序；summary 出现后作为显示来源，不把两路流重复拼接 |
| MCP / dynamic tool 输出 | 模拟原生 item 经真实 CodexDriver 映射后，MCP content / structuredContent 与 dynamic contentItems 正文均保留 |
| A-Q3 / 最后退出责任 | 活跃宿主与其他实例保护、PID 复用保护、已观察脱离后代、登记失败句柄保留、并发 terminate、失败 dispose 重试及真实 Node 宿主 SIGKILL 后恢复，原有 9 项再次通过 |

中途基线曾因 Main Agent 移除 `SESSION_CLIS` import 但构造器保留引用而失败；已交实现者恢复 import。Codex-only 的 `getDefaultCli` 异步末尾分支曾仍允许 Claude，也已改成实际 Provider 集合判断。上方最终结果在修复后执行。

## 规格与协议范围

新增 effort、公开 reasoning / tool result、明确图片和 Skill 输入，分别落实 [Input §2 / I-Q6](../../../../specs/input/spec.md)、[Session S-Q12](../../../../specs/session/spec.md)及[产品原则 20、24](<../../../../docs/01. Product Definition.md#8-已确认的产品原则>)，属于既有授权中的缺口修复。当前默认创建 Provider 仅 Codex，符合 DEC-16 / DEC-19；Claude 实现与历史保留，不因此新增真实 Claude 验收。

协议生成已更新为 **0.163.0**；初查中的 0.161.0 是 `dc66a16` 历史事实，不能当作本次现状。`skills/list` 新增实际调用；`thread/settings/update` 仍只声明而未调用。生成协议覆盖的全部方法不构成 V1 产品清单：账户 / 登录管理、云端 / 部署、MCP / 插件配置编辑器及其他管理接口，不因上游类型存在而必须逐一新建 UI。当前验收应围绕实际应用出站调用与明确规格场景。

同样，不能把“没有逐方法实现”写成裁剪具体必要原生会话能力的依据。上游类型里的 audio 等扩展只有类型存在、没有当前版本 / 模型 / CLI 可用性与必要性证据时，保持未验证边界，不补记兼容，也不凭此盲目扩大 V1。发现具体实际可用且属既有原则的必要能力时，应记录负责规格、实际证据与接入差距。

## 基线指纹

以下为本次执行后捕获的 Git blob hash；最终 UI / 包验证须再次核对受影响源码与产物基线。

| 文件 | hash |
|---|---|
| `runtime-ownership.ts` | `942b6c0538701e6cb75ddadafab08e2b7e574169` |
| `codex/connection.ts` | `688a480940e554c54f19b795d544ee6630525ecf` |
| `codex/driver.ts` | `0ae9c3df7be458da6388a8e16ca722b3188e005a` |
| `codex/provider.ts` | `c0c3c21d715b20243ae7468c5eff1a5fbe878d38` |
| `codex/mapping.ts` | `6877f178300581807ce2116497855fe5538e2be3` |
| `session-service.ts` | `f948ffe1f0c0f20b48b631db2bf136ad84991823` |
| `file-reference.ts` | `ea2aa1f8aa6c245aea7fa1fba9288487fffe2802` |
| `Composer.tsx` | `2dc0732ef5fd6d2c425b7d13b08717ddb56785c0` |
| `Transcript.tsx` | `f6793c2dd2803ed07cd63a2d195831ab66dabf21` |
| `shared/session/types.ts` | `f1f6d2c403e169c02d8ae689101ac5eb4714473c` |

文档语义复核：检查初查能力矩阵、退出复验记录与本次结论；初查保留原基线和失败事实，本记录说明当前自动化通过范围，未覆盖 GUI / 真实 CLI / 包明确保留。未修改任务状态、人工验收状态或路线图，交 Main Agent 完成统一收尾。
