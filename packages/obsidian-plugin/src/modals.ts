// Small pickers: account switching, cover selection and scheduled time.
import crypto from "node:crypto";
import { Modal, App, TFile, Notice, setIcon } from "obsidian";
import type PublyPlugin from "./main.js";
import { generateTitleCover, type PublicationOptions, type PublicationFormat } from "@publy/core";
import { t } from "./i18n.js";
import { pickLocalImageFiles, fileToBase64, imageContentType } from "./image-input.js";

/** Simple list picker for switching accounts. */
export class AccountModal extends Modal {
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
export class CoverPickerModal extends Modal {
  private plugin: PublyPlugin;
  private file: TFile;
  private candidates: { name: string; data: string; contentType: string }[];
  private onPick: (choice: string | null) => void;
  private chosen: string;
  private picked = false;

  constructor(app: App, plugin: PublyPlugin, file: TFile, candidates: { name: string; data: string; contentType: string }[], current: string, onPick: (choice: string | null) => void, private title = file.basename) {
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
      const png = generateTitleCover(this.title);
      if (png) {
        const im = box.createEl("img");
        im.src = "data:image/png;base64," + png.toString("base64");
      } else {
        const d = box.createEl("div");
        d.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f8f6f0;color:#b75c3d;font-weight:600;font-size:12px;text-align:center;padding:4px;line-height:1.4";
        d.setText(this.title);
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
export class ScheduleModal extends Modal {
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


/** An explicit operation choice is separate from authorization to create a draft. */
export class PublicationOptionsModal extends Modal {
  private completed = false;
  constructor(app: App, private note: string, private account: string,
    private options: PublicationOptions,
    private onSubmit: (result: {options: PublicationOptions; action: "preview" | "publish"} | null) => void, private scheduledAt?: string) { super(app); }
  onOpen(): void {
    this.contentEl.createEl("h3").setText(t("operationTitle"));
    this.contentEl.createEl("p").setText(t("operationTarget", {note:this.note, account:this.account || t("operationNoAccount")}));
    this.contentEl.createEl("p").setText(t("operationNote"));
    if (this.scheduledAt) this.contentEl.createEl("p").setText(t("operationScheduled", {time:this.scheduledAt}));
    const label = this.contentEl.createEl("label"); label.setText(t("formatLabel"));
    const format = label.createEl("select"); format.addClass("publy-select");
    format.setAttribute("aria-label", t("formatLabel"));
    for (const id of ["article", "image", "cards"] as const) {
      const option = format.createEl("option"); option.value=id;
      option.textContent=t(id === "article" ? "formatArticle" : id === "image" ? "formatImage" : "formatCards");
    }
    format.value=this.options.format ?? "article";
    const fields: Partial<Record<keyof PublicationOptions, HTMLInputElement | HTMLTextAreaElement>> = {};
    for (const [key, name] of [["title","operationName"],["author","operationAuthor"],["digest","operationDigest"],["caption","operationCaption"]] as const) {
      const row=this.contentEl.createEl("label"); row.addClass("publy-operation-field"); row.setText(t(name));
      const input=key === "caption" ? row.createEl("textarea") : row.createEl("input");
      input.setAttribute("aria-label",t(name)); input.value=this.options[key] ?? "";
      if (key === "title") input.required=true;
      fields[key]=input;
    }
    const buttons=this.contentEl.createEl("div"); buttons.addClass("publy-modal-row");
    const finish=(action: "preview" | "publish") => {
      const title=fields.title!.value.trim(); if (!title) { fields.title!.focus(); return; }
      const options: PublicationOptions={...this.options,format:format.value as PublicationFormat,title};
      for (const key of ["author","digest","caption"] as const) {
        options[key]=fields[key]!.value || undefined;
      }
      this.completed=true; this.close(); this.onSubmit({options,action});
    };
    const cancel=buttons.createEl("button");cancel.setText(t("btnCancel"));cancel.addEventListener("click",()=>this.close());
    const preview=buttons.createEl("button");preview.setText(t("operationPreview"));preview.addEventListener("click",()=>finish("preview"));
    const submit=buttons.createEl("button");submit.addClass("mod-cta");submit.setText(t("operationSubmit"));submit.addEventListener("click",()=>finish("publish"));
    fields.title!.focus();
  }
  onClose(): void { this.contentEl.empty(); if (!this.completed) this.onSubmit(null); }
}
