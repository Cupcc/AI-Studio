# 调研记录

- 需求来源：用户 2026-10-19 提出 Thinking Effort 布局不佳、New Chat 输入区居中与回复时不统一，要求参考 Codex / Claude Desktop 并落到 design。
- 仓库基线：`d2a3f59`；检查实际 Composer、Conversation 与 CSS，结合 Shell Spec v02、input / chat / session 规格。
- 公开资料：来源、截图与版本边界统一见[参考索引](../../../design/references/README.md#3-2026-10-19-桌面布局参考)。
- 结论：问题分级、推荐方案与未决产品问题统一见[评审稿](../../../design/layout-ux-review-v01.md)。

## 调研修正

初稿曾从产品定位推断两款参考产品均使用底部 New Chat Composer；查看 Claude 官方图片后，该推断不成立，已删除。统一贴底作为本产品的工作流取舍提出。也删除了“选择 effort 会改变高度”的无证据表述，保留实际可证实的框外独立行问题。

Codex 原文档入口已重定向，公开图未覆盖完整输入区；未把文档示意图当成已安装客户端实测。OpenAI 产品介绍页在浏览器遇到访问校验，没有绕过，也未据此补造截图。
