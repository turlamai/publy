# Publy 使用指南

[English](guide.md) · **简体中文**

> 面向使用者（人和 agent 皆可）的完整操作手册。Agent 优先阅读 [CLI 机器调用契约](agent-cli.zh-CN.md)，使用 `publy capabilities --json` 探测能力，不要解析人工输出；设计理念见 [design.md](design.md)，部署架构见仓库 roadmap。

## 它是什么

一条命令把 Markdown 变成排版好的微信公众号草稿：

```
markdown 文件 → publy CLI → publy-server（你的服务器）→ 微信官方 API → 公众号草稿箱
```

排版在本地完成（主题渲染），服务器只负责可靠地把内容送进微信。草稿投递不是公开发布或群发，需在微信后台核对。本流程仅使用公众号实际获准的 API 能力。支持两类内容：

- **文章**：标准图文消息，主题化排版
- **图片消息**：图片消息，图文分离（text）或卡片渲染（cards）两种模式

## 当前可用范围

公开托管尚未开放注册、购买或付款。请先使用本地渲染与自己的服务端，不向历史托管地址发送 API key 或 AppSecret。服务端默认关闭旧版 `/purchase`、`/order/:id`、`/lookup`、`/pay/xunhupay/notify` 路由，统一返回 `CHECKOUT_NOT_AVAILABLE`。旧版手工收款流程仅供进程内隔离模拟测试，服务端配置文件不能启用它。配置缺失的支付宝／虎皮椒渠道不再静默降级为手工收款。托管支付需按 [#17](https://github.com/turlamai/publy/issues/17) 接入 Commerce/Permit 并完成真实商户与授权验收。完整状态、隐私和恢复说明见 [USER-GUIDE.zh-CN.md](USER-GUIDE.zh-CN.md)。

## 准备工作

### 1. 一台有稳定 IP 的服务器

微信公众号 API 要求 IP 白名单，家用/办公网络的出口 IP 会变，所以发布动作必须由一台固定 IP 的机器完成。publy-server 就部署在这台机器上（见文末「自托管服务器」）。

### 2. 本机 CLI（开发期）

**Publy 不再通过 npm Registry 发布新的 CLI 包。** 当前尚未提供通过验收的独立安装包，普通用户不应按旧版 npm 命令安装。发行方式与 Racket 原生程序实验见 [无需 npm 的分发计划](distribution.md)。在独立程序完成前，开发者可从源码构建：

```bash
git clone https://github.com/turlamai/publy.git && cd publy
pnpm install --frozen-lockfile && pnpm -r build
# 把 publy 命令指向 packages/cli/dist/index.js（全局 bin 或 alias）
```

源码构建后的资源和依赖按实际构建产物提供；不得将开发环境构建成功当作干净电脑上的一键安装验收。

### 3. 配置客户端

全部通过命令完成，无需手编文件：

```bash
publy config set server https://your-server.example          # 服务器地址
publy config set api_key <你的APIkey>                     # 与服务器端一致
publy config set media_dirs "D:/Notes/0.asset/media"     # 附件目录，多个用逗号分隔
publy account add TuringLambdaAI --app-id wx... --author 吉人 --theme claude
publy account add 另一个号 --theme medium                  # 多账号逐个 add
publy account list
```

配置落盘在 `~/.publy/config.json`，落盘结构供排查参考：

```json
{
  "server": "https://your-server.example",
  "api_key": "...",
  "default_account": "TuringLambdaAI",
  "media_dirs": ["D:/Notes/0.asset/media"],
  "accounts": [
    { "name": "TuringLambdaAI", "app_id": "wx...", "author": "吉人", "theme": "claude" },
    { "name": "另一个号", "theme": "medium" }
  ]
}
```

`media_dirs` 是 Obsidian 附件目录：正文里的 `![[img.png]]` 会按这些目录递归解析，**源文件永不修改**。

### 4. 服务器端注册账号

在服务器上编辑 `/root/.publy/server.json`（权限 600）：

```json
{
  "port": 8081,
  "apiKey": "与客户端一致",
  "accounts": [{ "name": "TuringLambdaAI", "appId": "wx...", "appSecret": "..." }]
}
```

这个静态配置示例把 AppSecret 存在受限服务端配置中，不自动提供加密落盘。不要提交真实配置；使用托管绑定接口时，客户端可能短暂处理 AppSecret，不能承诺它永远不接触客户端。按你的服务进程管理方式重新加载配置。

## 发布文章

```bash
publy publish article.md --account TuringLambdaAI
```

就这一条。渲染（主题 + 代码高亮 + 链接转脚注 + Obsidian 语法）全部自动完成，产物进公众号草稿箱，**请在后台核对草稿并按账号实际权限发布或群发**；不能根据投递结果推断公开发布成功。

### frontmatter 字段

| 字段 | 作用 | 默认 |
|------|------|------|
| `title` | 文章标题 | 文件名 |
| `cover` | 封面图片路径 | 正文首图（都没有则报错） |
| `theme` | 排版主题 | 账号配置的 theme |
| `author` | 作者署名 | 账号配置的 author |
| `digest` | 摘要 | 空 |
| `type: image` | 图片消息（见下节） | 文章 |

命令行可覆盖：`--title`、`--cover`、`--account`、`--theme`、`--custom-theme <css路径>`（任意 CSS 即主题）、`--footer "文末文案"`、`--no-footnote`、`--at "2026-10-01 09:00"`（定时发布）。摘要（digest）不填时自动取正文首段前 120 字。

### 封面

服务端自动把封面中心裁切为公众号要求的 2.35:1。封面三种来源：frontmatter `cover` 字段、`--cover` 参数、正文首图。

### 从 Typora 或 Obsidian 检查后再发

Typora 原始 `.md` 文件和 Obsidian 的 Markdown 笔记都可以交给开发版
Publy；不必迁移编辑器，也不计划开发其他编辑器插件。嵌套图片目录和 Typora 本地
`typora-root-url` 均按原文解析；缺图不会静默替换成别的同名文件。

```bash
publy check "D:/Notes/article.md"         # 本地检查，不访问服务器
publy check "D:/Notes/article.md" --json  # 输出给 agent 的结构化问题清单
```

退出码：成功 0、文件输入错误 2、发布前检查不通过 4。该功能不修改源笔记、
不建立草稿。尚未提供经过跨平台验收的用户安装器，当前为源码构建工具。
设计与后续支持的编辑器见 [跨编辑器工作流](editor-workflows.zh-CN.md)。

**防止缺图草稿：** `publy check` 与 `publy publish` 都会检查缺失图片/
封面、无法渲染的公式/SVG、不能经公众号素材接口上传的外链图片或内嵌
data 图片。先将外链图片保存到原笔记的本地资源文件夹；本地 HTML 预览启用
CSP 阻止页面自动请求远程图片/脚本，内嵌本地图片仍可查看。没有封面也没有
正文图片的文章、没有素材的图片消息，都不得创建草稿。失败会以退出码 4
终止，发生在网络请求前；错误日志不打印带令牌的完整图片 URL。

**图片消息卡片预览：** 当源文件使用 `mode: cards` 时，
`publy preview post.md` 会调用**和正式投递相同的 PNG 卡片渲染引擎**，
输出包含每张 3:4 卡片和 caption 的本地 HTML，缺少卡片或文案超限
会在页面上明显提示。预览无须服务器、公众号账号或登录，并且
**只使用随程序打包的本地字体子集，不联网下载字体**。
本地子集不支持某个字形时明确报错（退出码 3），不偷偷联网。
它不会修改原文，也不会自动保存公众号草稿。真实 Typora/Obsidian
和干净安装验收仍未完成。

### 写作前先看效果

```bash
publy preview article.md     # 浏览器打开内嵌本地图片的排版预览
publy preview article.md --no-open --out preview.html  # 离线保存给审核/自动化
publy render article.md -o out.html   # 只要 HTML
```

### 发布图片消息

**text 模式（图文分离）**——图片即帖子图片，剩余文字即配文：

```markdown
---
title: 帖子标题
type: image
---

![[图1.png]]

![[图2.png]]

配文正文，第一行是钩子……
```

**cards 模式（卡片渲染）**——按节写，引擎确定性渲染 3:4 卡片，汉字像素级正确：

```markdown
---
title: 居家咖啡指南
mode: cards
theme: naive
caption: 配文（≤1000 字）
tags: [咖啡, 手冲]
---

## cover        # 封面卡：第一行大标题，其余行副标题
居家咖啡指南
入门手冲，从这四个参数开始

## point        # 内容卡：第一行是小标题，其余行是段落
水粉比 1:15
15 克粉配 225 克水……

## list         # 清单卡：每行一个要点，自动编号
- 研磨度：中细
- 水温：92°C

## ending       # 结尾互动卡
关注我
下期讲注水手法
```

规则：3–9 张卡（一节一张），cover 和 ending 必备，caption ≤1000 字——lint 不过拒绝发布（退出码 4）。`mode: cards` 本身即隐含 `type: image`，不必重复写。

先出图检查再发：

```bash
publy card post.md --preview    # 浏览器打开拼版预览（全部卡片 + 配文）
publy publish post.md --account TuringLambdaAI  # 核对账号后投递到草稿箱
```

## 主题

```bash
publy theme ls                  # 列出全部主题
publy theme preview claude      # 本地渲染样例文章，浏览器即看
```

| 主题 | 类型 | 风格 |
|------|------|------|
| claude | 文章 + 卡片 | 暖燕麦底、陶土色强调 |
| medium | 文章 | 近白底、绿色强调、1.85 行高 |
| naive | 卡片 | 纯白底、黑墨文字 |

在线画廊（真实渲染预览）：[themes.publy.jrtx.site](https://themes.publy.jrtx.site/)。

## 自托管服务器

```bash
git clone https://github.com/turlamai/publy.git /opt/publy && cd /opt/publy
pnpm install --frozen-lockfile && pnpm -r build
# 写 /root/.publy/server.json（见上），然后 systemd 托管：
# ExecStart=node /opt/publy/packages/server/dist/index.js
# Environment=PUBLY_SERVER_CONFIG=/root/.publy/server.json
```

源码提供以下机制，真实持久化与超时恢复仍需按 #7/#8 验收，不能据此承诺零重复或零丢失：access_token 缓存（两小时过期自动刷新、并发单飞）、素材去重（同图免重传）、幂等（同内容 10 分钟内重试不重复发布）、审计日志（`~/.publy/server-data/history.jsonl`，客户端 `publy history` 直读）、定时任务（`--at`，jobs.json 持久化；投递开始后的未知结果不自动重试）、webhook（账号配置 `"webhook": "https://..."` 即推送 publish/failed 事件）。

安全建议：API key 用 24+ 字节随机值（`node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`）；任何跨机访问应使用 HTTPS 或私有隧道；可在服务器前挂 Caddy 提供 HTTPS（Caddyfile 两行：域名 + `reverse_proxy localhost:8081`）。

更新版本：

```bash
cd /opt/publy && git pull && pnpm install --frozen-lockfile && pnpm -r build && systemctl restart publy-server
```

## 查发布记录与定时任务

```bash
publy history            # 服务器审计日志（谁、何时、发了什么、mediaId）
publy jobs list          # 定时任务
publy jobs cancel <id>   # 取消未执行的定时任务
publy jobs retry <id>    # 仅能重试已证明在投递前失败的任务；中断任务仅对账已确认记录
```

**服务端冲突保护：** 如果客户端将同一个请求键用于不同公众号、
标题、正文、图片字节、封面或排程，服务端返回
`409 IDEMPOTENCY_CONFLICT`，不会拿旧草稿冒充新草稿成功。
先核对原请求结果，再对确实变更的内容生成独立请求键。
历史记录没有完整指纹时，只能核对旧记录中保存的账号、标题与类型；
新记录会保存完整指纹，仍不意味着微信公众号端到端恰好一次。

**请求身份：** Typora CLI 与 Obsidian 共用同一规则：计算完整草稿内容
（包括目标公众号、正文 HTML、每张图片的实际字节、封面、定时参数）
的哈希。标题相同、长度相同但内容不同，或者文件名不变图片实际已更新，
不应再误判为同一份草稿。原样重试应保持同一个请求键。但请求键**并不等于**
真正端到端恰好一次：微信公众号已建草稿而本地服务未落盘的故障仍可能导致
结果未知，必须查询原请求、人工核对草稿，而不是盲目重新发布。

超时恢复：发布命令网络中断时退出码 5，并打印本次的幂等键。先查询并检查微信草稿箱，不要直接重发：

```bash
publy publish-result <幂等键>   # confirmed = 草稿已建；unknown = 先检查公众号草稿箱
```

## 故障排查

| 现象 | 原因与处理 |
|------|-----------|
| 退出码 2 | 文件或封面路径不存在 |
| 退出码 3 | 渲染失败，看输出的 warn（多半是图片找不到：检查 media_dirs） |
| 退出码 4 | 图片消息 lint 未过：按提示补 cover/ending 节、压 caption |
| 退出码 5 + `WECHAT_40001` | AppSecret 不对或被重置，改服务器端 server.json |
| 退出码 5 + `WECHAT_45166` | 图片消息内容超微信长度限制，精简 |
| 连接拒绝 | 服务端 `systemctl status publy-server`，检查安全组/防火墙端口放行 |
| 退出码 5 + outcome UNKNOWN | 网络中断，草稿可能已建：先 `publy publish-result <键>` 查询，并检查公众号草稿箱，再决定是否重新提交 |
| 卡片出现乱码方块 | 生僻字/emoji 超出内置 GB2312 子集：`--font-file` 指定全量字体（首次自动下载） |

## 设计边界（为什么没有这些）

- **不自动群发**：官方 API 到草稿为止，群发按钮留给人——这是合规红线，也不做账号模拟
- **没有 GUI**：预览即 HTML/卡片拼版；编辑器内预览由 Obsidian 插件承担（开发中）
- **不做图床**：图片随文章仓库走，发布时经微信素材接口上传
