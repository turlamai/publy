// Plugin settings UI. Local-only settings never need a server; the hosted
// subscription is not sold, so no purchase action is offered here.
import { App, Setting, PluginSettingTab, Notice, requestUrl } from "obsidian";
import type PublyPlugin from "./main.js";
import { t, setLanguage } from "./i18n.js";
import { availableArticleThemes } from "./article-themes.js";

export class PublySettingTab extends PluginSettingTab {
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
