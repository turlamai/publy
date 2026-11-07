// Built-in article theme CSS and the installed-bundle picker. Bundle
// validation and file access stay in @publy/core; this module only exposes
// safe labels/CSS to the plugin UI.
import { Notice } from "obsidian";
import { listInstalledThemes, readInstalledTheme, BUILTIN_CARD_THEMES } from "@publy/core";
import { t } from "./i18n.js";
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

/** Only validated content-only bundles are offered to the plugin. */
export function availableArticleThemes(): Record<string, string> {
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
export function articleThemeCss(id: string): string {
  if (Object.hasOwn(THEME_CSS, id)) return THEME_CSS[id];
  try { return readInstalledTheme(id).css; }
  catch { throw new Error(t("themeLoadError")); }
}
