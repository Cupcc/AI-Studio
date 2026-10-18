# 人工验收清单：T20261009-v1-foundation-slice

> 写入者：主 Agent。场景初稿日期：2026-10-09；人工体验结果更新：2026-10-18。路线图所列现有功能的人工体验已全部通过，范围、确认原文与基线统一记录在[总体验收](acceptance.md#人工功能验收)。下文保留历史场景模板供技术复核参考，不再作为待人体验清单；模板复选框不表示当前验收状态。AI 技术验证缺口仍按原证据跟踪，分工见 [Task Protocol](../README.md#lifecycle)。

## 1. 记录结果与签收

在对话中告诉主 Agent 结果即可，例如：

> 第 3～5 部分全部通过，M-S5 不通过：绿点没有出现。第 6 部分 M-R1～R3 通过，Claude 额度不足，R4～R7 未执行。

主 Agent 收到后：

1. 把结果写入本清单各项，不通过的项附上现象，并按需整理成修复任务。
2. 在[总体验收的人工功能验收](acceptance.md#人工功能验收)中记录接受的功能 / 阶段范围、版本或证据基线、未覆盖项及确认日期。人工接受部分交付不把未覆盖项变为通过，也不自动关闭子 task；各任务由 Main Agent 按 Lifecycle 核对完成条件后收尾。
3. 同步 [V1 建设计划与进度](<../../docs/06. Development Roadmap.md>) 的模块状态和下一步。

| 人工验收范围 | AI 验证依据与体验参考 | 接受交付时需明确 |
|---|---|---|
| 应用窗口与多 Project 工作区 | [窗口验证](../T20261009-app-skeleton/acceptance.md)、[Project 验证](../T20261009-project-shell/acceptance.md)；第 3～4 部分 | M-A1～M-A2、M-P1～M-P8 的证据与核心体验；View / 工具占位不算完整 AC-01 通过 |
| Session 对话、状态与恢复 | [Session 验证](../T20261009-session-slice/acceptance.md)；第 5～6 部分 | M-S1～M-S14 的证据与核心体验；仅接受模拟范围时须明确真实链路未验收 |
| 真实 CLI 集成 | [Adapter 验证](../T20261009-agent-adapter/acceptance.md)；第 6 部分 | M-R1～M-R7 的真实验证结果；缺口作为部分交付例外提交人决定 |
| 阶段 1 整体交付 | [总体验收](acceptance.md)及以上功能范围 | 完整范围所需验证通过并经人接受；不以子 task 逐项签收作为条件 |

## 怎么用

本清单保留详细场景供 AI 验证和人工体验参考。AI 先提供有效证据、未覆盖项与建议体验的核心流程；人无需重复全部技术测试或逐项签收内部任务。实际体验的步骤可以勾选，不符合时记录现象；未亲自执行的步骤不补记为人工通过。以下场景来自初稿，运行前由 AI 核对当前版本、设计及环境，历史“未覆盖”描述不能替代最新验收记录。

| 部分 | 内容 | 对应 task | 模型调用 | 预计用时 |
|---|---|---|---|---|
| [第 1 部分](#1-记录结果与签收) | 反馈结果与签收方式 | 全部 | — | — |
| [第 2 部分](#2-准备) | 准备测试目录与启动方式 | — | 无 | 5 分钟 |
| [第 3 部分](#3-应用窗口) | 窗口尺寸、窗口控制区、拖拽 | [app-skeleton](../T20261009-app-skeleton/task.md) | 无 | 5 分钟 |
| [第 4 部分](#4-project-与导航ac-01) | 多 Project、启动页、恢复、导航、注意力点 | [project-shell](../T20261009-project-shell/task.md) | 无 | 20 分钟 |
| [第 5 部分](#5-session模拟模式ac-02ac-05) | Session 全流程，使用模拟 CLI | [session-slice](../T20261009-session-slice/task.md) | 无 | 30 分钟 |
| [第 6 部分](#6-真实-cliac-02ac-05-补验) | 当前 V1 Codex 真实补验；Claude Code 暂缓 | [agent-adapter](../T20261009-agent-adapter/task.md)、session-slice | **有，约 8～10 轮** | 30 分钟 |
| [第 7 部分](#7-不在本次验收范围) | 不需要验收的内容 | — | — | — |

第 3～5 部分的现有功能人工体验已验收。第 6 部分仍是 AI 真实 Codex 技术补验参考；当前证据缺口见[总体验收](acceptance.md#未完成与签收)。同日后续已恢复实施；本清单未整体执行，Codex 原生引用与本轮 Diff 的新增证据见[工程工具验收](../T20261009-context-tools/acceptance.md#2026-10-18-本轮-diff-独立评审w23)。模型访问、额度、限流以及限流后的停止或错误由 CLI / 上游服务提供方决定，应用不设置调用次数、费用上限、自动重试或自动替换模型的护栏；用户主动选择模型仍按输入规格传给 CLI，用户主动点击 Stop 仍按产品定义验证，实际结果按 CLI 返回记录。

自动化已覆盖的项目在“已有自动化”中注明。人工验收看的是：亲眼看到的行为是否符合预期，以及界面上能否理解。

## 2. 准备

### 2.1 安装与构建

从仓库根运行（需要 Node >= 24、pnpm 12）：

```sh
pnpm install
pnpm --filter @ai-studio/agent-adapter run build
pnpm --filter @ai-studio/desktop run build
```

### 2.2 测试目录

测试目录放在仓库外，以免 CLI 读到本仓库的 `AGENTS.md`：

```sh
mkdir -p ~/studio-acceptance/{project-a,project-b,project-c,locked}
for d in project-a project-b project-c; do echo "# $d" > ~/studio-acceptance/$d/README.md; git -C ~/studio-acceptance/$d init -q; done
ln -s ~/studio-acceptance/project-a ~/studio-acceptance/link-a
chmod 000 ~/studio-acceptance/locked
```

验收结束后，可运行 `chmod 755 ~/studio-acceptance/locked && rm -rf ~/studio-acceptance` 清理。

### 2.3 两种启动方式

| 方式 | 命令（仓库根） | 用途 | 数据目录 |
|---|---|---|---|
| 模拟模式 | `STUDIO_E2E_PROVIDERS=1 pnpm --dir apps/desktop exec electron . --studio-user-data-dir="$HOME/studio-acceptance/sim-data"` | 第 3～5 部分 | `~/studio-acceptance/sim-data`，与日常数据隔离 |
| 真实模式 | `pnpm dev` | 第 6 部分 | `~/Library/Application Support/AI Developer Studio (Dev)` |

模拟模式下，Codex 和 Claude Code 都替换为模拟 CLI，不调用模型，模型列表只有 `E2E Codex` / `E2E Claude` 各一个。发送的消息里带下面的标记，就能触发对应场景：

| 消息中包含 | 模拟 CLI 的行为 |
|---|---|
| （无标记） | 运行一条模拟命令 `echo studio-e2e`，约 0.5 秒后完成 |
| `[e2e:delay]` | 约 1.8 秒后完成，用于制造后台完成 |
| `[e2e:slow]` | 一直保持 Running，直到点击 Stop |
| `[e2e:approval]` | 出现一张授权卡片（允许 / 拒绝） |
| `[e2e:multi]` | 同时出现两张授权卡片 |
| `[e2e:question]` | 出现一张提问卡片（选项“继续”，也可以输入文字） |
| `[e2e:secret]` | 提问卡片使用私密输入框 |
| `[e2e:error]` | 第一次发送这条消息时失败；用相同文字重试则成功 |

第 4、5 部分中提到“重启应用”时，都指用 `⌘Q` 退出后，再执行同一条模拟模式命令（数据目录不变）。

## 3. 应用窗口

#### M-A1 窗口尺寸与窗口控制区

来源：app-skeleton 验收标准 3；Shell Spec v01 第 2、3 节。已有自动化：`apps/desktop/e2e/app.spec.ts` 断言最小尺寸和按钮位置；系统窗口控制区没有截图证据（见 [app-skeleton 验收](../T20261009-app-skeleton/acceptance.md#3-窗口控制区)）。

1. 以模拟模式启动应用。
2. 拖动窗口右下角，尽量缩小窗口。
3. 拖动顶部 40px 高的区域（标签栏空白处）。

- [ ] 首次启动后显示窗口，红黄绿三个窗口按钮在左上角，不与标签或按钮重叠。
- [ ] 窗口无法缩小到 1024×640 以下。
- [ ] 拖动顶部空白区域可以移动窗口；点击顶部的按钮和标签不会拖动窗口。

#### M-A2 缩小时不自动收起区域

来源：project-shell 验收标准 9；Shell Spec v01 第 2.2、2.3 节。已有自动化：[布局记录](../T20261009-project-shell/acceptance.md#布局记录)中 1024 / 1280 / 1440 三种宽度的截图与测量。

1. 打开一个 Project，打开右侧边栏（顶栏“右侧边栏”按钮）。
2. 把窗口从较宽逐渐缩到最小宽度。

- [ ] 左侧导航、Conversation 区、右侧边栏都还在，只是变窄；不会自动折叠或关闭任何区域。
- [ ] 文字和按钮没有互相遮挡，也没有出现横向滚动条。

## 4. Project 与导航（AC-01）

以下均使用模拟模式。

#### M-P1 启动页

来源：FR-PROJ-001；D-09；PROJ-Q2（2026-10-09 确认）。

1. 首次启动后观察第一个标签。
2. 点击“打开本地目录”，选择 `~/studio-acceptance/project-a`。
3. 点击标签栏的 `+`（或 `⌘T`）。

- [ ] 首次启动显示“新标签页”，上面有“打开本地目录”和“最近打开”列表。
- [ ] 打开 project-a 后，这个标签变成 project-a。
- [ ] 点击 `+` 时出现新的“新标签页”，“最近打开”里有 project-a，并标记“已打开”。
- [ ] 已经有一个“新标签页”时再点 `+`，切换到现有的那个，不会再新建一个。

#### M-P2 同一目录不重复打开

来源：FR-PROJ-001；project spec 3.1.3。

1. 在“新标签页”中通过“打开本地目录”再选一次 project-a。
2. 再打开一个“新标签页”，选择 `~/studio-acceptance/link-a`（指向 project-a 的符号链接）。

- [ ] 两次都直接切换到已有的 project-a 标签，“新标签页”随之关闭；标签栏里只有一个 project-a。

#### M-P3 无法打开的目录

来源：FR-PROJ-001；project spec 3.1.3。

1. 在“新标签页”中选择 `~/studio-acceptance/locked`。
2. 先在“最近打开”列表中留下 project-c：打开 project-c 后关闭它的标签。然后在终端执行 `mv ~/studio-acceptance/project-c ~/studio-acceptance/project-c-moved`，再看“最近打开”。
3. 把目录改回原名：`mv ~/studio-acceptance/project-c-moved ~/studio-acceptance/project-c`。

- [ ] locked 显示“无法读取该目录，请检查访问权限。”，不会创建 Project 标签。
- [ ] 改名后，“最近打开”里的 project-c 显示“目录不存在”，点击它不会打开 Project；可以“从列表移除”。

#### M-P4 三个 Project 互不影响（AC-01 核心）

来源：AC-01；FR-PROJ-001～003；project-shell 验收标准 1、5。已有自动化：[W3-e2e.log](../T20261009-project-shell/evidence/W3-e2e.log) 三 Project 用例。

1. 同时打开 project-a、project-b、project-c 三个标签。
2. 在 project-a 中点击左侧 PROJECT VIEWS 的 Architecture，打开右侧边栏并拖宽一些。
3. 在 project-b 中点击 New Chat，在输入框写一段文字但不发送；打开右侧边栏，选择 Terminal。
4. project-c 保持不动。
5. 依次点击三个标签来回切换。

- [ ] 每个 Project 回到自己的状态：project-a 显示 Architecture（右侧为 Preview），宽度保持；project-b 显示草稿，输入框里的文字还在，右侧为 Terminal；project-c 是首次打开时的 Overview。
- [ ] 切换标签时，其他 Project 的状态没有跟着改变。
- [ ] Preview 和 Terminal 显示的是“…将在这里显示”占位文字。这在本阶段属于正常（见第 7 部分）。

#### M-P5 Session 与 Project View 的右侧状态分开保存

来源：PROJ-Q3（2026-10-09 确认）；project-shell 验收标准 5。

1. 在 project-a 的 Architecture 中，把右侧切到 Files。
2. 点击 New Chat 进入草稿，把右侧关闭。
3. 再点击 Overview。

- [ ] 从左侧导航进入 View 时，右侧显示 Preview。
- [ ] 草稿 / Session 中关闭右侧，不会把 View 的右侧也关掉，两种模式各自记住自己的开关和宽度。

#### M-P6 左侧导航与折叠

来源：FR-NAV-001、FR-NAV-002；D-14；navigation spec 3.2、3.4。

1. 观察左侧导航。
2. 点击“折叠导航”，切换到其他 Project，再重启应用。

- [ ] 从上到下依次是：New Chat；PROJECT VIEWS 下的 Overview、Progress、Architecture、Agent Team、Business Flow；SESSIONS。只有当前 View 高亮。
- [ ] 折叠后，顶栏保留“展开导航”和 New Chat 按钮。
- [ ] 折叠状态对所有 Project 生效，重启后保持。

#### M-P7 重启恢复

来源：FR-PROJ-003；PROJ-Q1（2026-10-09 确认）、PROJ-Q8。已有自动化：W3-e2e 真实重启用例。

1. 保持 M-P4 的三个标签，记下标签顺序（当前不支持拖动排序），停在 project-c。
2. 重启应用。

- [ ] 恢复三个标签和它们的顺序，当前标签仍是 project-c。
- [ ] 每个 Project 的 Main Canvas 内容和右侧边栏状态与重启前一致。
- [ ] 关闭 project-a 标签后，从“最近打开”重新打开，恢复关闭前的 View 与右侧状态。

#### M-P8 关闭最后一个 Project

来源：FR-PROJ-001；PROJ-Q2（2026-10-09 确认）。

1. 逐个关闭所有 Project 标签（标签上的关闭按钮，或 `⌘W`）。

- [ ] 关闭最后一个 Project 后显示“新标签页”，窗口不会关闭。

## 5. Session（模拟模式，AC-02～AC-05）

以下均使用模拟模式。打开 project-a 和 project-b。“A”“B”分别指 project-a 中的两个 Session。

#### M-S1 草稿与 Default CLI

来源：FR-CHAT-001、FR-CHAT-002；D-01、D-11；chat spec。

1. 在 project-a 中点击 New Chat。
2. 点击 New Chat 旁边的“选择 CLI”箭头。
3. 在菜单中对 Claude Code 点击“设为此 Project 默认”，再点一次 New Chat。
4. 在草稿中输入文字但不发送，然后点 Overview，再回到草稿。

- [ ] New Chat 打开“新对话”草稿，显示“开始新对话”说明；此时 SESSIONS 里还没有新条目。
- [ ] CLI 菜单列出 Codex CLI 和 Claude Code，当前默认的一项标着“默认”。
- [ ] 设为默认后，New Chat 打开的草稿使用 Claude Code（输入框提示“向 Claude Code 发送消息…”）。这个默认只对当前 Project 生效，project-b 不受影响。
- [ ] 离开后回到草稿，未发送的文字还在。
- 验收后把默认改回 Codex CLI，方便后续步骤。

#### M-S2 创建 Session（AC-02 模拟）

来源：AC-02；FR-CHAT-001、FR-SESSION-001、FR-STATE-001。已有自动化：完整 Electron 门禁 AC-02 用例。

1. 用 Codex 的草稿发送“第一条消息”。

- [ ] 一发送，SESSIONS 的“今天”分组下就出现这条 Session，带 `CX` 标识和转圈的 Running 标志。
- [ ] 对话区依次出现：用户消息、工具行 `Run echo studio-e2e`、回复文字“正在处理模拟请求…”。
- [ ] 完成后，Running 标志消失；最后显示“Worked for … · Done”。
- [ ] 正在查看的这条 Session 完成后，不出现绿点。
- [ ] Session 标题取自第一条消息的开头。

#### M-S3 CLI 锁定与 Model Selector

来源：FR-CHAT-003、FR-INPUT-002。

1. 在 M-S2 的 Session 里观察输入区。

- [ ] 已创建的 Session 不能再切换 CLI，只有 Model Selector 可选；模拟模式下显示“E2E Codex（默认）”。
- 真正切换模型要在真实模式下检查，见 M-R6。

#### M-S4 并发与切换不打断（AC-03 模拟）

来源：AC-03；FR-SESSION-003、FR-CHAT-003。已有自动化：AC-03 用例、[并行截图](../T20261009-session-slice/evidence/W6-parallel-session-stop.png)。

1. New Chat 用 Codex 发送“`[e2e:slow]` 并发 1”。
2. New Chat 用 Claude Code 发送“`[e2e:slow]` 并发 2”。
3. 在两条 Session 之间来回点击几次。
4. 在“并发 1”中点击 Stop。

- [ ] 两条 Session 同时显示 Running，分别带 `CX` 和 `CC` 标识。
- [ ] 来回切换不会让任何一条停下或报错。
- [ ] Running 时发送按钮变成 Stop。点击后，“并发 1”显示“已停止”的完成行，“并发 2”仍在 Running。
- [ ] 再把“并发 2”也停止。两条 Session 都可以继续发送新消息。

#### M-S5 后台完成提醒（AC-04 模拟）

来源：AC-04；FR-STATE-004、FR-STATE-005、FR-SESSION-001。已有自动化：AC-04 用例。

1. 先确认已有一条已完成的 Session，记为 B（例如 M-S2 那条）。
2. New Chat 发送“`[e2e:delay]` 后台完成”，记为 A。**发送后 1.5 秒内**点击 SESSIONS 中的 B。来不及就再发一次。
3. 等 2 秒，看 A 的条目。
4. 点击 A。

- [ ] 你停在 B 时，A 完成后出现绿点（Completed Unread）；页面不会自动跳到 A。
- [ ] 点击 A 后，直接显示对话底部的最新内容，没有从顶部滚下来的过程。
- [ ] 绿点随即消失。

#### M-S6 失焦和最小化不算查看

来源：FR-STATE-005；S-Q1（2026-10-09 确认）。已有自动化：[最小化](../T20261009-session-slice/evidence/W6-unread-minimize.png)、[隐藏](../T20261009-session-slice/evidence/W6-unread-hide.png)截图。

1. 在任意 Session 中发送“`[e2e:delay]` 最小化测试”，随即按 `⌘M` 最小化窗口。
2. 等 3 秒，从 Dock 恢复窗口。
3. 再点击一次该 Session（可以先点别的 Session 再点回来）。

- [ ] 恢复窗口后，这条 Session 仍显示绿点，不会因为窗口回到前台就消失。
- [ ] 重新点击这条 Session 后，绿点消失。

#### M-S7 Needs Input：授权卡片（AC-05 模拟）

来源：AC-05；FR-STATE-002；D-03。已有自动化：AC-05 用例、[审批截图](../T20261009-session-slice/evidence/W6-needs-input-approval.png)。

1. New Chat 发送“`[e2e:approval]` 授权测试”，随即点击另一条 Session。
2. 观察 SESSIONS 和 project-a 标签；再切到 project-b 标签，观察 project-a 标签。
3. 回到 project-a，点击“授权测试”；先只看，不操作；再点击别的 Session，然后点回来。
4. 在卡片上点击“允许”。

- [ ] “授权测试”的条目显示橙点（Needs Input），一眼就能看出它在等你。
- [ ] 站在 project-b 时，project-a 标签上有一个注意力点；当前标签上不显示。
- [ ] 打开 Session 后，直接看到“等待你的确认”卡片和“允许 / 拒绝”按钮，卡片下方提示“也可以在下方直接回复”。
- [ ] 只打开查看，橙点不会消失。
- [ ] 点击“允许”后，卡片显示“已选择：允许”，Session 回到 Running，随后完成并显示 Done。

#### M-S8 Needs Input：提问、输入框回复、多个请求

来源：FR-STATE-002；I-Q2（2026-10-09 确认）。已有自动化：[文字答复截图](../T20261009-session-slice/evidence/W6-needs-input-text-reply.png)、多审批 E2E。

1. 发送“`[e2e:question]` 提问测试”，不点卡片按钮，直接在输入框（提示“回复 Agent…”）输入“继续执行”并发送。
2. 发送“`[e2e:multi]` 两个请求”，先在第一张卡片上点“允许”。
3. 再在第二张卡片上点“拒绝”。
4. 发送“`[e2e:secret]` 私密测试”，在卡片的私密输入框里输入任意文字，点击“提交回答”；然后重启应用，再打开这条 Session。

- [ ] 提问卡片显示“等待你的回答”，有“继续”选项和“输入回答”框；从输入框回复后，卡片显示“已在输入框回复”，Session 继续执行。
- [ ] 两个请求可以分别答复：答完第一张后第二张仍在等待，橙点也还在；两张都答完后才继续执行。
- [ ] 私密回答在输入时显示为圆点，卡片下方提示“私密回答不会保存到对话记录。”；重启后显示“已答复（私密内容不保存）”，看不到原文。

#### M-S9 Error 与重试

来源：FR-STATE-003；D-04；S-Q2（2026-10-09 确认）。已有自动化：[Error 截图](../T20261009-session-slice/evidence/W6-error-details-retry.png)。

1. 发送“`[e2e:error]` 失败测试”。
2. 展开“查看详情”。
3. 点击“重试”。

- [ ] 出现错误卡片，标题是“模拟执行失败”，展开详情可以看到“这是一条模拟错误详情”。
- [ ] 点击“重试”后，重新发送失败那一轮的消息，这次成功并显示 Done；没有新建 Session。
- [ ] 应用没有崩溃，其他 Session 不受影响。
- 后台出错时的红点在模拟模式下很难赶上时机（约 0.4 秒就会失败），由自动化覆盖，本项不要求。

#### M-S10 打开位置与滚动

来源：FR-SESSION-001；Shell Spec 第 6 节。已有自动化：[滚动截图](../T20261009-session-slice/evidence/W6-conversation-scroll-paused.png)。

1. 在同一条 Session 中连续发送 8～10 条普通消息，让内容超过一屏。
2. 点到别的 Session，再点回来。
3. 向上滚动一段，然后发送“`[e2e:delay]` 滚动测试”。
4. 点击“回到最新 ↓”。

- [ ] 点回来时，直接停在最底部。
- [ ] 向上滚动后，新内容不会把视图拉回底部，并出现“回到最新 ↓”。
- [ ] 点击“回到最新 ↓”后，回到底部。

#### M-S11 Session History 排序、分组与 Rename

来源：FR-NAV-003；D-12；NAV-Q4（2026-10-09 确认）。

1. 记住 SESSIONS 的当前顺序。在列表中较靠下的一条 Session 里发送一条消息。
2. 让一条 Session 在后台完成（参照 M-S5），观察它的位置。
3. 对任意一条 Session 点击“⋯”→ Rename，输入新标题后按回车，然后重启应用。

- [ ] 按最近一次**你发送**消息的时间倒序排列：发送后，这条 Session 移到最上面；Agent 后台完成不会改变顺序。
- [ ] 按“今天 / 昨天 / 过去 7 天 / 更早”分组（本次只会出现“今天”）。
- [ ] 每条只显示一个状态标志，状态在条目右侧。
- [ ] Rename 立即生效，重启后保留。

#### M-S12 关闭 Project 与退出时的确认

来源：FR-PROJ-002、FR-INPUT-001；D-10；PROJ-Q6、PROJ-Q7。已有自动化：[关闭确认截图](../T20261009-session-slice/evidence/W6-close-counts-two.png)、[重开截图](../T20261009-session-slice/evidence/W6-project-reopen-running.png)。

1. 在 project-b 中发送“`[e2e:slow]` 关闭测试”，再用另一条 Session 发送“`[e2e:approval]` 关闭测试 2”，不答复。
2. 在 project-a 中也发送一条“`[e2e:slow]` 保持运行”。
3. 关闭 project-b 标签，先点“取消”。
4. 再关闭一次，点“关闭并停止”。
5. 从“最近打开”重新打开 project-b。
6. 关闭一个没有运行中 Session 的 Project 标签。
7. 在 project-a 仍在 Running 时按 `⌘Q`，先点“取消”，再按 `⌘Q` 点“停止并退出”。重新启动应用后，打开 project-a 的那条 Session。

- [ ] 关闭 project-b 时，确认框显示“关闭 project-b？”和“2 个对话仍在运行或等待你的输入。当前一轮将停止，对话记录会保留。”。
- [ ] 点“取消”后，标签和两条 Session 保持原样。
- [ ] 点“关闭并停止”后标签关闭；project-a 的“保持运行”仍是 Running。
- [ ] 重新打开 project-b，两条 Session 都在，当前一轮显示已停止，可以继续发送。
- [ ] 没有运行中或等待中的 Session 时，直接关闭，不弹确认框。
- [ ] 退出时的确认框标题是“退出 AI Developer Studio？”，点“取消”后不退出。重启后 Session 记录保留，当前一轮显示已停止。

#### M-S13 Project Tab 与折叠导航的注意力点

来源：FR-PROJ-002；D-07、D-14。已有自动化：[折叠点截图](../T20261009-session-slice/evidence/W6-attention-tab-fold.png)。

1. 在 project-a 中同时制造一条 Needs Input（`[e2e:approval]`）和一条 Completed Unread（参照 M-S5）。
2. 切到 project-b，看 project-a 标签。
3. 回到 project-a，折叠左侧导航。
4. 另在 project-b 发送“`[e2e:slow]`”后切到 project-a，看 project-b 标签。

- [ ] project-a 标签只显示一个点，颜色为 Needs Input（优先级 Needs Input > Error > Completed Unread）。
- [ ] 只有 Running 时，标签不显示点。
- [ ] 折叠后，展开按钮旁显示当前 Project 的注意力点。
- [ ] 以上状态变化都不会自动切换标签、View、Session 或右侧工具。

#### M-S14 重启后的 Session 数据

来源：FR-SESSION-002；session spec 3.1、3.14。已有自动化：重启 E2E；2,000 条摘要的重开测试。

1. 留一条未查看的 Completed Unread，然后重启应用。

- [ ] 重启后 Session 列表、标题、对话内容、“Worked for … · Done / 已停止”完成行都还在。
- [ ] 未查看的绿点仍在，点击后消失。
- [ ] 在旧 Session 里继续发送，可以正常完成。

## 6. 真实 CLI（AC-02～AC-05 补验）

本部分会调用真实模型，是本轮唯一没覆盖的验收内容。当前 V1 只执行 Codex；Claude Code 的实现、模拟验证和历史真实证据保留，但真实步骤暂缓。若 Codex 因额度或限流返回停止 / 错误，记录为 CLI 实际结果和未覆盖项，不由应用主动制造或改变该结果。需要事先知道：

- Codex 本机为 `0.162.0`，但协议按 `0.161.0` 锁定，当前版本的兼容性没有验证过。本部分本身就是在验证兼容性，遇到失败要如实记录。
- Claude Code 之前因额度不足（`rate_limit / quota_exceeded`）没有跑通；按 DEC-16 本轮不再发起真实调用，CLI 显示已登录也不代表还有额度。
- 先在终端运行 `codex --version`，确认 Codex 已登录。Claude Code 只保留可用性记录，不在本轮发起调用。用 `pnpm dev` 启动应用，打开 project-a。
- 出现 Needs Input 的条件取决于本机 CLI 的权限配置；没有触发时记为“未触发”，不算失败。

#### M-R1 创建 Codex Session（AC-02）

1. New Chat 选 Codex CLI，发送“阅读 README.md，用三句话说明这个目录是做什么的”。

- [ ] 发送后左侧立刻出现 Session 并显示 Running，不会等 Codex 先输出。
- [ ] 回复是流式逐步出现，不是最后一次性出现；内容没有重复。
- [ ] 完成后显示“Worked for … · Done”。

#### M-R2 Codex 多 Session 并发（AC-03；Claude Code 暂缓）

1. New Chat 用 Codex 发送“写一篇约 800 字的文章，介绍本地优先软件的优缺点”。
2. 马上 New Chat 再用 Codex 发送同样的内容。
3. 在两条 Codex Session 之间切换几次；Claude Code 并发留待后续独立验收。

- [ ] 两条 Codex Session 同时显示 Running，并且都在输出。
- [ ] 来回切换不会打断任何一条，最后两条都完成；Claude Code 并发不在本轮结论内。

#### M-R3 后台完成（AC-04）

1. 复用 M-R2：在其中一条完成之前停在另一条上。

- [ ] 后台那条完成后出现绿点；点击后直接显示最新内容，绿点消失。

#### M-R4 Needs Input（AC-05）

1. New Chat 用 Codex 发送“在当前目录创建 hello.txt，内容为 hello”，随即切到另一条 Codex Session。
2. 再用 Codex 发送“运行 `ls -la ~` 并告诉我结果”，随即切换；Claude Code Needs Input 留待后续独立验收。
3. 对出现的授权卡片，先点“拒绝”，再用一条新请求测试“允许”。

- [ ] Session 条目显示橙点；点击后能看到 CLI 想执行的操作（展开“工具参数”可以看到细节）。
- [ ] 答复后继续执行；拒绝时，CLI 收到拒绝并给出相应回复。
- 记录 Codex 是否出现授权请求：Codex ___；Claude Code 本轮不调用。

#### M-R5 Stop

来源：FR-INPUT-001；04 第 5 节。

1. 用 Codex 发送“运行 `sleep 60`，结束后告诉我”。命令开始执行后（工具行在转圈）点击 Stop。
2. 在同一 Session 发送“刚才的命令结束了吗？”。
3. Claude Code 重复步骤留待后续真实验收。

- [ ] 点击 Stop 后几秒内显示“已停止”，不显示 Error。
- [ ] 停止后同一 Session 可以继续对话，Agent 记得之前的上下文。
- [ ] 停止一条 Session 时，同时在运行的另一条不受影响（可以与 M-R2 一起做）。
- 可选：在终端运行 `pgrep -fl "sleep 60"`，确认已经没有对应进程。

#### M-R6 切换模型

来源：FR-INPUT-002。

1. 在一条已完成的 Session 中，从 Model Selector 选择另一个模型，发送“你现在是哪个模型？”。

- [ ] Codex 下拉列表里有真实模型；新一轮使用新选择的模型（可以从回复内容或 CLI 用量中判断）。Claude Code 模型切换留待后续真实验收。

#### M-R7 重启后恢复上下文

来源：FR-SESSION-002；Adapter 验收标准 1。

1. 退出应用，再执行 `pnpm dev`。
2. 打开 M-R1 的 Session，发送“我第一条消息让你做了什么？”。

- [ ] Agent 能答出之前的请求，说明恢复的是同一个原生会话，不是新建的空会话。

## 7. 不在本次验收范围

以下内容本阶段只有占位或尚未实现，请不要当作缺陷记录：

- Project View 内容（Overview / Progress / Architecture / Agent Team / Business Flow 的 Preview）、Project Knowledge、AC-06。
- Files / Diff / Browser / Terminal 的工具内容，以及从 Files 添加上下文、AC-07。
- 打包后应用的完整功能、签名与公证、Windows / Linux。
- 视觉样式：当前是中性的临时 Token，尚未完成设计确认。
