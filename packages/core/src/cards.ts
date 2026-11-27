// Image-post (image-post) card engine: markdown sections → themed 3:4 PNGs
// rendered deterministically with satori + resvg. Pixel-exact CJK glyphs,
// seconds per deck, no AI image generation.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { type SourceMeta, type PublicationOptions } from "./frontmatter.js";
import { NOTO_SANS_SC, loadSatoriFonts, loadSatoriFontsOffline, loadSatoriFontsWithFallback, type FontSpec } from "./fonts.js";
import { svgToPng } from "./svg.js";
import { CARD_WIDTH, CARD_HEIGHT, CARD_PALETTES, cardElement, parseCardSource, lintCards,
         type CardPalette, type CardSectionKind, type LintResult } from "./card-layout.js";
export { CARD_WIDTH, CARD_HEIGHT, parseCardSource, lintCards } from "./card-layout.js";
export type { CardSectionKind, CardSection, ParsedCards, LintResult } from "./card-layout.js";

export interface CardTheme extends CardPalette {
  fonts: FontSpec[];
}

export const BUILTIN_CARD_THEMES: Record<string, CardTheme> = Object.fromEntries(
  Object.entries(CARD_PALETTES).map(([id, palette]) => [id, { ...palette, fonts: NOTO_SANS_SC }]),
);

export function loadCardTheme(id: string): CardTheme {
  const theme = BUILTIN_CARD_THEMES[id];
  if (!theme) {
    throw new Error(`Unknown card theme "${id}". Built-in: ${Object.keys(BUILTIN_CARD_THEMES).join(", ")}`);
  }
  return theme;
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

export async function renderCards(
  raw: string,
  opts: PublicationOptions & {
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
  const { meta, sections, caption } = parseCardSource(raw, opts);
  const theme = loadCardTheme(opts.theme ?? "naive");
  const outDir = opts.outDir ?? process.cwd();

  const fontSpecs: FontSpec[] = opts.fontFiles?.length
    ? opts.fontFiles.map((f, i) => ({ family: "Custom", weight: i === 0 ? 400 : 700, file: path.resolve(f) }))
    : theme.fonts;

  fs.mkdirSync(outDir, { recursive: true });
  const cards: CardOutput[] = [];
  for (let i = 0; i < sections.length; i++) {
    const el = cardElement(theme, sections[i], i, sections.length);
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
