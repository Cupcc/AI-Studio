# 执行计划：T20261009-v1-foundation-slice

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
- 2026-10-09 约 11:5x 三个运行中的 worker（app-skeleton W1、agent-adapter W1、session-slice W2）因账户会话额度限流（HTTP 429，12:10 重置）中断。13:18 恢复：app-skeleton W1 与 agent-adapter W1 通过消息续跑（worktree 中未提交进度保留），并向 agent-adapter W1 补充 I-Q2、S-Q2 的确认结果、session spec 第 4.1 节的接口期望和 Claude SDK `origin` 发现；session-slice W2 未写入任何文件，worktree 已被自动清理，重新启动。要求 worker 分步提交，降低再次中断的损失。
- 2026-10-09 app-skeleton W1 合并（`70b9ca6`），干净克隆复核通过；`AGENTS.md` 记录构建命令；project-shell 转为 ready 并启动 W2 实现；启动 app-skeleton W2 验收。
- 2026-10-09 agent-adapter W1 合并（`e680c2e`），干净克隆复核通过；启动 agent-adapter W2（Codex）、W3（Claude）。
- 2026-10-09 用户要求 Codex 接续并调用 agent team，并限定上述四种 GPT 模型配置。恢复检查：`dev/v1` 位于 `385adf0` 且干净；7 个旧 worktree 中仅 project-shell W2 有未提交实现（`agent-a014c55195a9e9487`），保留并在原处继续；其他旧分支提交均已在集成分支。Provider worker 尚无落盘实现，因此从当前集成提交创建独立 worktree。首批并行继续 Project 壳层、Codex Provider、Claude Provider；主 Agent 恢复 Session 推荐与接口计划并负责后续集成。app-skeleton W2 验收已由 `385adf0` 合并，任务不标记 done，等待人签收。
- 2026-10-09 Session W2 推荐复核与 W3 共享契约已提交；Project W2 主进程阶段 `598ab87` 合入，界面继续。骨架冒烟隔离修复 `c544b2b` 已实测通过，app-skeleton 为 verifying。Claude Provider 模拟测试已通过，真实成功回合受账户 session limit 阻断，停止额外请求；该限制不阻塞 Session 的模拟 Provider 开发，但真实验收不得标通过。
- 2026-10-09 首批三个 worker 已结束，所有提交集成至 `4ddc59e`。下一批并行：Session W4 Astra xhigh（后端）、W5 Sol xhigh（界面）、Adapter W4 / Project W3 Sol high（独立验收）；主 Agent 修复共享请求撤回、对齐 spec、做最终接线。继续严格限定用户指定四种模型配置。
- 2026-10-09 Session后端、界面、共享接线已全部合入，W5容量中断后由允许的Astra high接续原worktree，保留未提交进度；W4/W6也在容量恢复后续跑。已交付10项Session Electron流程，W6独立重现并复验IPC旧返回、关闭超时、迟到秘密答复、Adapter exports和macOS前台通知问题。详细恢复记录在Session plan，最新修复 `36abe65`。
- 2026-10-09 用户要求合理使用已安装skills：使用Vitest行为回归、React组件规则、agent-browser Electron交互；不改既有设计方向。各worker写入范围隔离，原生窗口测试由主Agent串行协调。用户新安装的 `.agents/`、`.claude/` 配置与skill安装task不纳入本轮提交。
- 2026-10-09 主Agent回写模块spec与子任务report，所有实现task转或保持verifying；Project View仅调研、Context tools不实施。独立验收worker追加总任务acceptance汇总，完成最终门禁后归档证据。真实CLI部分通过边界不变，不追加推理调用、不推送、不合main、不将任何task标done。
- 2026-10-09 W6 最终验收提交 `9f54ed8` 已合入，所有本轮交付与独立验收归档完成。最终代码基线 `188bd1d` 的 workspace typecheck、311 项单测、19 项完整 Electron 与 3 项独立补充 Electron 通过；5 项独立窄测和 15 张截图见 [Session 验收](../T20261009-session-slice/acceptance.md)。[总体验收](acceptance.md) 保留部分通过结论：真实 CLI UI AC-02～AC-05 本轮均未运行，Claude 配额及 Codex 修正版精确 Stop / 当前版本兼容边界未变。所有实现 task 保持 `verifying`、spec 保持草稿，等待人工审阅；下一步不自动扩展至 Project View / Context 工具实施或真实模型调用。
