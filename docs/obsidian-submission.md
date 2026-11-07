# Publy — Obsidian Community Directory 发布与审核（当前流程）

> 当前状态（2026-10-30）：官方公开 `community-plugins.json` 未列出 `publy`。这只能说明**尚未公开上架**，不能从公开 API 推断“没提交／审核中／被拒”。开发者后台的私有审核结果需要登录后查看。本文件是发布检查表，不是通过审核的证明。

[English user guide](USER-GUIDE.md) · [中文使用指南](USER-GUIDE.zh-CN.md)

## 1. 当前发布阻塞与已关闭安全项

- [#12](https://github.com/turlamai/publy/issues/12)：标准社区安装只获取 Release 的 `main.js`、`manifest.json`、`styles.css`。开发分支已将卡片/WASM/字体及 MathJax 嵌入 `main.js`，三平台自动 smoke 负责验证闭包；这不是已发布资产或真实桌面证据。**ZIP 侧载通过不等于社区目录安装通过**。必须先完成只用三个文件的干净库实机验收。
- 已关闭的安全项 [#13](https://github.com/turlamai/publy/issues/13)：原生 HTML 预览安全边界经 [#24](https://github.com/turlamai/publy/pull/24)、[#41](https://github.com/turlamai/publy/pull/41) 和 [#43](https://github.com/turlamai/publy/pull/43) 加固；真实桌面验收仍由 #15 跟踪。
- [#14](https://github.com/turlamai/publy/issues/14)：仓库主线源码现为 `0.8.7`，但最后一个公开插件 Release 为 `0.8.3`。统一的根/子目录清单只表示源码元数据一致；**还需要从已审查 SHA 创建相同版本的 Release** 才能提审。
- [#15](https://github.com/turlamai/publy/issues/15)：需要增补真实 Obsidian 桌面安装/交互测试；现有 Node stub 不是原生测试。

不要为了让扫描“变绿”而删除卡片/安全功能，或把已经存在的旧 Release 资产冒充新版本。公开托管尚未开卖（[定价与权益](../PRICING.md)、[运行门禁](https://github.com/turlamai/publy/issues/8)）。

## 2. 官方当前入口（不要再提交旧式目录 PR）

- 开发者目录：<https://community.obsidian.md/>
- 官方[提交指南](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- 官方[插件要求](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)
- 官方[开发者政策](https://docs.obsidian.md/community-directory/developer-policies)
- 官方[检查／重新审核](https://docs.obsidian.md/community-directory/manage-entry)
- 官方[常见问题与付费分类](https://docs.obsidian.md/community-directory/faq)
- 只读公开[插件目录镜像](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json)

旧的 Fork + PR 更新 `community-plugins.json` 流程已废弃。初次登记应使用社区目录中的开发者账户和插件提交入口，连接 GitHub 仓库 `https://github.com/turlamai/publy`；后续版本通过 GitHub Release 更新。

## 3. 发布前的机器可验证门禁

1. `pnpm install --frozen-lockfile && pnpm -r build && pnpm -r test`；执行 `node scripts/check-plugin-metadata.mjs` 和 `node scripts/verify-plugin.mjs`。后者模拟 Obsidian API，不能替代桌面测试。正式发行前还必须执行 `node scripts/verify-plugin.mjs --community-only`（只复制 main.js、manifest.json、styles.css，严格拒绝任何额外 node_modules/ 和 fonts/）；Actions 的 **Obsidian Community Directory three-file gate** 在每次 PR/main 推送时验证 Windows/macOS/Linux，也可手动运行。它拒绝外部网络及运行时包加载，并检查真实公式 PNG、卡片和重新加载；该脚本仍只模拟 Obsidian，成功后也必须通过真实桌面库验收。
2. 确认仓库根 `manifest.json` 与 `packages/obsidian-plugin/manifest.json` 完全一致；根/子 `versions.json` 一致，`packages/obsidian-plugin/package.json` 版本匹配。当前源码的 `0.8.7` **不是**已发布版本。
3. 从审核通过的确切 commit SHA 构建；以相同版本号创建 Git tag 和 GitHub Release，上传构建产物 `main.js`、`manifest.json`、`styles.css`。确保 Release assets 实际与本次构建内容一致，并记录校验和；不要使用旧 Release 附件。
4. **重要**：在干净的真实 Obsidian 桌面库中，仅复制社区安装会取得的三个文件，禁止额外字体、模块或 ZIP；重启后验证离线预览、富文本复制、图片卡片、数学公式、加载/卸载、更新和错误提示，覆盖实际支持的操作系统。当前这一步尚未通过（#12）。
5. 审查无动态广告、客户端遥测、自更新/自装依赖、不透明混淆；根目录 `README.md` 和 `LICENSE` 可访问；`isDesktopOnly: true` 与 Node/Electron 使用相符；命令 ID 不自带插件 ID 前缀；无样例模板遗留。
6. 用户可见文档明确披露：本地预览无需账户；草稿投递需要用户自己的服务端、网络、公众号/API 权限与 key；可能涉及库外文件；默认商业托管当前不可购买。真实付款开通前按实际功能选择目录的 `Optional payment`（若通过可选付费托管扩展能力），不能把付费服务包装成永久免费。根据后台官方分类解释确认最终标签。
7. 预备插件图标、简短描述、截图及非敏感的测试说明；不要把 AppSecret、API key、实际用户文章和日志交给审核。

## 4. 有权登录的开发者最后操作

1. 登录 <https://community.obsidian.md/>，检查 **Your entries** 是否已有 `publy`。若存在，打开扫描报告，逐项记录 Manifest、Releases、Source code、Build verification 的 Error/Warning；若不存在，按官方入口提交插件，不再打开 `obsidian-releases` PR。
2. 先用 **Review branch / Run preview scan** 验证源分支；阻塞项修完并发布 GitHub Release 后，使用 **Request review** 或 **Check for new releases**。
3. 看到后台报告全部满足要求仍不等于公开上架。必须在[公开目录](https://community.obsidian.md/plugins)和 Obsidian 应用内搜索到 Publy，并从头安装/更新验证，才能在 #14 留存公开链接、版本、日期、截图和通过结论。

## 5. 如需给审核者提供的准确概述

> Publy previews Markdown articles and image-post cards for WeChat Official Accounts. Local preview and rich-text copy do not require a hosted account. Optional delivery uses the user's configured Publy server and official WeChat APIs to create **drafts**, not to automatically mass-send or publicly post articles. The Obsidian plugin is desktop-only; hosted commercial subscriptions are not yet offered.

不要声称官方目录已通过、付费已经开放，或特定安全测试已完成。
