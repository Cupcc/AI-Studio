# 无限画布独立验收

## 边界与待完成事项

- 本轮只验收无限画布与选品模板升级；Provider/Codex 链路未改变，不新增真实模型请求，不重跑原功能验收。
- 本轮已完成代码、网页 fixture 与实际 Electron 交互复核；人工产品验收仍待用户确认。
- 人工产品验收待进行。

## 基线与结论

- Review Agent 未参与实现，只写本文件及 `evidence/W2-*`。
- 代码基线为 `6dc9c4ceb5017ef967ae235bb444b523fb77815c` 上 `feat/selection-canvas` 工作树改动；最终 Electron 验收读取的选品包内容修订为 `625aab1d6841a91c78caa29f3abef96d3d1efbf13dac78a47fc7660a90ec8ff3`，包含固定浅色、去点阵与指针修复。
- 最终结论：本任务范围通过独立代码、网页探针、Electron 交互和针对性回归；未覆盖项与人工状态见文末。
- 独立网页探针使用实际 `selection.js`、`canvas.js`、`canvas-model.js`，在 Chromium 中以合成 SDK 状态运行；不冒充 Electron/真实 Provider 验收。

## 发现及复验

| 编号 | 影响与位置 | 复现及证据 | 状态 |
|---|---|---|---|
| C1 | P2：点击连线成功后提示相反信息；`canvas.js` 的 input pointerDown / click 双重处理 | 点 market 输出，再按住 competition 输入约150ms后释放；依赖已保存，但提示先选输出。[初次探针](evidence/W2-canvas-probe-initial.json) | 提交连接改为完整 click；[复验](evidence/W2-canvas-probe-fixed.json)依赖与成功提示一致 |
| C2 | P2：空闲轮询误当执行锁；`selection.js` 传入 canvas locked 的 busy 条件 | SDK listAgents 延迟2秒且返回空数组；端点可见 enabled，点击却提示执行中不能修改。[初次探针](evidence/W2-polling-probe-initial.json) | 改为区分只读 polling 与业务执行；[复验](evidence/W2-polling-probe-fixed.json) |
| C3 | P2：结果回写期间取消拖拽未恢复持久布局；`selection.js:30` 与 `canvas.js:111` | 拖动运行节点并保持鼠标按下，合成结果完成触发业务保存，然后 Escape。视觉恢复原位，保存仍是中间拖拽位置。[复现](evidence/W2-cancel-save-initial.json) | `canvas.layout()` 在未结束手势期间返回 origin；[修复复验](evidence/W2-cancel-save-fixed.json)中视觉/持久世界位置一致，取消拖拽不再保存中间位置 |

## 已检查

- 最终原型卡片样式下，缩放约60.9%时节点屏幕移动60×30对应世界位移约98.49×49.25，误差小于1px；分组 Alt+右键移动10世界单位，节点位置归属分组。见[最终画布探针](evidence/W2-canvas-probe-final.json)。
- 连线业务校验复用 DAG 与设计唯一来源规则，布局未加入业务指纹。
- 模板升级保持原实例标识，并从最新版模板创建独立预览草稿；应用逻辑仍保留实例最新业务状态。独立运行5个直接测试文件共42项通过；实际入口待复验。

## 定向命令

在 worktree 根目录运行：

```sh
node tasks/T20261111-selection-canvas/evidence/W2-canvas-probe.mjs
node tasks/T20261111-selection-canvas/evidence/W2-polling-probe.mjs
node tasks/T20261111-selection-canvas/evidence/W2-cancel-save-probe.mjs
pnpm --filter @ai-studio/desktop exec vitest run src/main/services/workbench/selection-model.test.ts src/main/services/workbench/workbench-service.test.ts src/main/services/workbench/package-runtime.test.ts src/main/services/workbench/ipc.test.ts src/renderer/src/features/workbench/workbench.test.tsx
```

## 续接独立复核（2026-11-11）

评审者 `/root/canvas_review` 未参与实现，范围为 `6dc9c4c` 上本任务未提交 diff、调用该 diff 的标准网页宿主与 IPC。此阶段完成时 Electron 交互尚待交接，最终结果见下节；本节定向探针运行于 macOS 的无头 Chromium，以合成 SDK 状态检查实际网页包，不调用真实 Provider。

- **C4（P1，已修复并通过 UI 复验）**：新增“预设工作台”按钮直接显示 `product-selection` App 虚拟实例，但 Renderer 的状态保存和 Agent 操作仍要求自定义实例。触发路径为“添加工作台 → 添加 选品工作台”；页面可打开，保存任务/布局与执行均被拒绝。初始代码位置为 `WorkbenchNavigation.tsx:116`，直接受影响处为 `WorkbenchPage.tsx:47–57`、`schema.ts:87–102` 与 `PackageRuntime.package`。实际 Schema 探针显示该 ID 可导航、`isCustomWorkbenchId` 为 false，两种操作解析均抛“此操作只适用于自定义工作台”。见[初始证据](evidence/W2-optional-preset-initial.json)与[探针](evidence/W2-optional-preset-probe.mjs)。Main 已修复为分类在预设区域但继续从标准草稿创建可写实例；最终实际 UI 从新入口创建并保存草稿通过，见下节。
- [画布复跑](evidence/W2-canvas-resumed.json)：缩放比例 0.609185，节点屏幕移动 60×30 对应世界位移约 98.49×49.22；分组键盘移动 10 世界单位；连线与成功提示一致；页面错误为空。
- [轮询复跑](evidence/W2-polling-resumed.json)：空闲 `listAgents` 延迟期间端点仍可用并成功保存依赖；无错误。
- [取消保存复跑](evidence/W2-cancel-save-resumed.json)：结果完成触发保存时仍在拖拽，Escape 后世界位置与持久位置均为 `(56,126)`；未保存中途拖拽位置。
- 代码核对：布局不进入业务指纹；业务与布局串行保存，布局任务在提交时读取最新业务状态；画布连线与详情编辑共同使用 DAG / 设计唯一来源校验；模板升级复制最新包到独立草稿，应用只更新原实例包引用并保留原实例最新业务状态。当前未发现此范围内其他阻塞缺陷。

- [定向测试日志](evidence/W2-model-upgrade-tests.log)：实际 Vitest 执行布局独立、指针缩放/适应、画布依赖校验与升级保留状态四项，4 passed，20 项按名称跳过；未把跳过项记为通过。
- [旧包升级探针](evidence/W2-upgrade-result.json)调用实际 `PackageRuntime` 与真实 SQLite：从带旧页面标记的 1.0.0 实例创建 1.1.0 预览，确认预览使用新模板文件、应用前原实例仍是 1.0.0；预览期间修改原实例任务与结果后应用，实例 ID 与最新状态均保留，状态版本仍为 2。探针为 [W2-upgrade-probe.mjs](evidence/W2-upgrade-probe.mjs)，临时数据在运行后清理。

- [指针与外观复验](evidence/W2-canvas-pointer-result.json)：对 Main 本轮修复后的实际网页包，双击节点与展开按钮均打开对应详情；合成 interrupted 执行显示“已停止”；宿主 `appearance.dark=true` fixture 下画布为 `rgb(242,245,241)`、卡片白色、`color-scheme: light`，与参考原型的固定浅色方向一致；页面错误为空。此为无头网页探针；实际 Electron 深色入口复验见文末。可重跑 [W2-canvas-pointer-probe.mjs](evidence/W2-canvas-pointer-probe.mjs)。

## 最终 Electron 交互复验（2026-11-11）

- **环境与独立性**：Review Agent 未参与产品实现；使用 Main 交接的 Electron 开发窗口（CDP 9338）、隔离 fixture `Canvas Project`、模拟 Provider，不发送真实模型请求。fixture 元数据与旧实例版本见 `.runtime/canvas/ui-fixture.json`；测试期间未应用真实 Agent 执行。
- **升级保留**：从首个旧 1.0.0 选品实例的用户入口点击“预览新版选品画布”，加载新版浅色画布；预览后点击“应用更改”。应用后原实例仍在原工作台路由，已有任务目标“合成界面验收：小尺寸桌面收纳用品，零售价100–200元。”及合成市场结果可见。证据：[旧实例](evidence/W2-electron-old-instance.png)、[升级预览](evidence/W2-electron-upgrade-preview.png)、[应用后结果](evidence/W2-electron-upgraded-result.png)。
- **画布与保存**：实际拖动分组和节点后，连接市场与趋势→竞品与价格，再选中连线并删除；提示分别为依赖保存、依赖删除，布局状态为“布局已保存”。点击放大、键盘 ArrowRight 平移，切换到 Overview 再返回，节点与分组位置、视口缩放／平移均恢复。证据：[编辑后](evidence/W2-electron-layout-edited.png)、[恢复后](evidence/W2-electron-restored-overview.png)。
- **业务校验**：实际尝试建立反向循环，页面提示“节点依赖存在循环”并拒绝；未产生非法依赖。
- **预设入口与草稿状态**：从“添加工作台 → 预设工作台 → 添加 选品工作台”进入标准草稿预览，而非只读虚拟实例；任务目标可编辑并保存，提示“任务要求已保存”，运行按钮在草稿中保持禁用。证据：[预设菜单](evidence/W2-electron-preset-menu.png)、[预设草稿](evidence/W2-electron-preset-draft.png)。
- **外观与布局**：宿主处于深色模式时，iframe 内仍使用参考原型浅灰绿底（`#f2f5f1`）与白色卡片，最终 CSS 计算的 `background-image` 为 `none`，无背景点阵。最终画布截图见[最终画布](evidence/W2-electron-final-canvas.png)。
- **最终 AI 结论**：本任务范围（无限画布交互、布局持久化、依赖编辑、旧实例升级、非默认预设入口）通过独立代码、网页探针、Electron 交互和针对性回归。未覆盖真实 Codex 请求、打包应用、完整原功能验收；这些属于既有选品任务或后续复验范围。
- **人工状态**：用户于 2026-11-11 反馈需直接采用原型配色并去掉背景斑点；修正版已完成 AI 复验，人工产品验收仍待用户确认，不能标为人工通过。

- **同步与工具边界**：已审阅 `workbench.spec.ts` 在“添加至当前项目”后等待“工作台实例”再点击计数按钮的修改，符合页面切换的用户可见边界且保留计数断言。实际滚轮平移已通过；`agent-browser keydown Control` + `mouse wheel` 未向 wheel 传播组合键，不能据此判定产品缩放失败，Ctrl+滚轮由 Main 以 Playwright 原生输入补验后单独记录。自动排布已点击并确认回到全图；100%按钮仍由 Main 补验。
