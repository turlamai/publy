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
| `--accent --accent-hover --accent-soft` | 微信绿：主投递按钮/选中态/成功态（`--publy-accent`）+ 悬停进行中 + 弱底 |
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
