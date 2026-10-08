# D20261009 Project Knowledge 存储格式与位置

## 文档信息

| 项目 | 内容 |
|---|---|
| 文档状态 | 草稿 |
| 日期 | 2026-10-09 |
| 关联 | FR-VIEW-001、FR-VIEW-002（P1）、FR-VIEW-003、FR-VIEW-004；FR-TOOL-002；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2、5 节与第 7 节第 1、2 项；[T20261009-project-view](../../tasks/T20261009-project-view/task.md) |
| 取代 | — |

> 文档状态取值：`草稿` / `已确认（YYYY-MM-DD）` / `已废弃（被 Dxxx 取代）`。本草稿未经人确认，不得作为实现依据。

## 背景

04 第 2 节把 Project Knowledge 的技术基线定为“JSON / Markdown + Schema 校验”，并要求与 View Definition 分离；第 5 节只列出 Project Knowledge 至少要支持结构化数据、AI 更新、用户更新、View Rendering 和后续自定义 View，具体 Schema 留给技术设计。第 7 节第 1、2 项要求落定存储格式，以及是否放在 Project 内部的隐藏目录。

约束来自：

- FR-VIEW-004：事实信息写在数据里，视觉表达写在 View 里；HTML 不能是知识的唯一来源。
- 产品原则 19、20 与 FR-VIEW-006：不自研 Agent 框架，Project View 里的对话是普通 CLI Session。Agent 因此只能用 CLI 自带的文件工具更新知识，客户端不提供专用的知识写入工具。
- FR-SESSION-003：同一 Project 的多个 Session 共享同一目录并可并行运行，可能同时修改知识。
- FR-TOOL-002 / UX D-08：Diff 显示 Project 目录相对 Git HEAD 的全部未提交变更，含未跟踪文件。
- FR-VIEW-003：Knowledge 尚未生成时，Preview 显示空状态，不自动生成。

本机验证（详见 [research.md](../../tasks/T20261009-project-view/research.md) 第 2 节 V1～V4）：

- Codex 0.161.0 在 `:workspace` 沙箱下，项目根的 `.git`、`.codex`、`.agents` 不可写，`.claude` 与普通自建目录可写，项目目录之外不可写；`:read-only` 下项目内全部不可写。
- Claude Code 把 `.git`、`.claude`、`.vscode`、`.idea`、`.husky` 等列为受保护路径，acceptEdits 模式下写入仍需逐次确认（官方文档）；工作目录之外读取需要确认或额外目录授权。

## 决定

1. **位置**：Knowledge 与 View Definition 放在 Project 根下的隐藏目录 `<Project>/.ai-studio/`。目录名不得使用被 CLI 保护或占用的名称（`.claude`、`.codex`、`.agents`、`.git`、`.vscode`、`.idea`、`.husky`）。目录名 `.ai-studio` 待人确认。
2. **目录结构与写入者**：

   | 路径 | 内容 | 写入者 |
   |---|---|---|
   | `knowledge/<view-id>.json` | Project Knowledge（事实） | Agent（经 CLI 文件工具）或用户手工编辑 |
   | `views/<view-id>.view.json` | View Definition（呈现），可选；缺失时使用应用内置默认 | 同上 |
   | `schema/*.schema.json`、`README.md` | 随应用版本发布的 JSON Schema 与 Agent 编写指南，仅供 Agent 阅读 | 客户端（幂等写入，版本不一致时覆盖） |
   | `.gitignore`（内容为 `*`） | 使整个目录默认不进入 Git | 客户端 |

   客户端不修改 `knowledge/` 与 `views/` 下的文件（不格式化、不迁移、不自动修复）。客户端校验永远使用应用内置的 Schema，不信任项目内 `schema/` 副本。
3. **格式**：UTF-8 JSON，2 空格缩进、末尾换行，便于逐行 diff 与 Agent 局部编辑。每个文件带 `schemaVersion`（整数）与 `kind`。Schema 以 JSON Schema 发布，实现上可由 TypeScript 类型或 Zod 生成以保持单一来源。不使用 YAML 或带注释的 JSON；Markdown 只作为字符串字段承载短文本，长文档继续放在仓库既有文档中，Knowledge 用 `refs`（项目内相对路径）引用。
4. **文件粒度**：一个 View 一份 Knowledge 文件。默认五项的 `view-id` 固定为 `overview`、`progress`、`architecture`、`agent-team`、`business-flow`。事实只存一处：Overview 中的 Architecture Summary、Agent Summary 由其 View Definition 绑定 `architecture`、`agent-team` 的字段，不在 `overview.json` 里复制。一个 View Definition 可以绑定多份 Knowledge。
5. **事实与展示的判据**（写入 Agent 指南）：去掉所有样式、位置、图表类型后仍然成立的内容是事实（模块与依赖、里程碑状态、Agent 职责、业务步骤与代码映射），写入 Knowledge；与“怎么摆、画成什么”有关的内容（分组、排序、方向、图表种类、强调变体、折叠状态）写入 View Definition。Knowledge 中不出现坐标、颜色、组件类型。
6. **Agent Team 的特殊性**：`agent-team.json` 只是对 CLI 原生配置（AGENTS.md、Skill、Rule、Agent 文件等）的描述与引用，路径指回原文件，不构成客户端自有的 Agent Profile 标准（[02. Functional Requirements](<../02. Functional Requirements.md>) 第 3 节 Agent Team；原则 19）。
7. **自定义 View（FR-VIEW-002，P1）**：新增 `knowledge/<id>.json`（`kind: "custom"`，`data` 为自由结构，仅限制大小与嵌套深度）和必需的 `views/<id>.view.json`（声明 `title`、`order`，用 JSON Pointer 绑定 `data`）。不设索引文件：View 列表 = 内置五项 + 扫描 `views/*.view.json`，避免多个 Session 争写同一份索引。V1 P0 不实现创建入口，Schema 预留 `kind: "custom"`。
8. **默认不进 Git**：`.ai-studio/.gitignore` 使整个目录被忽略，因此知识更新不会出现在 Diff 和“本轮修改 N 个文件”里，也不会被 `git clean` 默认清掉，无需为 FR-TOOL-002 增加例外规则。需要团队共享时，由用户删除该 `.gitignore` 后自行提交。这个默认值需要人确认。
9. **缓存**：最近一次通过校验的 JSON 与接受时间保存在应用的 SQLite 中，仅用于渲染失败时保留上一版（UX D-06）和重启后的首屏，不是事实来源。
10. **文件格式示意**（非最终 Schema）。`.ai-studio/knowledge/architecture.json`：

    ```json
    { "schemaVersion": 1, "kind": "architecture", "example": false,
      "summary": "…",
      "nodes": [ { "id": "billing", "name": "Billing Service", "type": "service",
                   "description": "…", "refs": [ { "path": "services/billing" } ] } ],
      "edges": [ { "from": "web", "to": "billing", "label": "REST" } ] }
    ```

    `.ai-studio/views/architecture.view.json`（覆盖应用内置默认，可选）：

    ```json
    { "schemaVersion": 1, "kind": "view", "view": "architecture",
      "knowledge": [ "architecture" ],
      "root": { "type": "stack", "children": [
        { "type": "text", "bind": "architecture:/summary" },
        { "type": "graph", "nodes": "architecture:/nodes", "edges": "architecture:/edges", "groupBy": "type" } ] } }
    ```

## 备选方案

| 方案 | 放弃原因 |
|---|---|
| 所有知识合并为单个文档（如 `project-knowledge.json`） | 并行 Session 写同一文件的冲突概率最高；Agent 每次都要读入全量内容；Overview 与其他 View 的事实容易互相复制 |
| YAML | 手写友好，但隐式类型转换、锚点与别名带来解析陷阱，且与 04 第 2 节基线“JSON / Markdown”不一致 |
| Markdown + frontmatter（每个 View 一篇） | 叙述类内容友好，但关系图、表格、里程碑等结构化数据需要嵌入代码块，Schema 校验与绑定困难；长文档用 `refs` 引用既有文档即可 |
| 把知识存入 SQLite | Agent 无法用文件工具直接更新，必须自研读写工具，违背原则 19、20 与 FR-VIEW-006 |
| 存放在应用数据目录（如 `~/Library/Application Support/…`） | Codex `:workspace` 下项目外不可写（V1），需要为每个 Session 追加可写根（Codex `sandboxPolicy.workspaceWrite.writableRoots`、Claude `additionalDirectories`），扩大用户 Session 的权限边界，Claude 的 `--add-dir` 还会加载该目录的 Skill 与命令；用户在应用之外运行 CLI 时无法更新；知识不随项目目录移动与备份。仅保留为缓存位置 |
| 放在 `.claude/`、`.codex/`、`.agents/` 之下 | 属于 CLI 保护路径（V1～V3）：Codex 只读，Claude 每次写入都要确认 |
| 项目内可见目录（如 `docs/project-knowledge/`） | 利于团队共享，但侵入用户仓库的可见结构；共享需求可由用户删除 `.gitignore` 满足 |
| 默认纳入 Git 跟踪 | 每次知识更新都进入 Diff 与“修改文件数”，多个 Session 并行产生合并冲突，AI 生成内容容易被误提交到共享仓库 |
| 通过 `.git/info/exclude` 忽略 | 需要写 `.git/`，在 worktree、子模块下路径处理复杂；自带 `.gitignore` 更简单且随目录移动 |
| 让客户端写入 Knowledge（迁移、格式化、修复） | 与 Agent 并发写同一文件会互相覆盖；V1 的 Preview 只读，修改通过对话完成（UX 第 6 节） |

## 影响

- 04 第 5 节的 `ProjectView.knowledge_source` 指向 `.ai-studio/knowledge/<id>.json`，`view_definition` 指向 `.ai-studio/views/<id>.view.json` 或应用内置默认。
- CLI Adapter 不需要追加可写目录或 additional directories（见 [D20261009-project-view-context](D20261009-project-view-context.md)）。
- Diff 与“本轮修改文件数”在默认配置下不受知识更新影响；用户删除 `.gitignore` 后会出现，这是用户自己的选择。
- Files 工具是否显示隐藏目录由 T20261009-context-tools 决定。
- 用户在 Codex `:read-only` 沙箱或要求逐次确认的模式下运行 Session 时，Agent 写知识要走 CLI 原生授权流程（Needs Input）；客户端不放宽用户的权限设置。
- 需要新增 SQLite 缓存表（T20261009-app-skeleton）、JSON Schema 与 Agent 指南（后续 `specs/project-view/spec.md`）。
- 并发写同一文件的冲突检测仍由 04 第 7 节第 7 项统一处理；本决定只通过“每个 View 一个文件”缩小冲突面，不引入锁。

## 未决问题

| 问题 | 推荐 |
|---|---|
| 目录名是否为 `.ai-studio` | 是；避开受保护名称，并与产品名对应 |
| 默认不进 Git（自带 `.gitignore`）还是默认跟踪 | 默认不进 Git；团队共享不在 V1 目标内（01 第 4 节），需要时用户删除 `.gitignore` |
| `example`（“示例数据”标注，见 Shell Spec v01 第 7 节）何时为真 | 作为数据属性，缺省为 `false`；Agent 只在知识并非来自真实项目（占位内容）时置为 `true`。文档未定义何时算示例数据，请人确认 |
| 单个文件大小与节点数上限 | 暂定 256 KB、500 个节点，超过则校验失败；需用真实项目与渲染性能原型校准 |
| `.ai-studio/` 的客户端自有文件由谁、何时写入 | 在用户发送带 View Context 的第一条消息之前由客户端写入；进入 View 本身不写文件（FR-VIEW-007）。见 [D20261009-project-view-context](D20261009-project-view-context.md) |

## 依据

- 需求：FR-VIEW-001～004、FR-VIEW-006、FR-SESSION-003、FR-TOOL-002；[01. Product Definition](<../01. Product Definition.md>) 第 7 节与第 8 节原则 13、14、19、20；[03. UX Specification](<../03. UX Specification.md>) 第 6 节“Project View 空状态与更新”、D-06、D-08；[04. Technical Requirements](<../04. Technical Requirements.md>) 第 2、3、5、7 节。
- 本机验证：[W1-view-probes-results.json](../../tasks/T20261009-project-view/evidence/W1-view-probes-results.json)（Codex 0.161.0 沙箱写入探测）；调研记录 [research.md](../../tasks/T20261009-project-view/research.md) 第 2、3.1 节。
- 官方文档：[Codex Agent approvals & security（受保护路径）](https://learn.chatgpt.com/docs/agent-approvals-security)；[Claude Code permission modes（Protected paths）](https://code.claude.com/docs/en/permission-modes#protected-paths)；[Claude Code permissions（Working directories）](https://code.claude.com/docs/en/permissions#working-directories)。
- 原型：`design/prototypes/studio-prototype-v01/render.js` 的 Knowledge 对象仅作示意，不构成需求。
