# W23 本轮 Diff 独立评审

## 未覆盖与适用范围

- 评审者 W23 未参与应用实现，只写验收与证据。范围为 FR-TOOL-002、Tools spec §3 / §4.2、AC-07 的 Adapter 原生补丁 → Session / SQLite → IPC → Conversation / Diff，追加审计本轮 Codex 原生文件引用策略。
- **本轮所列范围的独立 AI 评审：通过（2026-10-18）**。六项发现全部修复并独立复验；最终源码、边界探针、受影响回归及模拟 Provider 的实际 Electron 界面均已检查。完整 AC-07 尚未完成。
- 本次真实调用仅 Codex。Claude Code 没有真实复测，沿用 DEC-16 / DEC-19 暂缓边界。应用 UI 的真实运行中追加、四工具综合技术验收、最终打包产物独立验收和 V1 里程碑不在本次通过范围；Main Agent 的全量 E2E / 打包 / 冒烟结果由其负责记录。
- 无需新增人工产品决定；新功能的人工体验仍待用户验收，既有功能的 2026-10-18 人工接受不自动覆盖本轮。

## 环境与方法

- 基线 `dcfaac35ef86200721727ab53533682f2dd85d4e` + `feat/turn-diff` 未提交变更，工作目录 `AI Stduio.worktrees/turn-diff`。初审、修复复验及 GUI 均于 2026-10-18 执行；最终 31 个修改 / 新增源码文件的哈希清单见 [W23-baseline.json](W23-baseline.json)，清单摘要 SHA-256 为 `a9d0cf3df621d7f6a07800ad6e6cdf090ff153ea3582c9c80f54bcd7d2ee7125`。清单只覆盖应用 / Adapter 源码，未修改部分由 HEAD 固定，任务证据不混入源码清单。
- macOS 15.6 arm64、Electron 44.4.5、Node 26.10.0、pnpm 12.10.1；独立探针从源码导入 Adapter / Session，使用 Node SQLite 的磁盘数据库和临时目录，未读当前工作区来构造历史补丁。模拟运行使用真实 Controller / Driver / JSON-RPC 假传输，真实调用使用安装的 `codex-cli 0.163.0`。
- 使用 vitest 技能准备边界探针，按 vercel-react-best-practices 核对按需挂载、读取取消和原始状态依赖；实际界面按 agent-browser core / electron 工作流操作。
- GUI 使用 F6 修复后的开发构建；main bundle SHA-256 为 `69ddcf8923e28ffc21409b7b0d1c93dba98c7685e44c16b86cc96079ce59639e`，与最终复核时的构建一致。GUI 后源码仅修正 `file-reference.ts` 的证据文件名注释，不改变行为；Main Agent 另保存了[重新构建的 119 文件等价清单](W0-build-comment-equivalence.json)。

## 发现、修复与复验

| 编号 | 初始发现与影响 | 修复与独立复验 |
|---|---|---|
| W23-F1（中） | 大于 512 KiB 聚合 patch 被截断后，完整的小聚合替换仍继承旧 `truncated=true`，最终历史错误报告不完整 | Main Agent 分开保存聚合 / 文件列表 / 每文件截断；聚合替换重置聚合标志。独立原失败探针现通过 |
| W23-F2（低） | 9000 字节原生路径裁到 8192 字节，却仍 `truncated=false`，静默丢失身份显示信息 | 路径 / 原路径裁切加入每文件截断。独立原失败探针现通过 |
| W23-F3（高） | 对整个 TurnDiffRecord 递归脱敏会改身份及状态：secret=`completed` 时 `native-completed` 变 `native-[已隐藏]`，后续合法更新不匹配；状态枚举也可被改，命中 App Turn ID 时还会违反 FK | 改为仅脱敏补丁、原因和文件显示路径；结构字段保持原值。独立原失败探针现通过 |
| W23-F4（中） | 脱敏之后未再限额；512 KiB 全 `x` 的合法 patch 在 secret=`x` 时持久化为 5,767,168 字节，且未标截断 | 共用有界函数移动至 Adapter core 并导出，Session 脱敏后再限额。独立原失败探针现通过 |
| W23-F5（低） | 只有 fileChange 事件时来源却写成尚未收到的 turn/diff/updated；已有文件 patch 时 UI 泛称“没有取得原生补丁” | 来源收集实际事件，unknown 文案明确“原生聚合补丁”。独立探针检查 fileChange-only 来源、随后聚合到来后的两种来源均通过，文案经代码核对 |
| W23-F6（中） | 本次新轮没有 patch 事件时，已经由 CLI 提供的原生 Turn、CLI / 协议版本未保存；完成 / 重启后误显示未提供身份 | bindTurn 首次发 `client:native-turn-bound` unknown 快照。独立 Driver → SessionService 探针不发任何 patch，验证已知身份、完成锁定及 Session 重建后同一记录保留 |

F1～F4 原始失败来自 W23 自写的 [W23-turn-diff.test.ts](W23-turn-diff.test.ts)，非实现者测试；F5 / F6 先由源码审计提出、修复后补独立探针验证。六项均交 Main Agent 修改应用后由 W23 复验，W23 未改应用代码。

## 独立非 GUI 场景

| 来源 / 场景 | 操作与实际结果 | 当前结果 |
|---|---|---|
| Tools §4.2：早到 / 迟到 | 模拟 diff 通知早于 turn/start 响应，正确缓冲后归属；结束后的迟到 patch 无新更新 | 通过 |
| Tools §3 / §4.2：替换与限额 | 大聚合换完整小聚合、超长路径、结构脱敏、脱敏扩容四项原失败探针复验 | 通过 |
| Tools §4.2：迁移与历史锁定 | 先建无 Diff 的旧磁盘库和真实历史行，再升级并落盘 final；关闭重开后 revision=100 的覆写仍被拒，原历史行保留 | 通过 |
| AC-07：并行隔离 | 两个 Session 的 Thread 不同，故意让 native Turn ID 完全相同；分别收 patch，跨 Thread 通知被拒 | 通过 |
| Tools §4.2：Runtime 恢复 | 强制 Stop 清理失败触发 Runtime 替换并恢复原 Thread；下一轮收到旧轮通知后仅保存新代次当前轮 patch | 通过 |
| Tools §4.2：来源 / 无 patch 的新轮 | fileChange-only 来源不伪称已收到聚合；新轮没有 patch 通知也保存已知原生身份，完成 / 重建服务后保持 unknown，未伪造零变更 | 通过 |
| Session / 数据库 / IPC / 引用 / UI 请求回归 | 最终源码上 W23 独立运行现有五个 suite，110 项通过；覆盖身份错配拒绝、失败 / 中断保留、empty / unknown / unavailable / failed、引用失败保留、UI 旧请求回写丢弃和补丁标记按文本显示 | 通过；[最终日志](W23-regression-final.log)，非独立新编用例 |
| Adapter Diff / Controller / Stop 回归 | 最终源码上 W23 独立运行三个既有 suite，81 项通过；核对新增绑定快照不破坏并发、Stop、Runtime 替换及状态事件 | 通过；[最终日志](W23-adapter-final.log)，非独立新编用例 |

探针命令：

```sh
pnpm --filter @ai-studio/desktop exec vitest run --root "$PWD" --config "$PWD/tasks/T20261009-context-tools/evidence/W23-review.config.ts" --reporter=verbose
```

常规运行跳过两个真实 CLI 用例，最终 10 个本地探针通过，见[日志](W23-probes-final.log)。真实用例须显式 `STUDIO_W23_REAL=1`，不会由仓库 `pnpm test` 自动调用。最终复跑没有新增模型请求。

## 独立 Electron 界面验收

使用命名 agent-browser 会话 `w23-turn-diff`，CDP 9341，窗口内容 1440 × 900。准备脚本 [W23-launch-gui.cjs](W23-launch-gui.cjs) 只用 Playwright 启动 Electron、隔离 userData、指定窗口尺寸并替换原生目录选择器返回 fixture 路径；没有从内部接口触发被验收行为。模拟 Provider 由应用已有 `STUDIO_E2E_PROVIDERS=1` 提供原生事件夹具，其补丁文字包含 `+saved-version`。选择 Codex、输入与发送、点击完成 / 错误入口、选择聚合 / 文件、切换工具 / Project 和查看来源均由 agent-browser 从可见入口执行。fixture 元数据见 [JSON](W23-gui-fixture.json)。

| 来源 / 场景 | 用户操作与实际结果 | 结论与截图 |
|---|---|---|
| FR-TOOL-002：主动打开与精确归属 | 发送 `[e2e:diff]`，完成后工具未自动打开；点击该完成行链接打开对应 Session / Turn 的聚合。显示最新补丁，无旧快照文字 | 通过；[未自动打开](W23-no-auto-open.png)、[聚合](W23-native-aggregate.png) |
| Tools §4.2：文件原始状态 | 选择原生文件记录，显示该文件补丁及“补丁记录不代表写入成功”，未将原生记录解释成成功写入 | 通过；[文件补丁](W23-native-file.png) |
| Tools §3：历史不随工作区重算 | 在磁盘把 fixture 的 `native.txt` 改成 `w23-later-workspace\n`，旧轮仍显示 `+saved-version`；再发普通无 patch 轮，当前选择仍为旧轮 | 通过；[切回后旧轮](W23-project-restored.png) |
| FR-TOOL-002：项目范围 | 点击工具栏 Diff，明确切回项目变更，显示非 Git 说明；没有把本轮原生记录冒充工作区 Git 差异 | 通过；[项目范围](W23-project-fallback.png) |
| Tools §4.2：未知与明确空 | 点击新普通轮的完成链接，显示“没有取得原生聚合补丁”，不捏造 0 文件；再发显式 empty 场景，说明仅指原生记录为空，不代表工作区无变更 | 通过；[unknown](W23-unknown.png)、[empty](W23-empty.png) |
| Tools §4.2：失败 | 发送收到补丁后失败的场景，点击错误卡片链接；保留 patch，轮次“执行失败”，文件条目“失败” | 通过；[失败轮](W23-failed.png) |
| Tools §4.2：中断 | 发送收到补丁后中断的场景，点击停止行链接；保留 patch，轮次“已停止”，原文件完成状态仍保留。中断由模拟 Provider 发出，本步骤不验证真实 Stop 清理 | 通过；[中断轮](W23-interrupted.png) |
| AC-07：Project 隔离 | 打开第二个 Project，不暴露第一个 Project 选中的 Diff；切回后恢复原来的历史选择 | 通过；[另一 Project](W23-other-project.png)、[恢复选择](W23-project-restored.png) |
| Tools §4.2：来源 | 展开“记录来源”，可读取原生关联和来源标签，未冒用当前工作区内容 | 通过；[来源披露](W23-source.png) |
| Tools §4.2：重启 | 完全关闭并以同一隔离 userData 重开应用；从原完成行重新打开，仍显示原来的保存补丁，磁盘的后来修改不影响它 | 通过；[重启历史](W23-restart-history.png) |

已查看以上关键截图，文字、选中状态、补丁颜色和布局可读，未发现新增界面缺陷。GUI 进程及本次 CDP 监听已关闭，原生窗口资源已交回 Main Agent。本轮未新增深色模式独立 GUI 场景，Main Agent 的深色截图属于自检。

## W23 独立真实 Codex 结果

| 场景 | 操作与实际结果 | 证据与边界 |
|---|---|---|
| 非 Git 原生 patch | 在仓库外非 Git fixture，仅让 Codex 使用 apply_patch 将 `w23-before` 改为 `w23-after`。通过本轮修改的 Adapter 收到聚合和 fileChange，状态 completed，文件落盘与补丁一致，Thread / Turn 和 CLI 版本关联正确 | [用例](W23-real-codex.test.ts)、[JSON](W23-real-codex.json)；1 次真实模型请求，约 8.7 秒；fixture 已删除 |
| 原生文件引用 | 用当前应用 `buildUserInput` 和 `FILE_REFERENCE_STRATEGY.codex` 构造附件，文件名含空格、`#`、中文及双引号。prompt 不含随机 token；Codex 实际读取附件并返回正确 token，文件未修改 | [用例](W23-native-reference.test.ts)、[JSON](W23-native-reference.json)；1 次真实模型请求，约 15.6 秒；fixture 已删除 |

两个真实场景均在调用前独立检查版本及登录状态，结果为 `0.163.0` / `logged_in`，报告未保存凭据。协议生成版本仍为 `0.161.0`，本次仅验证受影响的 0.163.0 接缝，不扩大为全 CLI 兼容性结论。Shell-only 修改缺少原生记录的覆盖说明同时经源码及 Main Agent 的[原始事件证据](W0-codex-native-probe.json)核对，不将其记为零变更。

这两份真实 JSON 采集于 F5 / F6 的来源与初始身份元数据修复之前：原生 patch 证据中 fileChange-only 快照的旧来源标签仍保留，没有改写历史证据。最新来源和无 patch 身份保存由最终本地独立探针复验；不把早期 JSON 标成最新元数据实测。

另独立检查了 Main Agent 的[真实 steer 原始 JSON](W0-codex-steer-live.json)：发送时为 running，返回随机 token，开始 / steer 接收 / 完成使用同一个 App Turn，初始 unknown 也包含原生身份及版本。该次调用由 Main Agent 执行，W23 仅审计证据；不计作 W23 独立执行或应用 UI 的真实追加验收。

## 收尾复核

- 最终独立检查为 10 个自写探针、110 个既有桌面回归和 81 个既有 Adapter 回归；六项发现已关闭，没有未解决的本次评审阻塞项。
- 已核对 Tools §3 / §4.2 / §5.3、Adapter §3.13、路线图的下一步 / 整体概况 / 模块与验收范围及本任务当前记录；应用 UI 真实追加、完整 AC-07、Claude 和人工新增功能验收均保持未覆盖，不扩展历史结论。脚本说明中可能误读为当前限制的“本轮只更新文档”已由 Main Agent 标明为当时边界，W23 已复核修正文案。
- Main Agent 最终自检报告完整 Electron E2E 49 / 49 及 unsigned package / packaged smoke 通过，见 [E2E 日志](W0-turn-diff-e2e.log)、[打包日志](W0-turn-diff-package.log)、[冒烟 JSON](W0-turn-diff-packaged-smoke.json)。这些由 Main Agent 执行，未计入 W23 独立运行结果，也不代表最终 V1 发布包已验收。
- W23 本段及报告的本地 Markdown 链接为 0 问题，表格 / 标题已检查；`git diff --check` 通过，最终源码清单复核无漂移。W23 只修改本报告、W23 证据及 `acceptance.md` 的 W23 段；不改应用代码或任务状态。仓库级文档同步、全量门禁及主任务收尾由 Main Agent 负责。
