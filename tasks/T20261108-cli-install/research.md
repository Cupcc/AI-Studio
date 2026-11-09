# CLI 配置覆盖机制核实（2026-11-08）

## 结论与边界

建议应用保存独立连接配置，在启动自己管理的 CLI 子进程时传入；不写入用户的 CLI 配置或登录文件，也不采用退出时还原。此为 AI 设计建议，尚未获用户对详细交互与生效语义的确认。用户已要求先核实机制并参考 CC Switch。

本轮是源码调查与本机无模型调用探测；未完成产品实现、真实网关鉴权 / 请求路由、旧版 CLI 兼容性、应用内界面、并发与恢复验证。安装功能仍处于独立 worktree 中的开发草稿，未合入主工作区。

## CC Switch 实际机制

调查仓库：[farion1231/cc-switch](https://github.com/farion1231/cc-switch)。基线：`c6a5a789f7e1888fbd18106acbca8df04d11ddee`（2026-11-07），2026-11-08 克隆至临时研究目录，仅阅读，未运行该应用。

| 机制 | 源码观察 | 对本项目的意义 |
|---|---|---|
| 直连切换 | Claude 对 `settings.json` 做关键字段补丁；Codex 更新 `config.toml`，按认证场景处理 `auth.json`、登录暂存与模型目录 | 会改写本机文件，不符合本次优先诉求 |
| 本地路由 | 进入路由时将客户端配置指向本地服务，后续切换多数由代理选择上游 | 适合接管外部 CLI；本项目直接启动子进程，不需为配置覆盖引入代理 |
| 写入可靠性 | 首次写前按字节备份、应用内写锁、临时文件、hash 重检、pending 日志与启动恢复 | 可借鉴原子保存与冲突检查；不应因此承担无必要的全局文件接管 |
| 正常退出 | `detach_all` 将代理客户端改回直连供应商，模式与路由记录保留 | 不是逐字节恢复到应用启动前的文件 |
| 异常退出 | 下一次启动 / 写操作按 pending 记录前滚或放弃，遇外部修改保留外部文件 | 强制终止时仍不能即时修复本机配置；恢复机制不等于退出保证 |

源码入口（固定 commit）：

- [Claude 直连写入](https://github.com/farion1231/cc-switch/blob/c6a5a789f7e1888fbd18106acbca8df04d11ddee/src-tauri/src/services/provider/claude_direct.rs)
- [Codex 直连写入](https://github.com/farion1231/cc-switch/blob/c6a5a789f7e1888fbd18106acbca8df04d11ddee/src-tauri/src/services/provider/codex_direct.rs)
- [写入引擎](https://github.com/farion1231/cc-switch/blob/c6a5a789f7e1888fbd18106acbca8df04d11ddee/src-tauri/src/live/engine.rs)
- [pending 与恢复](https://github.com/farion1231/cc-switch/blob/c6a5a789f7e1888fbd18106acbca8df04d11ddee/src-tauri/src/mode/operation.rs)
- [路由模式与退出](https://github.com/farion1231/cc-switch/blob/c6a5a789f7e1888fbd18106acbca8df04d11ddee/src-tauri/src/mode/controller.rs)
- [退出清理](https://github.com/farion1231/cc-switch/blob/c6a5a789f7e1888fbd18106acbca8df04d11ddee/src-tauri/src/lib.rs#L2118-L2149)

写入引擎明确承认：其他客户端不参与应用内部锁，hash 重检到 rename 之间仍存在外部写入竞争窗口。不能把它描述成无条件安全的全局切换。

## 官方支持与本机验证

### Codex

[官方高级配置](https://learn.chatgpt.com/docs/config-file/config-advanced)定义自定义 `model_providers`、`base_url`、`env_key`。本机 `codex app-server --help` 明确支持 `-c key=value`，覆盖本来从配置文件读取的值。

本机版本 `codex-cli 0.167.0`。在仓库外临时工作目录启动 `app-server --listen stdio://`，用 `-c` 设置独立 provider `ai_studio_probe`，地址为不提供服务的 loopback 端口，密钥变量为仅含假值的 `AI_STUDIO_PROBE_KEY`。只发送 initialize / initialized / config/read，不发送 turn。

结果：`config/read` 读取到指定 provider；base URL 与 env key 引用均正确，`requires_openai_auth=false` 生效。没有运行 login / 写入认证，也没有输出整个配置或任何真实凭据。这里只证明运行时配置解析，不证明远端服务支持 Responses API 或真实鉴权成功。

实现要点：在 app-server 启动层传入覆盖，不能只给 thread/start，因为模型目录、检测与恢复也必须使用同一连接配置。密钥值仅注入子进程环境，不放在 `-c` 参数或明文配置文件中。

### Claude Code

[官方环境变量](https://code.claude.com/docs/en/env-vars)支持 `ANTHROPIC_BASE_URL`、`ANTHROPIC_API_KEY` 和 `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`。宿主管理模式会忽略 settings 文件中的 provider 路由 / endpoint / auth 变量，以宿主进程环境为准。[设置优先级](https://code.claude.com/docs/en/settings)同时说明：普通 `--settings` 是会话级覆盖，但组织管理设置与字段合并有例外，不能笼统承诺任意字段都能覆盖。

本机版本 `Claude Code 2.1.319`。使用 `--bare --settings <临时测试文件> auth status --json`，避免真实用户设置、Hook 与 OAuth 登录干扰；测试文件只含假 API key、loopback URL、禁用 Hook。输出仅抽取鉴权状态与来源类型，不保留完整原始响应。

| 场景 | 结果 |
|---|---|
| 假 key 仅在测试 settings 文件，未启用宿主管理 | `loggedIn=true`，`authMethod=api_key` |
| 开启宿主管理，环境不给 key，文件仍有假 key | `loggedIn=false`，`authMethod=none` |
| 开启宿主管理，子进程环境给假 key | `loggedIn=true`，`authMethod=api_key` |

这证明该版本宿主管理模式会忽略 settings 文件里的 key，并识别宿主环境提供的 key；`loggedIn=true` 只是本地凭据配置状态，假 key 并未被服务端验证。`--bare` 仅用于机制探测，不能把该测试当作应用保留本机 Skills / MCP / Hook 的集成验收。endpoint 实际请求路由仍待本地 HTTP fixture 与真实连接验证。

另一个不使用 `--bare`、但排除普通 settings 来源的 auth-status 探测也识别宿主假 key；与 Codex 探测前后对 `~/.codex/config.toml`、`~/.codex/auth.json`、`~/.claude/settings.json` 做内存 hash 比较，三者内容未变。未导出内容或 hash。

## 本项目接入差距

- `SessionServiceOptions.environment()` 当前没有 CLI 参数，必须区分 CLI 与配置修订，防止把 Codex / Claude 凭据同时交给所有子进程。
- Codex 的实际 Session Driver 与目录 probe 各自创建 app-server；当前都未传入连接覆盖。需共用启动配置构造。
- Claude SDK 已支持 `settings`、`env` 与 `settingSources`；本项目 Adapter 的允许列表尚未开放 `settings`。连接配置可走宿主管理 env，其他字段后续按官方支持边界加入，不能开放任意进程参数。
- 检测当前只看用户登录状态；自定义 key 模式要区分“已配置凭据”和“连接测试成功”，不能把填写 key 标成真实验证通过。
- 缓存、模型目录、现存 Runtime 与续聊要绑定配置版本，避免保存后检测用新地址、消息却继续走旧进程。

## 建议的产品设计（待确认）

1. 设置 → CLI → 每个 CLI 的“连接配置”。两种模式：默认“使用本机配置”；可选“使用应用配置”。应用配置包含 Base URL、API Key、按 CLI 区分的认证方式与可选模型。第一版支持每 CLI 一套应用配置，多套供应商配置不在当前明确请求内。
2. 应用保存独立配置，非敏感字段存用户数据目录；key 用系统凭据保护能力加密，仅主进程解密后注入对应子进程。前端只拿已设置 / 掩码状态，编辑时输入新 key。主机加密能力不可用时不静默降级明文。
3. 自定义 URL 与凭据视为一个连接方案；不把已有官方登录凭据自动发给用户刚填的新地址。清理该 CLI 进程中会竞争的旧连接变量，并验证继承规则。子进程环境包含凭据不代表能向拥有该进程权限的工具绝对隐藏凭据，仍须防日志、错误和导出泄露。
4. 仅覆盖明确管理的连接字段；本机 Skills、MCP、Hook 与权限等尽量按原规则继承。组织策略与 CLI 支持限制需分别处理，不能把宿主管理开关当作任意设置编辑器。
5. 修改配置后刷新检测与模型目录；建议新会话采用新配置，运行中的会话保持其配置快照。已有会话换配置须显式操作，在空闲时释放 / 重建 Runtime 后恢复，不能静默改变请求目的地。该用户可见生效语义尚待确认。
6. “恢复使用本机配置”只关闭覆盖，下一次受影响 Runtime 启动不再传覆盖；磁盘原文件不需要还原。
7. “测试连接”独立按钮，标明会发起请求；保存本身不发模型请求。不把“兼容 OpenAI API”泛化为都能被 Codex 使用，需验证 Responses 协议；Claude 默认需 Anthropic Messages 协议。跨协议代理转换不在当前请求内。

## 文档影响复核

本轮新增研究结论与任务衔接，未将上述设计写成人工确认。已核对 settings 的 CLI 管理、Adapter 的默认继承原则、DEC-16 / DEC-19 的发布边界及当前 Session 环境入口；实现与发布范围文档的正式修改留在安装 / Claude 启用交付阶段，不能将开发草稿当成已交付。历史 CLI 验证结论保留原版本。
