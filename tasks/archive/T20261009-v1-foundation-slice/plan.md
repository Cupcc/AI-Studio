# 执行计划：T20261009-v1-foundation-slice

## 人工审阅入口

[现有功能人工体验已全部通过](acceptance.md#人工功能验收)（2026-10-18 确认）；任务的技术收尾条件见[签收依据](task.md#当前收尾2026-10-19)。下文保留 2026-10-09 的执行计划和过程状态，不构成本轮执行授权。

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

- 分支：`main` 只放人审阅过的内容；`dev/v1` 为本轮集成分支；每个 worker 在独立 worktree 分支上提交，由主 Agent 合并到 `dev/v1`（2026-10-09 确认）。
- 波次：
  - Wave 1 并行：app-skeleton W1；agent-adapter W1（接口与核心）；project-view W1（调研）；project-shell W1、session-slice W1（spec 草稿）。
  - agent-adapter W1 合并后，并行启动 agent-adapter W2（Codex）与 W3（Claude）。
  - spec 草稿的未决问题由人回答后，project-shell 与 session-slice 进入实现（Wave 2）。
- 接续团队模型：仅限 GPT-6 Astra（xhigh / high）与 GPT-6.1 Sol（xhigh / high），替代此前 Claude 团队的模型安排（2026-10-09 对话确认）。协议与状态机使用 Astra xhigh；Claude Provider 使用 Astra high；壳层与界面使用 Sol xhigh；独立验收与范围明确的整理使用 Sol high。已完成 worker 的历史模型记录保留。
- 根目录文件归属：`package.json`、`pnpm-workspace.yaml`、`tsconfig*.json`、`.gitignore`、`.npmrc` 由 app-skeleton W1 维护；其他 worker 不修改。`pnpm-lock.yaml` 冲突在合并时重新生成。`AGENTS.md` 由主 Agent 在合并时更新。
- 真实 CLI 调用：只在显式开启的集成测试中限量运行，测试目录在 `/tmp`（2026-10-09 确认）。

## Workers

各子 task 的 worker 详表见其 `plan.md`；此处只列总览。

| Task | Worker | 职责 | 模型 | 依赖 | 状态 |
|---|---|---|---|---|---|
| app-skeleton | W1 | 应用骨架 | Opus 5.5 high | — | done |
| app-skeleton | W2 | 验收 | Sonnet 5.5 xhigh | app-skeleton W1 | done（待人签收） |
| agent-adapter | W1 | 接口、事件模型、核心运行时、spec 草稿 | Opus 5.5 xhigh | — | done |
| agent-adapter | W2 | Codex Provider | GPT-6 Astra xhigh | agent-adapter W1 | delivered |
| agent-adapter | W3 | Claude Provider | GPT-6 Astra high | agent-adapter W1 | delivered |
| project-view | W1 | 待决事项调研与决定草稿 | Sonnet 5.5 xhigh | — | done |
| project-shell | W1 | `specs/project`、`specs/navigation` 草稿 | Sonnet 5.5 high | — | done |
| project-shell | W2 | 壳层实现 | GPT-6.1 Sol xhigh | app-skeleton W1 | delivered |
| session-slice | W1 | `specs/session`、`specs/chat`、`specs/input` 草稿 | Opus 5.5 high | — | done |
| session-slice | W2 | 参考 Claude Desktop / ChatGPT Desktop 修订非阻塞问题的推荐 | 主 Agent 接续 | session-slice W1 | done |
| session-slice | W4 / W5 | 后端 / 界面与 Electron 场景 | Astra xhigh / Sol xhigh，界面收尾 Astra high | 契约 / Providers / Project | delivered |
| 验收 | Session W6（兼 Adapter W4、Project W3） | 独立子任务验收；总任务 `acceptance.md` 汇总，只写验收与本人证据 | GPT-6.1 Sol high | 各实现 worker | delivered（待人签收） |

## 进度与决定

- 2026-10-09 基线提交 `e17e295` 进入 `main`，创建 `dev/v1`；写入本轮拆分与各子 task 卡片。
- 2026-10-09 Wave 1 启动 5 个 worker，各自在 `.claude/worktrees/agent-*` 的独立 worktree 分支（`worktree-agent-*`）上工作，基于 `98490b2`。`.claude/worktrees/` 已加入本地 `.git/info/exclude`。合并后的验证在临时干净克隆中进行，避免主工作区的 `node_modules` 影响仍在运行的 worktree。
- 2026-10-09 project-shell W1 合并（spec 草稿，30 个未决问题，3 个阻塞）。
- 2026-10-09 session-slice W1 合并（session / chat / input spec 草稿）。人回答阻塞问题：PROJ-Q1～Q3、S-Q2、I-Q2、NAV-Q4 采纳推荐；S-Q1（c）不采纳推荐——窗口失焦、最小化或后台不算正在查看，回到前台不清除提醒。已写入各 spec 并修正 01 第 6 节、02 第 6 节（`cd87cc8`）。
- 2026-10-09 人对其余非阻塞问题的指示：对话功能参考 Claude Desktop 与 ChatGPT Desktop（含 Codex 的新版）修订推荐，写入 spec 并保持待确认，实现先按推荐进行。已启动 session-slice W2 调研。
- 2026-10-09 project-view W1 合并：4 份决定草稿登记在 `docs/decisions/README.md`；12 个问题写入 project-view task.md，待本轮收尾时一并请人确认（不阻塞本轮）。
- 2026-10-09 约 11:5x 三个运行中的 worker（app-skeleton W1、agent-adapter W1、session-slice W2）因账户会话额度限流（HTTP 429，12:10 重置）中断。13:18 恢复：app-skeleton W1 与 agent-adapter W1 通过消息续跑（worktree 中未提交进度保留），并向 agent-adapter W1 补充 I-Q2、S-Q2 的确认结果、session spec 第 5.1 节的接口期望和 Claude SDK `origin` 发现；session-slice W2 未写入任何文件，worktree 已被自动清理，重新启动。要求 worker 分步提交，降低再次中断的损失。
- 2026-10-09 app-skeleton W1 合并（`70b9ca6`），干净克隆复核通过；`AGENTS.md` 记录构建命令；project-shell 转为 ready 并启动 W2 实现；启动 app-skeleton W2 验收。
- 2026-10-09 agent-adapter W1 合并（`e680c2e`），干净克隆复核通过；启动 agent-adapter W2（Codex）、W3（Claude）。
- 2026-10-09 用户要求 Codex 接续并调用 agent team，并限定上述四种 GPT 模型配置。恢复检查：`dev/v1` 位于 `385adf0` 且干净；7 个旧 worktree 中仅 project-shell W2 有未提交实现（`agent-a014c55195a9e9487`），保留并在原处继续；其他旧分支提交均已在集成分支。Provider worker 尚无落盘实现，因此从当前集成提交创建独立 worktree。首批并行继续 Project 壳层、Codex Provider、Claude Provider；主 Agent 恢复 Session 推荐与接口计划并负责后续集成。app-skeleton W2 验收已由 `385adf0` 合并，任务不标记 done，等待人签收。
- 2026-10-09 Session W2 推荐复核与 W3 共享契约已提交；Project W2 主进程阶段 `598ab87` 合入，界面继续。骨架冒烟隔离修复 `c544b2b` 已实测通过，app-skeleton 为 verifying。Claude Provider 模拟测试已通过，真实成功回合受账户 session limit 阻断，停止额外请求；该限制不阻塞 Session 的模拟 Provider 开发，但真实验收不得标通过。
- 2026-10-09 首批三个 worker 已结束，所有提交集成至 `4ddc59e`。下一批并行：Session W4 Astra xhigh（后端）、W5 Sol xhigh（界面）、Adapter W4 / Project W3 Sol high（独立验收）；主 Agent 修复共享请求撤回、对齐 spec、做最终接线。继续严格限定用户指定四种模型配置。
- 2026-10-09 Session后端、界面、共享接线已全部合入，W5容量中断后由允许的Astra high接续原worktree，保留未提交进度；W4/W6也在容量恢复后续跑。已交付10项Session Electron流程，W6独立重现并复验IPC旧返回、关闭超时、迟到秘密答复、Adapter exports和macOS前台通知问题。详细恢复记录在Session plan，最新修复 `36abe65`。
- 2026-10-09 用户要求合理使用已安装skills：使用Vitest行为回归、React组件规则、agent-browser Electron交互；不改既有设计方向。各worker写入范围隔离，原生窗口测试由主Agent串行协调。用户新安装的 `.agents/`、`.claude/` 配置与skill安装task不纳入本轮提交。
- 2026-10-09 主Agent回写模块spec与子任务report，所有实现task转或保持verifying；Project View仅调研、Context tools不实施。独立验收worker追加总任务acceptance汇总，完成最终门禁后归档证据。真实CLI部分通过边界不变，不追加推理调用、不推送、不合main、不将任何task标done。
- 2026-10-09 W6 最终验收提交 `9f54ed8` 已合入，所有本轮交付与独立验收归档完成。最终代码基线 `188bd1d` 的 workspace typecheck、311 项单测、19 项完整 Electron 与 3 项独立补充 Electron 通过；5 项独立窄测和 15 张截图见 [Session 验收](../T20261009-session-slice/acceptance.md)。[总体验收](acceptance.md) 保留部分通过结论：真实 CLI UI AC-02～AC-05 本轮均未运行，Claude 配额及 Codex 修正版精确 Stop / 当前版本兼容边界未变。所有实现 task 保持 `verifying`、spec 保持草稿，等待人工审阅；下一步不自动扩展至 Project View / Context 工具实施或真实模型调用。
- 2026-10-09 按用户要求新增 [人工验收清单](manual-acceptance.md)：准备、应用窗口、Project / 导航（AC-01）、Session 模拟模式（AC-02～05）、真实 CLI 补验与签收方式，逐项列步骤与预期；模拟模式启动命令已在本机实际启动验证。[建设计划](<../../../docs/06. Development Roadmap.md>) 第 1 节第 4 步链接本清单。各 task 状态不变。

## 2026-10-18 V1 剩余技术收尾

依据：用户要求核对路线图「下一步」，已完成即移除，未完成继续推进；后续「continue」。沿用当前 V1 / DEC-16～22 范围，不发布或上传。

### 执行与评审

| 执行者 | 写入范围 | 依赖与方法 |
|---|---|---|
| W26 Main Agent | `fix/v1-closure` 独立 worktree；受影响实现、回归、负责文档及 `evidence/W26-*` | 核对焦点 / 未读回归、退出失败、A-Q3 归属清理；真实 Codex UI Stop / 模型 / 并发；最终产物验证；不代签人工验收 |
| W27 独立 Review Agent（实现后安排） | 本任务 `acceptance.md` 当前增补及 `evidence/W27-*`；源码只读 | 按 Task Protocol 复杂变更与里程碑要求独立执行受影响场景；GUI 串行；发现交 W26 修复 |

### 进度与恢复

- 基线 `dc66a16`。先前尝试的 Renderer 10 秒未读压制与重复 opened 调用均已撤回，不能作为修复证据。现阶段打包冒烟只证明开发版本基础能力，不作为最终 `v1.0.0` 通过。
- 当前在独立 worktree `/Users/Chris/Projects/AI Stduio.worktrees/v1-closure` 安装依赖；先复现焦点 / 未读失败，再补实现及真实 UI。原有 W24 / W25 结果保持其原基线。
- W26 已在 `dc66a16` 构建应用通过 agent-browser 执行真实 Codex UI 并发、单方 Stop、Astra 续聊及后台完成 / 前台打开清除；原始截图和只读状态在 `evidence/W26-ui-*`。浏览器 CDP 的 document.hasFocus 与 macOS 原生前台并不等价；清除场景用 System Events 明确置应用前台后复验。默认模式 request_user_input 原生返回 unavailable，不算 AC-05 通过。
- W27 独立审计发现 A-Q3、最终退出吞错、推理强度 / 公开输出、模型目录擅自回退等真实缺口，详见 `evidence/W27-scope-audit.md`。W26 实现持久 Runtime 归属、启动时清理、严格可重试退出，依独立失败探针修复登记失败丢句柄、已记录脱离后代遗漏与并发 terminate；W27 自建 OS 宿主强杀 / 多实例隔离等 9 项已通过。仍在补原生控制与附件接缝，未宣称阶段 / V1 完成。

- 最新全基础检查通过 scripts 36、Adapter 255、desktop 1165；W27 当前 19 项独立探针通过。首轮全 E2E 为 48/49，原始两个焦点用例定向 2/2 通过；随后定位首个原生焦点事件早于 Renderer 订阅的确定同步缺口，补可信 snapshot / event revision 及回归，并为前台 E2E 增加实际 active / frontmost PID 前置，未放宽未读断言。
- 初次 1.0.0 arm64 包与 smoke 通过，Electron 自带最低系统声明 13.0；纳入焦点修补后须重新生成最终包。未发布。

- 恢复进度：最终焦点修补包已生成，隔离 CLI fixture 改用当前支持的 on-request，并补齐配置引用的本地模型目录；login status 成功。W27 因服务 usage limit 停止，尚未完成最终 GUI / 包评审，不能据此前源码探针宣称里程碑通过。
- 按 Task Protocol 独立验收要求安排 W28 新 Review Agent：源码只读；写入仅限本任务 acceptance.md 当前增补及 evidence/W28-*。先独立复核最终源码、自动化证据与工具验收缺口，GUI 等 W26 释放后串行交接；W27 原证据保持基线。

- W26 最终包真实图片 / Skill / Rule、原生审批接受、I-Q2 文字拒绝、Astra low→CLI 默认 gpt-6.1-sol xhigh、正常重启及真实 Electron 宿主 SIGKILL后原ID续聊均取得证据（W26-native-result.json / W26-electron-recovery.json）。该次CLI随EOF退出，启动确认旧journal cleaned；实际杀死遗留后代的证据仍是W27 Node独立探针，不能混写。W28 已接GUI独占。
- W28 独立发现 functionCallOutput / Review / webSearch公开正文丢失，W26已修复并加正式回归，W28自写10/10通过；Main从恢复截图发现中断历史工具仍转圈，已补当前turn未完成条目恢复，Session79通过，须重包后由W28复验。

- 最新恢复：W28最终包独立通过（fc68a613…），Main完整基础36/257/1172、1.0.0 package/open smoke通过。完整E2E38通过/11在原生前台前置失败，诊断系统已锁屏且frontmost=loginwindow；已请求用户解锁，未弱化断言或提前归档。W28与包验证已从路线图下一步移除，最后保留解锁后的全套回归及技术收尾。
- 继续检查：系统只读状态仍为锁屏，因缺少原生前台条件而未重跑 GUI 回归。补修路线图阶段 3 / AC-02 / AC-07、04 最终包要求、08 任务收尾措辞、scripts 发布摘要及总任务 / Session / Adapter 的当前签收入口，避免已完成专项继续显示待实现 / 待验证；收尾资格仍取决于完整 Electron 门禁，七任务状态不变。

- 2026-10-19 最终收尾：只读确认 macOS 已解锁；重新构建并完整执行 Electron 49/49 通过。应用源码保持 9cd17ef，原独立最终包与 smoke 仍适用。按 W28 独立结论逐项关闭七任务，同次整体归档；当前状态与路径检查见总报告。此前锁屏等待及失败结果按原时间保留，新体验待人工验收，暂不发布。
