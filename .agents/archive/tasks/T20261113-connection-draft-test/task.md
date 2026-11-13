---
id: T20261113-connection-draft-test
status: done
next: none
waiting:
paths: [apps/desktop/src/shared/session/cli-connection.ts, apps/desktop/src/shared/ipc/session.ts, apps/desktop/src/main/services/session/cli-connection.ts, apps/desktop/src/main/services/session/cli-connection.test.ts, apps/desktop/src/main/ipc/session.ts, apps/desktop/src/renderer/src/features/settings/**, apps/desktop/src/renderer/src/features/session/session.test.tsx, specs/settings/spec.md, docs/07. Decisions.md]
evidence: 设置页自定义连接未保存即可测试、改地址不需重填 Key、Key 遮盖可显示；单测与虚拟机界面检查通过
risk: review
fr: [FR-SET-001]
ac: [AC-08]
specs: [specs/settings/spec.md]
created: 2026-11-13
---

# 自定义连接先测试再保存，Key 遮盖显示

## 目标

用户 2026-11-13 指出 CLI 自定义连接的体验不合理：须先保存才能测试；填错后改地址又要重填 Key。决定：

- 按表单当前内容测试，无需先保存；保存不要求测试通过。
- 改地址时保留已保存的 Key。
- 已保存的 Key 像密码一样遮盖显示在输入框里，点击“显示”可看到明文。

规格见 [settings spec CLI 连接配置](../../../../specs/settings/spec.md#cli-连接配置2026-11-08-确认)第 3、4、6 条，决定记录见 DEC-27。

## 范围

- 做：测试接口改为接收表单内容（Key 留空用已保存的）；新增读取已保存 Key 的接口；保存时不再因地址变化要求重填 Key；详情页的测试按钮条件、提示文案、遮盖 Key 输入框；单测与规格。
- 不做：连接测试本身的请求与失败分类、Session 连接快照、本机配置模式。

## 依据

- 用户对话（2026-11-13）：“我要测试，得先点保存。不应该测试通过后再点保存吗？”“API key 不用全部隐藏，做成像密码一样，可以遮盖；点击后可以显示。其他没有问题。”
- 已保存的 Key 从此会解密后送到 Renderer，属于安全边界变化，`risk: review`，集成前由未参与实现的 Review Agent 检查。

## 验收标准

| 场景与来源 | 前置条件与用户操作 | 预期结果 | 验证方式与环境 |
|---|---|---|---|
| 未保存即测试（spec 第 4、6 条） | 自定义连接，填写地址与 Key，不保存，点测试连接 | 按填写内容请求；显示结果，并提示尚未保存；不写入配置 | 单测（Renderer + 主进程）；虚拟机界面检查，模拟 Provider |
| 改地址保留 Key（spec 第 3 条） | 已保存连接，修改地址后保存或测试 | 不要求重填 Key，使用已保存的 Key | 单测（主进程）；虚拟机界面检查 |
| Key 遮盖显示（spec 第 3 条） | 已保存连接，重新打开详情页 | Key 输入框有内容且被遮盖，点“显示”看到明文 | 单测（Renderer）；虚拟机界面检查 |
| 读取失败的回退（spec 第 3 条） | 已保存 Key 无法解密 | 输入框留空，占位提示留空沿用已保存的密钥 | 代码检查 |

## 收尾

- 主 Agent 实现与自检，基线 `568691f`。提交门禁：类型检查与相关单测 303 项通过。虚拟机 CI `vm-ci 1794546876443`（affected，含 cli-default、composer、session、settings 四个 E2E）通过。
- 独立评审：未参与实现的 Review Agent 检查 IPC 校验、Key 去向、保存后的配置完整性与详情页逻辑，无阻断项。
- 界面检查（虚拟机，模拟 Provider；连接测试经 `{{codex_api_base_url}}` 与 Key 请求真实网关）：未保存时用错误 Key 测试显示 401 失败；换正确 Key 未保存测试通过，并提示尚未保存；保存后显示“已保存”“已安全保存”；返回列表再打开，Key 输入框有内容且为遮盖状态，“显示 / 隐藏”切换明文与遮盖；改成无效地址后不重填 Key 即可测试并显示失败，改回原地址测试通过、状态回到“已保存”。截图含网关地址，未入库。
- 文档：settings spec 第 3、4、6 条，DEC-27，`scripts/README.md` 中“不回显 Key”的说明。`specs/agent-adapter/spec.md` 写的是 Adapter 收到的快照在主进程解密，仍然成立，未改。
- 收尾日期 2026-11-13。人工功能验收待用户在 dev 体验。

## 后续项

- 非阻断（评审）：Key 读取较慢时，用户先输入新 Key 并保存，读取结果返回后会把已保存 Key 记成旧值，页面误显示“未保存”。修法：`setSavedKey(current => current ?? key)`，已有值时不再读取。
- 非阻断（评审，原有）：Codex 地址不含 `/v1` 或大小写不同时，保存后仍显示“未保存”。

