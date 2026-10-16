# W18 阶段 1 独立安全复验

## 未覆盖与适用边界

- 本复验不包含 GUI、真实 Codex / Claude CLI、模型调用、原生轮次补丁及本轮 Diff；界面结论由 W19 单独负责。模拟文件引用通过不代表真实 CLI 已接收文件。
- 仅在 macOS 15 / Darwin 24.6.0 arm64、APFS 上验证；HFS+ 专用别名用例因没有挂载卷而跳过。没有模拟缺少 Xcode Command Line Tools、没有触发系统安装器。
- 本地 Project 是受信任目录。Git 原生的 clean 过滤器仍可能执行代码，引用交给 Provider 后不再是内容快照；这些边界及风险见下文。它们不能被解释为应用对不可信仓库或原生 CLI 的沙箱承诺。
- 人工功能验收仍为待人工验收；本记录只提供独立 AI 技术复验材料。

## 当前结论与环境

**通过（阶段 1 独立安全技术复验，2026-10-17）**。先前复现的目录替换泄漏、长路径使目录整体不可用、构建 / 打包不一致均已在 `890a431` 基线复核关闭，本次原定终验 60 项通过、无失败。后续评审发现的引用别名误折叠也已修复：新增独立测试 12 项及受影响引用 / IPC 回归 48 项全部通过。最新源码已由 Main Agent 完成 E2E、打包及冒烟自检，W21 已独立复核新包与构建一致。结论限定于下述受信任本地 Project 边界，不表示 GUI、真实 CLI 或人工产品验收通过。

- 审阅者：W18；本次终验由 W21 接续，二者均未参与应用实现。W18 只编写证据并维护 W16 的过时静态断言，未改变行为用例；W21 更新本记录、新增 `W21-*` 证据，并按 Main Agent 指派同步 acceptance 阶段 1 的最终产物状态，不修改实现。
- 最终代码基线：`feat/files-diff` @ `890a4314e2217c2e6085d1cb20097c0461bcd25e` + 未提交的引用 aliases 修复（`files/references.ts`、`session/session-service.ts`、`shared/tools/files.ts` 及两个对应测试），这五个文件相对 HEAD 的 diff SHA-256 为 `868b7c83219bd1a5968aaa8153a6fe21f3a8bdeba54b2a6a152e9881cbb747c1`。最终复核已包含 aliases 的等价数组追加写法，并重跑 12 项独立测试。含无 HEAD 文案的完整六文件源码 diff SHA-256 为 `72e61737c7bb62616ba62274d1a8d3b6ff6d291acce6cacc48f63dfdc38aa801`，见 [最终产物记录](W21-package-final.log)。aliases 修复后只补验受影响链路，不重复无关目录竞态。
- 旧 `890a431` 构建的一致性记录 [W21-package-audit.log](W21-package-audit.log) 作为历史保留。当前 `out/` 与重新打包的 `app.asar` 已包含最新 aliases 修复及无 HEAD 文案；W21 独立审计确认 119 个对应文件内容全部一致，main SHA-256 为 `63b52d0920b948bb29a6744e7db1fe517c28bb2eb511c07dd67bee77074f558d`。W22 的 GUI 仍使用旧构建，不将其截图改记为新包验收。其它工作区差异为文档及证据，不作为已确认的产品决定。
- Node v26.10.0、pnpm 12.10.1、Apple Git 2.39.2。测试使用 `/tmp` 的隔离仓库；不启动应用窗口、不调用真实 CLI、不访问模型服务。
- 本次目录行为测试执行与生产相同的自包含 worker 函数，经 Node 子进程运行；另外读取打包 utility worker、main 与 preload 做逐字节核对。本次没有独立启动 Electron utilityProcess，实际 Electron 窗口、E2E 与打包冒烟由对应验收 / Main Agent 记录负责。
- 需求依据：[Tools spec §3、§4.1](../../../specs/tools/spec.md)、任务阶段 1（FR-TOOL-001 / 002、FR-INPUT-001、受影响 AC-07 / AC-01）。

## 已执行结果

| 范围 | 独立操作与结果 | 证据 |
|---|---|---|
| 完整 W16（首次） | 133 通过、1 跳过、1 失败；失败为旧 `app.asar` 与新构建不一致。后续还曾复现目录竞态，首次通过不能覆盖该失败；最终关闭结果见下两项 | [W18-security-run.log](W18-security-run.log)、[竞态复现](W18-files-race-residual.log) |
| 最终 Files / surface | 30 / 30 通过：Files 符号链接、特殊文件、权限、别名、根替换、资源上限、watcher；生产 CSP、preload 暴露面及源码注入扫描。旧 surface 失败源于构建时 `out/renderer` 缺失，最终目录完整后通过 | [W21-files-surface-final.log](W21-files-surface-final.log) |
| 最终打包一致性 | 最新源码重构建 / 打包后，W21 独立重跑审计：`out/` 与 `app.asar` 中 119 个对应文件集合及内容全部一致，含独立 directory worker、main、preload 和全部 renderer 资产；worker 入口、cwd 身份验证及 loader 环境清理仍在包内，main 已含 aliases 精确覆盖逻辑 | [审计脚本](W21-package-audit.mjs)、[最终输出及 SHA-256](W21-package-final.log)；[旧包历史](W21-package-audit.log) |
| 最新版本自动化 / 打包门禁（Main Agent 自检） | E2E 46 / 46；复用同一构建执行 `package:built` 成功；packaged smoke PASS（SQLite、PTY、Terminal 屏幕、登录 Shell、Renderer）。W21 只核对日志与产物，未独立重跑这些命令，不计作独立 GUI / 冒烟验收 | [E2E](W0-stage1-close-e2e.log)、[打包](W0-stage1-close-package.log)、[冒烟](W0-stage1-packaged-smoke.json) |
| Git 钩子 / 用户索引 | 最终 C2 再验：`post-index-change`（默认与自定义 hooksPath）未执行，用户 index mtime 未变；私有副本保留原始字节及保守 mtime | [W21-diff-reference-final.log](W21-diff-reference-final.log)、[索引矩阵](W18-index-compat.test.ts) |
| 索引格式与 racy-clean | 最终独立矩阵 8 / 8：SHA-1 / SHA-256 × v2 / v3 / v4、暂存与未暂存内容、v3 intent-to-add、同大小同 mtime 改动正确；真实 index 字节与 mtime 保持 | [W21-boundary-final.log](W21-boundary-final.log) |
| split-index | 最终矩阵输出正确，真实 index 字节 / mtime 和 sharedindex 字节不变；sharedindex 缓存存活 mtime 会刷新，见下文边界 | [最终矩阵](W21-boundary-final.log)、[独立 probe](W18-split-index-probe.log) |
| 最终 Files 竞态与规模 | 普通外部名称：40 秒列表 38,847 次尝试 / 10 次成功，0 泄漏；外部符号链接名及目标：40 秒 32,994 次 / 20 次成功，0 泄漏；读取 50,944 次 / 217 次成功，0 泄漏。10 万条目返回 2000 条、378 ms，事件循环最大延迟 6.2 ms | [Files](W21-files-surface-final.log)、[symlink-row](W21-boundary-final.log) |
| 参数与引用链 | 最终 C2 / C5 / D1 / D2 定向 20 / 20 通过：pathspec 按字面路径处理、JSON 引号单行引用、特殊名字、别名去重、删除 / 符号链接拒绝及 Session / 模拟 Provider 链。错误脱敏复用未变实现的既有 C8 结果 | [最终定向结果](W21-diff-reference-final.log)、[既有 C8](W18-security-run.log) |
| aliases 修复后独立补验 | 12 / 12：模拟区分大小写与 Unicode 的文件系统结果；只按实际 realpath 合并；缺失 NFD 拼写不跳过；原始请求完整传入 resolver / Provider；显式 aliases 精确覆盖；同数量替换、重复 / 额外覆盖及遗漏拒绝；aliases / 绝对路径不经 Renderer 或转录泄漏 | [独立用例](W21-reference-identity.test.ts)、[结果](W21-reference-final.log) |
| aliases 修复后回归 | W16 引用链 + IPC 48 / 48 通过，包含本机 APFS 实际大小写 / NFC / NFD 别名、create / send / retry / steer、敌意 IPC 与发送前拒绝；区分大小写 / Unicode 的实体卷没有挂载，其语义由上述 FS seam 模拟验证，不声称实体卷验收通过 | [W21-reference-ipc-regression.log](W21-reference-ipc-regression.log) |
| 深路径条目 | 长 UTF-8 子项不再使目录整体不可用：精确返回可读 `keep.txt`、`omittedPaths: true`、`truncated: false`，无法安全寻址的子项不展示 | [最终复验](W21-boundary-final.log)、[独立用例](W18-files-boundary.test.ts)、[首次失败](W18-files-boundary-initial.log) |

## 新发现与修复复验

### W18-F1：已拒绝的索引二进制改写方案

评审中途出现的临时 `invalidateStatCache` 方案错误处理条目对齐、v4 变长字段及 hash 宽度，并清零了 mode。独立矩阵 8 / 8 失败，其中 Git 报 `unsupported ce_mode: 0` 并终止。该方案已交回实现者并从最终代码删除，未作为最终实现提交。

当前实现直接复制 index，并保留向下取整的源 mtime，不解析 Git 二进制格式。[受控 probe](W18-index-racy-probe.log) 证实：源 index 与文件 mtime 相同的同大小改动，普通新副本会漏报，保留源 mtime 的副本与原生查询均正确报修改；独立矩阵通过。源 mtime 向下取整只会使更多条目进入 Git 的 racy 检查，不会把边界向未来移动。[Git index 格式文档](https://git-scm.com/docs/index-format) 也明确了各格式的不同字段与对齐，保留原始字节避免了自行实现协议的兼容性风险。

### W18-F2：深路径使目录整体不可用

父路径为两段 150 字节目录，子文件名为 255 个 `漢`（765 UTF-8 字节）。通过子进程 cwd 能创建该文件；父目录可读取，但相对总路径超过 1024 字节，绝对 lstat 也可能超过 macOS 路径上限。列表为了显示禁用行将 kind 改为 `other`，后续校验却按真实特殊文件判断，加上路径长度错误，最终令整个父目录返回 `unreadable`。

Main Agent 选择有提示的安全降级：不显示无法安全验证的长路径子项，保留其它条目，提示可把该目录单独打开为 Project。最终独立用例已通过：只保留 `keep.txt` 并明确返回 `omittedPaths: true`，没有跳过路径边界验证。

### W18-F3：目录 pathname 后校验仍存在竞态

早期 B5 曾无泄漏，但后续重复窗口捕获一次 Project 外目录名称（[失败日志](W18-files-race-residual.log)），故早期通过不能关闭此问题。最终 `890a431` 将枚举移入独立进程：父进程保留 no-follow 目录句柄；worker 在枚举前将自身 cwd 的 dev / ino 与该句柄身份比较，不匹配即拒绝；成功后仅使用该 cwd 的直接子路径，父进程再核对目录身份。打开的句柄防止 inode 在比较期间被复用，pathname 被临时换成外部链接也不能指向同一目录身份。

本次独立阅读实现，并分别执行原 B5 与新增 symlink-row 的完整 40 秒窗口；外部普通名称、链接名称、链接目标均为 0 泄漏，正常条目仍有成功结果；最终打包 worker 与被测构建逐字节相同。该实现加上失败复现的回归结果足以关闭本轮缺陷，概率测试本身不构成普适安全证明。

### W21-F1：按平台 / Unicode 预去重会漏投不同文件

后续代码评审发现：Session 在解析前按 macOS 转小写并做 NFC 去重，resolver 也先做 NFC 去重。这只能在部分卷上代表别名，在区分大小写或 Unicode 的卷上会丢失独立路径，甚至跳过本应失败的缺失路径。早期 APFS 别名测试无法发现这一点。

Main Agent 安排实现者修复，W21 独立检查其 diff：Session 与 resolver 都只预去重完全相同的原始字符串；每个不同拼写仍执行 `inspect`，只有真实 canonical realpath 相同才合并。`ResolvedFileReference.aliases` 只在主进程携带已验证的其它请求拼写，Session 对 `file.path + aliases` 执行原始请求的精确、无重复、无额外项覆盖检查，不再根据数量或平台猜测是否漏投；hardlink 的不同 realpath 保留。独立用例确认 Main-only 字段不跨 Renderer IPC 或持久化转录。12 项独立测试及 48 项引用 / IPC 回归均通过，本缺陷关闭。

## 本地 Project 信任边界与非阻塞事项

1. **Git clean 过滤器**：即便只改 mtime 或复制未编辑的仓库，打开 Diff 也可能执行仓库配置的 `filter.*.clean`；未跟踪文件补丁也会执行。fsmonitor、外部 diff、textconv、pager 与仓库钩子已被覆盖 / 禁用，这不等于禁用了所有仓库代码。普通过滤器在超时 / 关闭时随进程组清理；主动 `setsid` 脱离组的恶意过滤器可存活。完整 W16 独立复验明确观察到了这一点。该风险属于本轮授权采用的受信任本地 Project 边界，若未来接入不可信仓库，应另行设计隔离，不以本次通过代替。
2. **Git 仓库身份**：合法 `.git` 文件或符号链接可指向 Project 外部元数据（linked worktree 需要此机制），Git 可以读取该仓库的已提交对象。Files 工具仍拒绝 `.git` 与符号链接；不能由此宣称 Git 自身被限制在 Project 的物理目录内。Project 子目录的工作区列表按前缀隔离。
3. **引用是路径文本**：发送时重新验证，但 Provider 读取前文件仍可能变化或被替换；应用不会快照 / 内联全文。JSON 引号防止文件名伪造引用列表结构，不能消除文件名的语义提示注入。原生 CLI 自行控制读取与权限。APFS 硬链接也不能被当作符号链接拒绝。
4. **sharedindex 缓存 mtime**：Git 读取共享索引时刷新其到期时间，`core.splitIndex=false` 仍有相同行为。独立 probe 确认它只改变 sharedindex mtime，不改内容、用户 index 或文件集合。此为 Git 的缓存保活设计，非用户数据变更，不阻塞阶段 1；见 [Git config 的 splitIndex.sharedIndexExpire](https://git-scm.com/docs/git-config/2.44.3#Documentation/git-config.txt-splitIndexsharedIndexExpire)。
5. **受信任 Renderer 的资源边界**：watcher 有活动实例上限、请求有时限和有界输出；同一发送方 20 万次订阅仍可增加约 50.7 MB 堆，退订 / 崩溃 / Project 关闭会释放。当前单窗口可信 Renderer 中不作新阻塞；不视为面向任意网页开放的接口。

## 复现命令

```sh
pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W16-vitest.config.ts --reporter=verbose
pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W18-vitest.config.ts --reporter=verbose
pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W16-vitest.config.ts tasks/T20261009-context-tools/evidence/W16-files.test.ts tasks/T20261009-context-tools/evidence/W16-surface.test.ts --reporter=verbose
pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W16-vitest.config.ts tasks/T20261009-context-tools/evidence/W16-diff.test.ts tasks/T20261009-context-tools/evidence/W16-refchain.test.ts --testNamePattern 'C2 |C5 |D1 |D2 ' --reporter=verbose
node tasks/T20261009-context-tools/evidence/W21-package-audit.mjs
pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W21-vitest.config.ts --reporter=verbose
pnpm exec vitest run --config tasks/T20261009-context-tools/evidence/W16-vitest.config.ts tasks/T20261009-context-tools/evidence/W16-refchain.test.ts tasks/T20261009-context-tools/evidence/W16-ipc.test.ts --reporter=verbose
node tasks/T20261009-context-tools/evidence/W18-index-racy-probe.mjs
node tasks/T20261009-context-tools/evidence/W18-split-index-probe.mjs
```
