# D20261009 桌面端 SQLite 驱动采用 node:sqlite

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 日期 | 2026-10-09 |
| 关联 | task [T20261009-app-skeleton](../../tasks/T20261009-app-skeleton/task.md)；04 第 2、6 节；06 第 6 节 |
| 取代 | — |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。

## 背景

[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2 节确定本地持久化使用 SQLite，但未指定驱动。[06. CLI Integration Preflight](<../06. CLI Integration Preflight.md>) 第 6 节要求在骨架阶段验证 Electron 原生依赖。候选驱动有两类：

- Node.js 内置的 `node:sqlite`（`DatabaseSync`，同步 API）；
- `better-sqlite3`（第三方原生模块，同步 API）。

`better-sqlite3` 基于 V8 原生接口而非 N-API，必须按 Electron ABI 重新编译；而 Vitest 运行在系统 Node（本机 26.10.0）中，需要另一份按 Node ABI 编译的二进制，两者互相覆盖是常见问题。

## 决定

1. 主进程使用 `node:sqlite` 作为 SQLite 驱动，不引入 `better-sqlite3`。
2. 数据库文件固定为 `app.getPath('userData')/studio.sqlite3`，路径在打开时校验必须位于 userData 内，不写入任何 Project 目录。开发模式使用独立的 `<userData> (Dev)` 目录，避免与安装版数据混用。
3. 打开时设置 `journal_mode = WAL`、`foreign_keys = ON`、`busy_timeout = 5000`。
4. 迁移只向前、幂等：`schema_migrations` 表记录已执行的迁移 ID；每个迁移在 `BEGIN IMMEDIATE` 事务中执行，失败回滚且不记录；数据库中存在当前版本不认识的迁移（由更新版本写入）时拒绝打开，不做猜测。
5. 迁移 ID 格式为 `<YYYYMMDD><NN>_<feature>_<name>`，按字符串升序执行，与 task ID 一样以日期避免并行 task 冲突。骨架只建立示例表 `app_meta`（键值），不定义产品数据表。
6. 访问封装在 `apps/desktop/src/main/services/database/`，其他模块通过 `CoreServices.database()` 获取连接，不直接 `new DatabaseSync`，以便日后替换驱动或移入独立进程。

## 备选方案

| 方案 | 放弃原因 |
|---|---|
| `better-sqlite3` | 需要针对 Electron ABI 重编译（`@electron/rebuild` 或 Electron 预编译包），与 Vitest 所用 Node ABI 冲突，需维护两份二进制或改用 Electron 运行单元测试；增加打包与签名环节的原生文件。 |
| 异步驱动（如 `sqlite3`） | 同样是原生模块，且回调 / 异步 API 对迁移事务没有收益。 |
| 在 utilityProcess / Worker 中运行数据库 | 当前数据量小，同步访问足够；如出现阻塞主进程的查询，再按本决定第 6 条的封装迁移。 |

## 影响

- 无需为 SQLite 做任何原生构建；`pnpm install` 后在 Electron 主进程与 Vitest 中使用同一实现。
- `node:sqlite` 在 Node 24 中仍标注为实验性（Release Candidate），API 可能小幅变化；升级 Electron 大版本时需复跑数据库单元测试与打包冒烟。
- 同步 API 在主进程执行，长查询会阻塞主进程事件循环；产品表设计时应保持查询轻量（04 第 6 节“多 CLI Session 并行不得阻塞主 UI”）。
- 后续 task 新增表：在 `migrations/` 新建迁移文件，并在 `migrations/index.ts` 增加一行。

## 依据

- 实测：Electron 44.4.5（内置 Node 24.21.0）主进程中 `require('node:sqlite')` 无需任何启动参数即可使用，SQLite 3.53.4，未产生 ExperimentalWarning；见 [research.md](../../tasks/T20261009-app-skeleton/research.md) 第 3 节。
- 打包后通过 `open` 启动的冒烟结果：读写、重复迁移（第二次执行 0 条）、数据库位于 userData 均通过，见 [W1-packaged-smoke.json](../../tasks/T20261009-app-skeleton/evidence/W1-packaged-smoke.json)。
- 单元测试：`apps/desktop/src/main/services/database/database.test.ts`。
