---
id: T20261020-v06-add-menu
status: done
fr: [FR-INPUT-001, FR-INPUT-002]
ac: [AC-02]
specs: [specs/input/spec.md]
created: 2026-10-20
closed: 2026-10-20
---

# v06 Composer Add 菜单

## 目标与依据

用户要求参考 Codex Add 展开交互，在 `+` 中按分类显示 Files、Skills、Plugins 等 CLI 能力；条目显示图标、名称和可选描述。仅调整 v06 探索原型，不扩展真实 CLI catalog 或生产 Electron Composer。

## 完成记录

- 增加按分类的 Add 面板：文件、Project View（仅 View 草稿可重新附加）、Skills、Plugins、其他。
- Files 复用现有 Files 工具入口；Skill 从当前 Project 文件树中的 `SKILL.md` 派生，当前示例 `code-review` 可加入上下文，重复添加显示“已添加”并禁用。
- Plugins 没有真实 catalog 接口时显示“暂无可用 Plugin”，Images 作为明确的原型未实现禁用项；没有虚构可安装能力。
- 增加 skill / plugin / image 图标、名称与描述的两行条目布局，Add 面板支持滚动并约束在对话栏内。

## 浏览器验证

- `+` 菜单按分类显示，且每个可用 / 空状态条目都有图标、名称和描述。
- 添加 `code-review` 后出现上下文标签；重新打开菜单显示“已添加”禁用状态。
- Files 条目打开右侧 Files 工具；View 草稿移除当前 View 后可从 Project View 分类重新附加。
- 窄窗口边界沿用 Composer popover 的最大高度与横向约束。

## 自动检查

- `node --check design/prototypes/studio-prototype-v06/{data.js,render.js,app.js}` 通过。
- `git diff --check` 通过。
- `pnpm check:docs` 仍被工作区既有的 `design/references/README.md:31-32` 缺失图片链接阻断，与本次 Add 菜单无关。
