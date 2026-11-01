# Publy 产品设计

> 当前决策：2026-10-23 interaction review。本文件负责产品形态与交互，商业权益以 `PRICING.md` / `PRICING.zh-CN.md` 为准，实际可用性以用户指南和发行/运营证据为准。下述当前范围优先于早期设想；旧里程碑勾选不是公开上线证明。

## Editor-independent commercial product decision / 跨编辑器商业产品决定 — 2026-10-30

**The editor is a source, not the product.** Obsidian is one integration,
while Typora and Obsidian must enter the same render/check/review/draft
workflow without requiring users to migrate their source files.
Source files and image folders stay in place. A future optional small
cross-platform *publishing companion* can make open/drag-and-drop,
preflight, accurate preview, formatted-copy and explicit draft delivery
accessible without a terminal or npm; it must **not** become a second editor
or library database. A good-looking plugin does not make the overall product
commercial-grade if first-time installs, local media and recovery are broken.
Keep source-agnostic rendering, preview, warnings, signed/offline
distribution, accessibility, crash/retry and real WeChat draft outcomes as
shared acceptance criteria. This refines rather than replaces the
2026-10-23 write-in-existing-editor / no-new-editor decision. See
[English workflows](editor-workflows.md) and
[中文工作流](editor-workflows.zh-CN.md).

**编辑器是内容来源，不是我们的收费产品。** Obsidian 只是一个接入口；
Typora 与 Obsidian 应当走同一条检查、预览、复制和
草稿投递路径；普通 Markdown 文件仍由共用引擎处理。源文件与图片留在原位置。未来可用小型跨平台
发布伴侣提供打开/拖拽、发布前检查、预览与确认，不再造编辑器或数据库。
真正商业级的门槛是安装、缺图提示、预览一致性、无障碍、恢复与可验证的
草稿回执，而不是支持的插件数量或界面截图。

## Destination scope decision / 发布目的地范围决定 — 2026-10-30

Publy has **one publishing destination, WeChat Official Account drafts**.
Typora and Obsidian are its two focus editor experiences. Other Markdown
files may be readable, but no additional editor plugins are planned.
**Zhihu, Toutiao, WordPress, Ghost, Xiaohongshu, Douyin and all other
publishing destinations are explicitly excluded**, not research candidates.
Do not build a provider framework or mass-posting UI. Normative scope:
[English](platform-strategy.md) · [中文](platform-strategy.zh-CN.md).

Publy 以**微信公众号草稿为唯一当前正式输出**。兼容 Typora、Obsidian
等多种 Markdown **输入**，不等于做所有平台的**发布**。
知乎、今日头条、WordPress、Ghost、小红书、抖音等发布目的地
全部排除，不保留调研或条件接入计划；不预建平台适配器框架。完整决定见上方中英文文档。

## Current scope and interaction decision / 当前范围与交互决定

The primary task is **write in the existing editor → local preview/copy → explicitly deliver to the selected WeChat account's drafts → inspect the result**. The CLI and Obsidian plugin are both clients; neither an additional desktop editor nor a theme marketplace is required for this loop. Local rendering/copy and the self-host path remain free under the existing licence. Public hosted service is not yet open for sale.

主任务是**在既有编辑器写作 → 本地预览/复制 → 明确投递至选定公众号草稿箱 → 查看结果**。CLI 与 Obsidian 插件都是客户端，不要求先做新桌面编辑器或主题交易市场。本地渲染/复制、自托管继续按现行许可免费，公开托管尚未开售。

Before a remote submission show the note/title, destination account and the actual draft-only operation. Preview must not mutate the source or submit remotely. Rich-text copy must disclose local-image limitations. Public sending, mass sending and scheduling are distinct capabilities, not synonyms for creating a draft; only expose a capability after it has its own permission, confirmation and outcome/recovery evidence.

远程提交前展示笔记/标题、目标账号与真实的草稿投递动作。预览不修改原文、不触发发送；富文本复制明确本地图片限制。公开发布、群发、排程是独立能力，不能作为创建草稿的同义词；各自具备权限、确认与结果/恢复证据后才能开放。

Use explicit states: local preview, submitting, outcome unknown, draft confirmed, scheduled draft, duplicate suppressed and failed. A timeout does not prove failure. Keep the submitted source/account/request identity stable while the user switches notes or accounts; query/retry the original operation before offering a new submission. Confirmation/result text must name the submitted destination, not whatever preview is now visible. Existing implementation requires validation; these are the target acceptance rules, not a claim that every state is already implemented.

明确区分本地预览、提交中、结果未知、草稿已确认、草稿已排程、去重跳过和失败。超时不代表失败。切换笔记/账号后仍保留原提交的内容、账号和请求身份，先查询/重试原操作再提供新提交；结果必须指向原目标，不能随当前预览漂移。现有实现仍需验收，本节是目标契约，不宣称所有状态已完成。

Do one slice from [issue #7](https://github.com/turinglambdaai/publy/issues/7) at a time, with the [controlled deployment pilot #8](https://github.com/turinglambdaai/publy/issues/8) as the hosted-readiness owner. Validate no-server preview/copy, double submit, lost response, retry, note/account switching and recovery with synthetic fixtures before any real publishing. Keep CLI flags, JSON fields and exit codes unchanged in this documentation correction.

一次只实施 [#7](https://github.com/turinglambdaai/publy/issues/7) 的一个切片，托管准备沿用[受控部署试点 #8](https://github.com/turinglambdaai/publy/issues/8)。先用合成 fixture 验证无服务器预览/复制、重复点击、丢失响应、重试、切换笔记/账号和恢复，再做真实发布验收。本次文档修正不变更 CLI 参数、JSON 字段或退出码。

The historical rationale and unshipped ideas below are context. Theme-marketplace revenue, new multi-account/mass-send surfaces and old hosted pricing are not the current implementation queue. Reuse validated rendering/theme-package mechanisms; restoring a historical idea requires a separate product decision.

以下早期论证和未交付设想作为背景保留。主题市场收入、新多账号/群发操作面和旧托管定价不再是当前实施队列；已验证的渲染/主题包机制可继续复用。恢复历史设想需另做产品决定。

## 0. 一句话

**Publy 是 Markdown 到微信公众号草稿的交付工具：CLI 与 Obsidian 插件负责预览、排版和卡片渲染，自托管服务负责草稿投递；公开托管服务仍需通过运营门禁。**

写作留在 Obsidian / 任意 Markdown 编辑器，其余一切（排版、卡片渲染、上传、群发、定时、多账号）收进一条 `publy` 命令。

## 1. 判断：为什么是「CLI + 服务」，而不是又一个编辑器

### 1.1 现有竞品全是给人用的 GUI

| 竞品 | 形态 | 共同假设 |
|---|---|---|
| [doocs/md](https://github.com/doocs/md)（md.doocs.org） | 浏览器编辑 → 复制 → 手动粘贴进公众号后台 | 操作者是坐在浏览器前的人 |
| [Raphael](https://github.com/liuxiaopai-ai/raphael-publish)（publish.raphael.app） | 30 套主题、Notion/飞书粘贴清洗，仍是网页复制流 | 同上 |
| mdnice / 壹伴 | 商业化成熟（付费主题/浏览器插件），形态不变 | 同上 |

agent 时代这个假设失效：创作发生在 Obsidian，执行发生在 CLI/agent，人只做审阅。GUI 排版器没有服务端，也就没有护城河和收入——doocs/md 30k+ star 依然收不了钱。

### 1.2 wenyan 的教训

wenyan（文颜）验证了 CLI + server 路线可行（tlai-wechat-publish 技能即构建其上），但产品摊得太开：macOS App、跨平台桌面版、CLI、MCP、Docker 多端并进；主题靠本地 CSS / gist 注册，没有主题广场。多端并进的结果是每一端都是半成品。

当前保留 **CLI + Obsidian 插件两个客户端，以及同协议的自托管/未来托管服务**。不为统一界面再造编辑器；公开托管是否可用以实际运营证据为准。

### 1.3 为什么「发布服务」能收钱

公众号 API 的脏活恰好全是运维活：

- IP 白名单要求出口 IP 稳定——家用/办公网络天然不可行
- AppSecret 托管与轮换
- access_token 两小时过期，多进程集中刷新需要分布式锁
- 素材上传、群发配额（订阅号 1 次/天）、失败重试与幂等

这些对个人是负担，对服务是产品。GUI 工具收钱靠去广告和主题数量；Publy 收钱靠**发布可靠性**——这是硬成本，用户愿意为省掉的运维付费（mdnice/壹伴已验证过这个人群的付费意愿）。

### 1.4 图片消息是空白区

所有排版工具都在做「文章」，没有工具认真做「图片消息」：

- 现有图片消息工作流（tlai-wechat-card）靠 AI 生图烘焙文字：慢、贵、汉字经常出错
- 确定性渲染（HTML/CSS 模板 → PNG）可以做到：像素级正确的汉字、主题化、秒级、零边际成本

图片消息是 Publy 的差异化楔子：先建立「最好用的图片消息管线」心智，再带动文章发布服务。

## 2. 产品形态：一个引擎，两个客户端，一个服务，一个商店

| 工件 | 形态 | 开源性 | 角色 |
|---|---|---|---|
| **@publy/core** | npm 包（渲染引擎 + 卡片引擎） | 开源（AGPL） | 产品本体：排版、图片消息渲染、校验、微信客户端 |
| **publy CLI** | npm 包，`npx publy` | 开源（AGPL） | 客户端 B：agent 的操作面，非 Obsidian 用户的入口 |
| **Obsidian 插件** | Obsidian 社区插件 | 开源 | 客户端 A：写作现场——图片消息实时预览、文章预览、一键直推服务器 |
| **Publy Cloud / 自托管 server** | REST 服务（协议 v1） | server 开源 / cloud 闭源 | 发布可靠性：IP 白名单、密钥托管、定时、多账号；**收费物** |
| **主题商店** | npm 包 + 注册表索引 | 主题与索引均开源 | 文章主题与卡片主题的分发、预览、提交 |

客户端不设上限：core 是 npm 包，任何客户端壳都可以包它；CLI 和 Obsidian 插件是两个一等公民。插件进 Obsidian 社区目录（开源免费）引流，服务器服务收费——插件免费 + 云服务收费是 Obsidian 生态成熟惯例。

**插件的价值分层（2026-10-13 显式化）**：预览与发布不是竞争关系，是漏斗两段——**预览是使用频率的核心与免费价值主张**（创作过程反复发生、零配置可用、是人类的界面；agent-first 定位下发布被 CLI 接管，插件里人类的交互重心天然向「看」倾斜），**发布是商业核心与产品存在的理由**（低频、慎重、多重防护）。交互跟随该分层：预览走零交互机制（常驻面板 + autoPreview，面板是工作区状态而非按钮动作，Obsidian 惯例一插件至多一个 ribbon），ribbon 留给发布这一标志性动作——前提是预览必须存在零交互路径，两者缺一即回议。

**渲染可见性设计**（写作的人必须看得到最终形态）：

- 文章：`publy render -o out.html` 产出自包含 HTML（内联样式与微信一致），浏览器打开即所见即所得；`publy preview` = render + 自动打开
- 图片消息：card 引擎的原生输出就是 PNG 卡片——渲染形态即文件本身；`publy card --preview` 额外产出拼版大图（9 张 + caption 模拟排版）
- Obsidian 插件：编辑器侧边实时预览文章渲染效果与卡片拼版，写作现场直接看，这是完整答案

### 2.1 明确不做（范围纪律）

- ❌ 独立 Web 排版编辑器（doocs/md / Raphael 类通用 GUI，正面竞争无护城河）；写作场内入口（Obsidian 插件）不在禁列——它不承担排版编辑职责（排版是主题 + core 的确定性渲染），只做预览与触发
- ❌ 桌面 App
- ❌ 图床——图片随文章仓库/Obsidian 存放，发布时经素材接口上传
- ❌ 知乎/头条等多平台适配——wenyan 式「都支持一点」是杂的根源；只做微信，做穿
- ❌ MCP server（首版）——REST + CLI 已可被任何 agent 驱动，后续可加薄封装
- ❌ 账号密码模拟 / 扫码爬虫——**合规红线**：只走官方 MP API

## 3. CLI 契约（agent-first）

**2026-10-30 新增开发版命令：** `publy check <file> [--json]`，
离线检查原始 Markdown 的图片、封面、卡片结构和渲染准备情况，不配置服务器
也能使用，不修改源文件、不创建草稿。标准 Markdown 按源文档目录优先解析
嵌套资源；Typora 的本地 `typora-root-url` 也适用。退出码
0=检查通过、2=文件或格式输入错误、3=无法解析/渲染、
4=图片/封面/卡片预检问题；JSON 中明确标识 `submitted:false`
和 `networkUsed:false`。这是源码构建 CLI 的新增能力，不表示已有普通用户
安装包；生产安装验收仍由 #25 负责。



设计原则：CLI 是编辑器无关的通用接口；Agent 通过版本化能力发现、结构化 JSON、稳定退出码与明确的副作用分类调用，不必模拟 GUI。**这是目标和逐步验收的契约，不代表所有历史命令都已经做到。** 当前已有 `capabilities --json`、`check --json`、`preview --json`、`card --json`、`publish --json`、`publish-result --json`、`account list --json`、`account add --json`、`config set --json`、`jobs list --json`、`history --json`、`quota --json`；其余命令以 `capabilities` 报告的真实 `json:false` 为准。发布/取消/重试应由 Agent 在用户明确授权后调用。完整实例和风险边界见 [Agent CLI 契约](agent-cli.zh-CN.md)。

```bash
publy render a.md --theme claude -o out.html   # Markdown → 公众号 HTML（免费路径，可贴入后台）
publy preview a.md --theme claude              # 本地预览（HTML + 截图，供 agent 自检）
publy card post.md --theme naive -o cards/     # 图片消息：Markdown → N 张卡片 PNG + caption
publy card post.md --lint                      # 校验：caption ≤1000 字、图片 3–9 张、比例 3:4
publy publish a.md                             # 发布文章（经云端或自托管服务）
publy publish post.md                          # 发布图片消息（图片消息）
publy publish a.md --at "2026-10-01 09:00"     # 定时（服务端 job）
publy theme add @scope/theme-x | theme ls | theme preview <name>
publy account add --app-id wx... --secret-env WX_SECRET   # 密钥走环境变量引用，不明文落盘
publy quota                                    # 群发配额余量
```

- 当前部分命令支持 `--json`（清单见 `publy capabilities --json`，不要假设所有命令均已支持）。退出码以实际命令及 [Agent CLI 契约](agent-cli.zh-CN.md) 为准：主要路径 `0` 成功 / `1` 用法错误 / `2` 输入文件错误 / `3` 渲染失败 / `4` 校验失败或查询结果未知 / `5` 服务端、网络及限额错误。**原设计中的退出码 6 尚未实现，不能当作已发布接口。**
- `publish --json` 输出含 `warnings` 数组（渲染期非致命警告，如资源目录缺图）。警告同时打到 stderr，但 agent 消费 `--json` 时以该字段为准——不允许"发布成功但图片静默丢失"只留在 stderr
- `config set` 支持键：`server` / `api_key` / `default_account` / `media_dirs`（逗号分隔多个目录）；不支持手编 `~/.publy/config.json`
- 服务端不可达时 stderr 必须带底层原因（`ECONNREFUSED` / TLS 握手 / 超时分类不同），并给出下一步（检查 `--server` 或 `publy tunnel`）
- 输入兼容 Obsidian：`![[img.png|650]]`、`[[wikilink|别名]]` 原生解析（`--media-dir` 指定资源目录）；frontmatter 的 `title` / `cover` / `type` / `theme` 直接消费
- 密钥管理：配置文件只存环境变量名引用（`--secret-env`），与 tlai 技能的 `${VAR}` 约定一致

### 3.1 从 tlai 技能继承的实战经验（内置为默认行为）

这些是现有公众号推送技能踩坑沉淀，全部固化为 CLI 默认行为：

- **零修改原文**：所有变换发生在内存/输出物，绝不回写源文件
- SVG 自动补白底（公众号把透明背景渲染成黑色的坑）
- 链接转文末脚注（默认开，`--no-footnote` 关闭）
- `--footer` 文末引流文案注入
- 封面比例 2.35:1 裁切
- 账号 ↔ 主题绑定（`accounts[]` 配置，`--account` 选择）
- 图片消息预检清单（错别字/风格一致性提醒）保留为 `preview` 流程的人工/agent 环节

## 4. 图片消息管线（楔子功能）

### 4.1 创作格式：一个 Markdown 文件即一篇图片消息

```markdown
---
title: 居家咖啡指南
mode: cards            # cards 图文卡片 | text 图文分离
theme: naive           # 卡片主题
tags: [咖啡, 生活]
caption: ...           # 帖子配文（≤1000 字；# 标签写在 caption 末尾）
---

## cover               # 第一节 = 封面卡（版式原型 Sparse）
居家咖啡，从磨豆开始

## point               # 中间节 = 内容卡
水粉比 1:15
水温 92°C

## list                # 版式原型 Dense：清单/步骤
...

## ending              # 最后一节 = 结尾互动卡（Sparse）
关注我，下期讲手冲参数
```

节名对应四种版式原型（对齐 tlai-wechat-card 的成熟经验）：`cover`（Sparse）/ `point`（Balanced）/ `list`（Dense）/ `ending`（Sparse）。主题控制每种原型的排版实现。

`text` 模式沿用现状：正文列图（`![[...]]`）+ 一段配文，发布为图片消息，图片不做渲染。

### 4.2 确定性渲染（双引擎）

- **默认引擎 satori**：HTML/CSS 模板 → SVG → PNG（resvg），无浏览器依赖、秒级出图。约束：CSS 子集；CJK 字体使用预分包字体
- **兜底引擎 browser**：`--engine browser` 走无头 Chromium 截图，支持完整 CSS；主题在 `manifest.json` 中声明所需引擎
- 输出 1080×1440（3:4）；文字自适应缩放（放不下逐级降字号）；页码/水印由主题控制

### 4.3 预览与校验：人/agent 各司其职

- `publy card --preview` 生成拼版预览页；agent 截图自检，并提醒人工核对错别字（AI 生图时代的教训保留为流程）
- `--lint` 硬校验：caption 字数、图片数量、比例、标签格式；发布前不通过即拒绝（退出码 4）

### 4.4 发布

当前交付边界是素材上传与创建公众号草稿（首图为封面），返回已确认的草稿结果；不把草稿成功描述成公开发布或群发成功。沿 #7 验证同一请求身份的重试与未知结果恢复，不能只凭超时推断是否已创建草稿。未来公开发送需单独的权限、确认和配额契约。

## 5. 主题商店

### 5.1 主题包

- 文章主题 = npm 包 `publy-theme-*`：`theme.css`（`#publy` scope）+ `manifest.json`（适用范围 article|card）+ `sample.md` + `preview.png`（CI 渲染）
- 卡片主题：`CardTheme` 风格配置模块（colors、fonts、watermark），引擎按四种版式原型消费配置；内置参考实现 naive / claude。卡片主题不做 HTML 模板——satori 的 flex 语义下配置化比模板更可靠
- 语义化版本；本地 CSS 文件可用 `--custom-theme` 直接兜底，不强绑 npm

### 5.2 注册表

- GitHub 仓库 `publy-themes`：`index.json` 精选清单（名称、npm 包、截图、作者）
- 提交 = PR；CI 自动渲染 sample 生成预览图进 gallery 页
- `publy theme search / add / preview` 读注册表；`add` 实际安装走 npm
- 解决 gist 注册的痛点：版本化、一条命令安装、装前可预览、贡献有常规入口

### 5.3 商业化（二期）

早期候选，当前不排期、不对外承诺分成。当前商业边界以 PRICING 的托管服务设计为准；先验证预览与可靠草稿投递。

## 6. 服务协议与架构

### 6.1 协议 v1（已实现于 packages/server 与 packages/cli）

```
GET  /health              # 无鉴权
GET  /verify              # 鉴权探针，返回账号名列表
POST /v1/publish          # 发布（JSON，≤30MB）
GET  /v1/publish-result/:key   # 按幂等键查询结果：confirmed | unknown（超时恢复入口）
POST /v1/jobs/:id/retry        # 显式重试 interrupted/failed 任务（幂等键随行）
POST /v1/admin/users/:id/rotate-key  # 用户 key 轮换（旧 key 立即失效）
POST /v1/ws-ticket             # 换取短时 WS 票据（替代 URL 携带长期 key）
```

- 鉴权：`x-api-key` 请求头
- `POST /v1/publish` 请求体：

```json
{
  "account": "TuringLambdaAI",
  "type": "article | image_post",
  "title": "...",
  "html": "<div id=\"publy\" style=\"...\">...</div>",
  "images": [{ "name": "a.png", "data": "<base64>", "contentType": "image/png" }],
  "cover": "a.png",
  "author": "...", "digest": "...", "contentSourceUrl": "...",
  "needOpenComment": true
}
```

- 正文 HTML 中图片引用 `attachment://<name>`，server 上传素材后替换为微信 CDN URL（复用 media_id 语义：正文图用 `add_material` 的 url，封面用 media_id 作 thumb）
- 响应：`{ "mediaId": "...", "account": "...", "title": "...", "requestId": "..." }`——回显本次提交的目标账号、标题与请求身份，客户端结果展示以回显为准、不随当前预览漂移；幂等命中响应带 `"deduped": true`；错误 `{ "code": "...", "message": "..." }`（400 客户端错 / 401 鉴权 / 429 配额 / 502 `WECHAT_<errcode>`）
- server 配置 `~/.publy/server.json`：`{ port, apiKey, accounts: [{ name, appId, appSecret }], cacheDir }`；token 缓存 600s buffer + 并发单飞
- 幂等键（`idempotencyKey`）已实现：服务端为每个键保留 10 分钟持久记录，重试命中返回原 `mediaId` 不重复建草稿；定时任务准入同键只入队一次；进程崩溃时处于 running 的任务重启后标记为 `interrupted`（结果未知），不自动重跑，等待显式重试（重试沿用原键，命中记录则对账去重）
- 状态区分契约（2026-10-23 review）：本地预览 / 提交中 / 结果未知 / 草稿已确认 / 已排期 / 去重跳过 / 显式失败——超时不等于失败；显式失败（服务端有应答）与结果未知（网络层中断）在客户端有不同的后续动作（查询 / 原请求重试）

### 6.2 服务端职责

IP 白名单管理、AppSecret 加密托管（KMS，永不下发）、access_token 集中刷新（分布式锁）、群发队列（重试/退避/幂等）、审计日志（谁在何时发了什么）。

### 6.3 Monorepo（pnpm + TypeScript）

```
packages/
  core/     # 渲染器（md → 公众号 HTML）、卡片引擎、主题加载、校验 —— 纯函数库
  cli/      # commander 薄壳，npm 包名 publy
  server/   # 自托管参考实现（Fastify，Docker）
  shared/   # 协议类型、配置 schema（zod）
  cloud/    # 托管控制面（闭源，后期：计费、多租户、调度器）
```

### 6.4 技术风险

| 风险 | 应对 |
|---|---|
| Satori CJK 字体体积与加载 | cn-font-split 预分包；主题声明字体栈；browser 引擎兜底 |
| 微信 API 变动/收紧 | 只走官方接口；协议层隔离微信细节，服务端灰度升级 |
| 群发配额稀缺（订阅号 1 次/天） | 幂等键 + `publy quota` 预检 + 定时错峰 |
| 用户不信任托管 AppSecret | 加密托管 + 审计透明 + 自托管逃生门；文档明示数据流 |

## 7. 渲染位置与多租户（2026-09-29 定稿）

### 7.1 渲染永远在客户端，server 永不渲染

| 流量 | 位置 | 说明 |
|---|---|---|
| 预览（高频） | 客户端 | `render -o out.html` 浏览器打开 / 插件侧边预览；毫秒级反馈，零网络往返，零服务器成本 |
| 发布（低频） | 客户端渲染 → server 转发微信 | server 只做素材上传 + 草稿提交等 API 编排 |
| 定时发布 | 客户端预渲染，server 存 job | 到期时 server 只做"上传素材 + 提交草稿"，依然不渲染 |

理由：

1. **成本结构**：渲染是 CPU 密集活（juice DOM 内联、resvg 光栅化、将来的 satori 卡片渲染）。放 server 则服务器成本随用户数线性上涨且不产生付费点；放客户端由用户自己的机器出算力，一台小服务器可以服务大量用户。server 端**禁止引入渲染依赖**（juice / resvg / satori 都不进 `packages/server` 的依赖树）。
2. **交互性**：预览要边写边看、换主题即时重渲，任何网络往返都不可接受。
3. **隐私**：正文只在发布那一刻离开本机；自托管用户内容全程不经他人之手。
4. **职责分层**：server 的价值全在有状态运维（IP 白名单、密钥托管、token 生命周期、配额、审计），渲染是无状态 CPU 活，不属于它。

### 7.2 多租户演进路径（现在不实现，架构不埋死路）

自托管 server 定位为单租户（一人或一个团队）。真正的多用户只发生在云控制面（M4）：

**现在就对的（不用改）：**

- 协议 v1 的 `account` 字段按名寻址；多租户下语义自然变为"该用户的账号"，协议不变
- `TokenManager` 按 appId 缓存，天然支持多账号并存
- `publishToWechat(req, cred, tokenManager)` 是纯函数，控制面直接复用
- 渲染在每用户的客户端各自发生，天然水平扩展

**M4 才做的：**

- `AccountStore` 抽象：文件实现 → 数据库实现；API key → user → accounts 归属关系（M2 先把 server 的账号读取抽成接口，成本几乎为零）
- 配额记账（Free 30 次/月）按 user 统计
- 审计日志按 user 记录（谁在何时发了什么）
- AppSecret 加密托管（KMS），永不明文下发、永不出 server
