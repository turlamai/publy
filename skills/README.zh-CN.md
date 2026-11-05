# Publy Agent 技能

[English](README.md)

[`publy-publish/SKILL.md`](publy-publish/SKILL.md) 是供支持该技能格式的 Agent 使用的通用说明。它调用 Publy CLI，读取 Markdown 文件；Obsidian 和 Typora 都不是前提。技能本身不会安装 Publy、添加账号或授予创建草稿的权限。

请先按当前[使用指南](../docs/USER-GUIDE.zh-CN.md)单独安装 Publy CLI。使用 Codex 时，可将 `publy-publish` 文件夹复制到 `~/.codex/skills/`，必要时重启或重新加载技能。其他 Agent 请按其文档确认是否支持 `SKILL.md` 以及放置位置；若不支持技能，但支持用户提供工作流说明，可将该文件作为说明提供。不要假设所有 Agent 都能自动发现此目录。使用可选功能前，以已安装版本的 `publy capabilities --json` 为准。

你可以让 Agent 预览指定 Markdown 文件，或明确授权它将该文件投递到指定公众号的草稿箱。此技能不会授权公开发布。原文件保留在原处；本地生成的预览供审阅，用完可删除。
