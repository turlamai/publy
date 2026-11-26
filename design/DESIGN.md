# Publy DESIGN.md — 视觉与交互契约（单一真源）

原型（`design/prototype/`）与实现（`packages/obsidian-plugin/`）都遵循本文件；改视觉先改这里，再同步实现。
Tokens 提取自 `packages/obsidian-plugin/styles.css` 现行值；亮暗两套的底色与文字取 Obsidian 默认主题变量语义（插件声明「One accent token on top of Obsidian's native CSS variables」），暗态红/琥珀参考 `packages/server/src/pages.ts` 控制台暗色页。

## Brief（2026-11-11）

- **UI 表面认定**：产品的人类 UI 表面是 **Obsidian 插件**——预览面板（侧栏 leaf，可调宽，面板窄、垂直排布）、发布历史面板、插件设置页（Obsidian 设置弹窗内）、以及账号切换/封面选择/定时发布三个弹窗。`packages/server/src/pages.ts` 存在 storefront + admin 控制台页，但公开托管结账未开放，不在本期范围。CLI 是 agent 操作面、无 GUI，遵循 `docs/agent-cli.md` 契约——本契约以首个 UI 切片（Obsidian 插件）为边界。
- **目标**：非从零重设计。在插件现行 styles.css 体系（微信绿单 accent + Obsidian 原生变量）上做 HIG 级打磨；让「与公众号一致的预览」和「投递前的防错」这两个差异化主角在界面上站出来；把 `publy check` 的本地 preflight 结果从 Notice 文本升级为结构化检查清单界面。
- **原型范围**（6 屏 × 亮/暗）：① 预览面板·文章（英雄屏，含投递成功结果条）② 预览面板·图片消息拼版（渐进渲染进行态 6/9）③ 发布前检查报告（失败态：fix + warn + 通过项，投递被拦截）④ 发布历史与待发任务（结果未知恢复 / 失败 / 空待发队列）⑤ 设置与连接（凭据托管状态）⑥ 预览面板空态（未打开笔记 + 首次三步引导）。
- **Exit 条件**：6 屏关键状态齐（成功/失败/进行/空）+ 交互逻辑定稿 + HIG 清单全过 + 用户评审通过。
- **不在范围**：CLI 界面、server storefront/admin 控制台、官网、新功能、发布目的地扩展（唯一目的地 = 公众号草稿箱）、新配色体系（微信绿不动）。

## 设计原则（HIG 内核）

- **预览即真相**：纸面模拟公众号实际效果——恒白底、微信文章头部结构（标题/账号/作者/草稿徽标）、手机宽优先（读者大多在手机）；预览与投递必须一致。
- **投递前透明**：目标账号显式命名在主按钮上（「投递「账号」草稿箱」），不存在未命名的默认投递；预览与检查零副作用——不改原文、不联网、不创建草稿。
- **结果不漂移**：结果文本指回提交时的目标账号与标题，不随当前预览漂移；「结果未知」不是失败——先查询/核对草稿箱，重试必须沿用原请求身份；动作直接内嵌在结果条里。
- **防错一致**：本地媒体未就绪时投递被拦截并给出可执行的修复清单；富文本复制遇到图片/公式附件时取消并披露原因，而不是复制无效链接。
- **层级克制**：面板窄幅垂直排布，bg < bg-alt < 纸面三层足够；accent 绿只给交互与状态；纸面是唯一「强白」表面，靠阴影而非描边堆叠表达浮起。

## Tokens（语义；值不在此复制）

值类 token 真源 = `packages/obsidian-plugin/styles.css` 现行值；底色与文字取 Obsidian 默认主题变量语义（插件声明「One accent token on top of Obsidian's native CSS variables」），暗态红/琥珀参考 `packages/server/src/pages.ts` 控制台暗色页；原型 `design/prototype/shared.css` 与其一一对应，本表只记语义与层级。

| Token | 语义 |
|---|---|
| `--bg --bg-alt --line` | 面板画布（Obsidian `--background-primary`）/ 次级画布卡片底（`--background-secondary`）/ 描边分隔（`--background-modifier-border`） |
| `--ink --mute` | 主/次级文字 |
| `--accent --accent-hover --accent-contrast --accent-soft` | 微信绿：主投递按钮/选中态/成功态（`--publy-accent`）+ 悬停进行中 + accent 之上的文字与图标 + 弱底 |
| `--danger --amber` | 失败/拦截（`--publy-danger`）/ 已排期·结果未知·警告（`--publy-amber`） |
| `--paper --paper-ink` | 公众号纸面：恒白恒黑不随主题变化（唯一恒白表面，见不变式 1） |
| `--wx-link --wx-avatar` | 微信账号名蓝（views.ts meta 行）/ 头像锈红（微信品牌色，不随主题变化） |

- **字体**：`-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`（与 views.ts 纸面、server 页面同栈）；面板 UI 13px 为主、次级 12px、面板标题 15px/600；纸面标题 21px/600、正文 15px/1.6。
- **圆角**：纸面 10px · 结果条/卡片 8px · 控件 6px · 徽标/宽度胶囊 999px。**间距节奏**：4/8/12/16/24。**动效**：120–150ms ease（结果条滑入 250ms），不过度。
- **图标**：unicode 符号优先（↻ ⧉ ➤ ✓ ✕ ⚠ ?），与 Obsidian 内置图标语义对应；不用 emoji 承担界面职责。
- **语言**：界面文案双语 zh/en（`src/i18n.ts` 双源，默认跟随 Obsidian 界面语言）；原型以 zh 展示。

## 组件词汇

`LeafHead`（面板头：视图标题 + 图标动作）· `PreviewToolbar`（刷新/复制/手机-桌面宽度胶囊/本次发布形式/主题切换/投递主按钮——投递按钮文案含目标账号）· `ResultStrip`（五态：成功/已排期/失败/去重跳过/结果未知，未知态内嵌「查询结果」动作，无动作 6s 自动淡出）· `Paper`（白底公众号文章模拟：标题/头像+账号+作者+草稿徽标/头发线/正文）· `CardStrip`（3:4 卡片横向拼带 + 渲染计数 x/y + 骨架占位）· `CaptionCard`（帖子配文卡）· `PreflightList`（fix/warn/pass 三级清单，fix 项带修复动作；底部「本地检查 · 未联网 · 未创建草稿」披露行）· `HistoryTimeline`（待发任务 + 最近记录，ok/scheduled/unknown/fail 四色节点）· `SettingsForm`（连接/账号/主题/预览行为分组 + 测试连接结果行）· `EmptyHint`（空态居中提示 + accent 弱底图标）。

## 不变式

1. `--paper` 永远 `#ffffff`、正文永远 `--paper-ink`，不随亮暗主题变化——公众号在白底渲染；纸面是面板中唯一恒白表面，其余界面一律跟随 Obsidian 主题。
2. `accent` 绿只用于：主投递按钮、当前选中/激活态、成功与进行状态；`danger` 专职失败与拦截、`amber` 专职已排期/结果未知/警告；三者禁止大面积色块，弱底一律用 soft 变体。
3. 结果绑定提交：结果文本必须指名提交时的账号与标题；「结果未知 ≠ 失败」，先查询/核对草稿箱再决定，重试沿用原请求身份；超时不推断为失败。
4. 预览与检查零副作用：不修改原文、不联网、不创建草稿；媒体未就绪时投递被拦截，修复清单给出具体文件与动作，不允许「发布成功但图片静默丢失」。
5. 亮暗成对：每个表面两种主题同时设计（恒白纸面除外，见 1）；面板窄幅垂直排布，层级 ≤3 层（bg < bg-alt < 纸面/浮层），层级靠底色与 `line` 分隔，不用阴影堆叠表达（纸面浮起是唯一例外）。


## 2026-11-15 · 原型交互补齐

入口为 prototype/preview-article.html。文章、图片消息、历史、设置可互达，宽度切换、富文本复制、连接演示、历史操作均有反馈；阻断状态页仍保留未修复项，绝不把选择封面等同于全部发布检查通过。

根级 index.html 只负责首次进入主界面；页面切换直接到目标界面，不再保留页面目录。原型运行脚本 prototype-runtime.js / prototype-flow.js 只表达浏览器内的交互合同；正式产品业务仍由既定引擎实现。真实设备、模型和发布服务均未连接。凭据演示不保存密钥，破坏性示例与派发保留确认和取消。

这些是可评审的增量改动，未替用户勾选满意度、HIG 最终验收或设计冻结条件。


## Prototype source checkpoint — 2026-11-15

`index.html` opens the primary prototype directly. Screen-directory launchers have been removed. All local scripts, styles and referenced assets needed by this checkpoint are versioned under this directory; OpenDesign metadata is excluded. This is an editable prototype checkpoint, not a claim that the native product or external services implement these interactions.


## Operation options — owner decision 2026-11-23

Obsidian is the recommended human workflow; the editor-independent CLI and official skill share one `PublicationOptions` contract. Note properties never select format, title, cover, theme, author, caption, tags or asset roots. A leading properties block is skipped without evaluating YAML; sources remain unchanged.

The toolbar contains exactly article / image-and-caption / cards, with article selected initially. There is no automatic/document mode. Draft and scheduled-draft actions open a keyboard-accessible operation dialog naming the note and account, with format, title, author, digest and caption fields. The user may preview these options without submitting, or explicitly confirm draft delivery. Settings supply theme defaults; the current operation overrides them. A cancelled dialog never renders remotely or submits. The note, account, raw source and selected options are captured for the operation so later note/account changes cannot retarget the draft. Preview and submission use identical parameter normalization; remote recovery preserves the original payload.

Prototype slice: existing preview pages and prototype-flow.js. Acceptance: all three formats, cancellation, explicit confirmation, matching preview/request options, malformed/private properties ignored without leaks, source immutability, and offline rendering. No true draft submission is authorized by testing this slice.

## NowPay Direct monthly operation (2026-11-23)

Owner request and issue #105: the current hosted purchase page uses a single Personal MONTH offer at 29 CNY, no automatic renewal. Preserve the existing page appearance. The first operation authenticates or creates one application account; allow restoring the same account with its API key, without exposing the key in a URL. Query current rights before offering purchase. Valid access shows its verified platform period and no purchase control; PURCHASE_REQUIRED shows the signed-provider purchase entrance/locally generated QR only when all purchase gates pass; DENY/unavailable never opens checkout. A return/refresh re-queries current rights, including after server/browser-session restart. No redirect or local paid flag activates access. `prototype/hosted-purchase.html` owns these states; its buttons are local simulation only.

The product calls the released isolated Commerce socket service, independently verifies nonce/service/product/account-bound fresh Permit evidence, then meters the provider's exact period. Public HTTP processes never read merchant or Permit private keys. Keep the public purchase gate closed until native Direct and product acceptance, merchant limits and filing are verified.

Direct slice validation (2026-11-23, #105): local synthetic browser walkthrough exercised first signup, closed purchase state and explicit refresh to active rights; this is UI fixture evidence, not Alipay payment evidence. Existing hosted page appearance is retained, with password-field sizing, secondary copy/refresh actions, visible focus and dark-mode colors in the prototype. Cross-browser, narrow viewport and 200% text enlargement remain unverified; public rollout stays gated. Server identity, restart, period quota and withdrawal tests supplement the browser state walkthrough.

## First-run web journey (2026-11-24, #107)

Owner request: a nontechnical customer must be able to find the official WeChat whitelist entry, connect their own account, configure Obsidian, and inspect a first draft without operator-only instructions. This expands the former plugin-only UI scope to the public site and customer service pages. Public sales stay gated; pricing remains under owner review, with no offer changes in this slice. Decision `2026-10-auth-1` is unchanged. Starting product SHA: `d05c2d2b83316a4b6c0c8e7838a429663c53e794`; family standard `2026-11-20-minimal-family`.

Prototype: `prototype/setup.html`, `prototype/public-web.css`, `prototype/public-web.js`. Public web tokens live in the existing prototype directory, separate from the native Obsidian paper tokens, because public pages follow the system theme while the draft simulation stays white. Generated static and packaged-server consumers must use this one source; do not edit generated site-kit CSS. Use system UI fonts, quiet neutral surfaces and one accessible green accent (a darker green than the native plugin’s brand green for text/white-button contrast). Admin retains its denser operator layout with the same semantic colors. Existing site-kit homepage geometry remains, mapped to the public tokens.

Flow: restore Publy key → display service-configured egress IP → official WeChat guide → explicitly validate and bind via existing authenticated `/v1/bind` → client settings and first draft instructions. No new paid rights, purchase gate or draft side effects. Connection success means only credentials/IP validation; draft API permission remains a separate check. Never reset AppSecret automatically. Keep existing whitelist entries. AppSecret is password input, never stored in browser storage; clear on success and forget. Publy key uses existing tab-scoped session storage, never a URL. Public `/setup` contains no account data or credentials; owned accounts remain authenticated.

Exit evidence required: shared stylesheet generation check; authenticated owned-account flow and wrong-key isolation; failed whitelist correction; empty-key copy prevention; closed/active purchase navigation; light/dark, narrow viewport and keyboard review; paired English/Chinese direct official links, permission prerequisites and unknown-result recovery. Official WeChat platform navigation is not yet observed in this environment (site access blocked), so distinguish current/legacy entry labels and document that labels may vary. No fabricated platform screenshots or claim of real-payment/refund completion.

Operator follow-up within #107: `prototype/operator-web.html` records the shared-theme login surface, quiet navigation, readable error badges and narrow feed controls. In the actual operator page, shared styles must not promote every navigation item to a primary action. Narrow navigation retains visible names and an accessible current-page marker; logout remains available. The login panel and table hover/error states must use paired semantic surfaces, and feed headings/controls stack instead of compressing into vertical text. No operator data mutation or billing scope is added.

## 原型对齐家族基线（2026-11-26）

家族规范修订 `2026-11-20-minimal-family`；起始 SHA `45d449af55f1489b654bf1953562d8f8fad3f018`。只改 `design/prototype/`，不改信息架构、强调色、token 值、布局结构、示例数据与文案含义。`public-web.css` / `public-web.js` / `setup.html` 未动，生成产物无漂移。渲染证据：无头 Chromium 1280×800，9 页 × 亮/暗，基线 → 本轮。

| 检查 | 结果 | 证据 / 限制 |
|---|---|---|
| R1 主题切换 | 通过 | 6 个插件页 `#themeBtn`：`◐` → 线性 SVG（16px、stroke 1.7、`aria-hidden`），浅色显太阳、深色显月亮；按钮 28px，静息无底无框，悬停借 `bg` 作底色。`aria-label` 与 `title` 指向点击后的主题（切换浅色 / 深色主题），由 `prototype-runtime.js` 随 `#app` 的 `.dark` 同步。`operator-web.html` 同款，命中区保持 44px。7 个控件各真实点击一次：图标与名称在两个方向都翻转。`setup.html` 的文字按钮未动，见「仍开放」。 |
| R2 12px 下限 | 通过（1 项登记例外） | 源扫描 14 → 5 处声明，渲染 `small` 64 → 34，余下全部落在下述例外。角色层级不变：辅助 12 / 标签 13 / 正文 14。 |
| R3 减弱动效与焦点 | 通过 | `shared.css` 补 `prefers-reduced-motion` 与全局 `:focus-visible`（2px `--accent`、offset 2px）；公开网页三件套原本已有。焦点环在浅色下对白底 2.38:1，受强调色取值所限。 |
| R4 原型完整性 | 通过（一处与家族清单不同，保留现状） | 零远程依赖，本地 `href` / `src` 全部可解析（`/hosted` 是产品路由）。`index.html` 仍按 2026-11-15 的决定直接进入主界面、不设目录页；家族清单的「导航页」不覆盖该契约，要改需另行决策。 |
| R5 可访问名称 | 通过 | 仅图标的按钮补 `aria-label`（历史、刷新、重新检查、关闭、重新渲染、复制），主按钮的装饰 `➤` 标 `aria-hidden`；`nameless` 2 → 0。设置页开关是 `role="switch"` + `aria-labelledby`——原型脚本原先把它覆盖成了 `button`。 |
| R6 版式缺陷 | 通过 | 1280 以下窗口不再横向溢出（1024 宽 240 → 0，800 宽 464 → 0）；`preview-cards` 的画布底色铺满面板；`operator-web` 的「重连」不再竖排，网关地址完整可见。 |
| R7 契约同步 | 通过 | 本节；token 值未变，token 表无需改行。 |
| R8 仓库门禁 | 通过 | `node scripts/sync-public-web.mjs --check`、`node --test scripts/public-web-generation.test.mjs`。 |
| 对比度（未要求，仅记录） | 未变 | `low` 188 → 188，见「仍开放」②。 |

**登记例外（R2）**：`preview-cards.html` 的 `.card` 内文字——`.wm` 9px、`.pg` 9.5px、`.cover .k` 9.5px、`.cover .sub` 11px、`.ending .cta` 11px。
- 场景：预览面板里缩小的卡片图片示意（150×200）。
- 偏离项：12px 下限。
- 用户收益：实物由 `packages/core/src/cards.ts` 渲染成图片，水印与页码画在图内，本来就小于正文；放大到 12px 会让水印与正文描述等大，示意失真。
- 替代方案：这些字代表输出画面的像素，不承担界面职责；承载信息的界面文字（渲染计数、配文）在卡片之外，已是 12–14px。
- 验收证据：渲染 `small` 的 34 个节点全部是 `.card` 内文字；源扫描剩余 5 条均在此处。

**偏离登记**：主题切换图标用家族线性 SVG，与上文「图标」一行的 unicode 优先不同。其余 unicode 符号（↻ ⧉ ➤ ≡ ✕ ▾）本轮未换，留待下一切片与实现（`views.ts` 已用 `setIcon`）一并对齐。

**仍开放（需产品决策）**：① `setup.html` 导航栏的主题切换是带文字的 `.secondary` 按钮，与同栏 EN / 中文 一致，线上另 7 个公开页共用同类写法（文案在 `design/` 之外）；换成家族图标要连同 `docs/*.html` 与 `scripts/build-user-pages.mjs` 一起改。② ~~浅色主题对比度~~ 已于 2026-11-26 落地，见下节。③ ~~小号 `.tbtn` 高约 25px~~ 已随下节改为 `min-height: 28px`。④ `settings.html` 的主题按钮被弹窗遮罩盖住，深浅色靠其他页面记住的偏好。

## 对比度落地（2026-11-26）

起始 SHA `a0b731c`，只改 `design/prototype/shared.css` 与本文件。上节「仍开放」②③由 owner 授权按「保色相、普通文字不低于 4.5:1」处理。

| Token | 亮色 | 暗色 | 说明 |
|---|---|---|---|
| `--accent` | `#07c160` → `#057f3f` | `#07c160`（不变） | 同一绿色色相。亮色作为文字对白底 5.13、`bg-alt` 4.62、弱底 4.68；暗色原值对深底已有 6.99。与公开网页 `public-web.css` 的配对一致（亮 `#176842` / 暗 `#9ed7ad`）。 |
| `--accent-hover` | `#06ad56` → `#047239` | 新增 `#1ecb75` | 悬停只做明度微调。 |
| `--accent-contrast` | 新增 `#ffffff` | 新增 `#102016` | 主按钮文字与进行中图标。暗色 accent 偏亮，白字只有 2.38，改用深墨。 |
| `--mute` | `#7a7a7a` → `#6f6f6f` | 不变 | `bg-alt` 上 3.87 → 4.56。 |
| `--amber` | `#b8860b` → `#8d6608` | 不变 | 白底 3.25 → 5.19。 |
| `--danger` | `#e5484d` → `#d61e24` | 不变 | 白底 3.91 → 5.14。 |

`.tbtn` 加 `min-height: 28px`，结果条与历史行里的小号按钮不再只有约 25px 高。

**登记例外（对比度，内容示意）**：`preview-cards.html` 的 `.card`、`.canvas` 内文字与字面量 `#07c160`，`preview-article.html` 的 `.paper` 内文字，以及编辑器正文里的 `.figcap` / `.fnotes` / `.proto-link`。
- 场景：预览面板里的卡片图片示意、恒白的公众号纸面、作为上下文的编辑器正文。
- 偏离项：普通文字对比度 4.5:1。
- 用户收益：这些字代表导出图片与用户文档的实际样子，不是界面；按界面上调会让预览失真。
- 替代方案：承载操作与状态的界面文字全部走 token，已过线。
- 验收证据：渲染 `low` 的 32 个节点全部落在上述三类内容内。

**产品侧待同步**：值类 token 真源是 `packages/obsidian-plugin/styles.css`，本轮只改了原型镜像；产品样式与 `server` 暗色页随下一个实现切片对齐，属于漂移台账项。

验证：无头 Edge 1280×800，9 页 × 亮/暗，低于 4.5:1 的文字对由 159 / 34 降为 32 / 32（全部在登记的内容示意内）；小字、溢出、可访问名称无变化。


## 2026-11-26 契约补充：默认密度与尺度待办

家族规范修订 `2026-11-20-minimal-family` §6 要求契约记录默认密度与尺度偏离。起始提交 `e900f2f`，本节只补记录，未改原型样式。

- **默认密度：**紧凑**。现有工具条按钮 24–28px。理由：编辑器把画布与检查器并排，工具条需要在窄高度下容纳多组动作。
- **尺度待办**：静态扫描 `design/` 下全部样式，列出家族尺度之外的值。家族字号角色之外：15px×4、17px×1 应吸附到 14 / 16；20–28px 为成品预览里的展示级标题，另议。**工具条按钮 24–26px 低于紧凑预设下限 28px**，需在下一次编辑器切片提到 28。圆角尺度之外：2 / 5 / 6 / 9 / 10 / 14 / 16px，应吸附到 4 / 8 / 12。`preview-cards.html` 的 11px×2 位于已登记例外（公众号卡片成品示意），保持不变。按规范「已有产品在下一次相关切片渐进对齐」处理，不在对比度修复里盲改。

## 气质档位声明与对齐 — 2026-11-26（家族规范 `2026-11-26-temperament-profiles`）

本轮按 owner 指令对全部产品原型过一遍新规范。做法是「声明档位 + 对齐受影响的差量 + 记录遗留」：没有重绘任何屏幕，没有改动信息架构，也没有新增 token 值表。**档位由 agent 代为判定，待 owner 确认或更正。**

### 档位

- **主档位**：静读。在 Obsidian 内写作并发布，主体是文章。
- **主任务**：沿用上文 Brief，本节不复述。
- **与静读默认的差量**：无，取 §4 默认值；强调色沿 Obsidian 原生变量的语义不变。
- **借用档位**：`preview-cards.html` 的卡片画布是导出图的等比预览，按图像对待。
- **工作台结构**（§9）：沿用现有布局，本轮未调整面板；「同一时间最多一个从属面板」留到核心屏打磨轮核对。

### 本轮改动

- 字体栈：UI 栈与等宽栈在通用回退前补 CJK 回退（§9「等宽与中文」）；值仍只维护在 `shared.css`。
- 排版基线块：`body { text-autospace: normal; line-break: strict }`、亮暗成对的 `::selection`、中性 `scrollbar-color`（§10 中文排版、状态齐全）。
- `preview-article.html`：作者名、图注、脚注由硬编码的浅灰（2.85:1、3.54:1）改为 `--muted`；「草稿预览」胶囊改为 `--muted` 压 `--tint`（原 2.01:1）；脚注链接改用 `--green`（暗色原 3.13:1）。

### 测量

无头 Edge 1280×800（移动页 390×844），亮暗各渲染一次，逐页统计；对比度为脚本近似计算（半透明高亮底、彩色 emoji、content 里的符号会被误计）。

低对比文字 79→49：剩余 34 处在卡片画布内（9–12px 的导出图文字，不计入 UI 字号下限），其余是导航页的暗色链接；字号低于 12px 34→34，同样全部在卡片画布内。

### 遗留（本轮未处理）

- `design/index.html` 导航页的暗色链接 3.13:1 未改（本地评审页）。
- 行内文字链接的命中区不足 24px（上轮基线遗留，面广）：本轮未动，需逐页裁决是加内边距还是改成按钮。
- 上文已记的尺度待办（圆角、字号、字重）不变，继续渐进对齐。
- §10 核心屏打磨轮：每轮须 owner 裁决；本轮只有 agent 的测量与自评，不计入打磨轮次。
