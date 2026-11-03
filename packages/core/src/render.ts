// Markdown → inline-styled HTML for the WeChat editor.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/common";
import * as cheerio from "cheerio";
import juice from "juice";
import { ATTACHMENT_SCHEME } from "@publy/shared";
import { parseSource, publishType, type SourceMeta } from "./frontmatter.js";
import { preprocessObsidian } from "./obsidian.js";
import { resolveEditorAsset } from "./editor-assets.js";
import { loadTheme, loadThemeFromCss, loadHighlightCss, resolveVars } from "./theme.js";
import { svgToPng } from "./svg.js";
import { texToPng } from "./math.js";

export interface RenderOptions {
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
  /** resolved cover path (from frontmatter), if any */
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

function highlight(code: string, lang: string): string {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  try {
    return hljs.highlight(code, { language }).value;
  } catch {
    return MarkdownIt().utils.escapeHtml(code);
  }
}

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

function mathInlineRule(state: any, silent: boolean): boolean {
  const src = state.src;
  const pos = state.pos;
  if (src.charCodeAt(pos) !== 0x24 /* $ */) return false;
  // find the closer: a $ with an even number of backslashes before it
  let end = pos + 1;
  for (;;) {
    end = src.indexOf("$", end);
    if (end === -1) return false;
    let bs = 0;
    for (let k = end - 1; src.charCodeAt(k) === 0x5c; k--) bs++;
    if (bs % 2 === 0) break;
    end++;
  }
  const content = src.slice(pos + 1, end);
  if (!content.trim() || /[\n\r]/.test(content)) return false;
  // pandoc-style guard: no unescaped whitespace hugging the delimiters
  if (/^\s|\s$/.test(content)) return false;
  if (!silent) state.push("html_inline", "", 0).content = mathPlaceholder(content, false);
  state.pos = end + 1;
  return true;
}

function mathBlockRule(state: any, startLine: number, endLine: number, silent: boolean): boolean {
  const startPos = state.bMarks[startLine] + state.tShift[startLine];
  if (state.src.charCodeAt(startPos) !== 0x24 || state.src.charCodeAt(startPos + 1) !== 0x24) return false;
  let pos = startPos + 2;
  let closeLine = startLine;
  let closeIdx = -1;
  while (closeLine < endLine) {
    const lineEnd = state.eMarks[closeLine];
    const rel = state.src.slice(pos, lineEnd).indexOf("$$");
    if (rel !== -1) {
      closeIdx = pos + rel;
      break;
    }
    closeLine++;
    pos = state.bMarks[closeLine] + state.tShift[closeLine];
  }
  if (closeIdx === -1) return false;
  const content = state.src.slice(startPos + 2, closeIdx).trim();
  if (!content) return false;
  if (!silent) {
    state.push("html_block", "", 0).content = mathPlaceholder(content, true) + "\n";
  }
  state.line = closeLine + 1;
  return true;
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
  const warnings: string[] = [];
  const { meta, body } = parseSource(raw);
  const baseDir = opts.baseDir ?? process.cwd();
  const mediaDirs = [...(opts.mediaDirs ?? []), baseDir];
  const themeId = opts.theme ?? meta.theme ?? "claude";

  // 1. Obsidian syntax → standard markdown
  const pre = preprocessObsidian(body, mediaDirs);
  if (pre.missing.length > 0) {
    warnings.push(`Assets not found: ${pre.missing.join(", ")}`);
  }

  // 2. markdown → html fragment
  const md = new MarkdownIt({ html: true, breaks: false, highlight });
  // Typora may write file:///... for local inserted images. MarkdownIt's
  // default link validator bans file: for both links and images; permit the
  // syntax at parsing time, then remove file: from ordinary <a> hrefs in the
  // DOM sanitizer and resolve <img> to the usual local attachment pipeline.
  const defaultValidateLink = md.validateLink.bind(md);
  md.validateLink = (url: string): boolean =>
    /^file:\/\/\//i.test(url) || defaultValidateLink(url);
  md.block.ruler.before("fence", "publy_math_block", mathBlockRule);
  md.inline.ruler.after("escape", "publy_math_inline", mathInlineRule);
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
  const blockedElements = "script,iframe,object,embed,form,input,button,select,textarea,link,meta,base,style,template,svg,math,video,audio,source,frame,frameset,applet,portal";
  $(blockedElements).remove();
  const safeUrl = (raw: string, kind: "href" | "src"): boolean => {
    const value = raw.trim();
    // Browsers strip ASCII control characters while interpreting protocols.
    const schemeText = value.replace(/[\u0000-\u0020]/g, "");
    if (!schemeText || schemeText.startsWith("#") ||
        schemeText.startsWith("/") || schemeText.startsWith("./") ||
        schemeText.startsWith("../")) return true;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(schemeText)?.[1]?.toLowerCase();
    if (!scheme) return true; // relative link or vault-relative asset
    if (scheme === "http" || scheme === "https") return true;
    if (kind === "href") return scheme === "mailto";
    // A local file:/// image is not an executable URL; it is immediately
    // resolved into an attachment:// reference below. File links are never
    // retained as clickable hrefs in the submitted HTML.
    if (kind === "src" && scheme === "file") return /^file:\/\/\//i.test(schemeText);
    if (scheme === "attachment") return true;
    if (scheme === "data") {
      return /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(schemeText);
    }
    return false;
  };
  $("*").each((_, el) => {
    if (el.type !== "tag") return;
    const attrs = { ...((el as { attribs?: Record<string, string> }).attribs ?? {}) };
    for (const [name, value] of Object.entries(attrs)) {
      const attribute = name.toLowerCase();
      // The sanitized markdown input never owns executable attributes or
      // inline CSS. Juice later applies the reviewed theme after this pass.
      if (attribute.startsWith("on") || ["style", "srcdoc", "srcset", "formaction", "action", "poster", "xlink:href"].includes(attribute)) {
        $(el).removeAttr(name);
      } else if ((attribute === "href" || attribute === "src") &&
                 !safeUrl(value, attribute)) {
        $(el).removeAttr(name);
      }
    }
  });
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
      typoraRootUrl: meta["typora-root-url"],
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

  // 5. cover resolution (frontmatter only; CLI/plugin may override)
  let cover: string | undefined;
  if (meta.cover) {
    cover = resolveEditorAsset(meta.cover, {
      baseDir,
      mediaDirs: opts.mediaDirs,
      typoraRootUrl: meta["typora-root-url"],
    }) ?? undefined;
    if (!cover) warnings.push(`Cover not found: ${meta.cover}`);
  }

  return {
    html,
    title: meta.title ?? "",
    meta,
    type: publishType(meta),
    cover,
    attachments: collector.attachments,
    warnings,
    cleanup,
  };
  } catch (error) {
    cleanup();
    throw error;
  }
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
