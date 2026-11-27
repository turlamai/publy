// Markdown → inline-styled HTML for the WeChat editor.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { configureArticleMath } from "./article-math.js";
import { createArticleParser } from "./article-parser.js";
import { sanitizeArticleSource } from "./article-sanitize.js";
import * as cheerio from "cheerio";
import juice from "juice";
import { ATTACHMENT_SCHEME } from "@publy/shared";
import { parseSource, publicationTitle, resolvePublication, type SourceMeta, type PublicationOptions } from "./frontmatter.js";
import { preprocessObsidian } from "./obsidian.js";
import { resolveEditorAsset } from "./editor-assets.js";
import { loadTheme, loadThemeFromCss, loadHighlightCss, resolveVars } from "./theme.js";
import { svgToPng } from "./svg.js";
import { texToPng } from "./math.js";

export interface RenderOptions extends PublicationOptions {
  theme?: string;
  /** path to a user-supplied CSS file; wins over `theme` */
  customThemePath?: string;
  /** raw theme css text (embedded environments pass this instead of theme) */
  themeCss?: string;
  highlight?: string;
  /** raw highlight.js css text (embedded environments) */
  highlightCss?: string;
  /** dirs searched for Obsidian-style asset references */
  mediaDirs?: string[];
  /** dir of the source file; assets resolve relative to it first */
  baseDir?: string;
  /** convert links to end-of-article footnotes (default true) */
  footnote?: boolean;
  /** text appended after the body, separated by a rule */
  footer?: string;
}

export interface Attachment {
  name: string;
  path: string;
  contentType: string;
}

export interface RenderResult {
  html: string;
  title: string;
  meta: SourceMeta;
  type: "article" | "image_post";
  /** resolved cover path (from explicit options), if any */
  cover?: string;
  attachments: Attachment[];
  warnings: string[];
  /** Remove only internally generated intermediate files after consuming attachments. */
  cleanup(): void;
}

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// --- math (TeX) -------------------------------------------------------------
// $...$ inline, $$...$$ block. The rules emit placeholder <img> nodes carrying
// the raw TeX; the DOM pass rasterizes them through mathjax → PNG (see
// math.ts) so WeChat never sees markup its editor would strip.

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function mathPlaceholder(tex: string, display: boolean): string {
  const hex = crypto.createHash("sha1").update(tex + (display ? "\u0001" : "\u0000")).digest("hex").slice(0, 10);
  return `<img class="publy-math" src="publy-math://${hex}" alt="${escapeAttr(tex)}" data-tex="${escapeAttr(tex)}" data-display="${display ? 1 : 0}" data-hex="${hex}">`;
}

class AttachmentCollector {
  attachments: Attachment[] = [];
  private used = new Set<string>();

  add(filePath: string): string {
    let base = path.basename(filePath);
    const ext = path.extname(base).toLowerCase();
    let name = base;
    let n = 2;
    while (this.used.has(name)) {
      name = `${path.basename(base, ext)}-${n}${ext}`;
      n++;
    }
    this.used.add(name);
    this.attachments.push({
      name,
      path: filePath,
      contentType: CONTENT_TYPES[ext] ?? "image/jpeg",
    });
    return name;
  }
}

export function renderMarkdown(raw: string, opts: RenderOptions = {}): RenderResult {
  const generatedDirs = new Set<string>();
  const cleanup = () => {
    for (const dir of generatedDirs) fs.rmSync(dir, { recursive: true, force: true });
    generatedDirs.clear();
  };
  try {
    return renderMarkdownWithCleanup(raw, opts, generatedDirs, cleanup);
  } catch (error) {
    cleanup();
    throw error;
  }
}

function renderMarkdownWithCleanup(
  raw: string, opts: RenderOptions, generatedDirs: Set<string>, cleanup: () => void,
): RenderResult {
  const warnings: string[] = [];
  const { body } = parseSource(raw);
  const meta: SourceMeta = { title: opts.title, cover: opts.cover, theme: opts.theme, author: opts.author, digest: opts.digest, caption: opts.caption };
  const baseDir = opts.baseDir ?? process.cwd();
  const mediaDirs = [...(opts.mediaDirs ?? []), baseDir];
  const themeId = opts.theme ?? "claude";

  // 1. Obsidian syntax → standard markdown
  const pre = preprocessObsidian(body, mediaDirs);
  if (pre.missing.length > 0) {
    warnings.push(`Assets not found: ${pre.missing.join(", ")}`);
  }

  // 2. markdown → html fragment
  const md = createArticleParser();
  configureArticleMath(md, mathPlaceholder);
  const bodyHtml = md.render(pre.body);
  const theme = opts.customThemePath
    ? loadThemeFromCss(opts.customThemePath)
    : opts.themeCss
      ? { id: themeId, css: resolveVars(opts.themeCss) }
      : loadTheme(themeId);
  const hljsCss = opts.highlightCss ?? loadHighlightCss(opts.highlight ?? "github");

  // 3. DOM post-processing
  const $ = cheerio.load(bodyHtml, null, false);
  // Source markdown may be imported, synced or generated. Preserve benign
  // author HTML, but prevent executable content from reaching the clipboard,
  // a temporary browser preview, or a downstream WeChat draft. Theme styles
  // are applied only AFTER this source boundary. See #13.
  sanitizeArticleSource($);
  const collector = new AttachmentCollector();

  // 3a. links → footnotes (WeChat strips plain <a> for most accounts)
  const footnoteEnabled = opts.footnote !== false;
  const notes: { n: number; label: string; href: string }[] = [];
  if (footnoteEnabled) {
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (!/^https?:\/\//.test(href)) return;
      const label = $(el).text().trim();
      if (!label) return;
      const n = notes.push({ n: notes.length + 1, label, href }) ;
      $(el).replaceWith(`${escapeText(label)}<sup>[${n}]</sup>`);
    });
  }

  // 3a-math. TeX formulas → PNG attachments: images survive the WeChat editor,
  // HTML/CSS math does not. Same TeX hashes to the same file name, so repeated
  // formulas upload once (and hit the server's material cache).
  const mathNames = new Map<string, string>();
  $("img.publy-math").each((_, el) => {
    const texStr = $(el).attr("data-tex") ?? "";
    const display = $(el).attr("data-display") === "1";
    const hex = $(el).attr("data-hex") ?? crypto.randomBytes(5).toString("hex");
    const img = texToPng(texStr, display);
    if (!img) {
      warnings.push(`Math not rendered (mathjax-full unavailable or TeX error): ${texStr.slice(0, 40)}`);
      $(el).replaceWith(`<code>${escapeText(texStr)}</code>`);
      return;
    }
    let name = mathNames.get(hex);
    if (!name) {
      const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "publy-math-"));
      generatedDirs.add(outDir);
      const outPath = path.join(outDir, `formula-${hex}.png`);
      fs.writeFileSync(outPath, img.png);
      name = collector.add(outPath);
      mathNames.set(hex, name);
    }
    $(el).attr("src", `${ATTACHMENT_SCHEME}${name}`);
    // inline style wins over theme `img` rules — themes set display:block on
    // images and add block-image margins, which would enlarge the text line
    $(el).attr(
      "style",
      display
        ? `display:block;margin:12px auto;width:${img.widthPx}px`
        : `display:inline-block;margin:0;padding:0;width:${img.widthPx}px;vertical-align:${img.valignPx}px;border-radius:0`,
    );
    $(el).removeAttr("data-tex data-display data-hex");
  });

  // 3b. images: svg → png, local files → attachment refs
  $("img").each((_, el) => {
    const src = $(el).attr("src");
    if (!src || src.startsWith(ATTACHMENT_SCHEME)) return;
    // Remote and embedded data images are not uploaded via the official
    // WeChat media API by this renderer. Never silently ship draft HTML that
    // only happens to reference them. Do not log their full source URL:
    // signed image URLs may contain user credentials/query tokens.
    // A warning alone is insufficient: leaving a remote src in the HTML
    // causes Obsidian/browser previews to fetch it (including signed URLs),
    // even when the draft submission is later blocked. Treat protocol-relative
    // and control-character-obfuscated HTTP(S) URLs as remote as well.
    const normalizedSrc = src.trim().replace(/[\u0000-\u0020]/g, "");
    if (/^https?:/i.test(normalizedSrc) || /^[/\\]{2}/.test(normalizedSrc)) {
      warnings.push("Remote image not uploaded: save the HTTP(S) image locally before publishing.");
      $(el).removeAttr("src");
      return;
    }
    if (/^data:/i.test(normalizedSrc)) {
      warnings.push("Embedded data image not uploaded: save the image as a local file before publishing.");
      $(el).removeAttr("src");
      return;
    }
    // Preserve relative directories from Typora and other Markdown files
    // and plain Markdown. Never pick a same-name asset from another folder.
    let filePath = resolveEditorAsset(src, {
      baseDir,
      mediaDirs: opts.mediaDirs,
    });
    if (!filePath) {
      warnings.push(`Image not found: ${src}`);
      return;
    }
    if (filePath.toLowerCase().endsWith(".svg")) {
      try {
        filePath = svgToPng(filePath);
        generatedDirs.add(path.dirname(filePath));
      } catch (e) {
        warnings.push(`SVG conversion failed for ${filePath}: ${(e as Error).message}`);
        return;
      }
    }
    const name = collector.add(filePath);
    $(el).attr("src", `${ATTACHMENT_SCHEME}${name}`);
  });

  // 3c. footnote section
  if (footnoteEnabled && notes.length > 0) {
    const items = notes
      // href came from untrusted Markdown/HTML. Escaping is required again
      // because Cheerio decodes entities when reading the href attribute.
      .map((note) => `<p><sup>[${note.n}]</sup> ${escapeText(note.label)}：${escapeText(note.href)}</p>`)
      .join("");
    $.root().append(`<div class="publy-footnotes"><p><strong>引用链接</strong></p>${items}</div>`);
  }
  if (opts.footer) {
    // Footer is documented as plain text, not a trusted HTML fragment.
    $.root().append(`<hr/><p>${escapeText(opts.footer)}</p>`);
  }

  const inner = $.html();

  // 4. assemble + inline styles
  const styled = `<div id="publy">${inner}</div>`;
  const full = `<html><head><style>${theme.css}\n${hljsCss}</style></head><body>${styled}</body></html>`;
  const inlined = juice(full, { removeStyleTags: true });
  const $out = cheerio.load(inlined);
  // tables & code blocks must never blow out the column: WeChat wraps cell
  // text (width:100% alone loses to unbreakable tokens like long urls), and
  // pathological tables scroll inside the content width instead
  $out("td, th").css({ "word-break": "break-word", "overflow-wrap": "anywhere" });
  $out("table").wrap('<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%"></div>');
  $out("pre").css("overflow-x", "auto");
  // outerHTML keeps the wrapper's inline styles (background, font-size) — the
  // WeChat editor pastes this div as-is.
  const html = $out.html("#publy") ?? "";

  // 5. cover resolution from explicit operation options only
  let cover: string | undefined;
  if (meta.cover) {
    cover = resolveEditorAsset(meta.cover, {
      baseDir,
      mediaDirs: opts.mediaDirs,
    }) ?? undefined;
    if (!cover) warnings.push(`Cover not found: ${meta.cover}`);
  }

  return {
    html,
    title: publicationTitle(raw, opts.title),
    meta,
    type: resolvePublication(opts.format).type,
    cover,
    attachments: collector.attachments,
    warnings,
    cleanup,
  };
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render a image-post caption (plain markdown paragraph text) to HTML. */
export function captionToHtml(text: string): string {
  const md = new MarkdownIt({ html: false, breaks: true, linkify: false });
  return md.render(text.trim());
}

/** Strip markdown syntax for plain-text uses (digest, lint counts). */
export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[\[[^\]]*\]\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`~_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
