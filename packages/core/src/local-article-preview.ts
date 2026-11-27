// Local-only article preview foundation. Never mount this fragment directly in the host DOM.
// The workbench must use a sandboxed iframe with a deny-by-default CSP.
import { createArticleParser } from "./article-parser.js";
import { parseSource, publicationTitle } from "./frontmatter.js";
import { rewriteOutsideCode } from "./markdown-rewrite.js";
import { resolveVars } from "./theme-css.js";

export interface LocalArticlePreview {
  title: string;
  html: string;
  css: string;
  warnings: string[];
}

/** Preview accepts only explicitly selected raster images. Raw HTML and TeX parity remain open. */
export function previewLocalArticle(raw: string, trustedThemeCss: string, media: ReadonlyMap<string, string> = new Map()): LocalArticlePreview {
  const warnings = new Set<string>();
  const body = rewriteOutsideCode(parseSource(raw).body, text => {
    if (/\$/.test(text)) warnings.add("Formula rendering is not yet supported in this preview.");
    return text.replace(/!\[\[([^\]]+)\]\]/g, (_match, name: string) => {
      return "![Image](" + encodeURIComponent(name.split("|")[0].trim()) + ")";
    }).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => (alias ?? target).trim());
  });
  const parser = createArticleParser();
  // Author-supplied HTML and network URLs never reach the preview.
  parser.set({ html: false });
  parser.renderer.rules.image = (tokens, idx) => {
    const token = tokens[idx];
    const src = token.attrGet("src") ?? "";
    const key = localMediaKey(src);
    const data = key === null ? undefined : media.get(key);
    if (data && /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(data)) {
      return '<img src="' + data + '" alt="' + parser.utils.escapeHtml(token.content) + '">';
    }
    warnings.add("Image unavailable: select the matching local image.");
    return '<span class="publy-missing-image">[Image]</span>';
  };
  parser.renderer.rules.link_open = () => "<span>";
  parser.renderer.rules.link_close = () => "</span>";
  return { title: publicationTitle(raw), html: '<div id="publy">' + parser.render(body) + '</div>', css: resolveVars(trustedThemeCss), warnings: [...warnings] };
}

/** Canonical relative paths only. Do not resolve URLs, traversal or absolute paths. */
export function localMediaKey(raw: string): string | null {
  let value: string;
  try { value = decodeURIComponent(raw); } catch { return null; }
  if (!value || /[\u0000-\u001f\u007f:?#\\]/.test(value) || value.startsWith("/")) return null;
  const parts = value.split("/").filter(part => part !== ".");
  if (parts.some(part => !part || part === "..")) return null;
  return parts.join("/");
}
