# Obsidian、CLI 与 Agent 工作流

[English](editor-workflows.md) · **简体中文**

经营者决策 `2026-11-23-operation-options`：Obsidian 是唯一推荐编辑器与插件体验；CLI 保持编辑器无关，官方 [Skill](../skills/publy-publish/SKILL.md) 调用 CLI。不再扩展 Typora 专属集成、验收项目或独立发布伴侣。唯一投递目的地仍是微信公众号草稿箱。

## 统一的本次操作参数

用 `--format article`、`--format image` 或 `--format cards` 明确选择文章、图片配文或文字卡片。检查、预览和投递使用完全相同的类型、标题、封面、主题、作者、摘要与配文参数。`publish` 必须显式指定类型与账号；本地检查和预览未指定时默认文章，不从笔记属性或图片数量推断。Skill 在意图不清楚时先询问用户。

插件提供三种类型选择和本次草稿投递窗口；可先预览，核对笔记、目标公众号和参数后明确确认投递。取消不创建草稿。插件复用相同的核心参数契约，不需要启动外部 CLI 程序。

Frontmatter 不再是 Publy 配置入口。开头的笔记属性区直接跳过，不解析 YAML，不导出为正文，也不复制进发布数据。原文不改写，属性区需正确闭合。参数和插件设置负责默认值；标题取明确参数、正文一级标题或文件名。图片配文默认取正文文字；卡片配文可写在第一个 `## cover/point/list/ending` 分节前，也可通过 `--caption-file` 指定。

```sh
publy check note.md --format article --title "草稿标题" --cover assets/cover.png --json
publy preview note.md --format article --title "草稿标题" --cover assets/cover.png --json
# 用户明确授权该文件与目标公众号后：
publy publish note.md --format article --title "草稿标题" --cover assets/cover.png --account me --json
```

## 文件与恢复

共享渲染器支持普通 Markdown 相对图片与 Obsidian 嵌入。图片从源文件目录与配置的资源目录解析，保留嵌套路径，不读取 frontmatter 中的资源根目录。缺图阻止投递；原 Markdown 与图片留在原处。

本地检查与预览不需账号，也不联网；投递需已配置的服务端、固定出口与公众号实际获准的官方 API 权限。结果未知时保留原请求标识与目标账号，先查询并核对草稿箱；没有收到回执不等于失败。

## 验收边界

验证三种类型、格式异常与私密属性、源文件字节不变、预览与请求一致、取消、错账号、缺图、延迟回执与原请求恢复。核心/CLI 与插件模拟验收不替代干净 Obsidian 安装实测。CLI 当前仍为源码构建，公开托管收款未开放。见[用户指南](USER-GUIDE.zh-CN.md)与[Agent 契约](agent-cli.zh-CN.md)。
