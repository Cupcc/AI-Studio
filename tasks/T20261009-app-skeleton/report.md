# 结论：T20261009-app-skeleton

## 需要回写的内容

| 目标文档 | 内容 | 状态 |
|---|---|---|
| 根 `AGENTS.md`、`apps/desktop/README.md` | install / dev / typecheck / test / e2e / package / smoke 命令；冒烟默认隔离 userData | 已回写 |
| `docs/decisions/D20261009-desktop-*.md` | SQLite 驱动、IPC、功能目录三份决定 | 草稿，待人审阅 |

## 遗留问题

- 验收中的低风险建议、最低 macOS / x64、签名与公证等边界仍以 W2 记录为准；本次未扩大范围。
- appId / 产品名、安装依赖策略、外部链接等待决定项见 [plan.md](plan.md#待人决定)；未擅自标为确认。
- 任务维持 `verifying`，等待人审阅验收与修复差异后签收。

## 结论

骨架实现与独立 W2 验收均已合并到 `dev/v1`。W2 的 8 项结论和边界见 [acceptance.md](acceptance.md)，人尚未签收。接续主 Agent 修复 W2 提出的中等问题：打包冒烟脚本每次默认创建独立临时 userData，支持 `--user-data-dir` 指定测试目录，临时目录保留供诊断。

修复复核（2026-10-09）：`node --check apps/desktop/scripts/packaged-smoke.mjs` 通过；以新脚本启动旧 W1 已有打包产物，报告 PASS，SQLite 首次迁移 1 次、重复迁移 0 次、读写通过，PTY 和登录 Shell 解析通过；筛选证据见 [W3-packaged-smoke.json](evidence/W3-packaged-smoke.json)。本次复核证明启动脚本隔离和既有骨架可运行，不证明后续 Session 实现的打包结果；没有调用模型。
