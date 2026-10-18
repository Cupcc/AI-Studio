# 当前 V1 Codex 产品能力核对（2026-10-18）

依据：[产品原则 19、20、24](<../../../../docs/01. Product Definition.md#8-已确认的产品原则>)、[原生对齐任务](../../T20261011-native-cli-parity/task.md)、DEC-16 / 19。当前源码基线为 `dc66a16` 加 W26 实现与 W28 缺陷修复；真实 CLI `0.163.0`，协议同版本 215 份类型；本机 macOS 15.6 arm64。此表按用户可用能力核对，生成类型不等于新增产品入口清单。

| 能力 | 当前接入 | 证据与证明边界 |
|---|---|---|
| 创建、流式、原 ID 恢复 | 生产 Codex Provider；失败不暗建替代 Thread | W25 Adapter、W26 原 UI、W26 最终包真实强杀后同 ID 续聊；[当前结果](W26-native-result.json) |
| Running 输入与文件引用 | native turn/steer，收到回执后保存到原回合；本轮不会暗排成新回合 | W24 应用 UI 同轮文件引用、W25 原生复验；正式竞态回归及 W27 / W28 独立输入探针 |
| 模型、推理强度与默认复位 | 显式选择原样传递；每轮接受时快照；null 查询原生配置 / 实际模型默认 | W26 high、Astra low，再恢复 gpt-6.1-sol / xhigh，原生 turn_context 核对；不凭 Agent 自述判断模型 |
| 图片 | Files 显式“作为图片附加”，校验后 native localImage | W26 / W28 最终包从 UI 附加红蓝图，真实识别；普通 file 与 image 语义分开；不是只有路径标签 |
| Skill / Rule / Context | CLI 原生配置加载 Rule；原生 skills/list enabled目录、opaque ID、发送时重新解析；View Context 独立接缝 | W26 / W28 真正选择 Skill，原生回应 Skill913 / Rule841；Skill 路径不由 Renderer 任意指定；AC-06 原独立真实记录保留 |
| 公开输出 | reasoning summary/content、命令、MCP / dynamic / function结果、Review正文、协作状态、搜索结果及其余已收到条目详情 | W28 发现并复验正文丢失修复；10/10独立探针。W26 旧Thread原生 summary=none不算正文通过；W28 新Thread已收到并展开非空公开摘要，见[独立记录](W28-review.md) |
| Needs Input 与 I-Q2 | 原生选项顺序与对象保留；卡片接受，输入框文字先 steer 回执再拒绝原请求 | W26 最终包真实审批接受并执行；文字拒绝同轮返回指定token且文件未创建。默认模式 request_user_input unavailable 是 CLI 当前模式结果，不是产品禁用；多问题 / 权限种类仍以正式模拟覆盖为准 |
| Stop / 隔离 | 当前轮原生中断与精确命令清理；失败走独立Runtime，原ID恢复；不自动重放 | W25 精确 Stop / 此前服务保留；W26 UI 两Session同时Running，单方Stop不影响另一方，第二模型续聊 |
| 完成提醒 / 焦点 | 先订阅事件再获取可信原生焦点快照，revision防止迟到覆盖；焦点不代替显式opened | W26 后台完成 / 前台打开清除；W27 独立6项焦点探针，E2E记录实际frontmost前置 |
| Project / 退出清理 | 严格可重试，失败不提前关库或退出；持久登记精确身份，启动先清理失效宿主记录 | W27 Node强杀 / 脱离已观察后代 / 多实例；W26 Electron强杀、旧记录cleaned、外部sentinel保留。该次CLI已随EOF退出，实际残留清理由W27证明；W28最终GUI故障专项见其记录 |
| 原生文件修改与两类 Diff | 原生patch按turn持久化；项目Diff单独读HEAD，Shell未上报不伪装无变更 | W23独立、W24应用UI和W28最终包原生apply_patch / 保存diff；历史不回填，不从工作区推断归属 |

## 后续范围与边界

- Claude Code 按 DEC-19 不注册为当前生产入口；实现与模拟覆盖保留，其真实 Rule / Skill、排队、模型、Stop及恢复不是本轮通过项。
- 未观察即脱离的后代、任意外部共享 MCP、账号 / 服务管理、部署或其他上游管理 API 不因类型生成而取得 V1 UI 实施授权。原生恢复 / 分支等尚无产品入口的项按 Session S-Q3 继续如实保留，不能宣称已覆盖原生 CLI 的所有功能。
- CLI 未公开正文、当前模式不提供的问题工具、其他系统 / 平台和未执行方法不补记通过。不添加应用调用次数 / 费用限制、不自动重试或换模型。
- 新增 Diff、推理 / 公开输出、图片 / Skill 的人工体验仍待验收，负责入口为总体验收的人工功能验收；技术通过不等于人工接受。
