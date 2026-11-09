# W1 Codex 文件输入映射独立评审

日期：2026-11-01。评审者：W1 `/root/attachment_review`。只读复核、独立运行现有测试；没有修改源码、操作窗口或发送模型请求。

## 原生依据

锁定 Codex `rust-v0.166.0`：

- [user_input.rs](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/user_input.rs) 定义 Text、image / local image、Skill 与 Mention；Mention 的目标示例为 app / plugin。
- [models.rs](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/protocol/src/models.rs#L2044-L2101) 将 Text 转成 InputText，将 Skill / Mention 在直接用户消息内容转换中转为空集合，工具内容由 core 另行注入。
- [protocol_v1.md](https://github.com/openai/codex/blob/rust-v0.166.0/codex-rs/docs/protocol_v1.md#userinput-items) 将 mention 描述为 app / connector 选择。

推论：现有任意本地路径的 file → Mention 映射缺少通用文件输入语义。使用受信任 path 的明确文本引用符合既有 Tools §4.1 降级契约；文本提供路径，实际内容读取与权限仍由 CLI 处理。

## 修复检查

| 检查 | 结论 |
|---|---|
| Codex file 序列化 | 独立 text item 说明本机路径、内容未内嵌；name / path 用 JSON.stringify，NEL / LS / PS 显式转义 |
| 身份 / 安全边界 | shared attachment 保留可信路径；Adapter 不重新解析为 shell 命令、不读内容、不改权限 |
| image / skill | 仍使用原有 localImage / skill 类型与原路径 |
| 普通 / Running | 两条 driver 路径继续调用同一个 nativeInput |
| 类型注释 / README | 不再将 file 说成 Codex 原生 mention 或笼统的原生附件 |
| 当前规格 | Adapter 拥有当前转换，Input / Tools 链接；旧真实结果明确为历史且未排除从 cwd 发现文件 |

没有发现新增阻塞。文本路径引用本身不证明 CLI 读取成功；最终真实验收须独立排除原文件与 Project 内副本，用缓存副本返回未写入 prompt 的 token。

## 独立测试

命令：`pnpm --filter @ai-studio/agent-adapter exec vitest run test/codex/provider.test.ts`

结果：**1 文件、66 项通过**，详见 [原始日志](W1-codex-file-mapping-regression.log)。本轮新增/修改场景覆盖：普通与 steer 相同映射、附件单独发送、多路径、默认名称、name / path 引号 / 换行 / NEL / LS / PS 的单行 JSON、image / skill 原生形态。

## 受评审指纹（SHA-256）

| 文件 | 指纹 |
|---|---|
| `packages/agent-adapter/src/codex/mapping.ts` | `7ce3640522f787f1df435cad9458003cdfb6873430b000ff9f10ec4e5bb66625` |
| `packages/agent-adapter/src/types.ts` | `f526097a9d93401088d218cdd84e218face4d33b81b207c1630acecfc8aa3d92` |
| `packages/agent-adapter/test/codex/provider.test.ts` | `980c07f106346c667fc1975c48fe4c9e1de5888231e1432da10b3f73e35754aa` |
