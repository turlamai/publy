# Publy

不绑定写作软件的 Markdown → 微信公众号草稿工具：本地检查与排版、Obsidian 集成、自托管草稿投递。公开托管订阅与普通用户独立安装器尚未交付。

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE) ![status](https://img.shields.io/badge/status-pipeline%20implemented-blue)

[English](README.md) · **中文**

- **继续使用 Typora 或 Obsidian 写作。** 用原始文件做 `publy check a.md` 检查图片与封面，再决定是否预览和投递草稿。当前 CLI 仍是开发者源码构建版本。
- **图片消息是一等公民。** `publy card post.md` 确定性渲染主题化 3:4 卡片——像素级正确的汉字，秒级出图，不靠 AI 生图。
- **无需 npm 主题发布。** 内置主题可离线使用；CLI 开发版支持创建、添加、预览、更新和删除纯内容文章主题包，HTTPS 下载必须提供 SHA-256。Obsidian 可选择通过校验的本地主题；目前没有签名主题或主题广场，详见[使用指南](docs/USER-GUIDE.zh-CN.md#使用独立文章主题cli-开发版)。
- **开源核心，不做锁定。** CLI 与自托管 server 开源（AGPL-3.0），与云服务同一协议。未来托管服务的价值是：IP 白名单稳定出口、AppSecret 托管、token 生命周期、定时、多账号。

合规：只走微信公众号官方 API，不做账号模拟，不做浏览器自动化。

状态：本地渲染与投递组件已存在；公开托管开通与商业运营尚未开放。

**一个文件、两种重点写作入口：** [Typora 使用指南](docs/typora.zh-CN.md) · [跨编辑器使用与商业级验收](docs/editor-workflows.zh-CN.md) · [English](docs/editor-workflows.md)。普通 Markdown 仍由共用引擎读取，但不开发其他编辑器插件；还需真实干净电脑验收。

## 开始使用

CLI、默认主题、Obsidian 和自托管按现行许可证保持免费。公开托管订阅尚未开放，不销售无限量套餐。 目前可使用开发版 CLI 或 Obsidian 插件。当前发布附件包含 Obsidian 插件。服务端需要稳定出口 IP，以及公众号实际具备的官方 API 权限。

[安装、首次使用、隐私与备份恢复](docs/USER-GUIDE.zh-CN.md) · [English](docs/USER-GUIDE.md)

## 三分钟上手

```bash
publy config set server https://your-server.example
publy config set api_key "$PUBLY_API_KEY"   # POSIX shell：先设置此环境变量
publy account add me --app-id wx... --theme claude
publy check article.md
publy preview article.md     # 仅本地预览，不创建草稿
publy publish article.md --account me  # 明确授权后才执行：只创建公众号草稿，不群发
```

PowerShell 请将 `"$PUBLY_API_KEY"` 换成 `"$env:PUBLY_API_KEY"`。CLI 会通过命令行参数接收密钥，可能被本机进程查看；不要把真实凭据粘贴到共享日志中。

图片消息：frontmatter 写 `mode: cards`，正文按 `## cover` / `## point` / `## list` / `## ending` 分节，`publy card post.md --preview` 出拼版预览，`publy publish post.md --account me` 投递到草稿箱（需先确认账号与授权）。

完整手册：[English manual](docs/guide.md) · [中文手册](docs/guide.zh-CN.md) · 主题画廊：[themes.publy.jrtx.site](https://themes.publy.jrtx.site/)

设计文档：

- [docs/design.md](docs/design.md) — 产品设计：定位、形态、CLI 契约、图片消息管线、主题机制、架构
- [docs/business.md](docs/business.md) — 开源边界、定价、GTM
- [docs/roadmap.md](docs/roadmap.md) — 当前交付与商业门禁

## License

AGPL-3.0
