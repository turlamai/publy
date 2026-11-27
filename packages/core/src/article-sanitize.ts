// Shared source HTML policy. This is a pre-render boundary, not permission to mount arbitrary HTML in a browser.
import type { CheerioAPI } from "cheerio";

export function sanitizeArticleSource($: CheerioAPI): void {
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
}
