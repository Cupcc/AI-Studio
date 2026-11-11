# 选品工作台独立验收

## 未覆盖与边界

- 人工产品验收：待进行。技术结论不表示人工接受。
- 本期交付真实 Codex 文本/结构化结果和设计说明；图片文件绑定/预览、外部市场数据真实性、商品商业效果不在通过结论内。
- 本次为开发构建验收，未做打包发布验收；原生下载位置选择器未独立操作。HTML 下载的磁盘结果由 Main 的 Electron 用例覆盖。
- 真实执行使用合成任务资料。Main 完成 10 节点真实运行与真实 Stop；Review 独立核对真实保存结果、截图与实际页面，并执行编辑/比较/恢复，没有额外发起付费模型请求。审批和失败/重试边界采用模拟 Provider/定向探针，不称为真实审批通过。

## 基线与结论

- 评审者：`review_selection`，未参与产品代码实现；只修改本验收文件和 `evidence/W2-*`。
- 基线：`b4fe0b9d23efe214cbe8596dd53344802ce6835f` 上 `feat/product-selection` 工作树改动，文件内容摘要见[最终基线](evidence/W2-final-baseline.json)。Main 后续提交/集成对应此交付内容。
- 平台：macOS；实际 Electron 开发构建；独立核实本机 `codex --version` 为 `codex-cli 0.167.1`。可用性及真实调用场景见[开发自检](task.md#开发自检)。
- 结论：**技术验收通过**。发现的阻塞缺陷均已交回修复并独立复验；没有未解决的阻塞发现。关闭日期：2026-11-11。

## 独立执行范围

| 场景 | 操作与结果 | 证据 |
|---|---|---|
| 真实结果与候选比较 | 在隔离 Project `/tmp/ai-studio-selection-live/project` 从实际页面点击“比较入选”，显示已入选 A/B 的人群、材料、价格、依据与风险；B 的材质修改保留 | [Electron 比较截图](evidence/W2-electron-comparison.png) |
| 新增及节点要求编辑 | 用 agent-browser 从可见入口新建“独立验收来源”，输入并保存节点要求；显示已保存且没有启动生成 | [Electron 编辑截图](evidence/W2-electron-edited.png) |
| 离开与恢复 | 导航至 Architecture，再打开选品工作台，滚动并重新打开新增节点；名称和保存要求完整恢复，既有真实成果仍在 | [Electron 恢复截图](evidence/W2-electron-restored.png) |
| UI 反馈与布局 | 查看浅色比较与深色详情截图，控件和文字可读，侧栏可关闭，未见核心操作裁切 | 同上截图 |
| 失败重试、依赖与焦点 | 实际网页模块在同 sandbox 配置的 Chromium fixture 下运行；覆盖失败→重试完成回写、非法依赖拒绝保存、候选勾选、新增与轮询焦点 | [最终页面探针](evidence/W2-page-probe-final.json)、[重试复验](evidence/W2-retry-probe-fixed.json) |
| 通用宿主边界 | 独立运行实际 WorkbenchService/SessionService/SQLite，验证背景执行保留 Composer 草稿；独立重跑 Agent、模型、IPC、页面桥四个测试文件，最终 18 项通过 | [独立宿主测试](evidence/W2-host.test.ts)，下方命令 |

Electron 交互使用 agent-browser。此会话的跨 origin iframe AX ref 查询持续报 Frame not found，主窗 ref 可用；已运行 doctor，改用同一工具的实际截图、鼠标和键盘完成 iframe 内操作，没有调用内部业务 API、注入状态或修改产品代码。截图均已由 Review 查看。页面 headless 探针使用合成 SDK fixture，与实际 Electron 证据明确分开。

## 已复现发现与复验

| 编号 | 影响 | 触发、原因与证据 | 当前结果 |
|---|---|---|---|
| R1 | P1：节点新增与修改材质不能工作 | 初版调用 `window.prompt`，而实际 iframe sandbox 未声明 allow-modals；已交回改为页内 dialog。 | 已改为页内点击/Enter 对话框；实际 sandbox 页面新增节点 10→11，通过[最终页面探针](evidence/W2-page-probe-final.json)。中间 form submit 也受 sandbox 拦截，已改按钮处理，未增加权限 |
| R2 | P1：节点详情关闭与候选勾选失效 | `render()` 绑定所有 `[data-node]`，误将保存节点缓存的详情 aside 也绑定 openNode；按钮冒泡后详情被重建。实际点击 A 后 unchecked、点击关闭后 hidden=false。[初始证据](evidence/W2-page-probe-initial.json) | 修复后 A checked=true、关闭后 hidden=true；候选 B 未锁死。[复验](evidence/W2-page-probe-fixed.json) |
| R3 | P1：后台节点执行清空用户未发送草稿 | 创建节点 Session 继承普通 `SessionService.create` 的消费草稿行为。同工作台 new_chat text 从用户文本变为空字符串。实际宿主测试 [W2-host.test.ts](evidence/W2-host.test.ts) 初次失败。 | 内部 create 增加 preserveDraft 后独立测试通过；普通发送行为由主 Agent 相关回归覆盖 |
| R4 | P2：普通会话重试成功不回写节点 | 失败时 `accepted.add(requestId)`，重试同 Session 后 listAgents 更新状态，但 getAgent 永久跳过；独立探针 failed→running→completed，读取次数始终1、保存结果为空。[证据](evidence/W2-retry-probe-initial.json) | 已按会话更新时间、活动与结果刷新，并仅读最新回合；[复验](evidence/W2-retry-probe-fixed.json)读取次数1→3、保存“重试成功结果”、节点已完成 |
| R5 | P2：空闲轮询丢失节点键盘焦点 | 每次 poll 全量替换 canvas DOM；focusBefore=true、focusAfter=false。[复现](evidence/W2-page-probe-expanded.json) | 无内容变化不重建画布；[复验](evidence/W2-page-probe-dialog-fixed.json)焦点保持 |
| R6 | P1：多个候选集合读错来源 | 第二个方案节点完成后覆盖全局候选，设计虽连默认来源却读了第二集合。[复现](evidence/W2-candidate-source-initial.json) | 改为节点内集合；[来源探针](evidence/W2-candidate-source-fixed.json)证明默认连接读取原集合，改连接后读取第二集合 |
| R7 | P2：修改已有设计依赖可能导致渲染失败 | R6 修复后的设计来源函数拒绝零或多个来源，但编辑保存初期只验证 DAG。直接模型探针记录异常。 | 保存前验证唯一候选来源；[实际页面复验](evidence/W2-page-probe-final.json)拒绝非法修改、重开保留原来源，未出现页面错误 |

最终独立重跑宿主/模型/IPC/页面桥 4 个测试文件，18 项通过；独立的 Composer 草稿保留测试另行通过。

## 独立验证命令

从任务 worktree 根目录执行：

```sh
pnpm exec vitest run --config .agents/archive/tasks/T20261111-product-selection/evidence/W2-review.config.mts
node .agents/archive/tasks/T20261111-product-selection/evidence/W2-page-probe.mjs
node .agents/archive/tasks/T20261111-product-selection/evidence/W2-retry-probe.mjs
pnpm --filter @ai-studio/desktop exec vitest run src/main/services/workbench/agents.test.ts src/main/services/workbench/selection-model.test.ts src/main/services/workbench/ipc.test.ts src/renderer/src/features/workbench/page-bridge.test.ts
```

探针与配置只位于获分配的 evidence 范围，没有修改产品代码或已有测试。Session 草稿保留测试直接调用本次通用 Agent API，检查用户可观察的已保存草稿。
