# 执行计划：T20261009-app-skeleton

> 唯一写入者：本任务的主 Agent。Worker 不修改本文件，结果交回主 Agent 后由主 Agent 更新。

## 方案

单个实现 worker 建立骨架并完成 [CLI 校验报告](../T20261008-cli-preflight/report.md) 第 6 节两项骨架阶段校验；完成后由不同 worker 验收。技术选择写成决定草稿。

## Workers

| ID | 职责 | 写入范围 | 产出 | 依赖 | 状态 |
|---|---|---|---|---|---|
| W1 | 骨架实现（Opus 5.5 high） | 根目录配置文件；`apps/desktop/**`；`docs/decisions/D20261009-desktop-*.md`（新建）；本 task 的 `research.md`、`evidence/W1-*` | 可启动应用、测试框架、决定草稿、命令清单 | — | done |
| W2 | 验收（Sonnet 5.5 xhigh） | 本 task 的 `acceptance.md`、`evidence/W2-*` | 验收记录 | W1 | done（待人签收） |
| W3 | 验收缺陷修复（接续主 Agent） | `apps/desktop/scripts/packaged-smoke.mjs`、`apps/desktop/README.md`、根 `AGENTS.md`；本 task 的 `report.md`、`evidence/W3-*` | 隔离打包冒烟 userData；记录验证边界 | W2 | done |

## 进度与决定

- 2026-10-09 task 卡片就绪，状态 ready。
- 2026-10-09 W1 因限流中断后续跑完成，合并到 `dev/v1`（`70b9ca6`）。主 Agent 在临时干净克隆中复核：`pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm test`（53/53）、`pnpm test:e2e`（6/6）通过。版本：Electron 44.4.5（Node 24.21.0）、electron-vite 5、React 19.3、TypeScript 7.0.2、node-pty 1.1.0、`node:sqlite`。命令已写入 `AGENTS.md`，3 份决定草稿已登记。
- 2026-10-09 W1 提出待人决定：3 份决定草稿；appId 与产品名（暂定 `dev.aistudio.desktop`、“AI Developer Studio”）；是否设置 pnpm `minimumReleaseAge`；IPC 校验是否采用 schema 库（如 zod）；外部链接默认拒绝还是用系统浏览器打开。另记录：打包冒烟在本机真实 userData 数据库写入了一行 `smoke.lastRun`。
- 2026-10-09 启动 W2 验收。
- 2026-10-09 W2 验收在 `385adf0` 合并；8 项给出通过结论及边界，尚未人签收。接续 W3 修复中等问题：`smoke:packaged` 默认写真实 userData，改为每次创建临时目录并支持显式路径。其他低风险建议保留在验收记录，不据此新增产品要求。
- 2026-10-09 W3 修复提交 `c544b2b`；语法检查及使用旧 W1 打包产物的隔离启动复核通过，SQLite fresh migration=1、repeat=0，PTY / shell env / Renderer PASS（见 W3 筛选证据）。补齐 report，task 转为 verifying，等待人签收，不标 done。
