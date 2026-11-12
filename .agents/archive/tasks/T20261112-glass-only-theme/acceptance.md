# 验收：T20261112-glass-only-theme

## 未覆盖与待决事项

- 真实系统“降低透明度”：未在本机切换 macOS 系统设置（会改动用户环境）。纯色回退只由 E2E 在主进程覆盖 `nativeTheme.prefersReducedTransparency` 模拟（SET-T5），agent-browser 交互只覆盖毛玻璃路径。复测条件：人工验收时在系统设置中开关一次“降低透明度”。
- 打包应用：未验证，只用 `electron-vite build` 的 `out/` 产物（开发形态）。
- 旧偏好迁移没有 E2E 用例，由单测和第一轮 agent-browser 实际应用检查覆盖（见下表第 3 行）。
- `composer.spec.ts` 已在本轮复跑；`alignment.spec.ts`、`app.spec.ts` 引用实现者在同一产品代码上的结果，本轮未复跑。
- 跨任务事项：`tasks/T20261112-workbench-ui-polish/task.md:60` 的“设置中切换毛玻璃 / 纯色”场景合并后无法执行。Coordinator 已决定交由该任务处理并告知用户（见 N4）。

## 人工功能验收

- 状态：待人工验收
- 范围与版本：设置 → 外观去掉主题选择；纯色仅作“降低透明度”回退；旧 `solid` 偏好显示为毛玻璃。证据基线 `0ca1794`。
- 人工记录：未确认，待验收（路线图“设置与外观”行已注明待人工验收）。

## AI 结论与运行环境

- 总体结论：**通过（AI 验收范围内）**。task.md 的 4 项验收标准全部通过。第一轮阻塞项 F1 已修复并经复验；非阻塞项 N1–N3、N5、N6 已处理，N4 属于其他任务。本结论不代表人工产品验收。
- 验收者：独立 Review Agent，未参与实现或修复。
- 日期与代码基线：2026-11-12。第一轮 `464c423`；复验 `feat/glass-only-theme` @ `0ca1794`（`git diff 464c423 0ca1794`：只改测试、文档与注释，产品逻辑不变）。复验时 worktree 中 `task.md` 的“依据”一行有 Coordinator 未提交的修改（改为引用 DEC-31），不涉及代码。
- 平台与应用形态：macOS 26.6，arm64，Electron 44.4.5；`electron-vite build` 产物，开发形态，未打包。
- Provider 与 CLI：模拟 Provider（`STUDIO_E2E_PROVIDERS=1`），未调用真实 CLI，本改动也不涉及 CLI 链路。

## 验收结果

证据位于 worktree 的 `.runtime/glass-only-acceptance/`（scratch，未复制到 `evidence/`，因为验收者只允许写入本文件）。第一轮文件在根目录，复验文件在 `r2/`。界面交互（R1）在 `464c423` 上执行；`0ca1794` 未改动产品代码，因此 R1 证据仍然适用。

| 场景与来源 | 前置条件与操作 | 预期结果 | 实际结果 | 验证方式与环境 | 结论 | 证据 |
|---|---|---|---|---|---|---|
| 设置只有模式与毛玻璃背景（task.md 标准 1；用户 2026-11-12） | 打开项目后点导航左下“设置” → 外观 | 只有“模式”“毛玻璃背景”两个单选组，没有“主题”和“纯色” | 无障碍树只有 `radiogroup "模式"` 与 `radiogroup "毛玻璃背景"`，对话框文本中没有“主题”和“纯色”；打开时焦点在“跟随系统” | agent-browser 连接实际 Electron（CDP），从可见入口操作；单测 `settings.test.tsx:206`；E2E `settings.spec.ts:90` | 通过 | `ui/R1-02-settings-appearance.png`；`r2/unit.log`；`r2/e2e.log` |
| 降低透明度回退（标准 2；SET-C5、SET-C9） | 模拟开 / 关“降低透明度”，浅色与深色；回退时点选“薄荷” | 纯色，窗口底色浅 #FFFFFF / 深 #212121；显示原因提示；颜色可选并保存；关闭后恢复毛玻璃，提示消失 | 与预期一致。复验后的单测 `settings.test.tsx:247-262` 也断言：保存后颜色保持选中，提示仍在 | E2E `settings.spec.ts:120,191,209`（主进程模拟 nativeTheme）；单测；代码 `shared/ipc/settings.ts:54`、`main/window/appearance.ts:21-35` 只看 `effective` | 通过（模拟环境） | `r2/e2e-settings/W1-reduced-transparency.png`、`W1-solid-dark-1280.png`；`r2/unit.log` |
| 旧偏好迁移（标准 3；用户 2026-11-12 选项） | 隔离 userData 先打开一个 Project，退出后向 `app_meta` 写入 `settings.appearance.theme = solid`，再启动实际应用 | 显示毛玻璃 | `<html data-theme="glass">`，`getAppearance()` 返回 `effective: "glass"`，不再含 `theme` 字段；旧行仍保留在库中（符合“只忽略、不删除”） | agent-browser + 实际 Electron；fixture 用临时脚本经桩化目录选择器打开 Project 并写库，属测试准备，不计入界面操作；单测 `settings-service.test.ts` 的迁移用例 | 通过 | `ui/R1-01-legacy-solid-shows-glass.png` |
| 模式、背景颜色的即时生效、持久化与键盘操作（标准 4；FR-SET-002） | 键盘 Tab / Shift+Tab 走一圈；在色块上按 → ；点“深色”；Esc 关闭 | Tab 顺序：关闭、分类、模式、背景颜色，限制在对话框内；方向键选中并聚焦；立即生效、对话框不关闭；重启后保持；Esc 后焦点回到入口 | Tab：跟随系统 → 极光 → 关闭设置 → 外观 → CLI → 跟随系统 → 极光（循环）；Shift+Tab 回到模式。→ 选中“薄荷”并聚焦；点“深色”后 `data-scheme=dark`，对话框仍开；库中保存 `mint` / `dark`；Esc 后焦点回到“设置”。重启持久化由 E2E 覆盖 | agent-browser + 实际 Electron；E2E `settings.spec.ts:165,209`（relaunch） | 通过 | `ui/R1-03-mint-dark.png`；`r2/e2e.log` |
| F1 复验：CLI 标题栏在两种外观 × 两种模式下固定 | `test:e2e cli-default.spec.ts settings.spec.ts composer.spec.ts`，随后单独 `test:e2e:built cli-default.spec.ts` | 全部通过 | 用例 `cli-default.spec.ts:107` 改为模拟“降低透明度”并断言 `data-theme`，两次都通过。组合运行时 14 项中 13 项通过，失败的 `cli-default.spec.ts:50` 是输入框收到一个多余的“a”（`retain mea`）；该用例不涉及外观，在 `464c423` 与单独复跑中均通过，判断为运行期间外部键盘输入进入了真实焦点窗口。单独复跑 4/4 通过 | Playwright Electron E2E | 通过 | `r2/e2e.log`（第 140、166–193 行）；`r2/e2e-cli-default-rerun.log` |
| 其他界面在纯色回退下正常（task.md 场景表第 4 行） | 跨外观的思考强度配色、布局用例 | 与毛玻璃同等通过 | `composer.spec.ts` 本轮复跑全部通过；`alignment.spec.ts`、`app.spec.ts` 的 diff 已审阅，引用实现者结果 | E2E；代码审阅 | 通过（部分为引用） | `r2/e2e.log` |
| 类型检查、单测与文档检查 | `typecheck`；`vitest run src/main/ipc/settings.test.ts src/main/services/settings src/renderer/src/features/settings`；`pnpm run check:docs` | 通过 | typecheck 退出码 0；3 个文件 26 项全部通过；文档检查 0 个新问题 | 本机 | 通过 | `r2/typecheck.log`、`r2/unit.log`、`r2/check-docs.log` |
| 遗留引用（全仓库，跳过 node_modules、out、.runtime、design/prototypes） | 搜索已删除的符号、“纯色”、“主题选择”、`DEC-12` | 不再暗示用户可选纯色 | 代码和测试中已无残留。新行为统一引用 DEC-31，DEC-12 只用于 2026-10-12 的原始来源。只剩 N4（其他任务的记录） | `rg` | 通过 | — |
| 文档一致性（CONTRIBUTING §7） | 核对 settings spec、FR-SET-002、DEC-12 / DEC-31、Shell Spec v02 状态行与 §12、Visual Direction、UX D-16、AC-08、路线图、`apps/desktop/README.md`、design/README | 相互一致，并与代码一致 | 一致。DEC-12 恢复原文，并在标题行注明结论已由 DEC-31 取代；DEC-31 编号接续 DEC-30，锚点可解析（check:docs 通过） | 人工阅读 diff；`check:docs` | 通过 | `r2/check-docs.log` |

## 缺陷与复验

| 编号 | 级别 | 问题（第一轮，`464c423`） | 处理（`0ca1794`） | 复验结论 |
|---|---|---|---|---|
| F1 | 阻塞 | `cli-default.spec.ts` 仍点选已删除的“毛玻璃 / 纯色”单选项，超时失败 | 改用 `setReducedTransparency` 切换外观，`launch()` 中先关闭，断言 `html[data-theme]`，并改名用例 | 已解决：两次 E2E 运行中该用例都通过 |
| N1 | 非阻塞 | `settings.test.tsx` 断言保存后提示消失，与规格相反 | 模拟状态改为 `reducedTransparency: true`，并断言保存后颜色与提示都保持 | 已解决：`settings.test.tsx:247-262` |
| N2 | 非阻塞 | `tokens.css` 注释提到已删除的设置预览 | 改为只提色块 | 已解决：`tokens.css:412,418` |
| N3 | 非阻塞 | Shell Spec v02 状态行过时，且未标注 §12 修订 | 状态行改为 SET-Q1～Q7 已确认，并注明 DEC-31 修订待审阅 | 已解决：`shell-spec-v02.md:28` |
| N4 | 非阻塞 | `T20261112-workbench-ui-polish/task.md:60` 的验收场景无法执行 | 未修改：属于其他任务的单一写入者，由 Coordinator 告知用户 | 保留，需在该任务验收前更新 |
| N5 | 非阻塞 | SET-C9 排序，SET-C3 措辞 | SET-C9 移到 SET-C8 之后；SET-C3 改为“用户不再选择主题，纯色只作回退” | 已解决 |
| N6 | 非阻塞 | DEC-12 原地修订 | 新增 DEC-31 并取代 DEC-12 的相应结论，DEC-12 保留原文 | 已解决，符合决定记录规则 |
| E1 | 环境（非缺陷） | — | 复验组合运行中 `cli-default.spec.ts:50` 收到外部键入 | 单独复跑通过。复跑多份真实焦点 E2E 时，应避免在测试窗口获得焦点期间使用键盘 |

既有问题，非本次引入，仅供参考：`docs/01. Product Definition.md:66`“默认白色主题”与原则 23 自 2026-10-12 起已与 DEC-12 不一致。
