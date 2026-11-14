---
id: T20261114-app-about-update
status: done
next: human
waiting: 在 dev 体验“设置 → 关于”与更新；决定后续项中的更新来源身份校验与启动页提示
paths: ["apps/desktop/src/main/services/updates/**", "apps/desktop/src/main/ipc/updates.ts", "apps/desktop/src/shared/ipc/updates.ts", "apps/desktop/src/shared/ipc/app.ts", "apps/desktop/src/main/index.ts", "apps/desktop/src/main/build-info.ts", "apps/desktop/src/main/menu/project-menu.ts", "apps/desktop/src/renderer/src/features/app-info/**", "apps/desktop/src/renderer/src/features/settings/**", "apps/desktop/src/renderer/src/assets/**", "apps/desktop/electron.vite.config.ts", "apps/desktop/e2e/settings.spec.ts", "scripts/check-affected*.mjs", "docs/**", "specs/**", "scripts/README.md", "apps/desktop/README.md"]
evidence: vm-ci affected（含 settings / app / alignment E2E）；VM 界面检查“关于”；本机打包版从真实 GitHub Release 自动更新并替换
risk: review
fr: [FR-SET-003]
ac: [AC-08]
specs: [specs/settings/spec.md]
created: 2026-11-14
---

# 关于页与软件更新

## 收尾

2026-11-14 完成（主 Agent）。

- 自检：受影响类型检查与单测；`vm-ci affected` 通过（`vm-ci 1794635480187`，基线 `200fb7c`，含 settings / app / alignment / project / workbench E2E）。
- 界面：VM 内开发版“关于”浅色 / 深色与链接截图（`evidence/about-*.png`）。
- 真实更新：本机打包版（同一代码、版本改为 1.0.9，隔离目录与 userData）两次从 GitHub Release `v1.1.0` 自动下载、校验并在“重启并更新”后原位替换为 1.1.0 重新打开。
- 独立评审：见 [acceptance.md](acceptance.md)，阻断项已复验通过。
- 人工功能验收：待人工验收，记录在 acceptance.md。

## 后续项

独立评审（未参与实现，2026-11-14）的非阻断发现，不在本分支处理：

| 项 | 说明 | 决策方 |
|---|---|---|
| 更新来源的身份校验 | 校验值与安装包同出一个 Release，能发布 Release 的账号或令牌即可向所有用户推送并在退出时静默安装。可选：离线 Ed25519 密钥给 zip 签名并在应用内验证；或改用自签名证书签名并固定证书（还能让钥匙串与隐私授权在更新后保持） | 人（安全与成本取舍） |
| 启动页看不到新版本 | 没有打开 Project 时没有导航，“设置”标记不可见，只能从菜单栏“检查更新…”发现；可考虑系统通知（会请求通知权限） | 人（新的用户可见行为） |
| 失败提示与重试 | “上次更新没有安装成功”会被 20 秒后的自动检查覆盖；替换持续失败时每次启动都会重新下载 | AI |
| 交换窗口内再次打开 | 旧进程退出到改名之间约 100 ms 内重新打开应用，可能运行在随后被删除的 `.previous` 中；可把 `.previous` 留到下次启动清理 | AI |
| `.previous` 残留 | 删除旧备份不完整时，下一次改名会把应用移进残留目录；可用 `mv -n` 或检测残留后失败 | AI |
| 小问题 | 退出路径在启动失败时可能新建更新服务（N5）；`dispose` 后仍可排期（N7）；`blocked` 同时承载应用级与版本级原因、开启自动更新不立即下载已知版本、手动检查并入自动检查时不下载（N8）；说明中的校验值不区分架构（N9） | AI |

## 目标

用户 2026-11-14：“怎么这个APP也没有版本信息呀？……我安装的我都不知道哪个版本，自动更新也没有吗？这什么也没有，给它完善。”应用内能看到版本与构建等基本产品信息，并能自动发现、下载和安装新版本。

## 范围

- 做：设置“关于”分类（版本、构建、运行时、复制版本信息、链接）；菜单栏“关于”面板补充构建信息与“检查更新…”；GitHub Releases 检查、下载、SHA-256 与包校验、退出时替换和“重启并更新”；导航“设置”的新版本标记；发布物命名与校验要求；影响选择器映射。
- 不做：Apple 签名与公证；Intel / 其他平台的安装包；自动发布 workflow；增量更新或回滚到旧版本的界面。

## 依据

- [FR-SET-003](<../../../../docs/02. Functional Requirements.md#fr-set-003-关于与软件更新>)、[settings spec FR-SET-003](../../../../specs/settings/spec.md#fr-set-003-关于与软件更新)、[DEC-36](<../../../../docs/07. Decisions.md#dec-36-未签名应用自建一键更新>)、AC-08 的 2026-11-14 补充。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 版本信息（FR-SET-003 第 1 条） | 打开设置 → 关于；菜单栏“关于” | 显示版本、构建提交与日期、运行时、系统；复制版本信息；链接指向本版本 tag | 单测 + `e2e/settings.spec.ts`；VM 界面检查；本机打包版“关于”面板 |
| 检查状态（第 2、3 条） | 菜单栏“检查更新…”；按钮检查；本地夹具返回同版本 / 新版本 | 已是最新、发现新版本、更新说明、前往下载；自动更新开关重启后保持 | `e2e/settings.spec.ts`（开发版 + 回环夹具，不访问外网） |
| 下载与校验（第 2、5 条） | 新版本可安装；校验值不符 / 无校验值 / 不可写位置 | 校验通过才就绪，否则丢弃并说明原因 | `update-service.test.ts`、`release.test.ts`、`installer.test.ts` |
| 替换与重启（第 4 条） | 就绪后退出或“重启并更新”；替换失败 | 原位置换成新版本并（重启时）打开；失败保留原版本并在下次启动说明 | `installer.test.ts` 运行真实脚本；本机打包版从真实 GitHub Release 更新 |
| 导航标记（第 6 条） | 有新版本 / 已就绪 | “设置”显示标记，点击打开“关于” | `settings.test.tsx`、`e2e/settings.spec.ts` |

## 已确认事项

| 问题 | 回答（确认日期） |
|---|---|
| 自动更新方式 | 自建一键更新，不购买签名（2026-11-14，见 DEC-36） |

## 技术决定

见 [settings spec SET-T6、SET-T7](../../../../specs/settings/spec.md#13-技术决定)。
