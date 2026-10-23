---
id: T20261019-ux-layout-review
status: done
fr: [FR-CHAT-001, FR-INPUT-001, FR-INPUT-002, FR-SESSION-001]
ac: [AC-02]
specs: [specs/chat/spec.md, specs/input/spec.md, specs/session/spec.md]
created: 2026-10-19
closed: 2026-10-20
---

# 用户体验与页面布局评审

## 目标与依据

用户 2026-10-19 指出 Thinking Effort 布局不佳、New Chat 输入居中与回复时不统一，要求参考 Codex Desktop、Claude Desktop，落地到 design；2026-10-20 指令“continue”继续同一工作。

交付设计评审、公开参考和可操作原型。关联 FR-CHAT-001、FR-INPUT-001～002、FR-SESSION-001 与 AC-02；行为基线为 [Shell Spec v02 §6～8](../../../design/components/shell-spec-v02.md)、[input spec](../../../specs/input/spec.md)、[chat spec](../../../specs/chat/spec.md)。本轮不更改生产代码、CLI 契约、正式确认规格或历史验收结论。

## 交付标准

| 标准 | 依据 | 验证方式 |
|---|---|---|
| 列出问题、证据、优先级、建议与待审阅事项 | 用户本次 review 请求 | 检查评审稿、来源和代码定位 |
| New Chat 与 Session 共用底部输入位置 | 用户本次布局反馈；FR-CHAT-001 / FR-SESSION-001 | 从原型 UI 发送首条消息、切换历史，比较底边和宽度 |
| 思考强度与模型在框内相邻，菜单不撑高输入框 | 用户反馈；FR-INPUT-002；input §3.6 | 选择档位、切换模型、默认复位、比较布局 |
| 覆盖 1024 / 1280 / 1440 与窄 View 列 | Shell Spec v02 §2.2 / §8 | 原型尺寸检查、附件换行与菜单截图 |
| 完成链接检查与语义复核 | AGENTS 文档同步与收尾规则 | 自动检查 + 负责文档 / 路线图 / 任务复核 |

这些标准针对设计交付；不代替 [AC-02](<../../../docs/05. Acceptance Criteria.md#ac-02-创建-codex-session>) 的真实 Codex 应用验收。

## 交付物

- [页面布局与输入体验评审 v01](../../../design/layout-ux-review-v01.md)：9 项发现、优先级、布局和状态定义。
- [原型 v05 与走查步骤](../../../design/prototypes/README.md#studio-灰度交互原型-v05)：继承 v04 外观，调整底部输入区、控件分组、附件行和弹层。
- [官方参考与截图](../../../design/references/README.md#3-2026-10-19-桌面布局参考)；[调研修正](research.md)。

## 验证记录

执行者：Main Agent（参与实现，属于自检，非独立功能验收）。基线：`d2a3f59` + 本任务 design / docs / task diff；macOS，agent-browser 操作本地静态 HTML 原型，模拟数据，不调用 CLI。界面步骤均通过可见控件完成；DOM / state 只用于读取测量，未注入业务状态。原型交付不涉及 Electron 应用修改，未开展 Electron 或真实 CLI 验收。

| 场景 / 操作 | 实际结果与证据 |
|---|---|
| 1280×800：New Chat → 发送 → Session | 无附件、单行文本时输入框均为 x=400、宽 720、高 88、底边 y=772；[新对话](evidence/W0-new-chat-1280.png)、[运行中](evidence/W0-running-1280.png) |
| 思考菜单 → 高 → 示例模型 B → 默认 | 输入框高度仍为 88；B 只提供默认 / 低 / 中，原“高”保留且提示目录未列出；主动选择默认后恢复。菜单位置见[截图](evidence/W0-effort-menu-1280.png) |
| 1024×640：Architecture → 模型 / 思考菜单 | View 列 367px 时，模型菜单 x≈350.4、宽 202；思考菜单 x=350、宽 202，均在列内，不覆盖发送按钮；[截图](evidence/W0-view-effort-1024.png) |
| 拖窄至 360px → Files → 逐个添加三个文件 | 与当前 View 标签组成三行；标签区高 90、工具行高 32；底部操作未换行，[最终截图](evidence/W0-attachments-360.png)。初检发现 84px 会裁掉第三行，已改为完整三行并复验 |
| Tab / Enter / Esc | 从输入框 Tab 到加号、模型、思考；Enter 展开、Tab 到选项并 Enter 选择；关闭后焦点回到思考按钮；Esc 关闭也恢复触发器焦点 |
| 1440×900：发送前后与 Stop | 输入框均为 x=480、宽 720、高 88、底边 y=872；[新对话](evidence/W0-new-chat-1440.png)、[运行中双入口](evidence/W0-running-1440.png)、[停止后](evidence/W0-stopped-1440.png) |
| 运行中补充输入 | 从 UI 连续发送“验证运行中补充一 / 二”；第二条在本次运行期间进入消息，后续模拟仍进入原任务的 pnpm test 确认节点。仅验证原型操作，不代表真实原生回合契约 |
| 浏览器异常 | 检查期间无 JavaScript 错误；浏览器后台页暂停 requestAnimationFrame 时先激活标签页再走查，未把后台未重绘认定为应用缺陷 |

已查看上表关键截图。旧 Session 选择、New Chat 及 View 的切换已走查；完整辅助技术、短于 640px 的窗口、真实目录 / 保存失败、图片上传与 Skill、恢复持久化、真实 CLI / Electron 均未覆盖，不影响本次设计草稿交付。

### 自动检查

- `pnpm check:docs`：通过，0 个新增问题；4 个已有基线问题未新增。首次发现的任务验证章节链接已补齐。
- 四个 v05 JavaScript 文件的 `node --check`、`git diff --check`：通过。
- 本轮仅设计原型与文档，无生产代码变更，不运行应用全量测试。

## 文档影响与收尾复核

- **已更新**：design 索引的审阅入口、原型索引的起始画面 / 步骤 / 模拟边界、参考索引的图片与证据边界。问题与布局以评审稿为唯一负责文档，调研记录引用它。
- **路线图**：逐节核对 §1 下一步、§1.1 人工事项、§2 整体概况、§3 模块、§4 阶段、§5 验收；§1 / §1.1 增加设计探索与采用审阅入口。其余维持实际生产基线，含 §3 的“新对话草稿居中”，因为本轮尚未修改应用；未把设计完成计入产品验收。
- **规格与上游**：核对 docs 01～05 的产品原则、相关 FR、运行中输入、AC-02 / Stop 专项、FR ↔ AC 映射；核对 Shell Spec v02 §2 / §6～8、input §3.1 / §3.6、chat §3.1、session 的输入与滚动规则。现有居中规则明确列为待修订基线；本轮不修改正式行为契约。未新增 FR / AC。
- **决定与历史任务**：核对 docs 07 的原生能力 / 发布 / 人工验收边界及关联对话 / 输入任务；没有新的人工采用确认，因此不新增“已确认”决定，不追改旧原型和历史验证。完整 diff 待人审阅。
- **未决问题**：产品采用事项由[UX-Q1](../../../design/layout-ux-review-v01.md#未决问题)负责；用户审阅方案是正式采用及应用实施前置，不是本次设计草稿任务关闭前置。
- **范围限制**：v05 继承旧原型其他模拟行为，例如附件仍按项目演示、New Chat 重建演示草稿；不等价于生产草稿隔离。完整状态定义中的异常接口留待正式实现。

## 当前状态

2026-10-20 Main Agent 完成设计交付、交互自检、链接 / 语法检查与最终 diff 复核，关闭并归档本任务。按 Task Protocol，本次设计草稿交付由 Main Agent 自检收尾；原型保持探索状态，不代表正式功能完成或人工验收。工作位于 `design/ux-layout-review` 独立 worktree，尚未提交或合入 main。
