# 最小回归实施与复核

| 执行者 | 职责与写入范围 | 依赖 |
|---|---|---|
| Main Agent | 选择器、测试、scripts 与桌面说明、任务记录 | 自检后交独立评审 |
| `regression_review` | 只读实现，独立运行定向脚本与清单检查；仅写 acceptance.md 和 W1 证据 | 未参与产品或脚本实现 |

## 进度

- Main 完成首版和 75 项定向自检后安排独立评审。
- 评审发现共享 tools.css 不应漏掉 Terminal/Browser 界面，以及单测和 Diff 改动不应扩大另一项 CSP 变动的 E2E 范围。Main 已补相应映射和混合改动回归，等待独立复验。
- 主目录 dev 期间新增了 worktree 集成命令。任务分支先提交，随后 rebase dev，保留新命令映射并补其子进程测试边界。
