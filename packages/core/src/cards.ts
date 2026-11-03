// Image-post (image-post) card engine: markdown sections → themed 3:4 PNGs
// rendered deterministically with satori + resvg. Pixel-exact CJK glyphs,
// seconds per deck, no AI image generation.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { parseSource, type SourceMeta } from "./frontmatter.js";
import { NOTO_SANS_SC, loadSatoriFonts, loadSatoriFontsOffline, loadSatoriFontsWithFallback, type FontSpec } from "./fonts.js";
import { svgToPng } from "./svg.js";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1440; // 3:4

export type CardSectionKind = "cover" | "point" | "list" | "ending";

export interface CardSection {
  kind: CardSectionKind;
  lines: string[];
}

export interface CardTheme {
  id: string;
  fonts: FontSpec[];
  colors: {
    bg: string;
    text: string;
    muted: string;
    accent: string;
    accentSoft: string;
    rule: string;
  };
  /** subtle top-left label, e.g. a series name; empty disables */
  watermark?: string;
}

type Style = Record<string, string | number>;
interface El {
  type: string;
  props: { style?: Style; children?: El | string | (El | string)[] | null };
}
// Satori requires every div whose children are not a plain string to declare
// display:flex — pass strings for text leaves, null for empty containers.
const h = (type: string, style: Style, children: El | string | (El | string)[] | null = null): El => ({
  type,
  props: { style, children },
});

// ---------------------------------------------------------------------------
// built-in themes

export const BUILTIN_CARD_THEMES: Record<string, CardTheme> = {
  naive: {
    id: "naive",
    fonts: NOTO_SANS_SC,
    colors: { bg: "#ffffff", text: "#1a1a1a", muted: "#888888", accent: "#1a1a1a", accentSoft: "#f2f2f2", rule: "#eaeaea" },
  },
  claude: {
    id: "claude",
    fonts: NOTO_SANS_SC,
    colors: { bg: "#f8f6f0", text: "#2b2b2b", muted: "#6b6b6b", accent: "#b75c3d", accentSoft: "rgba(183, 92, 61, 0.08)", rule: "#e0ddd6" },
  },
  wechat: {
    id: "wechat",
    fonts: NOTO_SANS_SC,
    colors: { bg: "#ffffff", text: "#1a1a1a", muted: "#888888", accent: "#07C160", accentSoft: "rgba(7, 193, 96, 0.10)", rule: "#07C160" },
  },
  midnight: {
    id: "midnight",
    fonts: NOTO_SANS_SC,
    colors: { bg: "#0d1117", text: "#e6edf3", muted: "#8b949e", accent: "#7ee787", accentSoft: "rgba(126, 231, 135, 0.12)", rule: "#30363d" },
  },
};

export function loadCardTheme(id: string): CardTheme {
  const theme = BUILTIN_CARD_THEMES[id];
  if (!theme) {
    throw new Error(`Unknown card theme "${id}". Built-in: ${Object.keys(BUILTIN_CARD_THEMES).join(", ")}`);
  }
  return theme;
}

// ---------------------------------------------------------------------------
// source parsing

export interface ParsedCards {
  meta: SourceMeta;
  sections: CardSection[];
  caption: string;
}

const SECTION_RE = /^##\s*(cover|point|list|ending)\s*$/m;

export function parseCardSource(raw: string): ParsedCards {
  const { meta, body } = parseSource(raw);
  const sections: CardSection[] = [];
  const rest = body;
  let match: RegExpExecArray | null;
  const pattern = new RegExp(SECTION_RE.source, "gm");
  const marks: { kind: CardSectionKind; start: number; end: number }[] = [];
  while ((match = pattern.exec(rest)) !== null) {
    marks.push({ kind: match[1] as CardSectionKind, start: match.index, end: pattern.lastIndex });
  }
  if (marks.length === 0) {
    throw new Error("No card sections found. Add `## cover` / `## point` / `## list` / `## ending` sections.");
  }
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : rest.length;
    const lines = rest
      .slice(marks[i].end, end)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    sections.push({ kind: marks[i].kind, lines });
  }
  const caption = (meta.caption ?? "").trim();
  return { meta, sections, caption };
}

// ---------------------------------------------------------------------------
// rendering

function renderElement(theme: CardTheme, section: CardSection, index: number, total: number): El {
  const c = theme.colors;
  const page: El = h("div", { position: "absolute", bottom: 44, right: 72, fontSize: 28, color: c.muted }, `${index + 1} / ${total}`);
  const watermark: El[] = theme.watermark
    ? [h("div", { position: "absolute", top: 56, left: 72, fontSize: 26, color: c.muted, letterSpacing: 2 }, theme.watermark)]
    : [];

  const base: Style = {
    width: `${CARD_WIDTH}px`,
    height: `${CARD_HEIGHT}px`,
    display: "flex",
    flexDirection: "column",
    backgroundColor: c.bg,
    padding: "120px 88px",
    position: "relative",
  };

  const children: El[] = [];
  switch (section.kind) {
    case "cover": {
      const [title, ...subs] = section.lines;
      children.push(
        h("div", { display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", flex: 1 }, [
          h("div", { fontSize: 92, fontWeight: 700, color: c.text, lineHeight: 1.25 }, title ?? ""),
          ...(subs.length
            ? [h("div", { display: "flex", flexDirection: "column", marginTop: 36, fontSize: 42, color: c.muted, lineHeight: 1.6 }, subs)]
            : []),
        ]),
        h("div", { width: 120, height: 10, backgroundColor: c.accent, borderRadius: 6, marginBottom: 40 }),
      );
      break;
    }
    case "point": {
      const [heading, ...paras] = section.lines;
      children.push(
        h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, [
          h("div", { display: "flex", flexDirection: "row", alignItems: "center", marginBottom: 36 }, [
            h("div", { width: 14, height: 44, backgroundColor: c.accent, borderRadius: 7, marginRight: 24 }),
            h("div", { fontSize: 64, fontWeight: 700, color: c.text, lineHeight: 1.3 }, heading ?? ""),
          ]),
          ...paras.map((p) =>
            h("div", { display: "flex", flexDirection: "column", fontSize: 42, color: c.text, lineHeight: 1.7, marginTop: 24, opacity: 0.92 }, p),
          ),
        ]),
      );
      break;
    }
    case "list": {
      const items = section.lines.slice(0, 8);
      children.push(
        h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 34 }, items.map((item, i) =>
          h("div", { display: "flex", flexDirection: "row", alignItems: "flex-start" }, [
            h("div", {
              minWidth: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: c.accentSoft,
              color: c.accent,
              fontSize: 30,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 28,
            }, String(i + 1)),
            h("div", { display: "flex", flexDirection: "column", fontSize: 42, color: c.text, lineHeight: 1.55, flex: 1 }, item.replace(/^[-*]\s*/, "")),
          ]),
        )),
      );
      break;
    }
    case "ending": {
      const [cta, ...rest] = section.lines;
      children.push(
        h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center" }, [
          h("div", { fontSize: 60, fontWeight: 700, color: c.accent, textAlign: "center", lineHeight: 1.4 }, cta ?? ""),
          ...(rest.length
            ? [h("div", { display: "flex", flexDirection: "column", marginTop: 40, fontSize: 38, color: c.muted, textAlign: "center", lineHeight: 1.7 }, rest)]
            : []),
          h("div", { marginTop: 72, width: 80, height: 8, backgroundColor: c.rule, borderRadius: 4 }),
        ]),
      );
      break;
    }
  }

  return h("div", base, [...watermark, ...children, page]);
}

export interface CardOutput {
  kind: CardSectionKind;
  name: string;
  file: string;
}

export interface RenderCardsResult {
  cards: CardOutput[];
  caption: string;
  meta: SourceMeta;
  warnings: string[];
  lint: LintResult;
}

export interface LintResult {
  ok: boolean;
  problems: string[];
}

export function lintCards(sections: CardSection[], caption: string): LintResult {
  const problems: string[] = [];
  if (sections.length < 3 || sections.length > 9) {
    problems.push(`图片数量须为 3–9 张，当前 ${sections.length} 张`);
  }
  if (caption.length > 1000) {
    problems.push(`caption 超过微信 1000 字上限（当前 ${caption.length} 字）`);
  }
  if (caption.length === 0) {
    problems.push("caption 为空：在 frontmatter 添加 caption 字段");
  }
  if (!sections.some((s) => s.kind === "cover")) {
    problems.push("缺少 cover 封面卡");
  }
  if (!sections.some((s) => s.kind === "ending")) {
    problems.push("缺少 ending 结尾互动卡");
  }
  return { ok: problems.length === 0, problems };
}

export async function renderCards(
  raw: string,
  opts: {
    theme?: string;
    outDir?: string;
    fontFiles?: string[];
    /** never download fonts for an offline preview; use bundled subsets only */
    offline?: boolean;
    /** progressive rendering: fires as soon as each card is rasterized */
    onCard?: (card: CardOutput, index: number, total: number) => void;
  } = {},
): Promise<RenderCardsResult> {
  const warnings: string[] = [];
  const { meta, sections, caption } = parseCardSource(raw);
  const theme = loadCardTheme(opts.theme ?? meta.theme ?? "naive");
  const outDir = opts.outDir ?? process.cwd();

  const fontSpecs: FontSpec[] = opts.fontFiles?.length
    ? opts.fontFiles.map((f, i) => ({ family: "Custom", weight: i === 0 ? 400 : 700, file: path.resolve(f) }))
    : theme.fonts;

  fs.mkdirSync(outDir, { recursive: true });
  const cards: CardOutput[] = [];
  for (let i = 0; i < sections.length; i++) {
    const el = renderElement(theme, sections[i], i, sections.length);
    let svg: string;
    try {
      // fast path: bundled GB2312 subset (no network)
      const fonts = opts.fontFiles?.length
        ? await loadSatoriFonts(fontSpecs)
        : opts.offline
          ? await loadSatoriFontsOffline(fontSpecs)
          : await loadSatoriFontsWithFallback(fontSpecs);
      svg = await satori(el as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts });
    } catch (err) {
      // glyph outside the subset: retry once with the full downloadable fonts
      if (!opts.fontFiles?.length && !opts.offline) {
        const full = await loadSatoriFonts(fontSpecs);
        svg = await satori(el as never, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: full });
      } else {
        throw err;
      }
    }
    // Intermediate SVG/PNG files live in owned private temp directories,
    // never at a predictable path in the user's chosen output folder.
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-card-svg-"));
    let png: string | undefined;
    const name = `card-${String(i + 1).padStart(2, "0")}-${sections[i].kind}.png`;
    const file = path.join(outDir, name);
    try {
      const tmpSvg = path.join(tempDir, "card.svg");
      fs.writeFileSync(tmpSvg, svg);
      png = svgToPng(tmpSvg, CARD_WIDTH);
      fs.copyFileSync(png, file);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (png) fs.rmSync(path.dirname(png), { recursive: true, force: true });
    }
    const out: CardOutput = { kind: sections[i].kind, name, file };
    cards.push(out);
    opts.onCard?.(out, i, sections.length);
  }

  return { cards, caption, meta, warnings, lint: lintCards(sections, caption) };
}

// Browser previews can contain untrusted, imported or AI-generated Markdown
// captions. HTML-escape all user strings and stop active network/script loads.
function escapePreviewText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Contact-sheet preview: one HTML file with all cards + simulated caption. */
export function buildPreviewHtml(result: RenderCardsResult): string {
  const imgs = result.cards
    .map((c) => {
      const b64 = fs.readFileSync(c.file).toString("base64");
      return `<figure><img src="data:image/png;base64,${b64}" alt="Card: ${escapePreviewText(c.kind)}"/><figcaption>${escapePreviewText(c.kind)}</figcaption></figure>`;
    })
    .join("\n");
  const tags = Array.isArray(result.meta.tags) ? result.meta.tags.map((t) => `#${escapePreviewText(String(t))}`).join(" ") : "";
  const problems = result.lint.ok
    ? `<p class="ok">lint 通过 · ${result.cards.length} 张卡片</p>`
    : `<p class="bad">lint 未通过：</p><ul>${result.lint.problems.map((p) => `<li>${escapePreviewText(p)}</li>`).join("")}</ul>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>Publy card preview</title><style>
    body{background:#222;color:#eee;font-family:sans-serif;padding:24px}
    h1{font-size:18px}
    .deck{display:flex;flex-wrap:wrap;gap:16px}
    figure{margin:0;text-align:center}
    img{height:480px;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.5)}
    figcaption{font-size:12px;color:#999;margin-top:6px}
    .caption{margin-top:24px;padding:16px;background:#2b2b2b;border-radius:8px;max-width:560px;white-space:pre-wrap;line-height:1.6}
    .ok{color:#4ade8c}.bad{color:#f87171}
  </style></head><body>
  <h1>Publy 卡片预览 — ${result.cards.length} 张 · 3:4 · ${CARD_WIDTH}×${CARD_HEIGHT}</h1>
  <div class="deck">${imgs}</div>
  <div class="caption"><strong>caption（${result.caption.length} 字）</strong>
${escapePreviewText(result.caption)}${tags ? `\n\n${tags}` : ""}</div>
  ${problems}
  </body></html>`;
}
