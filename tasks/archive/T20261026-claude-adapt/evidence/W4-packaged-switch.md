# W4 打包边界复核

- 基线：`e85d64f420ba14c322995321a81c98112fc3c0bf`，arm64 未签名包由本轮 `pnpm package` 生成。
- 命令：`pnpm --filter @ai-studio/desktop smoke:packaged`，退出码 0。
- 结果：打包应用通过原生依赖、Terminal 屏幕、CLI executable 探测和 Renderer / Preload 冒烟；Claude 2.1.311、Codex 0.164.0 均被发现。报告见 [W4 packaged smoke](W4-packaged-smoke.log)。
- 代码边界：`apps/desktop/src/main/index.ts` 仅在 `!app.isPackaged && STUDIO_ENABLE_CLAUDE_CODE=1` 时构造 `extraProviders`；打包应用即使继承该环境变量也不会注册 Claude。生产 Provider 列表仍由 DEC-19 约束为 Codex。
- 未覆盖：本轮未完成稳定的打包应用 UI Provider 菜单操作。Playwright 启动打包 bundle 时在 `app.evaluate` 等待目录 picker 的测试 launcher 超时；之后使用 `/usr/bin/open` 直接启动并连接 agent-browser 验证了 Renderer 启动，但在切换目标时无法保持目录 fixture，未把该路径记为 UI 通过。未修改用户配置。
