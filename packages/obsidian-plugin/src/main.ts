// Publy Obsidian plugin — client A: write in Obsidian, publish through a Publy server.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Plugin, ItemView, WorkspaceLeaf, Notice, PluginSettingTab, App, Setting, TFile, requestUrl, Modal, setIcon, sanitizeHTMLToDom } from "obsidian";
import {
  renderMarkdown,
  renderCards,
  captionToHtml,
  imagePostCaption,
  parseSource,
  resolvePublication,
  type PublicationFormat,
  blockingMediaWarning,
  draftIdempotencyKey,
  setPngRenderer,
  setEmbeddedFontSubsets,
  generateTitleCover,
  listInstalledThemes,
  readInstalledTheme,
  BUILTIN_CARD_THEMES,
} from "@publy/core";
import { configureBundledMath } from "@publy/core/math-bundled";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import embeddedResvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
// theme/highlight css inlined as text by esbuild (loader ".css": "text")
import claudeThemeCss from "../../core/themes/claude.css";
import mediumThemeCss from "../../core/themes/medium.css";
import wechatThemeCss from "../../core/themes/wechat.css";
import inkThemeCss from "../../core/themes/ink.css";
import techThemeCss from "../../core/themes/tech.css";
import roseThemeCss from "../../core/themes/rose.css";
import officialThemeCss from "../../core/themes/official.css";
import fortuneThemeCss from "../../core/themes/fortune.css";
import terminalThemeCss from "../../core/themes/terminal.css";
import newsThemeCss from "../../core/themes/news.css";
import hljsGithubCss from "highlight.js/styles/github.css";
import hljsGithubDarkCss from "highlight.js/styles/github-dark.css";
// esbuild's binary loader embeds these two font subsets in main.js. Official
// Community Directory installs do not fetch the dist/fonts sidecar.
import embeddedRegularFont from "../../core/fonts/NotoSansSC-subset-Regular.otf";
import embeddedBoldFont from "../../core/fonts/NotoSansSC-subset-Bold.otf";

const THEME_CSS: Record<string, string> = {
  claude: claudeThemeCss,
  medium: mediumThemeCss,
  wechat: wechatThemeCss,
  ink: inkThemeCss,
  tech: techThemeCss,
  rose: roseThemeCss,
  official: officialThemeCss,
  fortune: fortuneThemeCss,
  terminal: terminalThemeCss,
  news: newsThemeCss,
};

const THEME_LABELS: Record<string, string> = {
  claude: "Claude 暖橙",
  medium: "Medium 简白",
  wechat: "微信编辑器",
  ink: "水墨",
  tech: "科技",
  rose: "玫瑰",
  official: "公众号官方",
  fortune: "财经报刊",
  terminal: "终端（深色代码）",
  news: "新闻早报",
};


// --- i18n ------------------------------------------------------------------
// Bilingual UI (zh/en). Preference comes from settings ("auto" follows the
// Obsidian interface language). Command/menu names bake in at load, so a
// language change asks for a reload to take full effect.
type Lang = "zh" | "en";
let LANG_PREF: "auto" | Lang = "auto";
const STRINGS: Record<string, { zh: string; en: string }> = {
  cmdPublish: { zh: "发布当前笔记", en: "Publish current note" },
  cmdSchedule: { zh: "定时发布…", en: "Publish at scheduled time…" },
  cmdPreview: { zh: "预览排版（自动：文章/图片消息）", en: "Preview (auto: article or image-post cards)" },
  cmdPreviewBrowser: { zh: "在浏览器中预览排版 HTML", en: "Preview rendered HTML in browser" },
  cmdCopy: { zh: "复制排版富文本（粘贴到公众号编辑器）", en: "Copy rendered rich text (paste into WeChat editor)" },
  cmdHistory: { zh: "打开发布历史与待发任务", en: "Open publish history & scheduled jobs" },
  cmdSwitch: { zh: "切换公众号账号", en: "Switch WeChat account" },
  ribbon: { zh: "Publy: 发布当前笔记", en: "Publy: publish current note" },
  ribbonPreview: { zh: "Publy: 预览当前笔记", en: "Publy: preview current note" },
  menuPublish: { zh: "Publy: 发布到公众号草稿箱", en: "Publy: Publish to WeChat drafts" },
  menuPreview: { zh: "Publy: 预览排版", en: "Publy: Preview typeset" },
  menuCopy: { zh: "Publy: 复制排版富文本", en: "Publy: Copy rich text" },
  viewPreview: { zh: "Publy 预览", en: "Publy Preview" },
  viewHistory: { zh: "Publy 发布历史", en: "Publy History" },
  btnRefresh: { zh: "↻ 刷新", en: "↻ Refresh" },
  btnCopy: { zh: "复制 rich text", en: "Copy rich text" },
  btnPublish: { zh: "发布 → 公众号草稿箱", en: "Publish → WeChat drafts" },
  pillDraft: { zh: "草稿预览", en: "Draft preview" },
  previewHint: { zh: "打开一篇笔记，这里会实时预览它的公众号排版。", en: "Open a note — its WeChat-ready typeset shows up here, live." },
  noTitle: { zh: "(无标题)", en: "(untitled)" },
  setLang: { zh: "界面语言", en: "Language" },
  setAutoPreview: { zh: "打开笔记时自动预览", en: "Auto-preview on note open" },
  setAutoPreviewDesc: { zh: "每个笔记打开时自动渲染公众号排版预览（高频预览零交互）；预览面板已开时切换笔记自动跟随；重度用户也可在 设置→快捷键 里为「预览当前笔记」绑热键", en: "Render the WeChat preview automatically as each note opens; with the panel open, switching notes follows along; heavy users can also bind a hotkey to 'Preview current note' in Settings → Hotkeys" },
  setLangDesc: { zh: "自动跟随 Obsidian 界面语言；命令名需重载插件后更新", en: "Auto follows the Obsidian UI language; command names update after reload" },
  langAuto: { zh: "自动", en: "Auto" },
  langReload: { zh: "Publy: 界面语言已保存——命令名等将在重载插件后完全生效", en: "Publy: language saved — command names update fully after reload" },
  intro: {
    zh: "本地预览和复制富文本无需服务或账号。若要保存到公众号草稿箱，请先配置自己的 Publy 服务端、API key 和公众号账号，再测试连接；当前不提供可购买的托管服务。",
    en: "Local preview and rich-text copy need no server or account. To save to WeChat drafts, configure your own Publy server, API key and WeChat account, then test the connection. Paid hosting is not currently available.",
  },
  guideLink: { zh: "使用手册", en: "Guide" },
  setServer: { zh: "Server 地址", en: "Server URL" },
  setServerDesc: { zh: "Publy 服务地址，带协议，例如 https://publy-api.example.com", en: "Publy server URL incl. protocol, e.g. https://publy-api.example.com" },
  setKey: { zh: "API key", en: "API key" },
  setKeyDesc: { zh: "只保存在本机 vault 配置里", en: "Stored only in this vault's plugin data" },
  setAccount: { zh: "公众号账号名", en: "WeChat account" },
  setAccountDesc: { zh: "服务端绑定的账号名；配置好后自动列出 key 名下的账号", en: "Account bound on the server; auto-lists your accounts once configured" },
  setAccountFallback: { zh: "my-account（配置服务后可下拉选择）", en: "my-account (configure the server to get a dropdown)" },
  setMedia: { zh: "媒体目录", en: "Media folder" },
  setMediaDesc: { zh: "本地图片查找目录；留空 = 自动跟随 vault 附件设置", en: "Where local images live; empty = follow the vault attachment setting" },
  setMediaPlaceholder: { zh: "自动（vault 附件目录）", en: "Auto (vault attachment folder)" },
  setTheme: { zh: "主题", en: "Theme" },
  setThemeDesc: { zh: "文章排版主题；通过 CLI 安装的主题可在重新打开设置后选择。terminal 使用深色代码高亮。", en: "Article theme; themes installed by the CLI appear after reopening settings. Terminal uses dark code highlighting." },
  themeLoadError: { zh: "已选主题不存在或已损坏，请重新安装主题或切换内置主题。", en: "The selected theme is missing or invalid. Reinstall it or select a built-in theme." },
  themeListError: { zh: "无法读取已安装主题，请用命令行检查主题目录。", en: "Installed themes could not be read. Check the theme directory using the CLI." },
  setConn: { zh: "连接", en: "Connection" },
  setConnDesc: { zh: "检查服务可达性、API key 与套餐配额", en: "Check reachability, API key and plan quota" },
  btnTest: { zh: "测试连接", en: "Test connection" },
  testing: { zh: "测试中…", en: "Testing…" },
  badServerUrl: { zh: "❌ Server 地址格式不对（要带 https:// 或 http://）", en: "❌ Server URL looks wrong (include https:// or http://)" },
  needKey: { zh: "❌ 先填 API key", en: "❌ Enter the API key first" },
  keyInvalid: { zh: "❌ key 无效或被停用（服务返回 {code}）", en: "❌ Key invalid or disabled (server said {code})" },
  connOk: { zh: "✅ 连接正常 — {usage}", en: "✅ Connected — {usage}" },
  connOkNoAccount: { zh: " · 还没填公众号账号名，发布时会用服务端默认账号", en: " · no account set; the server default will be used" },
  planAdmin: { zh: "管理员 key（无限额）", en: "admin key (no quota)" },
  planUsage: { zh: "套餐 {plan} · 本月 {used}/{limit} 篇", en: "plan {plan} · {used}/{limit} posts this month" },
  connFail: { zh: "❌ 连接失败：{msg} — 请检查 Server 地址与 API key", en: "❌ Connection failed: {msg} — check the Server URL and API key" },
  noActiveNote: { zh: "Publy: 没有活动笔记", en: "Publy: no active note" },
  errNoActiveNote: { zh: "没有活动笔记", en: "no active note" },
  healthBad: { zh: "health 响应异常", en: "unexpected health response" },
  coverExplicit: { zh: "封面：自选图片", en: "cover: your pick" },
  coverPickTitle: { zh: "选择这篇的封面", en: "Pick a cover for this note" },
  coverAutoTile: { zh: "自动标题卡", en: "Auto title card" },
  btnConfirm: { zh: "确定", en: "OK" },
  coverFirst: { zh: "封面：正文首图", en: "cover: first image" },
  coverAuto: { zh: "封面：自动标题卡", en: "cover: auto title card" },
  ensureConfigured: { zh: "Publy: 还差一步——在设置里填 Server 地址和 API key（可用「测试连接」验证）", en: "Publy: almost there — set the Server URL and API key in settings (Test connection verifies it)" },
  inFlight: { zh: "Publy: 已有一篇在发布中——稍等，完成后会弹结果", en: "Publy: a publish is already running — the result will pop shortly" },
  rendering: { zh: "Publy: 渲染中…", en: "Publy: rendering…" },
  uploading: { zh: "Publy: 上传到公众号…", en: "Publy: uploading to WeChat…" },
  renderFail: { zh: "Publy: 渲染失败 — {msg}", en: "Publy: render failed — {msg}" },
  mediaNotReady: { zh: "素材未就绪，草稿未发送。请修复：", en: "Media not ready; draft NOT sent. Fix:" },
  coverFormatBad: { zh: "封面必须是有效的 PNG/JPEG 图片：{path}", en: "Cover must be a valid PNG/JPEG image: {path}" },
  publishFail: { zh: "Publy: 发布失败 — {msg}", en: "Publy: publish failed — {msg}" },
  publishOk: { zh: "✅《{title}》已进公众号草稿箱（{sec} 秒）", en: "✅ [{title}] is in your WeChat drafts ({sec}s)" },
  scheduledOk: { zh: "🕒《{title}》已排期 {when} — 在「发布历史」里可取消", en: "🕒 [{title}] scheduled for {when} — cancel it in History" },
  deduped: { zh: "Publy: 10 分钟内已发过《{title}》——本次跳过（防重复）", en: "Publy: [{title}] was just published — skipped as duplicate" },
  netFail: { zh: "Publy: 发布失败 — {msg}", en: "Publy: publish failed — {msg}" },
  badServer: { zh: "Publy: Server 地址格式不对——需要带协议，例如 https://publy-api.example.com", en: "Publy: Server URL is malformed — include the protocol, e.g. https://publy-api.example.com" },
  copyHasImages: { zh: "Publy: 笔记包含图片或公式附件，已取消复制以避免无效链接；请使用草稿交付功能", en: "Publy: copy cancelled — image or formula attachments need draft delivery, not unresolved clipboard links" },
  copyMediaNotReady: { zh: "Publy: 图片或公式渲染未完成，已取消复制，剪贴板内容未修改", en: "Publy: copy cancelled — media or math could not be rendered; clipboard left unchanged" },
  copyOk: { zh: "Publy: 已复制排版 rich text — 到公众号编辑器 Ctrl+V 粘贴", en: "Publy: rich text copied — paste into the WeChat editor with Ctrl+V" },
  wasmDown: { zh: "Publy: 卡片渲染器不可用（wasm 初始化失败）——文章发布不受影响", en: "Publy: card renderer unavailable (wasm init failed) — article publishing is unaffected" },
  previewCard: { zh: "预览卡片 {index}", en: "Preview card {index}" },
  cardsRendering: { zh: "Publy: 正在渲染图片消息卡片…", en: "Publy: rendering image-post cards…" },
  cardsFail: { zh: "Publy: 图片消息卡片渲染失败 — {msg}", en: "Publy: card rendering failed — {msg}" },
  wasmInitFail: { zh: "Publy: 卡片渲染器初始化失败（文章功能不受影响）——详情见开发者控制台", en: "Publy: card renderer failed to init (articles unaffected) — see the developer console" },
  histLoading: { zh: "加载中…", en: "Loading…" },
  histLoadFail: { zh: "加载失败：{msg} — 检查「测试连接」里的地址与 key", en: "Failed to load: {msg} — check URL & key under Test connection" },
  histNeedConfig: { zh: "配置 Server 和 API key 后，这里会显示发布历史与待发的定时任务。", en: "Once the Server URL and API key are set, publish history and scheduled jobs show up here." },
  histTitle: { zh: "发布历史", en: "History" },
  histJobs: { zh: "待发任务（{n}）", en: "Scheduled ({n})" },
  histJobsEmpty: { zh: "没有待发的定时任务。右键笔记或命令面板可排期。", en: "Nothing scheduled. Right-click a note or use the command palette to schedule." },
  histRecent: { zh: "最近记录", en: "Recent" },
  histEmpty: { zh: "还没有发布记录。", en: "No publishes yet." },
  btnCancel: { zh: "取消", en: "Cancel" },
  cancelOk: { zh: "已取消待发任务", en: "Scheduled job cancelled" },
  cancelFail: { zh: "取消失败：{msg}", en: "Cancel failed: {msg}" },
  typeImagePost: { zh: "图片消息", en: "image post" },
  typeArticle: { zh: "文章", en: "article" },
  formatLabel: { zh: "本次发布形式", en: "Format for this draft" },
  formatAuto: { zh: "跟随文档（{format}）", en: "Follow document ({format})" },
  formatArticle: { zh: "文章", en: "Article" },
  formatImage: { zh: "图片与配文", en: "Images and caption" },
  formatCards: { zh: "文字卡片", en: "Text cards" },
  acctFetchFail: { zh: "获取账号列表失败：{msg}", en: "Failed to list accounts: {msg}" },
  acctNone: { zh: "这个 key 名下没有公众号账号——请先在自托管服务端绑定（publy account add）", en: "No WeChat accounts under this key — bind one on your self-hosted server (publy account add)" },
  acctSwitched: { zh: "已切换到「{name}」", en: "Switched to [{name}]" },
  acctModalTitle: { zh: "切换公众号账号", en: "Switch WeChat account" },
  acctCurrent: { zh: "{name}（当前）", en: "{name} (current)" },
  acctSwitchBtn: { zh: "切换", en: "Switch" },
  schedTitle: { zh: "定时发布", en: "Schedule publish" },
  schedDesc: { zh: "到点由 Publy 服务自动发布到公众号草稿箱；配额在执行时计。", en: "The Publy server publishes to your WeChat drafts at the chosen time; quota counts at execution." },
  schedBtn: { zh: "排期", en: "Schedule" },
  schedInvalid: { zh: "时间无效或已过去——重新选一个未来时间", en: "That time is invalid or in the past — pick a future time" },
  browseLocal: { zh: "从本机选择图片…", en: "Pick an image from this computer…" },
  coverLocal: { zh: "本机图片", en: "Local image" },
  localCoverLost: { zh: "本机封面图已失效——请重新选择", en: "Local cover image lost — pick it again" },
  tipRefresh: { zh: "重新渲染预览", en: "Re-render the preview" },
  tipCopy: { zh: "复制排版 rich text", en: "Copy rendered rich text" },
  tipWidthMobile: { zh: "手机宽（390px）——公众号读者大多在手机", en: "Mobile width (390px) — most WeChat readers are on phones" },
  tipWidthDesktop: { zh: "桌面宽（700px）", en: "Desktop width (700px)" },
  tipTheme: { zh: "文章主题（切换即时重渲染）", en: "Article theme (re-renders instantly)" },
  pubRunning: { zh: "发布中…", en: "Publishing…" },
  resultOk: { zh: "已进草稿箱", en: "In your WeChat drafts" },
  resultScheduled: { zh: "已排期", en: "Scheduled" },
  resultDeduped: { zh: "10 分钟内已发过，本次跳过（防重复）", en: "Just published — skipped as duplicate" },
  resultFail: { zh: "发布失败", en: "Publish failed" },
  // #7: outcome-unknown is distinct from explicit failure — a dropped network
  // connection says nothing about whether the draft was created
  resultUnknown: { zh: "结果未知 — 草稿可能已创建；请查询结果并检查公众号草稿箱，不要直接重发", en: "Outcome unknown — the draft may exist. Query and check WeChat drafts before submitting again" },
  btnQueryResult: { zh: "查询结果", en: "Query result" },
  queryConfirmed: { zh: "✅ 已确认《{title}》在「{account}」草稿箱（幂等命中，未重复创建）", en: "✅ Confirmed: [{title}] is in [{account}] drafts (idempotent hit, no duplicate)" },
  queryUnknown: { zh: "服务端无法确认结果；请先检查公众号草稿箱，再决定是否新建草稿", en: "Server cannot confirm the outcome. Check your WeChat drafts before deciding whether to submit again" },
  queryFail: { zh: "Publy: 查询失败 — {msg}", en: "Publy: query failed — {msg}" },
  uploadingNamed: { zh: "Publy: 投递中 —《{title}》→「{account}」草稿箱", en: "Publy: delivering [{title}] → [{account}] drafts" },
  needAccount: { zh: "先选定公众号账号——不向未指定的默认账号投递（可在设置或「切换公众号账号」里选）", en: "Pick a WeChat account first — never submit to an unnamed default (Settings or the switch-account command)" },
  btnPublishNamed: { zh: "投递「{account}」草稿箱", en: "Deliver → [{account}] drafts" },
  emptyOpenHint: { zh: "打开一篇笔记，这里会实时预览它的公众号排版", en: "Open a note — its WeChat-ready typeset shows up here, live" },
};

function t(key: string, vars?: Record<string, string | number>): string {
  let lang: Lang = LANG_PREF === "auto"
    ? (typeof window !== "undefined" &&
       String((window as unknown as { moment?: { locale?: () => string } }).moment?.locale?.() ?? "en").toLowerCase().startsWith("zh") ? "zh" : "en")
    : LANG_PREF;
  let out = STRINGS[key]?.[lang] ?? STRINGS[key]?.zh ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split("{" + k + "}").join(String(v));
  return out;
}

/** Only validated content-only bundles are offered to the plugin. */
function availableArticleThemes(): Record<string, string> {
  const choices: Record<string, string> = Object.assign(Object.create(null), THEME_LABELS);
  try {
    for (const theme of listInstalledThemes()) {
      if (!Object.hasOwn(choices, theme.id) && !Object.hasOwn(BUILTIN_CARD_THEMES, theme.id)) {
        choices[theme.id] = `${theme.name} · ${theme.version}`;
      }
    }
  } catch { new Notice(t("themeListError")); }
  return choices;
}
function articleThemeCss(id: string): string {
  if (Object.hasOwn(THEME_CSS, id)) return THEME_CSS[id];
  try { return readInstalledTheme(id).css; }
  catch { throw new Error(t("themeLoadError")); }
}

const VIEW_TYPE_PUBLY_PREVIEW = "publy-preview";
const PUBLY_HISTORY_VIEW = "publy-history";

interface PublySettings {
  server: string;
  apiKey: string;
  account: string;
  mediaDir: string;
  theme: string;
  lang: "auto" | "zh" | "en";
  /** open the preview panel automatically as each markdown note opens */
  autoPreview: boolean;
  /** preview panel width: 390px "mobile" (the WeChat norm) or 700px "desktop" */
  previewWidth: "mobile" | "desktop";
  /** file path -> last cover choice ("auto" or attachment name) */
  lastCover: Record<string, string>;
}

const DEFAULT_SETTINGS: PublySettings = {
  server: "",
  apiKey: "",
  account: "",
  mediaDir: "",
  theme: "claude",
  lang: "auto",
  autoPreview: false,
  previewWidth: "desktop",
  lastCover: {},
};

interface PublishResponse {
  mediaId?: string;
  code?: string;
  message?: string;
  scheduled?: boolean;
  jobId?: string;
  runAt?: string;
  coverSource?: "cover" | "first-image" | "auto";
  /** server echo of the submitted identity (#7): results name their own
   *  destination and request instead of whatever preview is now visible */
  account?: string;
  title?: string;
  requestId?: string;
  deduped?: boolean;
}

/** GET /v1/publish-result/:key answer */
interface PublishResultInfo {
  status: "confirmed" | "unknown";
  mediaId?: string;
  account?: string;
  title?: string;
  requestId?: string;
}

interface HistoryEntry {
  ts: string;
  event: string;
  account?: string;
  title?: string;
  type?: string;
  mediaId?: string;
  error?: string;
}

interface JobEntry {
  id: string;
  runAt: string;
  status: string;
  account?: string;
  type?: string;
  title?: string;
  error?: string;
}

/** In-app preview leaf: article HTML or image-post card strip, with a small
 *  action toolbar (refresh / copy / publish) so the preview is a cockpit,
 *  not a dead end. */
class PublyPreviewView extends ItemView {
  plugin: PublyPlugin;
  notePath = "";
  documentFormat: PublicationFormat = "article";
  /** re-renders the current preview; set on every render by the plugin */
  refresh: (() => Promise<void>) | null = null;
  private publishBtn: HTMLButtonElement | null = null;
  private resultEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: PublyPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return VIEW_TYPE_PUBLY_PREVIEW; }
  getDisplayText(): string { return t("viewPreview"); }
  getIcon(): string { return "send"; }
  async onOpen(): Promise<void> {
    // after a restart the restored leaf would sit empty — populate it with
    // whatever note is active (or a hint until one is)
    this.app.workspace.onLayoutReady(() => {
      const active = this.app.workspace.getActiveFile();
      if (active) void this.plugin.previewCurrentNote(active);
      else this.renderHint();
    });
  }
  renderHint(): void {
    this.contentEl.empty();
    this.resultEl = null;
    this.publishBtn = null;
    const d = this.contentEl.createEl("div");
    d.addClass("publy-empty");
    const icon = d.createEl("div");
    icon.addClass("publy-empty-icon");
    setIcon(icon, "send");
    d.createEl("div").setText(t("emptyOpenHint"));
  }
  async onClose(): Promise<void> { /* nothing */ }

  /** dim the publish button while a publish runs (spinner + label swap) */
  setPublishing(busy: boolean): void {
    if (!this.publishBtn) return;
    this.publishBtn.toggleClass("is-busy", busy);
    this.publishBtn.disabled = busy;
    const label = this.publishBtn.querySelector(".publy-btn-label");
    if (label) label.textContent = busy ? t("pubRunning") : t("btnPublish");
    // spinner element is toggled via CSS (.publy-spin shown when is-busy)
    let spin = this.publishBtn.querySelector(".publy-spin");
    if (busy && !spin) {
      spin = this.publishBtn.createEl("span");
      spin.addClass("publy-spin");
      this.publishBtn.prepend(spin);
    } else if (!busy) {
      spin?.remove();
    }
  }

  /** colored feedback strip between toolbar and canvas (ok / scheduled /
   *  error / deduped / unknown). `actions` render as buttons inside the strip;
   *  an actionable strip stays until answered instead of auto-fading. */
  setPublishResult(kind: "ok" | "scheduled" | "error" | "deduped" | "unknown", text: string, actions?: { label: string; onClick: () => void }[]): void {
    this.resultEl?.remove();
    const bar = this.contentEl.createEl("div");
    bar.addClass("publy-result");
    bar.addClass(kind === "ok" ? "is-ok" : kind === "scheduled" ? "is-scheduled" : kind === "deduped" ? "is-scheduled" : kind === "unknown" ? "is-scheduled" : "is-error");
    const icon = bar.createEl("span");
    icon.addClass("publy-result-icon");
    setIcon(icon, kind === "ok" ? "check-circle-2" : kind === "scheduled" ? "clock" : kind === "deduped" ? "copy-x" : kind === "unknown" ? "help-circle" : "x-circle");
    bar.createEl("span").setText(text);
    if (actions?.length) {
      const row = bar.createEl("span");
      row.addClass("publy-result-actions");
      for (const a of actions) {
        const b = row.createEl("button");
        b.addClass("publy-btn");
        b.textContent = a.label;
        b.addEventListener("click", a.onClick);
      }
    }
    this.contentEl.prepend(bar);
    this.resultEl = bar;
    if (!actions?.length) {
      window.setTimeout(() => {
        bar.addClass("publy-fade-out");
        window.setTimeout(() => bar.remove(), 300);
      }, 6000);
    }
  }

  private toolbar(): void {
    const bar = this.contentEl.createEl("div");
    bar.addClass("publy-toolbar");

    const ghost = (icon: string, tip: string, fn: () => void) => {
      const b = bar.createEl("button");
      b.addClass("publy-btn");
      b.setAttribute("aria-label", tip);
      b.setAttribute("title", tip);
      setIcon(b, icon);
      b.addEventListener("click", fn);
      return b;
    };
    ghost("refresh-cw", t("tipRefresh"), () => void this.refresh?.());
    ghost("copy", t("tipCopy"), () => void this.plugin.copyRenderedHtml());

    // mobile / desktop width pill — WeChat readers are mostly on phones
    const pill = bar.createEl("div");
    pill.addClass("publy-segpill");
    const widthMode = () => this.plugin.settings.previewWidth ?? "desktop";
    const seg = (mode: "mobile" | "desktop", icon: string, tip: string) => {
      const s = pill.createEl("button");
      s.addClass("publy-seg");
      s.setAttribute("aria-label", tip);
      s.setAttribute("title", tip);
      setIcon(s, icon);
      s.toggleClass("is-active", widthMode() === mode);
      s.addEventListener("click", () => {
        this.plugin.settings.previewWidth = mode;
        void this.plugin.saveSettings();
        for (const el of pill.querySelectorAll(".publy-seg")) el.removeClass("is-active");
        s.addClass("is-active");
        this.canvasEl()?.toggleClass("is-mobile", mode === "mobile");
        this.paperEl()?.toggleClass("is-mobile", mode === "mobile");
      });
    };
    seg("mobile", "smartphone", t("tipWidthMobile"));
    seg("desktop", "monitor", t("tipWidthDesktop"));

    const spacer = bar.createEl("div");
    spacer.addClass("publy-spacer");

    const format = bar.createEl("select");
    format.addClass("publy-select");
    format.setAttribute("aria-label", t("formatLabel"));
    format.setAttribute("title", t("formatLabel"));
    const label = (id: PublicationFormat) => t(id === "article" ? "formatArticle" : id === "image" ? "formatImage" : "formatCards");
    for (const [id, labelText] of [["auto", t("formatAuto", { format: label(this.documentFormat) })], ["article", label("article")], ["image", label("image")], ["cards", label("cards")]]) {
      const option = format.createEl("option"); option.value = id; option.textContent = labelText;
    }
    format.value = this.plugin.formatForNote(this.notePath) ?? "auto";
    format.addEventListener("change", () => {
      const value = format.value;
      if (value === "auto" || value === "article" || value === "image" || value === "cards") {
        this.plugin.chooseFormat(this.notePath, value);
        void this.refresh?.();
      }
    });

    // theme quick switch — re-renders instantly, same as the setting page
    const sel = bar.createEl("select");
    sel.addClass("publy-select");
    sel.setAttribute("title", t("tipTheme"));
    for (const [id, label] of Object.entries(availableArticleThemes())) {
      const opt = sel.createEl("option");
      opt.value = id;
      opt.textContent = label;
    }
    sel.value = this.plugin.settings.theme || "claude";
    sel.addEventListener("change", () => {
      this.plugin.settings.theme = sel.value;
      void this.plugin.saveSettings();
      void this.refresh?.();
    });

    const publish = bar.createEl("button");
    publish.addClass("publy-btn");
    publish.addClass("publy-btn-primary");
    setIcon(publish, "send");
    publish.createEl("span").addClass("publy-btn-label");
    // the primary remote action names its destination account before any
    // submission happens (#7) — no unnamed default accounts
    const acct = this.plugin.settings.account;
    (publish.querySelector(".publy-btn-label") as HTMLElement).textContent =
      acct ? t("btnPublishNamed", { account: acct }) : t("btnPublish");
    publish.addEventListener("click", () => void this.plugin.publishCurrentNote());
    this.publishBtn = publish;
  }

  private canvasEl(): HTMLElement | null {
    return this.contentEl.querySelector(".publy-canvas");
  }
  private paperEl(): HTMLElement | null {
    return this.contentEl.querySelector(".publy-paper");
  }

  setHtml(html: string, meta?: { title?: string; author?: string; account?: string }): void {
    this.contentEl.empty();
    this.resultEl = null;
    this.toolbar();
    // themed canvas + elevated white paper (WeChat renders on white regardless
    // of the app theme, so the page itself stays white in dark mode too)
    const canvas = this.contentEl.createEl("div");
    canvas.addClass("publy-canvas");
    if ((this.plugin.settings.previewWidth ?? "desktop") === "mobile") canvas.addClass("is-mobile");
    const page = canvas.createEl("div");
    page.addClass("publy-paper");
    if ((this.plugin.settings.previewWidth ?? "desktop") === "mobile") page.addClass("is-mobile");
    // WeChat-article header: title, then account/author meta, hairline, body —
    // system font stack shared with the product's web pages
    page.style.fontFamily = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    if (meta?.title || meta?.account) {
      const title = page.createEl("h1");
      title.addClass("publy-title");
      title.setText(meta.title || t("noTitle"));
      const metaRow = page.createEl("div");
      metaRow.addClass("publy-meta-row");
      if (meta.account) {
        const avatar = metaRow.createEl("span");
        avatar.addClass("publy-avatar");
        avatar.textContent = meta.account.slice(0, 1).toUpperCase();
        const name = metaRow.createEl("span");
        name.addClass("publy-account");
        name.textContent = meta.account;
      }
      if (meta.author) {
        const a = metaRow.createEl("span");
        a.addClass("publy-author");
        a.textContent = meta.author;
      }
      const pill = metaRow.createEl("span");
      pill.addClass("publy-pill");
      pill.textContent = t("pillDraft");
      const hr = page.createEl("div");
      hr.addClass("publy-hairline");
    }
    const body = page.createEl("div");
    // Raw HTML in Markdown notes is untrusted, even when our renderer generated the wrapper.
    // Obsidian's sanitizer strips active markup before it reaches the privileged plugin DOM.
    body.replaceChildren(sanitizeHTMLToDom(html));
  }
  setCards(cards: { base64: string }[], caption: string): void {
    this.beginCards(cards.length);
    for (const c of cards) this.appendCard(c.base64);
    this.finishCards(caption);
  }

  /** progressive card rendering: skeleton first, cards pop in one by one */
  private cardStrip: HTMLElement | null = null;
  private cardCounter: HTMLElement | null = null;
  private cardTotal = 0;
  private cardDone = 0;

  beginCards(total = 0): void {
    this.contentEl.empty();
    this.resultEl = null;
    this.cardStrip = null;
    this.cardTotal = total;
    this.cardDone = 0;
    this.toolbar();
    const canvas = this.contentEl.createEl("div");
    canvas.addClass("publy-canvas");
    const strip = canvas.createEl("div");
    strip.addClass("publy-strip");
    this.cardStrip = strip;
    const progress = canvas.createEl("div");
    progress.addClass("publy-caption");
    progress.setText(total > 0 ? `0 / ${total}` : t("cardsRendering"));
    this.cardCounter = progress;
  }

  appendCard(base64: string): void {
    const img = this.cardStrip?.createEl("img");
    if (img) {
      img.alt = t("previewCard", { index: String(this.cardDone + 1) });
      img.src = "data:image/png;base64," + base64;
    }
    this.cardDone += 1;
    if (this.cardCounter && this.cardTotal > 0) {
      this.cardCounter.setText(`${this.cardDone} / ${this.cardTotal}`);
    }
  }

  finishCards(caption: string): void {
    // Completion replaces the loading status rather than leaving a false
    // "rendering" message below an already usable deck.
    this.cardCounter?.remove();
    if (this.cardStrip) {
      const canvas = this.cardStrip.parentElement;
      const cap = canvas?.createEl("div");
      if (cap) {
        cap.addClass("publy-caption");
        cap.textContent = caption;
      }
    }
    this.cardStrip = null;
    this.cardCounter = null;
  }
}

/** Publish history + scheduled jobs leaf. */
class PublyHistoryView extends ItemView {
  plugin: PublyPlugin;
  /** re-fetches and re-renders; set by the plugin on every render */
  refresh: (() => Promise<void>) | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: PublyPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string { return PUBLY_HISTORY_VIEW; }
  getDisplayText(): string { return t("viewHistory"); }
  getIcon(): string { return "history"; }
  async onOpen(): Promise<void> { await this.plugin.openHistory(); }
  async onClose(): Promise<void> { /* nothing */ }

  renderMessage(text: string): void {
    this.contentEl.empty();
    const d = this.contentEl.createEl("div");
    d.addClass("publy-view-msg");
    d.setText(text);
  }

  renderLoading(): void {
    this.renderMessage(t("histLoading"));
  }

  renderHistory(jobs: JobEntry[], entries: HistoryEntry[], onCancelJob: (id: string) => void): void {
    this.contentEl.empty();
    const bar = this.contentEl.createEl("div");
    bar.addClass("publy-panel-head");
    const title = bar.createEl("div");
    title.addClass("publy-panel-title");
    title.setText(t("histTitle"));
    const refreshBtn = bar.createEl("button");
    refreshBtn.addClass("publy-btn");
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.setAttribute("title", t("tipRefresh"));
    refreshBtn.addEventListener("click", () => void this.refresh?.());

    const fmt = (iso: string) => {
      try {
        return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      } catch {
        return iso;
      }
    };
    const typeLabel = (kind?: string) => (kind === "image_post" ? t("typeImagePost") : t("typeArticle"));
    const div = (parent: HTMLElement, cls?: string): HTMLElement => {
      const d = parent.createEl("div");
      if (cls) d.addClass(cls);
      return d;
    };
    const section = (text: string): void => {
      div(this.contentEl, "publy-section").setText(text);
    };

    const pending = jobs.filter((j) => j.status === "pending");
    section(t("histJobs", { n: pending.length }));
    if (pending.length === 0) {
      div(this.contentEl, "publy-muted-line").setText(t("histJobsEmpty"));
    }
    for (const j of pending) {
      const tl = div(this.contentEl, "publy-timeline");
      const item = div(tl, "publy-tl-item");
      item.addClass("is-wait");
      const icon = item.createEl("span");
      icon.addClass("publy-tl-icon");
      setIcon(icon, "clock");
      const main = div(item, "publy-tl-main");
      div(main, "publy-tl-title").setText(j.title ?? t("noTitle"));
      div(main, "publy-tl-sub").setText(`${fmt(j.runAt)} · ${j.account ?? "?"} · ${typeLabel(j.type)}`);
      const cancel = item.createEl("button");
      cancel.addClass("publy-btn");
      cancel.textContent = t("btnCancel");
      cancel.addEventListener("click", () => onCancelJob(j.id));
    }

    section(t("histRecent"));
    if (entries.length === 0) {
      div(this.contentEl, "publy-muted-line").setText(t("histEmpty"));
    }
    const tl = div(this.contentEl, "publy-timeline");
    for (const e of entries.slice().reverse()) {
      const isOk = e.event === "published";
      const isFail = e.event === "failed";
      const isSched = e.event === "scheduled";
      const item = div(tl, "publy-tl-item");
      item.addClass(isOk ? "is-ok" : isFail ? "is-fail" : isSched ? "is-wait" : "is-fail");
      const icon = item.createEl("span");
      icon.addClass("publy-tl-icon");
      setIcon(icon, isOk ? "check-circle-2" : isFail ? "x-circle" : isSched ? "clock" : "ban");
      const main = div(item, "publy-tl-main");
      div(main, "publy-tl-title").setText(e.title ?? t("noTitle"));
      const sub = e.event === "failed" && e.error ? `${fmt(e.ts)} · ${e.error}` : `${fmt(e.ts)} · ${e.account ?? "?"} · ${typeLabel(e.type)}`;
      div(main, "publy-tl-sub").setText(sub);
    }
  }
}

const IMAGE_EXT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function imageContentType(p: string): string {
  return IMAGE_EXT_TYPES[path.extname(p).toLowerCase()] ?? "image/png";
}

async function fileToBase64(f: File): Promise<string> {
  const buf = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** native file picker via <input type="file"> — the community-plugin-safe way
 *  (electron.remote is banned by Obsidian's review rules, and the HTML input
 *  works everywhere). Resolves with the chosen files; [] when cancelled. */
function pickLocalImageFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.multiple = true;
    input.style.display = "none";
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => done(input.files ? Array.from(input.files) : []));
    input.addEventListener("cancel", () => done([]));
    document.body.appendChild(input);
    input.click();
  });
}

/** Simple list picker for switching accounts. */
class AccountModal extends Modal {
  private names: string[];
  private current: string;
  private onPick: (name: string) => void;

  constructor(app: App, names: string[], current: string, onPick: (name: string) => void) {
    super(app);
    this.names = names;
    this.current = current;
    this.onPick = onPick;
  }

  onOpen(): void {
    this.contentEl.createEl("h3").setText(t("acctModalTitle"));
    for (const n of this.names) {
      const row = this.contentEl.createEl("div");
      row.addClass("publy-acct-row");
      if (n === this.current) row.addClass("is-current");
      row.addEventListener("click", () => {
        if (n === this.current) return;
        this.close();
        this.onPick(n);
      });
      const name = row.createEl("span");
      name.addClass("publy-acct-name");
      name.setText(n);
      if (n === this.current) {
        setIcon(row, "check");
      } else {
        const b = row.createEl("button");
        b.addClass("publy-btn");
        b.textContent = t("acctSwitchBtn");
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          this.close();
          this.onPick(n);
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/** Pick this publish's cover: any body image, or the auto title card. */
class CoverPickerModal extends Modal {
  private plugin: PublyPlugin;
  private file: TFile;
  private candidates: { name: string; path: string; contentType: string }[];
  private onPick: (choice: string | null) => void;
  private chosen: string;
  private picked = false;

  constructor(app: App, plugin: PublyPlugin, file: TFile, candidates: { name: string; path: string; contentType: string }[], current: string, onPick: (choice: string | null) => void) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.candidates = candidates;
    this.chosen = current;
    this.onPick = onPick;
  }

  onOpen(): void {
    this.contentEl.createEl("h3").setText(t("coverPickTitle"));
    const grid = this.contentEl.createEl("div");
    grid.addClass("publy-cover-grid");
    const tiles: [HTMLElement, string][] = [];
    const paint = () => {
      for (const [el, key] of tiles) el.toggleClass("is-chosen", key === this.chosen);
    };
    const makeTile = (key: string, build: (box: HTMLElement) => void, label: string): HTMLElement => {
      const el = grid.createEl("div");
      el.addClass("publy-cover-tile");
      // 2.35:1 crop thumbnail — what the cover actually looks like after the
      // server's center-crop, not the raw image
      const box = el.createEl("div");
      box.addClass("publy-cover-crop");
      build(box);
      const lab = el.createEl("div");
      lab.addClass("publy-cover-label");
      lab.setText(label);
      el.addEventListener("click", () => {
        this.chosen = key;
        paint();
      });
      tiles.push([el, key]);
      return el;
    };
    for (const c of this.candidates.slice(0, 12)) {
      let dataUri = "";
      try {
        dataUri = `data:${c.contentType};base64,${fs.readFileSync(c.path).toString("base64")}`;
      } catch {
        dataUri = "";
      }
      makeTile(c.name, (box) => {
        if (dataUri) {
          const im = box.createEl("img");
          im.src = dataUri;
        } else {
          box.setText("?");
        }
      }, c.name);
    }
    // the auto title card, rendered for real with this note's own title — the
    // same card the server would generate (fonts ship with the plugin)
    makeTile("auto", (box) => {
      const png = generateTitleCover(this.file.basename);
      if (png) {
        const im = box.createEl("img");
        im.src = "data:image/png;base64," + png.toString("base64");
      } else {
        const d = box.createEl("div");
        d.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f8f6f0;color:#b75c3d;font-weight:600;font-size:12px;text-align:center;padding:4px;line-height:1.4";
        d.setText(this.file.basename);
      }
    }, t("coverAutoTile"));
    paint();

    // pick any image from this computer — articles without body images still
    // deserve a real cover. Content-addressed keys (local-<hash>) live in the
    // session registry; electron.remote is banned by Obsidian review rules.
    const browseRow = this.contentEl.createEl("div");
    browseRow.style.cssText = "margin-top:8px";
    const browse = browseRow.createEl("button");
    browse.addClass("publy-btn");
    browse.textContent = t("browseLocal");
    browse.addEventListener("click", async () => {
      const files = await pickLocalImageFiles();
      let added = false;
      for (const f of files) {
        const data = await fileToBase64(f);
        const key = "local-" + crypto.createHash("sha1").update(data).digest("hex").slice(0, 10);
        const contentType = f.type || imageContentType(f.name);
        this.plugin.localImages.set(key, { name: f.name, data, contentType });
        if (tiles.some(([, k]) => k === key)) continue;
        const el = makeTile(key, (box) => {
          const im = box.createEl("img");
          im.src = `data:${contentType};base64,${data}`;
        }, f.name);
        grid.prepend(el);
        this.chosen = key;
        added = true;
      }
      if (added) paint();
    });

    const row = this.contentEl.createEl("div");
    row.addClass("publy-modal-row");
    const cancel = row.createEl("button");
    cancel.addClass("publy-btn");
    cancel.textContent = t("btnCancel");
    cancel.addEventListener("click", () => this.close());
    const ok = row.createEl("button");
    ok.addClass("publy-btn");
    ok.addClass("publy-btn-primary");
    ok.textContent = t("btnConfirm");
    ok.addEventListener("click", () => {
      this.picked = true;
      this.close();
      this.onPick(this.chosen);
    });
  }

  onClose(): void {
    if (!this.picked) this.onPick(null);
    this.contentEl.empty();
  }
}

/** Pick a local date+time for scheduled publishing. */
class ScheduleModal extends Modal {
  private onSubmit: (iso: string | null) => void;

  constructor(app: App, onSubmit: (iso: string | null) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    this.contentEl.createEl("h3").setText(t("schedTitle"));
    const desc = this.contentEl.createEl("p");
    desc.addClass("publy-sched-desc");
    desc.setText(t("schedDesc"));
    const input = this.contentEl.createEl("input");
    input.type = "datetime-local";
    input.addClass("publy-sched-input");
    const min = new Date(Date.now() + 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    input.min = `${min.getFullYear()}-${pad(min.getMonth() + 1)}-${pad(min.getDate())}T${pad(min.getHours())}:${pad(min.getMinutes())}`;
    const row = this.contentEl.createEl("div");
    row.addClass("publy-modal-row");
    const ok = row.createEl("button");
    ok.addClass("publy-btn");
    ok.addClass("publy-btn-primary");
    ok.textContent = t("schedBtn");
    ok.addEventListener("click", () => {
      const iso = input.value ? new Date(input.value).toISOString() : null;
      if (input.value && (Number.isNaN(new Date(input.value).getTime()) || new Date(input.value).getTime() < Date.now() - 60_000)) {
        new Notice(t("schedInvalid"));
        return;
      }
      this.close();
      this.onSubmit(iso);
    });
    const cancel = row.createEl("button");
    cancel.addClass("publy-btn");
    cancel.textContent = t("btnCancel");
    cancel.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export default class PublyPlugin extends Plugin {
  settings: PublySettings;
  private readonly formatChoices = new Map<string, PublicationFormat>();
  formatForNote(path: string): PublicationFormat | undefined { return this.formatChoices.get(path); }
  chooseFormat(path: string, value: PublicationFormat | "auto"): void {
    if (!path) return;
    if (value === "auto") this.formatChoices.delete(path); else this.formatChoices.set(path, value);
  }
  wasmOk = false;
  statusBarItem: HTMLElement | null = null;
  /** session-local registry of images picked from this computer for covers
   *  (key: local-<sha1 of content>) — no file paths are kept, only payload */
  localImages = new Map<string, { name: string; data: string; contentType: string }>();
  /** the note the in-app preview currently shows (for live re-render) */
  private livePreviewPath: string | null = null;
  /** one publish at a time — double-clicks must not create duplicate drafts */
  private publishInFlight = false;
  /** the last submission whose outcome is unknown (network-level failure).
   *  Queryable and retryable with the SAME request identity, so a retry can
   *  never create a second draft (#7). In-memory only — a restart simply
   *  clears the query affordance; the server-side idempotency record remains. */
  private lastAttempt: { payload: Record<string, unknown>; key: string; title: string; account: string } | null = null;

  async onload(): Promise<void> {
    // Initialize bundled fonts independent of side-loaded package directories.
    // Rendering must remain offline even when the three-file install has no
    // font directory. WASM availability is checked separately below.
    setEmbeddedFontSubsets({ regular: embeddedRegularFont, bold: embeddedBoldFont });
    // WASM PNG renderer (community-plugin safe: no native binaries).
    // Graceful degradation: if wasm init fails, article publish/preview still
    // work — only the card renderer is unavailable.
    try {
      // Explicit bytes prevent resvg's default URL/fetch fallback. The glue
      // and binary are part of main.js, including after disable/re-enable.
      try {
        await initWasm(embeddedResvgWasm);
      } catch (err) {
        if (!/already initialized/i.test(String((err as Error)?.message ?? err))) throw err;
      }
      configureBundledMath();
      // The wasm Resvg build requires raw font buffers, not fontPaths.
      // Both are embedded in main.js and require no other installed files.
      const fontBuffers = [embeddedRegularFont, embeddedBoldFont];
      setPngRenderer((svg, fitWidth) => {
        const resvg = new Resvg(svg, {
          font: {
            fontBuffers,
            defaultFontFamily: "Noto Sans SC",
            sansSerifFamily: "Noto Sans SC",
            serifFamily: "Noto Sans SC",
            monospaceFamily: "Noto Sans SC",
            cursiveFamily: "Noto Sans SC",
            fantasyFamily: "Noto Sans SC",
          },
          ...(fitWidth ? { fitTo: { mode: "width", value: fitWidth } } : {}),
        });
        return Buffer.from(resvg.render().asPng());
      });
      this.wasmOk = true;
    } catch (err) {
      this.wasmOk = false;
      console.error("[publy] wasm renderer unavailable:", err);
      new Notice(t("wasmInitFail"));
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    LANG_PREF = this.settings.lang ?? "auto";

    this.registerView(VIEW_TYPE_PUBLY_PREVIEW, (leaf: WorkspaceLeaf) => new PublyPreviewView(leaf, this));
    this.registerView(PUBLY_HISTORY_VIEW, (leaf: WorkspaceLeaf) => new PublyHistoryView(leaf, this));
    this.statusBarItem = this.addStatusBarItem();

    // live preview: while the preview leaf is open it always shows the active
    // note — switching notes re-renders, saving re-renders (~0.9s debounce).
    // autoPreview extends this to zero-interaction: opening any note brings
    // the panel up by itself.
    let liveTimer: number | undefined;
    let switchTimer: number | undefined;
    const previewOpen = () => this.app.workspace.getLeavesOfType(VIEW_TYPE_PUBLY_PREVIEW).length > 0;
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        const open = previewOpen();
        if (!open && !this.settings.autoPreview) return;
        if (open && file.path === this.livePreviewPath) return;
        // autoPreview flips through notes as fast as the user clicks; a
        // 250ms settle window keeps the synchronous render from blocking
        // every one of those clicks
        window.clearTimeout(switchTimer);
        switchTimer = window.setTimeout(() => void this.previewCurrentNote(file), 250);
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!previewOpen()) return;
        if (!(file instanceof TFile) || file.path !== this.livePreviewPath) return;
        window.clearTimeout(liveTimer);
        liveTimer = window.setTimeout(() => void this.previewCurrentNote(file as TFile), 900);
      }),
    );

    // right-click any note → publish / preview / copy for THAT note
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((item) => {
          item.setTitle(t("menuPublish")).setIcon("send").onClick(() => void this.publishCurrentNote(file));
        });
        menu.addItem((item) => {
          item.setTitle(t("menuPreview")).setIcon("eye").onClick(() => void this.previewCurrentNote(file));
        });
        menu.addItem((item) => {
          item.setTitle(t("menuCopy")).setIcon("copy").onClick(() => void this.copyRenderedHtml(file));
        });
      }),
    );

    this.addRibbonIcon("send", t("ribbon"), () => this.publishCurrentNote());

    this.addCommand({
      id: "publish-current-note",
      name: t("cmdPublish"),
      callback: () => this.publishCurrentNote(),
    });

    this.addCommand({
      id: "publish-scheduled",
      name: t("cmdSchedule"),
      callback: () => void this.publishScheduled(),
    });

    this.addCommand({
      id: "preview-current-note",
      name: t("cmdPreview"),
      callback: () => this.previewCurrentNote(),
    });

    this.addCommand({
      id: "preview-current-note-browser",
      name: t("cmdPreviewBrowser"),
      callback: () => this.previewInBrowser(() => this.renderCurrent()),
    });

    this.addCommand({
      id: "copy-rendered-html",
      name: t("cmdCopy"),
      callback: () => this.copyRenderedHtml(),
    });

    this.addCommand({
      id: "show-history",
      name: t("cmdHistory"),
      callback: () => void this.openHistory(),
    });

    this.addCommand({
      id: "switch-account",
      name: t("cmdSwitch"),
      callback: () => void this.switchAccount(),
    });

    this.addSettingTab(new PublySettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    /* nothing persistent */
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private currentFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  private basePath(): string {
    return (this.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.() ?? "";
  }

  private mediaDirs(): string[] {
    const dirs: string[] = [];
    if (this.settings.mediaDir) dirs.push(this.settings.mediaDir);
    dirs.push(this.autoMediaDir());
    dirs.push(this.basePath());
    return [...new Set(dirs.filter(Boolean))];
  }

  /** resolve the vault's own attachment setting, so local images resolve with
   *  zero configuration */
  private autoMediaDir(): string {
    try {
      const cfg = (this.app.vault as unknown as { getConfig?: (k: string) => string }).getConfig?.("attachmentFolderPath");
      if (!cfg || cfg === "/" || cfg === ".") return this.basePath();
      return path.isAbsolute(cfg) ? cfg : path.join(this.basePath(), cfg);
    } catch {
      return this.basePath();
    }
  }

  /** publish needs server + key; everything else (preview/copy) is local-only.
   *  When unconfigured, open the settings tab right at the guide. */
  private ensureConfigured(): boolean {
    if (this.settings.server && this.settings.apiKey) return true;
    new Notice(t("ensureConfigured"));
    const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
    setting?.open();
    setting?.openTabById("publy");
    return false;
  }

  private status(text: string): void {
    this.statusBarItem?.setText(text);
  }

  /** the open preview panel, if any — publish progress mirrors into it */
  private previewView(): PublyPreviewView | null {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_PUBLY_PREVIEW)[0] as WorkspaceLeaf | undefined;
    return (leaf?.view as PublyPreviewView | undefined) ?? null;
  }

  private renderOptions() {
    return {
      baseDir: this.basePath(),
      mediaDirs: this.mediaDirs(),
      theme: this.settings.theme || "claude",
      themeCss: articleThemeCss(this.settings.theme || "claude"),
      highlightCss: this.settings.theme === "terminal" ? hljsGithubDarkCss : hljsGithubCss,
    };
  }

  private async renderCurrent(file?: TFile): Promise<string> {
    const f = file ?? this.currentFile();
    if (!f) throw new Error(t("errNoActiveNote"));
    const raw = await this.app.vault.cachedRead(f);
    const rendered = renderMarkdown(raw, this.renderOptions());
    try {
      for (const w of rendered.warnings) console.warn("[publy] " + w);
      return this.inlineImages(rendered.html, rendered.attachments);
    } finally { rendered.cleanup(); }
  }

  /** preview-only: core emits attachment://<name> refs that publishing swaps
   *  for WeChat CDN urls; nothing local can load that scheme, so inline the
   *  files as data uris for display. base64 results are cached by
   *  (path, mtime) — between two keystrokes the images never change, only
   *  the html does, so image-heavy drafts stop re-reading megabytes. */
  private imgCache = new Map<string, { mtime: number; b64: string }>();

  private inlineImages(html: string, attachments: { name: string; path: string; contentType: string }[]): string {
    let out = html;
    for (const a of attachments) {
      try {
        const mtime = fs.statSync(a.path).mtimeMs;
        const hit = this.imgCache.get(a.path);
        const b64 = hit && hit.mtime === mtime ? hit.b64 : fs.readFileSync(a.path).toString("base64");
        if (!hit || hit.mtime !== mtime) {
          if (this.imgCache.size > 64) this.imgCache.clear();
          this.imgCache.set(a.path, { mtime, b64 });
        }
        out = out.split(`attachment://${a.name}`).join(`data:${a.contentType};base64,${b64}`);
      } catch (err) {
        console.warn("[publy] failed to inline image:", a.path, err);
      }
    }
    return out;
  }

  private async activateView(viewType: string): Promise<ItemView> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(viewType)[0] as WorkspaceLeaf | undefined;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: viewType, active: true });
    }
    workspace.revealLeaf(leaf);
    return leaf.view as ItemView;
  }

  /** authenticated GET against the configured server; throws on config/HTTP errors */
  async apiGet<T>(path: string): Promise<T> {
    const base = new URL(this.settings.server);
    const res = await requestUrl({
      url: new URL(path, base).toString(),
      method: "GET",
      headers: { "x-api-key": this.settings.apiKey },
    });
    if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
    return res.json as T;
  }

  async openHistory(): Promise<void> {
    const view = (await this.activateView(PUBLY_HISTORY_VIEW)) as PublyHistoryView;
    if (!this.ensureConfigured()) {
      view.renderMessage(t("histNeedConfig"));
      return;
    }
    view.renderLoading();
    view.refresh = () => this.openHistory();
    try {
      const [hist, jobs] = await Promise.all([
        this.apiGet<{ history?: HistoryEntry[] }>("/v1/history?limit=50"),
        this.apiGet<{ jobs?: JobEntry[] }>("/v1/jobs"),
      ]);
      view.renderHistory(jobs.jobs ?? [], hist.history ?? [], (id) => void this.cancelJob(id));
    } catch (err) {
      view.renderMessage(t("histLoadFail", { msg: (err as Error).message }));
    }
  }

  async cancelJob(id: string): Promise<void> {
    try {
      const base = new URL(this.settings.server);
      const res = await requestUrl({
        url: new URL(`/v1/jobs/${id}`, base).toString(),
        method: "DELETE",
        headers: { "x-api-key": this.settings.apiKey },
      });
      if (res.status >= 400) {
        new Notice(t("cancelFail", { msg: String((res.json as { message?: string } | null)?.message ?? res.status) }));
      } else {
        new Notice(t("cancelOk"));
      }
    } catch (err) {
      new Notice(t("cancelFail", { msg: (err as Error).message }));
    }
    await this.openHistory();
  }

  /** account picker over the accounts the key owns on the server */
  async switchAccount(): Promise<void> {
    if (!this.ensureConfigured()) return;
    let names: string[] = [];
    try {
      const r = await this.apiGet<{ accounts?: { name: string }[] }>("/v1/accounts");
      names = (r.accounts ?? []).map((a) => a.name);
    } catch (err) {
      new Notice(t("acctFetchFail", { msg: (err as Error).message }));
      return;
    }
    if (names.length === 0) {
      new Notice(t("acctNone"));
      return;
    }
    const pick = (name: string) => {
      this.settings.account = name;
      void this.saveSettings();
      new Notice(t("acctSwitched", { name }));
    };
    if (names.length === 1) {
      pick(names[0]);
      return;
    }
    new AccountModal(this.app, names, this.settings.account, pick).open();
  }

  /** monotonically increasing preview generation: a slow card-deck render
   *  must never paint over a note the user switched to afterwards */
  private previewGen = 0;

  /** one preview command: picks article or image-post cards from frontmatter.
   *  public: the preview-view toolbar and the theme dropdown call back into it. */
  async previewCurrentNote(file?: TFile): Promise<void> {
    const f = file ?? this.currentFile();
    if (!f) {
      new Notice(t("noActiveNote"));
      return;
    }
    if (f.extension !== "md") return;
    const gen = ++this.previewGen;
    const raw = await this.app.vault.cachedRead(f);
    if (gen !== this.previewGen) return; // user moved on while we read
    this.livePreviewPath = f.path;
    let docFormat: PublicationFormat;
    let format: PublicationFormat;
    try {
      const meta = parseSource(raw).meta;
      docFormat = resolvePublication(meta).format;
      format = resolvePublication(meta, this.formatForNote(f.path)).format;
    } catch {
      new Notice(t("renderFail", { msg: "Invalid document metadata" }));
      return;
    }
    if (format === "cards") {
      await this.previewCardDeck(f, raw, gen);
      return;
    }
    // let the UI paint the note switch before the (synchronous) render
    await new Promise<void>((r) => setTimeout(r, 0));
    if (gen !== this.previewGen) return;
    try {
      const rendered = renderMarkdown(raw, this.renderOptions());
      try {
        for (const w of rendered.warnings) console.warn("[publy] " + w);
        if (format === "image" && (!rendered.attachments.length || rendered.warnings.some(blockingMediaWarning))) {
          throw new Error(t("mediaNotReady"));
        }
        if (gen !== this.previewGen) return;
        const view = (await this.activateView(VIEW_TYPE_PUBLY_PREVIEW)) as PublyPreviewView;
        view.notePath = f.path;
        view.documentFormat = docFormat;
        view.refresh = () => this.previewCurrentNote(f);
        const html = format === "image"
          ? `<div>${rendered.attachments.map((a) => `<img alt="" src="data:${a.contentType};base64,${fs.readFileSync(a.path).toString("base64")}">`).join("")}${captionToHtml(imagePostCaption(raw))}</div>`
          : this.inlineImages(rendered.html, rendered.attachments);
        view.setHtml(html, {
          title: rendered.title || f.basename,
          author: rendered.meta.author,
          account: this.settings.account || undefined,
        });
      } finally { rendered.cleanup(); }
    } catch (err) {
      if (gen === this.previewGen) new Notice(`Publy: ${(err as Error).message}`);
    }
  }

  private async previewCardDeck(file?: TFile, rawArg?: string, gen?: number): Promise<void> {
    if (!this.wasmOk) {
      new Notice(t("wasmDown"));
      return;
    }
    const f = file ?? this.currentFile();
    if (!f) {
      new Notice(t("noActiveNote"));
      return;
    }
    const raw = rawArg ?? (await this.app.vault.cachedRead(f));
    const stale = () => gen !== undefined && gen !== this.previewGen;
    if (stale()) return;
    let outDir: string | undefined;
    try {
      outDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-cards-"));
      const view = (await this.activateView(VIEW_TYPE_PUBLY_PREVIEW)) as PublyPreviewView;
      view.notePath = f.path;
      view.documentFormat = resolvePublication(parseSource(raw).meta).format;
      view.refresh = () => this.previewCurrentNote(f);
      // progressive: the panel skeleton appears immediately and each card
      // pops in as its rasterization lands — 9-card decks stop feeling
      // like a 9x wait
      view.beginCards();
      const result = await renderCards(raw, {
        outDir,
        offline: true, // Never download a full font during offline plugin preview.
        onCard: (card) => {
          if (stale()) return; // drop late cards instead of overpainting
          try {
            view.appendCard(fs.readFileSync(card.file).toString("base64"));
          } catch (err) {
            console.warn("[publy] failed to read card:", card.file, err);
          }
        },
      });
      if (stale()) return; // a newer note took the panel — do not paint over it
      view.finishCards(result.caption);
      if (!result.lint.ok) {
        new Notice(`Publy lint: ${result.lint.problems[0] ?? "check the preview"}`);
      }
    } catch (err) {
      new Notice(t("cardsFail", { msg: (err as Error).message }));
    } finally {
      if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
    }
  }

  /** public: the preview-view toolbar calls back into it */
  async copyRenderedHtml(file?: TFile): Promise<void> {
    const f = file ?? this.currentFile();
    if (!f) {
      new Notice(t("noActiveNote"));
      return;
    }
    const raw = await this.app.vault.cachedRead(f);
    try {
      const rendered = renderMarkdown(raw, this.renderOptions());
      try {
        for (const w of rendered.warnings) console.warn("[publy] " + w);
        // A successful copy should be directly usable in the target editor:
        // unavailable formulas/media and attachment:// placeholders are not.
        // The draft workflow uploads assets and replaces placeholders safely.
        if (rendered.warnings.some(blockingMediaWarning)) {
          throw new Error(t("copyMediaNotReady"));
        }
        if (rendered.attachments.length > 0 || rendered.html.includes("attachment://")) {
          throw new Error(t("copyHasImages"));
        }
        const item = new ClipboardItem({
          "text/html": new Blob([rendered.html], { type: "text/html" }),
          "text/plain": new Blob([f.basename], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
        new Notice(t("copyOk"));
      } finally { rendered.cleanup(); }
    } catch (err) {
      new Notice(`Publy: ${(err as Error).message}`);
    }
  }

  private async previewInBrowser(render: () => Promise<string>): Promise<void> {
    try {
      const html = await render();
      const { shell } = require("electron") as typeof import("electron").shell;
      const out = os.tmpdir() + `/publy-preview-${Date.now()}.html`;
      fs.writeFileSync(out, html);
      shell.openPath(out);
    } catch (err) {
      new Notice(`Publy: ${(err as Error).message}`);
    }
  }

  /** public: the preview-view toolbar calls back into it */
  async publishCurrentNote(file?: TFile): Promise<void> {
    await this.doPublish(file ?? this.currentFile(), undefined);
  }

  /** pick a time, then hand the note to the server's job queue */
  async publishScheduled(): Promise<void> {
    const f = this.currentFile();
    if (!f) {
      new Notice(t("noActiveNote"));
      return;
    }
    new ScheduleModal(this.app, (iso) => {
      if (iso) void this.doPublish(f, iso);
    }).open();
  }

  private async doPublish(fileArg: TFile | null, publishAt?: string): Promise<void> {
    const f = fileArg;
    if (!f) {
      new Notice(t("noActiveNote"));
      return;
    }
    if (this.publishInFlight) {
      new Notice(t("inFlight"));
      return;
    }
    this.publishInFlight = true;
    try {
      await this.doPublishInner(f, publishAt);
    } finally {
      this.publishInFlight = false;
    }
  }

  private async doPublishInner(f: TFile, publishAt?: string): Promise<void> {
    if (!this.ensureConfigured()) return;
    // never submit to an unnamed default account: the destination must be
    // part of what the user sees before anything leaves the machine (#7)
    const submitAccount = this.settings.account;
    if (!submitAccount) {
      new Notice(t("needAccount"), 8000);
      void this.switchAccount();
      return;
    }
    try {
      new URL("/v1/publish", this.settings.server);
    } catch {
      new Notice(t("badServer"));
      return;
    }
    const raw = await this.app.vault.cachedRead(f);
    this.status(t("rendering"));
    const view = this.previewView();
    view?.setPublishing(true);
    // one sticky progress toast for the whole run — transient toasts vanish
    // mid-publish and reads as "nothing happened", inviting double-clicks
    const progress = new Notice(t("rendering"), 0);
    let html: string;
    let payloadAttachments: { name: string; data: string; contentType: string }[];
    let coverName: string | undefined;
    let explicitCover = false;
    let coverMode: "auto" | undefined;
    let type: "article" | "image_post";
    let title: string;
    let author: string | undefined;
    try {
      const rendered = renderMarkdown(raw, this.renderOptions());
      try {
        for (const w of rendered.warnings) console.warn("[publy] " + w);
        const problems = rendered.warnings.filter(blockingMediaWarning);
        if (problems.length) {
          throw new Error(t("mediaNotReady") + " " + problems.join("; "));
        }
        const selection = resolvePublication(rendered.meta, this.formatForNote(f.path));
        type = selection.type;
        title = rendered.title || f.basename;
        author = rendered.meta.author;
        if (selection.format === "cards") {
          if (!this.wasmOk) throw new Error(t("wasmDown"));
          const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-publish-cards-"));
          try {
            const cards = await renderCards(raw, { outDir, offline: true });
            if (!cards.lint.ok) {
              throw new Error(t("mediaNotReady") + " " + cards.lint.problems.join("; "));
            }
            payloadAttachments = cards.cards.map((card) => ({
              name: card.name,
              data: fs.readFileSync(card.file).toString("base64"),
              contentType: "image/png",
            }));
            if (!payloadAttachments.length) {
              throw new Error(t("mediaNotReady") + " No cards were generated.");
            }
            html = captionToHtml(cards.caption);
            coverName = payloadAttachments[0].name;
          } finally {
            // The POST payload now owns the base64 data. Avoid leaving copies
            // of private note content in the system temp directory.
            fs.rmSync(outDir, { recursive: true, force: true });
          }
        } else {
          payloadAttachments = rendered.attachments.map((a) => ({
            name: a.name,
            data: fs.readFileSync(a.path).toString("base64"),
            contentType: a.contentType,
          }));
          if (type === "image_post" && !payloadAttachments.length) {
            throw new Error(t("mediaNotReady") + " No local images found for image post.");
          }
          if (type === "image_post") {
            coverName = payloadAttachments[0]?.name;
            html = captionToHtml(imagePostCaption(raw));
          } else if (rendered.cover) {
            const existing = rendered.attachments.find((a) => a.path === rendered.cover);
            if (existing) {
              coverName = existing.name;
              explicitCover = true;
            } else {
              // The cover can be a standalone frontmatter image, not in body.
              const ext = path.extname(rendered.cover).toLowerCase();
              const data = fs.readFileSync(rendered.cover);
              const png = ext === ".png" &&
                data.length > 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
              const jpg = (ext === ".jpg" || ext === ".jpeg") &&
                data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
              if (!png && !jpg) {
                throw new Error(t("coverFormatBad", { path: path.basename(rendered.cover) }));
              }
              const basename = path.basename(rendered.cover);
              const name = payloadAttachments.some((attachment) => attachment.name === basename)
                ? `cover-${crypto.createHash("sha256").update(data).digest("hex").slice(0,12)}${ext}`
                : basename;
              payloadAttachments.unshift({
                name,
                data: data.toString("base64"),
                contentType: png ? "image/png" : "image/jpeg",
              });
              coverName = name;
              explicitCover = true;
            }
          }
          if (type === "article") html = rendered.html;
        }
      } finally { rendered.cleanup(); }
    } catch (err) {
      progress.hide();
      this.status("");
      view?.setPublishing(false);
      view?.setPublishResult("error", t("resultFail") + " — " + (err as Error).message);
      new Notice(t("renderFail", { msg: (err as Error).message }));
      return;
    }

    // no explicit cover -> the user picks: body images, a file from this
    // computer, or the auto title card (shown as a real render). Applies to
    // image-less articles too — silence must never choose the cover.
    if (type === "article" && !explicitCover) {
      const last = this.settings.lastCover?.[f.path];
      const known = (k: string) =>
        k === "auto" || payloadAttachments.some((c) => c.name === k) || this.localImages.has(k) || fs.existsSync(k);
      const pre = last && known(last) ? last : payloadAttachments[0]?.name ?? "auto";
      const choice = await new Promise<string | null>((resolve) => {
        new CoverPickerModal(this.app, this, f, payloadAttachments, pre, resolve).open();
      });
      if (choice === null) {
        progress.hide();
        this.status("");
        view?.setPublishing(false);
        return;
      }
      this.settings.lastCover = { ...(this.settings.lastCover ?? {}), [f.path]: choice };
      await this.saveSettings();
      if (choice === "auto") {
        coverMode = "auto";
      } else if (choice.startsWith("local-")) {
        // a file picked from this computer (content-addressed in the session
        // registry) — rides the payload like a body image
        const img = this.localImages.get(choice);
        if (!img) {
          progress.hide();
          this.status("");
          view?.setPublishing(false);
          new Notice(t("localCoverLost"));
          return;
        }
        payloadAttachments.push({ name: img.name, data: img.data, contentType: img.contentType });
        coverName = img.name;
      } else {
        coverName = choice;
      }
    }

    progress.setMessage(t("uploadingNamed", { title, account: submitAccount }));
    this.status(t("uploading"));
    const t0 = Date.now();
    // the request identity is fixed before sending: a retry of any kind
    // (timeout recovery, double-click slipping past the lock) carries the
    // same key and can never create a second draft (#7)
    // Identity follows the actual draft body and image payload, not the
    // active editor filename/mtime or a same-length HTML collision. The
    // account, cover, card bytes and schedule are all included.
    const submission = {
      account: submitAccount,
      type,
      title,
      html,
      images: payloadAttachments,
      cover: coverName,
      author,
      ...(coverMode ? { coverMode } : {}),
      ...(publishAt ? { publishAt } : {}),
    };
    const payload: Record<string, unknown> = {
      ...submission,
      idempotencyKey: draftIdempotencyKey(submission),
    };
    try {
      const body = await this.submitPayload(payload);
      progress.hide();
      this.status("");
      view?.setPublishing(false);
      this.handlePublishResponse(body, view, t0, title, submitAccount);
    } catch (err) {
      progress.hide();
      this.status("");
      view?.setPublishing(false);
      const rejection = err as { safeRejection?: boolean; code?: string };
      if (rejection.safeRejection && rejection.code) {
        view?.setPublishResult("error", `${t("resultFail")} ·《${title}》→「${submitAccount}」 · ${rejection.code}`);
        new Notice(t("publishFail", { msg: rejection.code }), 8000);
        return;
      }
      // Other errors may occur after the remote draft attempt. Treat them
      // conservatively until the original result is reconciled.
      // The server may or may not have delivered the
      // draft — outcome UNKNOWN, never treated as permission to re-send (#7)
      const key = String(payload.idempotencyKey);
      this.lastAttempt = { payload, key, title, account: submitAccount };
      view?.setPublishResult("unknown", `${t("resultUnknown")} ·《${title}》→「${submitAccount}」`, [
        { label: t("btnQueryResult"), onClick: () => void this.queryLastAttempt() },
      ]);
      new Notice(t("resultUnknown"), 8000);
    } finally {
      this.status("");
    }
  }

  /** Submit once; an incomplete acknowledgement leaves the outcome unknown. */
  private async submitPayload(payload: Record<string, unknown>): Promise<PublishResponse> {
    const base = new URL(this.settings.server);
    const res = await requestUrl({
      url: new URL("/v1/publish", base).toString(),
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.settings.apiKey },
      body: JSON.stringify(payload),
      throw: false,
    });
    const body = res.json as PublishResponse | null;
    const code = body && typeof body.code === "string" ? body.code : "";
    const knownRejection = ((res.status === 400 || res.status === 403 || res.status === 409 || res.status === 429) &&
      ["BAD_REQUEST", "ACCOUNT_NOT_FOUND", "ACCOUNT_NOT_OWNED", "QUOTA_EXCEEDED", "IDEMPOTENCY_CONFLICT"].includes(code)) ||
      (res.status === 502 && /^WECHAT_[0-9]{1,12}$/.test(code));
    if (knownRejection) throw Object.assign(new Error(code), { safeRejection: true, code });
    const validResult = body && typeof body === "object" &&
      (body.scheduled === true
        ? typeof payload.publishAt === "string" && typeof body.jobId === "string" && body.jobId.trim().length > 0
        : typeof body.mediaId === "string" && body.mediaId.trim().length > 0) &&
      (body.account === undefined || body.account === payload.account) &&
      (body.title === undefined || body.title === payload.title) &&
      (body.requestId === undefined || body.requestId === payload.idempotencyKey);
    if (res.status < 200 || res.status >= 300 || !validResult) {
      throw new Error("Unverified draft outcome; inspect the original request and WeChat drafts");
    }
    return body;
  }

  /** shared result rendering for a server answer: names are taken from the
   *  server's echo of the submitted identity, falling back to what this
   *  request actually carried — never from the currently visible preview (#7) */
  private handlePublishResponse(body: PublishResponse, view: PublyPreviewView | null, t0: number, fallbackTitle: string, fallbackAccount: string): void {
    const who = body.account ?? fallbackAccount;
    const named = body.title ?? fallbackTitle;
    if (body.deduped) {
      view?.setPublishResult("deduped", `${t("resultDeduped")} ·《${named}》·「${who}」`);
      new Notice(t("deduped", { title: named }), 6000);
      return;
    }
    if (body.scheduled) {
      const when = body.runAt ? new Date(body.runAt).toLocaleString("zh-CN") : "";
      view?.setPublishResult("scheduled", `${t("resultScheduled")} ·《${named}》→「${who}」${when ? " · " + when : ""}`);
      new Notice(t("scheduledOk", { title: named, when }), 6000);
      void this.openHistory();
      return;
    }
    const coverLabel = body.coverSource === "cover" ? t("coverExplicit")
      : body.coverSource === "auto" ? t("coverAuto")
      : t("coverFirst");
    view?.setPublishResult("ok", `${t("resultOk")} ·《${named}》·「${who}」 · ${coverLabel} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    new Notice(`${t("publishOk", { title: named, sec: ((Date.now() - t0) / 1000).toFixed(1) })} ·「${who}」 · ${coverLabel}`, 6000);
  }

  /** ask the server whether the lost submission actually landed; never
   *  re-sends the publish itself (#7: a timeout is not permission to re-issue) */
  async queryLastAttempt(): Promise<void> {
    const a = this.lastAttempt;
    if (!a) return;
    const view = this.previewView();
    try {
      const base = new URL(this.settings.server);
      const res = await requestUrl({
        url: new URL(`/v1/publish-result/${encodeURIComponent(a.key)}`, base).toString(),
        headers: { "x-api-key": this.settings.apiKey },
      });
      if (res.status >= 400) {
        new Notice(t("queryFail", { msg: `HTTP ${res.status}` }), 6000);
        return;
      }
      const info = res.json as PublishResultInfo;
      if (info?.status === "confirmed" && typeof info.mediaId === "string" && info.mediaId.trim().length > 0 &&
          (info.account === undefined || info.account === a.account) &&
          (info.title === undefined || info.title === a.title) &&
          (info.requestId === undefined || info.requestId === a.key)) {
        this.lastAttempt = null;
        view?.setPublishResult("ok", t("queryConfirmed", { title: info.title ?? a.title, account: info.account ?? a.account }));
        new Notice(t("queryConfirmed", { title: info.title ?? a.title, account: info.account ?? a.account }), 8000);
      } else {
        new Notice(t("queryUnknown"), 10000);
      }
    } catch (err) {
      new Notice(t("queryFail", { msg: (err as Error).message }), 6000);
    }
  }


}

class PublySettingTab extends PluginSettingTab {
  plugin: PublyPlugin;

  constructor(app: App, plugin: PublyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName(t("setLang")).setDesc(t("setLangDesc")).addDropdown((drop) =>
      drop
        .addOptions({ auto: t("langAuto"), zh: "中文", en: "English" })
        .setValue(this.plugin.settings.lang ?? "auto")
        .onChange(async (v) => {
          this.plugin.settings.lang = v as "auto" | "zh" | "en";
          LANG_PREF = this.plugin.settings.lang;
          await this.plugin.saveSettings();
          new Notice(t("langReload"), 6000);
          this.display();
        }),
    );

    new Setting(containerEl).setName(t("setAutoPreview")).setDesc(t("setAutoPreviewDesc")).addToggle((tgl) =>
      tgl.setValue(this.plugin.settings.autoPreview ?? false).onChange(async (v) => {
        this.plugin.settings.autoPreview = v;
        await this.plugin.saveSettings();
        if (v) void this.plugin.previewCurrentNote();
      }),
    );

    // setup guide — the first thing a new user sees
    const intro = containerEl.createEl("div");
    intro.style.cssText =
      "background:var(--background-secondary);border-radius:8px;padding:12px 16px;margin-bottom:14px;font-size:13px;line-height:1.9";
    intro.createEl("div").setText(t("intro"));
    const links = intro.createEl("div");
    const mkLink = (text: string, url: string) => {
      const a = links.createEl("a");
      a.textContent = text;
      a.href = url;
      a.target = "_blank";
    };
    mkLink(t("guideLink"), "https://publy.jrtx.site");
    links.style.marginTop = "4px";

    new Setting(containerEl).setName(t("setServer")).setDesc(t("setServerDesc")).addText((text) =>
      text.setPlaceholder("https://…").setValue(this.plugin.settings.server).onChange(async (v) => {
        this.plugin.settings.server = v.trim();
        await this.plugin.saveSettings();
      }),
    );
    new Setting(containerEl).setName(t("setKey")).setDesc(t("setKeyDesc")).addText((text) => {
      text.setPlaceholder("publy_…").setValue(this.plugin.settings.apiKey).onChange(async (v) => {
        this.plugin.settings.apiKey = v.trim();
        await this.plugin.saveSettings();
      });
      text.inputEl.type = "password";
    });
    const acctSetting = new Setting(containerEl).setName(t("setAccount")).setDesc(t("setAccountDesc"));
    void (async () => {
      try {
        const r = await this.plugin.apiGet<{ accounts?: { name: string }[] }>("/v1/accounts");
        const names = (r.accounts ?? []).map((a) => a.name);
        if (names.length === 0) throw new Error("no accounts");
        const opts: Record<string, string> = {};
        for (const n of names) opts[n] = n;
        acctSetting.addDropdown((drop) =>
          drop
            .addOptions(opts)
            .setValue(names.includes(this.plugin.settings.account) ? this.plugin.settings.account : names[0])
            .onChange(async (v) => {
              this.plugin.settings.account = v;
              await this.plugin.saveSettings();
            }),
        );
        if (!names.includes(this.plugin.settings.account)) {
          this.plugin.settings.account = names[0];
          await this.plugin.saveSettings();
        }
      } catch {
        acctSetting.addText((text) =>
          text.setPlaceholder(t("setAccountFallback")).setValue(this.plugin.settings.account).onChange(async (v) => {
            this.plugin.settings.account = v.trim();
            await this.plugin.saveSettings();
          }),
        );
      }
    })();
    new Setting(containerEl).setName(t("setMedia")).setDesc(t("setMediaDesc")).addText((text) =>
      text.setPlaceholder(t("setMediaPlaceholder")).setValue(this.plugin.settings.mediaDir).onChange(async (v) => {
        this.plugin.settings.mediaDir = v.trim();
        await this.plugin.saveSettings();
      }),
    );
    new Setting(containerEl).setName(t("setTheme")).setDesc(t("setThemeDesc")).addDropdown((drop) => {
      // Obsidian's addOptions calls hasOwnProperty on its argument; our
      // null-prototype lookup deliberately does not inherit that method.
      for (const [id, label] of Object.entries(availableArticleThemes())) drop.addOption(id, label);
      drop.setValue(this.plugin.settings.theme || "claude")
        .onChange(async (v) => {
          this.plugin.settings.theme = v;
          await this.plugin.saveSettings();
          // live re-render if the preview is open
          if (this.plugin.app.workspace.getActiveFile()) void this.plugin.previewCurrentNote();
        });
    });
    const connResult = containerEl.createEl("div");
    connResult.style.cssText = "font-size:13px;padding:2px 0 10px";
    new Setting(containerEl)
      .setName(t("setConn"))
      .setDesc(t("setConnDesc"))
      .addButton((btn) =>
        btn.setButtonText(t("btnTest")).setCta().onClick(() => {
          void this.testConnection(connResult);
        }),
      );
  }

  private async testConnection(resultEl: HTMLElement): Promise<void> {
    const s = this.plugin.settings;
    resultEl.setText(t("testing"));
    let base: URL;
    try {
      base = new URL(s.server);
    } catch {
      resultEl.setText(t("badServerUrl"));
      return;
    }
    if (!s.apiKey) {
      resultEl.setText(t("needKey"));
      return;
    }
    try {
      const health = await requestUrl({ url: new URL("/health", base).toString(), method: "GET" });
      if ((health.json as { status?: string } | null)?.status !== "ok") throw new Error(t("healthBad"));
      const quota = await requestUrl({
        url: new URL("/v1/quota", base).toString(),
        method: "GET",
        headers: { "x-api-key": s.apiKey },
      });
      if (quota.status === 401 || quota.status === 403) {
        resultEl.setText(t("keyInvalid", { code: quota.status }));
        return;
      }
      const q = quota.json as { plan?: string; used?: number; limit?: number; admin?: boolean; unlimited?: boolean };
      const usage = q.admin ? t("planAdmin") : t("planUsage", { plan: q.plan ?? "?", used: q.used ?? "?", limit: q.limit ?? "?" });
      resultEl.setText(t("connOk", { usage }) + (s.account ? "" : t("connOkNoAccount")));
    } catch (err) {
      resultEl.setText(t("connFail", { msg: (err as Error).message }));
    }
  }
}
