# Publy Roadmap

## Integration in progress / 正在整合 — 2026-11-03

Owner priority is Publy's first release. Starting repository commit:
`67032c390ba81f62d6d30d4813c12850cc10b366`; central delivery policy read at
`turlamai.github.io` commit `702a4c376a338d02f7ea90f459749e7a20f71b2e`;
authorization decision `2026-10-auth-1` remains in force. The following is
local integration work, not a merge, release, deployed service or sales claim.

- Incorporate and test the existing #65/#66/#67 stack, including #51, #57,
  #60, #61, #63 and #64; preserve those source PRs until reviewed integration
  and exact-head CI are complete. Additional local integrations cover #48,
  #49, #50, #52, #53, #54, #55, #56, #58 and #59; adaptations to overlapping
  files need review against each original PR. #62's code-example handling is
  adapted using Markdown block parsing, with a regression for an indented
  paragraph continuation; it still needs cross-platform and native evidence.
- Product proof still required: clean Obsidian install/update on target
  systems, real Typora/Obsidian source-to-draft walkthrough, and a no-npm
  packaged CLI. Synthetic three-file smoke is not directory listing or a
  desktop/WeChat acceptance (#12/#14/#15/#18/#25/#26/#37).
- Hosted admission remains closed: Commerce commit
  `61d12372f8dcfeb1a9a997f63a07bc5583c226ca` provides a development
  authenticated proof endpoint, but transaction-consistent refund reads,
  Publy account-bound Permit verification and its atomic usage ledger are
  not production integrated. A development-only shadow client signs requests
  against Commerce’s Racket framing and can observe proof responses. A
  separate SQLite quota ledger reserves atomically, holds uncertain results
  and checks expiry before send; neither component is wired to a user route
  or grants access. The loopback-only synthetic probe
  `COMMERCE_ROOT=<pinned-checkout> node scripts/verify-commerce-shadow.mjs`
  verifies request authentication and cross-account denial against the real
  Commerce HTTP listener; it does not test a paid entitlement. Billing-window policy, known-failure reconciliation,
  current-entitlement rechecks and full deployment recovery remain open. Complete
  #17/#44, the fixed-egress recovery pilot #7/#8, retention/backup and real
  merchant admission before enabling checkout. Free local and self-hosted
  paths stay available.
- Final publication requires a reviewed source and release artifact, required
  CI and native evidence. `main:/docs` triggers a public Pages deployment;
  resolve that release boundary with the owner before merge or publication.

## Actual release state / 当前真实发行状态 — 2026-10-30

**Developer code ≠ tested release ≠ public availability.** The monorepo now
retains TypeScript/pnpm only as an internal build tool; the old CLI package is
private and no npm Registry release is planned. A small Racket standalone CLI
probe exists, but it is not feature-complete. Ordinary users should eventually
install audited OS archives from GitHub Releases, not run npm/pnpm/raco.
See [distribution policy](distribution.md) and
[Racket migration experiment #18](https://github.com/turlamai/publy/issues/18).

**Obsidian:** source plugin is 0.8.7 while the latest public Release is 0.8.3.
The official Community Directory install/download, with only three files, is
not yet verified for cards/fonts/WASM (#12). Community listing/review
remains unresolved (#14), and in-app desktop tests remain to be proved (#15).
A side-loaded ZIP is not proof of directory compatibility.

**Commercial:** Public hosted checkout is disabled by default; manual-only
legacy tests are not live sales. Paid state must come from Commerce / Permit
after the upstream product-neutral entitlement interface, account/identity
mapping, reconciliation and real merchant admission (#17, Commerce #21).
No product is currently authorized to charge money through this repository.

**Operations:** #7/#8 still require independently reproduced fixed-egress
WeChat draft delivery and restart, scheduling, quotas, credential/key rotation,
backup/restore and logs on a controlled deployment. Historic checkmarks below
are **implementation history**, not acceptance of current production gates.

## Editor-neutral customer experience / 跨编辑器客户体验 — 2026-10-30

Publy must earn a real-user subscription via an excellent **existing editor
→ original Markdown → preflight → preview/copy → explicit selected WeChat
draft → verified outcome** journey, not a larger list of unverified editor
plugins. **Typora and Obsidian are the only first-class writing
experiences.** Ordinary Markdown remains a shared input format, not another
editor-support program. Cloud-document and extra editor adapters are out
of scope; a small file-picker companion is only a delivery UX candidate,
**not delivered**. The first developer
slice is source-relative/Typora image-path fidelity and an offline
`publy check` command; retain exact image identity and file immutability.
See [product UX #25](https://github.com/turlamai/publy/issues/25),
[interop/format evidence #26](https://github.com/turlamai/publy/issues/26),
[EN](editor-workflows.md) and [中文](editor-workflows.zh-CN.md).
Native no-npm clean-install, real editors/OS tests and hosted billing are still
explicit gates.

## Current execution boundary / 当前执行边界 — 2026-10-23

Read [the current product/interaction decision](design.md#current-scope-and-interaction-decision--当前范围与交互决定), [pricing policy](../PRICING.md) and [issue #7](https://github.com/turlamai/publy/issues/7) before implementation. First qualify local preview/copy and explicit delivery to a selected account's drafts, including unknown outcomes, retries and source/account identity. Hosted readiness belongs to [pilot #8](https://github.com/turlamai/publy/issues/8). Public hosting is not on sale. Historical checkmarks below describe earlier work, not current merchant approval, live availability or runtime acceptance; old quotas, payment onboarding assumptions and theme-marketplace expansion are superseded by current policy. No new public-send capability is authorized by this roadmap.

开工先读上述当前交互范围、PRICING 和 #7：优先验证本地预览/复制、选定账号的明确草稿投递，以及未知结果、重试和内容/账号身份。托管准备由 #8 负责，公开托管未开售。下方勾选记录是历史，不是当前商户获批、线上可用或运行验收证明；旧配额、支付准入假设与主题市场扩张服从当前政策。本路线不授权新增公开群发能力。

## M0 — 设计定稿与仓库骨架 ✅

- [x] 产品设计 / 商业模式 / 路线图文档
- [x] monorepo 骨架（pnpm workspace、packages/shared|core|server|cli）
- [x] 客户端形态定稿：Obsidian 插件 = 客户端 A，CLI = 客户端 B（2026-09-29 与用户对齐）

## M1 — 渲染与发布闭环 ✅

- [x] `@publy/core` 渲染管线：markdown-it + hljs 高亮 + juice 内联 + Obsidian 语法（`![[img]]` / wikilink）+ SVG→PNG（resvg，白底）+ 链接转脚注 + footer 注入
- [x] claude / medium 主题移植（用户 wenyan 自定义主题，CSS 变量编译为字面量）
- [x] `publy render` / `publy preview`（浏览器打开）/ `publy publish`（--json、退出码）
- [x] `publy config set` / `publy account add|list` / `publy theme ls`
- [x] `@publy/core` 微信客户端：token 缓存（单飞 + 600s buffer）、add_material、draft/add（文章 + newspic 图片消息两种草稿）
- [x] `publy-server` 协议 v1（/health /verify /v1/publish，base64 附件 + attachment:// 引用替换）——本地冒烟通过（含微信 API 真实调用错误路径）
- [x] 2026-09-29 记录过个人服务器部署；历史地址/端口不作为公开配置约定或当前可用性证明。当前访问、TLS、固定出口与凭据边界以 #8 的受控试点和实际 runbook 验证为准。
- [x] cards 模式发布实测：`mode: cards` 自动推断 image_post（tlai-wechat-card 产出无需 type 字段）——4 卡 newspic 草稿全链路通过

**验收**：✅ 真实公众号全流程发布 1 篇文章（渲染 → 服务器 → 草稿箱，6.5s，幂等命中与审计日志实测通过）+ 1 篇 cards 图片消息。

## M1b — 图片消息 card 引擎 ✅

- [x] satori + resvg 卡片渲染：markdown 分节（cover/point/list/ending 四版式原型）→ 3:4 PNG（1080×1440）
- [x] `publy card` + `--preview` 拼版预览页 + lint（caption ≤1000 字、3–9 张、cover/ending 必备）
- [x] 2 个内置卡片主题（naive 白底墨色 / claude 暖燕麦）；Noto Sans SC 按需下载缓存（jsDelivr + GitHub 双源）
- [x] 发布链路：`mode: cards` → 卡片即 images → image_post 草稿（lint 不过拒发）

**验收**：实测 4 张卡片 2.5s 出图，汉字像素级正确；两主题渲染通过。

## M2 — 稳定性 ✅（除自吞狗粮周期）

- [x] 幂等键（内容寻址，服务端 10 分钟窗口去重）
- [x] 审计日志（server-data/history.jsonl + `publy history` / GET /v1/history）
- [x] 封面 2.35:1 中心裁切（server 端 resvg 视口裁切，零图像库依赖）
- [x] 素材 hash 缓存（同 appId 同字节内容免重传，material-cache.json）
- [x] `AccountStore` 接口抽象（文件实现，M4 换数据库）
- [x] 公司网络大 POST 拦截解法：SSH 隧道（启动文件夹自启）→ **2026-09-30 产品化：`publy tunnel` 幂等命令 + publish 失败自动拉隧道重试**
- [x] **wenyan 全面退役**（2026-09-29）：服务器 tmux 停止 + npm 卸载 + 数据目录改名 `.retired-20260929` 观察；本机 npm 卸载 + 数据目录删除；`tlai-wechat-publish` 技能 v1.0.0 重写
- [x] CLI 开发期 shim（指向已构建 dist）；历史 npm 全局命令不再作为普通用户安装路径，发行包验收仍未完成
- [x] **强 API key 轮换**（2026-09-30：24 字节随机 hex 替换 wenyan 时代弱 key，双端同步）
- [x] **定时发布**（2026-09-30）：`publy publish --at "..."` → 服务端 jobs.json 持久化 + 失败重试 3 次 + `publy jobs list/cancel` + webhook 通知
- [x] **webhook**（2026-09-30）：server.json 账号级 webhook URL，publish/failed 事件推送
- [x] **测试与 CI**（2026-09-30）：33 个单测（core 26 含真实渲染、server 7 含 fastify inject 协议测试），GitHub Actions ubuntu+windows 矩阵
- [x] **历史 npm 打包实验（已退役，非当前发行方式）**（2026-09-30）：当时曾验证 esbuild 与打包体积；现已停止 npm Registry 发布，CLI 包标为 private。当前 Racket 原生分发属于实验状态，详见 [发行策略](distribution.md) 和 [#18](https://github.com/turlamai/publy/issues/18)
- [x] **图片消息 text 模式 caption 走 markdown 渲染** + digest 自动生成（首段前 120 字）
- [x] **字体子集化**（2026-09-30）：pyftsubset GB2312+ASCII 共 7549 字符 → 3.4MB/字重（原 32MB），随包分发零网络，越界字符自动回退全量字体
- [x] `--custom-theme <path>`：任意 CSS 文件即主题（变量自动解析）
- [ ] HTTPS：Caddy 2.6.2 已装已配（publy-api.jrtx.site → 8081），等 DNS A 记录 + 安全组 443/80 开放
- [ ] **自吞狗粮进行中**：连续 2 周仅经 publy 发布（自 2026-09-29 起算，wenyan 已不可回退）

## 竞品情报（2026-09-30 调研）

Obsidian 社区已有 **8+ 个同类公众号发布插件**（Markdown Publisher、Dou Publish、WeChat Multi Publisher、WeiXin MP Publisher、md-to-wechat、MarkNice WeChat、DGS、GZH Sync…），但**全部无人问津——最高 9 星**。两个结论：

1. 需求真实（反复有人试水），但"本地插件 + 用户自配 AppSecret/IP 白名单"模式做不大——配置劝退、无服务收入、单机孤岛。**这正是 Publy 托管服务模式的正面验证。**
2. 可吸收的功能点：**富文本复制路径**（Dou Publish：零配置，复制带样式 HTML 粘贴进公众号编辑器——已吸收进插件）；**KaTeX 数学公式**（多插件主打痛点：公众号不支持原生公式，需渲染为内联 HTML/CSS——juice 内联是我们的强项）；多账号群发、自动图床。

## M3 — Obsidian 插件（客户端 A）进行中

- [x] 插件骨架：设置页（server/api_key/account/mediaDir）、ribbon 按钮、命令「Publish current note」「Preview rendered HTML」
- [x] esbuild 构建 + resvg 原生模块随插件分发（dist/ 即装即用）
- [x] 命令「Preview image-post card deck」：当前笔记渲染卡片拼版并打开（2026-09-30）
- [x] 命令「Copy rendered rich text」：**零配置发布路径**（2026-09-30，自竞品 Dou Publish 吸收）——复制带排版 HTML 到剪贴板，粘贴进公众号编辑器，无需 AppSecret/服务器/白名单；含本地图片时的能力边界提示
- [x] 内嵌预览面板（ItemView 常驻侧边栏：文章 HTML 模拟公众号头部，卡片模式拼版条）+ 编辑改动自动重渲染（~0.9s debounce）
- [x] **设计系统与交互打磨（2026-10-12，0.6.0）**：styles.css 主题层（微信绿 token 落在 Obsidian 原生变量上，亮暗双主题）、发布状态机（按钮 spinner + 面板结果条：草稿/排期/去重/失败四态）、**390px 手机宽预览切换**（公众号读者大多在手机）、工具栏主题快切（10 主题即时重渲染）、历史面板时间线化、封面选择器 2.35:1 裁切缩略图 + hover/选中态、Lucide 图标全覆盖
- [ ] 发布到 Obsidian 社区目录

## M4 — 公开商业版（进行中）

- [x] 主题注册表仓库 `publy-themes`（index schema + 内置主题登记 + 提交指南）
- [x] **主题商店 gallery 上线并重做**（2026-09-30 v2）：themes.publy.jrtx.site/——文章主题直接内嵌**发布级真实 HTML**（同篇切主题对比 + 手机宽/文档宽切换），卡片主题按真实翻阅方式横向滑动 + 全屏翻页灯箱；废弃截图方案；生成器 scripts/build-gallery.mjs（输出到 publy-themes 仓库 D:Codespubly-themes）
- [x] **云控制面上线**（2026-09-30）：多用户（node:sqlite 独立 API key）、配额强制（Free 30 次/月 / Pro 5000 次/月，按自然月滚动）、账号归属与计划限制（Free 1 账号 / Pro 3 账号）、购买页 + key 找回 + `publy quota`、admin 控制台（开通/延期/停用/绑定账号/用量）、支付适配器（虎皮椒已实现，凭据待运营者注册填入；当前手工开通模式）
- [x] **支付适配器矩阵**（2026-09-30）：支付宝当面付（官方渠道、个人可申请，已实现 precreate 扫码 + 主动查单 + RSA2）/ 虎皮椒备用（PC 扫码仍可用）/ 手工开通兜底；购买页自动适配三种模式
- [ ] 运营者申请支付宝当面付 → server.json 填 alipay 凭据 → 扫码直付上线
- [ ] 定价页上主站 + 服务条款/隐私政策
- [ ] 外部主题提交流程开放（独立、受签名和版本约束的主题包；不依赖 npm Registry）— [#21](https://github.com/turlamai/publy/issues/21)
- [ ] jrtx.site 产品页（已上线 publy.jrtx.site）+ 开源发布文

## Later（不承诺时间表）

KaTeX 数学公式（公众号不支持原生公式 → KaTeX 渲染为内联样式 HTML，juice 内联——多竞品的主打功能，高需求）

MCP 薄封装 / 付费主题市场（70/30）/ Team 审批流 / API 按量计费

## 当前交付优先级（2026-10-23）

先验证发布幂等/超时恢复与凭据边界；审计 WebSocket URL 的长期 key。托管套餐按账号与有界发布配额设计，CLI/自托管路径保留。

执行场景与完成标准见[本仓审查 issue](https://github.com/turlamai/publy/issues/7)及家族[交付标准](https://github.com/turlamai/turlamai.github.io/blob/master/docs/PRODUCT-STANDARD.md)。未完成的跨平台、硬件或真实支付验证仍是显式门禁；本节不表示这些验证已通过。后续一次认领一个切片，证据回填本文件与 issue。
