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

/** Text-only preview slice. Image, raw HTML and TeX parity are not yet supported. */
export function previewLocalArticle(raw: string, trustedThemeCss: string): LocalArticlePreview {
  const warnings = new Set<string>();
  const body = rewriteOutsideCode(parseSource(raw).body, text => {
    if (/!\[\[/.test(text)) warnings.add("Image embeds require local media support.");
    if (/\$/.test(text)) warnings.add("Formula rendering is not yet supported in this preview.");
    return text.replace(/!\[\[([^\]]+)\]\]/g, (_match, name: string) => {
      return "![Image](" + encodeURIComponent(name) + ")";
    }).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => (alias ?? target).trim());
  });
  const parser = createArticleParser();
  // No author-supplied HTML or image/link URLs are allowed in this slice.
  parser.set({ html: false });
  parser.renderer.rules.image = () => { warnings.add("Images require local media support."); return '<span class="publy-missing-image">[Image]</span>'; };
  parser.renderer.rules.link_open = () => "<span>";
  parser.renderer.rules.link_close = () => "</span>";
  return { title: publicationTitle(raw), html: '<div id="publy">' + parser.render(body) + '</div>', css: resolveVars(trustedThemeCss), warnings: [...warnings] };
}
