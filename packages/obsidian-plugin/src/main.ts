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
import { t, setLanguage } from "./i18n.js";
import { availableArticleThemes, articleThemeCss } from "./article-themes.js";
import { imageContentType, fileToBase64, pickLocalImageFiles } from "./image-input.js";
import { VIEW_TYPE_PUBLY_PREVIEW, PUBLY_HISTORY_VIEW, DEFAULT_SETTINGS, type PublySettings, type PublishResponse, type PublishResultInfo, type HistoryEntry, type JobEntry } from "./types.js";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import embeddedResvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
// highlight css inlined as text by esbuild (loader ".css": "text")
import hljsGithubCss from "highlight.js/styles/github.css";
import hljsGithubDarkCss from "highlight.js/styles/github-dark.css";
// esbuild's binary loader embeds these two font subsets in main.js. Official
// Community Directory installs do not fetch the dist/fonts sidecar.
import embeddedRegularFont from "../../core/fonts/NotoSansSC-subset-Regular.otf";
import embeddedBoldFont from "../../core/fonts/NotoSansSC-subset-Bold.otf";

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
  private candidates: { name: string; data: string; contentType: string }[];
  private onPick: (choice: string | null) => void;
  private chosen: string;
  private picked = false;

  constructor(app: App, plugin: PublyPlugin, file: TFile, candidates: { name: string; data: string; contentType: string }[], current: string, onPick: (choice: string | null) => void) {
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
      // Payload attachments already carry base64 data; no filesystem path is
      // kept, so the tile cannot depend on a file that may have moved.
      const dataUri = c.data ? `data:${c.contentType};base64,${c.data}` : "";
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
  declare settings: PublySettings;
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
    setLanguage(this.settings.lang ?? "auto");

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
      const created = workspace.getRightLeaf(false);
      if (!created) throw new Error("Cannot open a Publy view in the current workspace");
      leaf = created;
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
      const { shell } = require("electron") as typeof import("electron");
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
    let html = "";
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
          setLanguage(this.plugin.settings.lang);
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
