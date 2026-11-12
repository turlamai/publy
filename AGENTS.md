# Publy

## 实现路由（agent 按任务读真源）

- 实现界面以 `design/prototype/` 为准：对照 HTML/CSS/JS 与实物截图验收，不依赖散文复述。
- Token/几何值真源 = `design/prototype/shared.css`（亮暗成对；无 shared.css 的仓 = design/prototype/ 各页样式）；`design/DESIGN.md` 只记语义名、用途与决策。
- 行为边界与跨平台一致性以 `design/DESIGN.md` 的不变式与平台差异节为准。
- 改界面先改原型再改实现（tlai-prototype-flow）；动共享层（design/、shared/）先 issue 声明，同 commit 落契约。

## Authorization decision before implementation

Decision `2026-10-auth-1`: Online hosted-service entitlement, verified on the server with current account state and atomic quotas; no desktop activation lease. Read the complete [local authorization decision](PRICING.md#authorization-decision-for-implementation) and its Chinese counterpart before commercial, trial, update-eligibility or credential work. Record this decision revision and the source/policy SHAs actually read in the PR/handoff. Refresh at each bounded slice; existing agent conversations do not receive this change automatically. Follow the existing product contract and implementation issue; do not activate a payment gate merely because a plan exists.

- 先读 `docs/design.md` 的 Current scope and interaction decision：它负责产品形态与交互；`PRICING.md` / 中文版负责商业权益；用户指南与实际发行/运营证据负责当前可用性。历史市场/群发/开卖设想不能覆盖当前范围。
- 当前阶段：渲染/发布管线已实现并自用，公开托管商业交付仍有门禁，进度见 `docs/roadmap.md`
- 动代码前必读 design.md 第 3 节（CLI 契约）与第 4 节（图片消息管线）
- Public user documentation is English with a complete Chinese path; historical internal design notes may remain Chinese. Code comments use English.
- 退出码与 `--json` 输出是对外契约，变更需同步 design.md 第 3 节和 docs/agent-cli.md / docs/agent-cli.zh-CN.md。使用 `publy capabilities --json` 发现实际支持的命令；不要把目标文档里的“所有命令 JSON”当作当前代码事实。Agent 不可自动创建草稿、取消/重试服务端任务或公开发布，除非用户对该副作用做了明确授权。CLI 不依赖某个编辑器，而发布目标只限公众号草稿箱。

## Editor-independent product contract (2026-10-30)

**Markdown is the product input; no editor or agent is required.** Typora and Obsidian are supported writing entry points, not prerequisites.
All Markdown inputs use the same source-neutral render, preflight, preview and
WeChat-draft protocol. Do not build separate editor integrations without a
concrete customer need. A future slim publishing companion
may accept drag/drop or open-with, but must not become a second editor or
copy/index the user's notebook by default. The original Markdown/assets stay
in place; local preview/check must not call a hosted service or require an
account. Keep exact nested media paths and covers; never silently substitute
same-name images. Capture missing assets in a preflight report. Obsidian's
special syntax remains an optional adapter, not a dependency of common
Markdown. See [English](docs/editor-workflows.md) and
[中文](docs/editor-workflows.zh-CN.md) acceptance criteria, and #25/#26.
Do not claim tested compatibility with proprietary editors or a native
installer until real sample/clean-machine evidence exists.

The customer pays, if at all, for **proven hosted delivery, operational
reliability and recovery**, never for moving content between editors.
Public checkout stays closed until Commerce/Permit and merchant gates pass.
Preserve the family authorization decision `2026-10-auth-1`.

## Scope discipline for an independent developer (2026-10-30)

WeChat Official Account **draft delivery is the only supported publishing
destination**. Generic Markdown and agent workflows are first-class; Typora
and Obsidian are supported optional writing entry points. Do not
add new publishing destinations, including Zhihu, Toutiao, WordPress, Ghost,
Xiaohongshu, Douyin or others. No provider abstraction, future-platform
backlog, API research or platform-specific placeholders. Preserve the focused customer journey:
existing Markdown -> reliable local preflight/preview -> explicit selected
WeChat draft -> verified/reconciled status. Normative product decision:
[English](docs/platform-strategy.md) ·
[中文](docs/platform-strategy.zh-CN.md). Do not change this scope due to
a passing thought or a technically easy API without a separate user-backed
decision. Current hosted checkout remains closed.

## racket/ — Racket components (2026-10-13)

`racket/publy-ws.rkt` is the live-events WebSocket gateway. It sits NEXT TO
the fastify server and never inside it: it tails `dataDir/history.jsonl`
and pushes each event to subscribers of `ws://host:port/events?key=<credential>`.
Two credential forms: a **short-lived signed ticket** from `POST /v1/ws-ticket`
(preferred — the long-lived key never travels in a URL, #8), or the
long-lived API key itself (legacy; refused entirely once server.json sets
`wsRequireTickets: true`). Ticket verification uses the self-contained
HMAC-SHA256 in `racket/publy-crypto.rkt` (no crypto package dependency).
The publishing server itself must stay untouched by gateway work. Replay
ends with a `{"control":"replay-done"}` marker — clients synchronize on
it. Tests: `raco test racket` (CI job `racket-ws`; the websocket library
installs from GitHub until it reaches the catalog).

`racket/publy-cli-prototype.rkt` is a **read-only Racket standalone distribution
probe**, not a substitute for the TypeScript publishing CLI. Do not add network
publication, payment gates or claims of production equivalence to it before
parity fixtures, native packaging and real platform tests are complete. User
installation must not require npm Registry; pnpm remains an internal developer
build dependency. Track its rollout in `docs/distribution.md` and issue #18.

`racket/publy-stats.rkt` is the read-only operational stats companion —
same posture (next to the server, `users.db` opened read-only,
`app_secret`/`api_key` never selected) and zero dependency on `@publy/core`.
It aggregates publish outcomes, top errors, monthly-quota pressure and
paid revenue from `history.jsonl` + `users.db`, bucketed in Asia/Shanghai
wall time. Human report by default, `--json` for agents. New Racket-side
components must follow this pattern: sidecar next to the server, read-only
over the data plane, no engine dependency.

## 组合定位（Portfolio placement）

- 当前决策（2026-10-v2）：免费 CLI/自托管 + 发布托管订阅。具体价格、免费/付费边界和开卖门禁以本仓 [PRICING.md](PRICING.md) 为唯一权威；旧版收费候选与早鸟方案已被替代。
- 组合归属：[PORTFOLIO](https://github.com/turlamai/turlamai.github.io/blob/master/PORTFOLIO.md)。当前全部产品开发中、没有实际用户；目标定价不表示已经开卖，不因此立即给开发版加收费墙。
- 免费产品不接商业激活；付费层先实现可验证价值，再接 Commerce/Permit。优先完成本仓既有产品审查 issue；不修改现行源码 LICENSE。

## 产品交付与下一步（2026-10-23）

- 家族[交付标准](https://github.com/turlamai/turlamai.github.io/blob/master/docs/PRODUCT-STANDARD.md)与[组合策略](https://github.com/turlamai/turlamai.github.io/blob/master/PORTFOLIO.md)是共用政策；本仓具体行为以 `docs/roadmap.md` 为准，不复制五库依赖图。
- 当前执行入口：[产品审查 issue](https://github.com/turlamai/publy/issues/7)。发布幂等（同请求身份查询/重试）、结果未知/显式失败区分、凭据轮换/撤销、UTC 配额与日志脱敏已在服务端与两个客户端落地（见 [PRICING.md](PRICING.md) Next gate 对照）；运行时验收仍需按 issue 验收标准补实机证据。WebSocket URL 长期 key 已由短时票据机制替代（`wsRequireTickets` 收口）。
- 开工先检查干净工作树与远端，以 fast-forward-only 更新并记录 SHA；共享文件一次一个写入者，保留其他 checkout 的未提交工作。
- 每次只完成一个可验收切片，记录 owned files、依赖 pin、命令/平台/产物证据和回滚。已实现、已发布、实机验收分别陈述；不修改 requirements 或复用旧证据来制造通过。

## Documentation languages

Public default documentation is English; maintain complete Chinese user paths in `*.zh-CN.md`, with reciprocal links. Update both languages when prices, quotas, installation, recovery, privacy or supported platforms change. API/protocol identifiers and commands remain unchanged; do not maintain a second normative protocol or implementation. Follow the [family language policy](https://github.com/turlamai/turlamai.github.io/blob/master/docs/DOCUMENTATION-LANGUAGES.md). Existing internal notes are not a claim that every document is bilingual.

## Public product documentation

The paired `docs/USER-GUIDE.md` / `docs/USER-GUIDE.zh-CN.md` own the public installation, first-use, data/recovery, privacy and availability path. Keep the homepage and both README entry points aligned with them when behavior changes. Detailed technical contracts and the current implementation queue retain their existing owners. Do not publish target prices, a purchase link or a ready/secure/platform claim before its release evidence exists.

## 设计流程（原型先行）

所有 UI 开发与界面改造一律先原型后代码：brief → `design/DESIGN.md`
视觉契约 → HTML 原型 → 按 HIG 基准评审通过才开工；改界面先改原型再改
代码。契约与原型放本仓 `design/`（尚未建立时随首个 UI 切片建立），
实物截图验收后才能作为对外宣传素材。
