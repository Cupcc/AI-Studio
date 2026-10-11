# 结论：T20261011-project-view-implementation

## 结论与边界

Knowledge、Renderer、Preview 与 View Context 已在独立 `feat/project-view` 工作树实现。模拟 AC-06 与真实 Codex / Claude 的受影响链路均已验证；人工产品验收仍待进行，分支尚未合入 main。

2026-10-11 用户补充真实调用授权，指定模型、low 和各最多两用户回合，见 [task.md](task.md#已确认事项真实验证续行)。实际使用 Codex `gpt-6-luna` / low 两轮、Claude `claude-haiku-5-5` / low 两轮，四轮均完成；未超额、未换模型。独立结论与未覆盖项由 [acceptance.md](acceptance.md) 负责。本次没有修改四类工程工具内容。

## 实现

- 五类内置 JSON Definition、严格 Schema/绑定校验、受信组件 Renderer；Knowledge 与展示分离。
- 安全有界读取、稳定重读、watch/打开/焦点/回合终态补扫、revision 和 last-good；不自动写 Knowledge 或修复内容。
- 左侧普通 Session、最近三条、独立 View 草稿；首条英文 View Context 可移除，两 CLI 复用模板，后续轮次和恢复不重复注入。
- Preview 空状态、只填草稿的生成入口、滚动缩放与局部错误；Overview 的固定 Session 摘要不受 Agent Definition 控制。

实现约定集中在 [Project View spec §6](../../../specs/project-view/spec.md#6-实现计划与落地记录)，不在本报告重复具体数据协议。

## 验证

平台 macOS arm64，实现基线 `d49fec3`（此前自动化证据记为 `810d230` 加同一实现 diff）；真实补验没有改产品代码。实现与测试使用 Vitest、React best practices、agent-browser；UI 保留现有 Shell 设计，不做视觉重构。

| 检查 | 最新结果 | 边界 / 证据 |
|---|---|---|
| `pnpm typecheck` | 通过 | 全工作区 |
| `pnpm test` | 359/359 通过 | Adapter 181 + Desktop 178，无真实调用 |
| Electron E2E | 28/28 通过，55.3s | 包括新增 Project View 两场景；此前 Session 前台完成失败在排除并行 Electron 干扰后原断言通过 |
| W2 独立探针 | 3/3 通过 | [独立日志](evidence/W2-review-log.md)；缺失目录、enum 严格类型、关闭期间 IPC 返回 |
| W1 实际界面自检 | 模拟通过 | [Architecture 空态](evidence/W1-architecture-empty.png)、[AC-06](evidence/W1-ac06-ready.png)、[Overview](evidence/W1-overview-sessions.png) |
| W2 实际界面验收 | 模拟与真实 AC-06 通过 | [独立验收](acceptance.md)，含 last-good、工具不抢焦点、View Context、关闭重开 |
| 真实 Codex / Claude | 各 2/2 轮完成 | UI 首轮原句 → CLI 写 Knowledge → Preview 自动刷新；关闭重开同一原生 Session 后再次更新；Context 首轮 true、恢复轮 false |
| 打包 / 原生目录选择器 / 人工产品验收 | 未覆盖 | 本轮是开发构建功能验收，不发布里程碑完整交付结论；目录选择器仅返回隔离 fixture |
| 文档与归档检查 | [收尾记录](evidence/W1-closure.md) | 本地链接、表格、旧路径检索、独立探针可复跑性与 `git diff --check` |

独立发现的两项缺陷已交回 W1 修复并由 W2 复验。回归首轮还修正了测试的旧 API key 列表和不精确 Architecture/Progress 选择器；没有放宽沙箱断言。界面检查推动 Composer 标签布局、图形连线布局的小修复；节点上限改为拒绝而非截断。

## 文档回写与集成

| 目标 | 内容 | 状态 |
|---|---|---|
| [Project View spec](../../../specs/project-view/spec.md) | §6 技术实现约定与本任务入口；确认状态沿用主 checkout 既有记录 | 已回写，diff 待人审阅 |
| [桌面端说明](../../../apps/desktop/README.md) | 模块资源、运行时与模拟测试边界 | 已回写 |
| [路线图](<../../../docs/06. Development Roadmap.md>) | 分支实现进度、AC-06 模拟与真实结果、人工验收入口 | 已回写，diff 待人审阅 |

工作树：`/Users/Chris/Projects/AI Stduio.worktrees/project-view-implementation`。主 checkout 原有治理、规格和归档 diff 全部保留；本轮不在其上自动 stash、覆盖或合并。分支与主 checkout 的重叠文档须在后续集成时逐项协调。

## 收尾与后续

1. 两 CLI 使用独立支付 fixture 和 userData，所有真实请求由 W2 从可见应用入口发送。源文件哈希保持不变，客户端没有代写 Knowledge；两轮更新由原生 CLI 完成。
2. Main Agent 按主 checkout 已读取的最新 Task Protocol 核对交付、检查、独立验收和文档后收尾归档。人工产品验收单独记录，不把任务状态等同于人工接受。
3. 后续协调主 checkout 的重叠文档再集成分支；保留隔离 fixture 与原生测试 Session 供复核。最终产品打包验证和 AC-02～05 的剩余真实场景不在本次预算内。

模拟自检命令与历史失败见 [W1 验证记录](evidence/W1-verification.md)，真实环境准备、模型固定与预算护栏见 [W1 真实验证准备](evidence/W1-real-preparation.md)。两次 harness 准备失败发生在模型调用前，未消耗预算，不属于产品缺陷；失败记录保留。
