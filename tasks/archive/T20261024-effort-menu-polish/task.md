---
id: T20261024-effort-menu-polish
status: done
fr: [FR-INPUT-001, FR-INPUT-002]
ac: [AC-02, AC-05]
specs: [specs/input/spec.md]
created: 2026-10-24
---

# 思考菜单与 Max 视觉修正

## 依据与范围

用户 2026-10-24 要求：effort 不要第一行默认；选中不突出、保持对齐、只打勾；思考图标放到模型左侧；重设计与现有 UI 不搭的 Max 配色。承接 [原任务](../T20261023-v06-ui-effort/task.md) 的后续局部修正，基线 `dc2d9dc`，主 checkout 未提交 diff。不改变 Adapter、持久化或真实调用契约；不是完整功能重新验收。

负责规则见 [input §3](../../../specs/input/spec.md#思考强度信号与动效)。AI 视觉方案：Max 改为低饱和蓝靛五格与同色单次边界反馈，保留 Ultra 主题渐变；字体、背景和间距沿用现有 Token。保留默认复位能力，但移到列表底部单独辅助操作，不作为档位第一项。

## 验证场景

| 来源 | 操作与预期 | 方法 |
|---|---|---|
| 本次指令、FR-INPUT-002 | 打开菜单，第一项为原生档位，不出现默认档位行 | 单元、Electron、agent-browser |
| 本次指令、AC-02 / 05 输入专项 | 切换 max / high，信号、文字、勾选列位置一致；选中只增加勾选，不增加底色或字重；保留键盘焦点 | Electron 几何检查、实际界面截图 |
| 本次指令、FR-INPUT-001 | 思考控件位于模型左边，窄列与两主题保持布局 | Electron alignment、agent-browser |
| 本次指令、input 动效边界 | Max 浅深配色与一次反馈；Ultra 不回归；默认复位、未知值、草稿与减少动态效果不回归 | 单元、Composer / settings Electron |

## 执行与验证

- 主 Agent 实现及自检；小范围 UI 缺陷按 Task Protocol 不强制独立验收。
- 最终类型检查、构建通过；Session 专项 26 / 26；Composer / alignment / settings Electron 21 / 21，通过四外观选中前后列坐标 / 宽度 / 字重 / 背景一致、默认复位、键盘、减少动态效果与 Ultra 主题渐变。完整 `pnpm check:code` 最终通过：脚本 36 / 36、Adapter 257 / 257、桌面 1179 / 1179。
- 完整检查首次出现未改动的 `git-runner.test.ts` 并发峰值断言失败（c 为 1，预期 2）。其按 5ms 间隔取样；单独复跑 16 / 16、随后完整检查通过。本任务不修改该模块，也不宣称已根治其时序不稳定。
- UI 自检使用隔离 userData 与模拟 Provider。通过 `openPath` 仅准备最近项目 fixture，再从“最近打开”入口点击进入；后续被验收选择均通过界面操作，不发送真实模型请求。
- agent-browser 实际点击 Max / High，切设置深色，键盘 End / ArrowUp / Enter 选 Ultra，再恢复 CLI 默认；草稿与 View 附件保留。主 Agent 已查看[浅色 Max](evidence/W1-max-light.png)、[深色 Max](evidence/W1-max-dark.png)、[深色 High](evidence/W1-high-dark.png)：只有勾选位置变化、三列对齐、思考位于模型左侧、Max 蓝靛适配深浅模式。测试应用已关闭，用户数据未使用。
- 无阻塞产品问题；人工状态：需调整后的本次修正待复验，不把技术自检视为人工接受。
- 2026-10-24 主 Agent 按局部修正范围自检收尾；未提交、未打包、未发布，不增加真实 CLI 兼容性结论。

## 文档影响复核

已按默认项 / 默认复位、勾选 / 对齐、控件顺序、Max 金橙 / 蓝靛等同义表述核对 input、Shell、DEC-23、AC 输入专项、设计索引与采用记录、原 v06 任务；input 负责具体行为，其他文档链接。路线图的下一步、整体概况、Conversation / Input / Project View 模块、阶段计划和 AC-02 / 05 / 06 进度均区分原 W7 基线与本次局部自检。核对 UX、FR、chat / session、Adapter 后，原生契约与上层行为不变，不制造无关修改。原型、W7 截图 / 验收、旧真实 CLI 与包证据保持历史基线。文档链接检查新增问题为 0；旧 4 项基线问题未增加。最终 diff 已复核，人工审阅与产品复验仍待进行。

## 2026-10-26 主线整理复核

按用户提交与线性整合指令及随后「未完成的大改动先保留，不并入 main」的纠正，本次仅把已完成的菜单 / Max 局部修正和对应规格、证据整理到 main。CLI 管理、Claude 适配与工具对齐保留在各自分支，不把提交或 rebase 记成任务完成。

复核最终主线 diff：Composer 仅调整思考控件顺序与菜单，保留原有 Codex 范围；CSS / Token / Composer E2E 与本任务既有修正一致。核对 input、Shell、DEC-23、AC 输入专项、设计采用记录与索引、原 v06 任务，以及路线图的下一步、整体概况、Conversation / Input / Project View、阶段计划和 AC-02 / 05 / 06；主线不包含未完成 CLI 管理或 Claude 的规格与实现。历史证据和人工待复验状态保持原样。分离后主线 `pnpm check:code` 通过（脚本 36、Adapter 257、桌面 1178），文档检查无新增断链；远端完整 CI 在推送后核对。

同版本的一次额外重复检查未通过：桌面 4 项计时 / 进程相关测试超时，另有 4 项 worker 启动错误，报告总耗时约 1031 秒。此前分离后全量通过的结果保留，不将这次失败抹去；本轮不修改无关测试，提交版本的完整 E2E / 打包由远端 CI 另行核对。
