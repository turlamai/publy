// Shared Markdown parser; no filesystem or native image dependencies.
import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/common";

function highlight(code: string, lang: string): string {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  try {
    return hljs.highlight(code, { language }).value;
  } catch {
    return MarkdownIt().utils.escapeHtml(code);
  }
}

export function createArticleParser(): MarkdownIt {
  const md = new MarkdownIt({ html: true, breaks: false, highlight });
  // Typora may write file:///... for local inserted images. MarkdownIt's
  // default link validator bans file: for both links and images; permit the
  // syntax at parsing time, then remove file: from ordinary <a> hrefs in the
  // DOM sanitizer and resolve <img> to the usual local attachment pipeline.
  const defaultValidateLink = md.validateLink.bind(md);
  md.validateLink = (url: string): boolean =>
    /^file:\/\/\//i.test(url) || defaultValidateLink(url);
  return md;
}
