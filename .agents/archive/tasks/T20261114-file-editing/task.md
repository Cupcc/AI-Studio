---
id: T20261114-file-editing
status: done
next: none
waiting:
paths: ["apps/desktop/src/shared/tools/files.ts", "apps/desktop/src/shared/ipc/files.ts", "apps/desktop/src/shared/project/**", "apps/desktop/src/main/services/files/**", "apps/desktop/src/main/ipc/files.ts", "apps/desktop/src/main/ipc/index.ts", "apps/desktop/src/main/services/project/**", "apps/desktop/src/main/index.ts", "apps/desktop/src/renderer/src/features/tools/files/**", "apps/desktop/src/renderer/src/features/tools/code/**", "apps/desktop/src/renderer/src/app/ConfirmDialog.tsx", "apps/desktop/src/renderer/src/features/project/store.ts", "apps/desktop/e2e/files.spec.ts", "specs/tools/spec.md", "docs/02. Functional Requirements.md", "docs/07. Decisions.md", "apps/desktop/README.md"]
evidence: desktop unit tests; vm-ci e2e files.spec; vm-ui 编辑保存、冲突、预览记忆与关闭确认截图
risk: review
fr: [FR-TOOL-001]
ac: [AC-07]
specs: [specs/tools/spec.md]
created: 2026-11-14
---

# Files 编辑与预览记忆

## 收尾（2026-11-14）

- 复核：Main Agent 实现与自检。写入涉及 Project 边界与符号链接，按 [Task Protocol](../../../../tasks/README.md#验收范围与独立性) 由未参与实现的 Review Agent 独立评审，记录见 [acceptance.md](acceptance.md)：首轮 1 个阻断项（B1，保存后下一次输入延迟上报），`55cd6b2` 修复后同一评审者复验通过；14 个非阻断项列为后续项。
- 自动化：桌面类型检查；`main/services/files`（新增 `write.test.ts`、`preferences.test.ts`）、IPC、Project 关闭 / 退出流程、`features/tools/files`、`features/tools/code`、`features/project`、`app` 相关单测；rebase 到 dev `b8efd76` 后重跑类型检查与相关 38 个文件 565 项单测通过。E2E `files.spec.ts` 新增 TOOLS-Q13 场景（Monaco 输入、⌘S 保留 CRLF、外部写入冲突与比较 / 覆盖、关闭 Tab 不保存、退出时保存并退出、重启后 Markdown 预览记忆），VM CI e2e `1794624543353`（`04cc066`）通过；集成前 affected 运行的编号记在集成提交的 `CI-Run`。
- AI 界面检查（VM，模拟 Provider，开发构建，`open-project` 注入目录，其余从界面入口操作，基线 `04cc066`）：输入后 Tab 与标题出现未保存圆点（[截图](evidence/vm-ui-01-unsaved.png)）；⌘S 后圆点消失，切到预览显示刚保存的内容（[截图](evidence/vm-ui-03-saved-preview.png)；输入框里的文字是检查中一次误输入，与本功能无关）；面板隐藏时从 Terminal 写入同一文件，回到 Files 显示冲突横幅（[截图](evidence/vm-ui-04-conflict.png)），“比较”显示磁盘与修改的对比（[截图](evidence/vm-ui-05-compare.png)），“放弃我的修改”后显示磁盘内容；新建文件输入后 Tab 显示未保存（[截图](evidence/vm-ui-07-tabs-dirty.png)）；关闭 Project 的确认框同时列出 Terminal 与未保存的 `notes.ts`，按钮为“保存并关闭 / 不保存并关闭 / 取消”（[截图](evidence/vm-ui-08-close-project.png)）。检查中发现可编辑编辑器点击后整块出现蓝色焦点外框，已改为只有只读查看器显示外框，可编辑时焦点由光标与当前行表示。rebase 后在 `b50ff46` 复查：点击编辑器输入不再出现外框，输入框不受影响，未保存圆点与“保存”按钮出现（[截图](evidence/vm-ui-rebased-editing.png)）；⌘S 后大小由 16 B 变为 36 B、圆点消失，预览显示新内容。
- 文档同步：[DEC-34](<../../../../docs/07. Decisions.md#dec-34-files-提供应用内编辑>)（DEC-25 对应条目标为已取代）、[FR-TOOL-001](<../../../../docs/02. Functional Requirements.md#fr-tool-001-files-explorer>)、[工具规格](../../../../specs/tools/spec.md) TOOLS-Q13 / TOOLS-Q11 及 §2、§3、§5.2、§5.4、§5.5，[桌面开发说明](../../../../apps/desktop/README.md)的入口。
- 未覆盖：原生退出对话框（窗口未加载时）只有代码审查与单测；Agent 并发写入用测试钩子和外部写入模拟，未用真实 CLI；真实 Codex / Claude CLI 链路与本功能无关，未运行。
- 人工功能验收：待用户在 dev 体验，体验步骤见集成提交。本条不代表已验收。

## 目标

Files 查看器改为可编辑的文本编辑器，行为参考 VS Code；Markdown 的编辑 / 预览模式按上次选择记忆并跨重启保留。来源：用户 2026-11-14「File 编辑模式不能编辑？我切换为预览，为什么没有记忆？下次打开文件还是默认编辑了？参考 vscode 这个模块，完善整个功能」。

## 范围

- 做：
  - 主进程 `files:write`：限定在 Project 内、不跟随符号链接、按读取时的版本检测冲突、原位写入并保留编码与 BOM；文件已被删除时排他重新创建。
  - 编辑：可编辑的 Monaco、未保存标记（Tab 与标题）、⌘S 保存、还原文件、编辑时固定预览 Tab、切换 Tab 与隐藏面板保留修改与撤销历史。
  - 冲突：未修改的文件随磁盘自动刷新；有未保存修改时磁盘变化或删除给出提示，可比较、覆盖或放弃修改，不静默覆盖。
  - 关闭：关闭有未保存修改的 Tab / 查看器时询问保存 / 不保存 / 取消；关闭 Project 与退出应用的确认框列出未保存的文件，可全部保存、不保存或取消。
  - 记忆：Markdown 编辑 / 预览按上次选择作为全局默认并持久保存，已打开的 Tab 各自保持；自动换行同样持久保存。预览显示未保存的内容。
  - 文档：TOOLS-Q13 取代 TOOLS-Q11，更新 FR-TOOL-001、DEC-25 及工具规格实现记录。
- 不做：自动保存、热退出、语言服务 / 补全 / 格式化、编码或换行符切换、Search 替换、编辑图片 / 二进制 / 超限文件、Markdown 并排预览。

## 依据

- 用户 2026-11-14 的要求与同日对三项问题的回答（见已确认事项）。
- [FR-TOOL-001](<../../../../docs/02. Functional Requirements.md#fr-tool-001-files-explorer>)、[工具规格](../../../../specs/tools/spec.md)；本任务取代其中 2026-10-26 “应用内不编辑”的决定。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 编辑保存（用户 2026-11-14） | 打开文本文件，输入内容，⌘S | Tab / 标题出现未保存标记；保存后标记消失，磁盘内容更新，编码与 BOM 不变 | 单元测试；E2E；VM 界面检查 |
| 预览记忆（同上） | Markdown 切到预览，打开另一个 Markdown，重启应用后再打开 | 新打开的 Markdown 以预览打开；重启后仍是预览；已打开 Tab 各自保持 | 单元测试；E2E；VM 界面检查 |
| 外部修改（同上，VS Code 行为） | 未修改时外部写入；有未保存修改时外部写入或删除，再 ⌘S | 未修改时自动刷新；有修改时提示冲突，可比较 / 覆盖 / 放弃，保存不覆盖外部内容 | 单元测试；E2E |
| 关闭询问（同上） | 有未保存修改时关闭 Tab、关闭查看器、关闭 Project、退出应用 | 询问保存 / 不保存 / 取消；保存失败时不关闭并说明原因 | 单元测试；E2E；VM 界面检查 |
| 安全边界（工具规格 §5.2） | 写入符号链接、Project 外路径、`.git`、被替换为链接的路径 | 拒绝，不跟随链接，不写出 Project | 主进程单元测试 |

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| Files 是否提供应用内编辑（取代 TOOLS-Q11） | 提供，参考 VS Code（用户 2026-11-14） |
| Markdown 预览 / 编辑如何记忆 | 按上次选择作为全局默认并跨重启保留；已打开的 Tab 各自保持（用户 2026-11-14） |
| 保存方式 | 手动 ⌘S，未保存标记，关闭时询问；磁盘冲突提示比较 / 覆盖 / 放弃（用户 2026-11-14） |
| 有未保存修改时关闭 Project 或退出 | 在现有关闭 / 退出确认框中列出，可全部保存、不保存或取消（用户 2026-11-14） |

## 技术决定

已回写[工具规格 §5.5](../../../../specs/tools/spec.md#55-编辑与预览记忆2026-11-14)（AI 在授权范围内的实现选择，2026-11-14），要点：原位写入并按读取版本做乐观并发、未保存文本只在 Renderer、主进程只登记未保存路径供关闭 / 退出确认、文本模型 LRU 缓存保留撤销历史、偏好存 `app_meta`。

## 后续项

独立评审的非阻断项 1–14 见 [acceptance.md](acceptance.md#后续项)，不在本分支修。较值得优先跟进的是 1（用废纸篓删除有未保存修改的文件时直接丢弃修改）和 2（关闭 / 退出清理失败后未保存登记被清空）。
