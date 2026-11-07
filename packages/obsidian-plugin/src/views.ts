// Preview and history leaves. They receive the plugin instance for commands
// but own only view construction and rendering.
import { ItemView, WorkspaceLeaf, setIcon, sanitizeHTMLToDom } from "obsidian";
import type { PublicationFormat } from "@publy/core";
import { t } from "./i18n.js";
import { availableArticleThemes } from "./article-themes.js";
import { VIEW_TYPE_PUBLY_PREVIEW, PUBLY_HISTORY_VIEW, type JobEntry, type HistoryEntry } from "./types.js";
import type PublyPlugin from "./main.js";

/** In-app preview leaf: article HTML or image-post card strip, with a small
 *  action toolbar (refresh / copy / publish) so the preview is a cockpit,
 *  not a dead end. */
export class PublyPreviewView extends ItemView {
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
export class PublyHistoryView extends ItemView {
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
