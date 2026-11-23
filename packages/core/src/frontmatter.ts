import MarkdownIt from "markdown-it";

// Publication options come from the caller, never from note properties.
export type PublicationFormat = "article" | "image" | "cards";

export interface PublicationOptions {
  format?: PublicationFormat;
  title?: string;
  cover?: string;
  theme?: string;
  author?: string;
  digest?: string;
  caption?: string;
  tags?: string[];
}

export type SourceMeta = PublicationOptions;
export interface ParsedSource { meta: SourceMeta; body: string; }

export function resolvePublication(choice?: PublicationFormat): {
  format: PublicationFormat; type: "article" | "image_post"; source: "choice" | "default";
} {
  if (choice !== undefined && !["article", "image", "cards"].includes(choice)) {
    throw new Error("Unsupported publication format");
  }
  const format = choice ?? "article";
  return { format, type: format === "article" ? "article" : "image_post", source: choice ? "choice" : "default" };
}

/** Skip a leading properties block without evaluating YAML or exposing values.
 * A missing closing delimiter fails locally instead of leaking private fields.
 * Horizontal rules elsewhere in the body remain ordinary Markdown.
 */
export function parseSource(raw: string): ParsedSource {
  const source = raw.replace(/^\uFEFF/, "");
  if (!/^---[ \t]*\r?\n/.test(source)) return { meta: {}, body: source };
  const end = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gm;
  end.lastIndex = source.indexOf("\n") + 1;
  const close = end.exec(source);
  if (!close) throw new Error("Unclosed note properties block");
  return { meta: {}, body: source.slice(end.lastIndex) };
}

const titleParser = new MarkdownIt({html:false});

/** One shared title fallback for CLI and plugin; no note properties are read. */
export function publicationTitle(raw: string, explicit?: string, fallback = ""): string {
  if (explicit?.trim()) return explicit.trim();
  const tokens = titleParser.parse(parseSource(raw).body, {});
  for (let i=0; i<tokens.length; i++) {
    if (tokens[i].type !== "heading_open" || tokens[i].tag !== "h1") continue;
    const inline=tokens[i+1];
    if (inline?.type === "inline") {
      const text=inline.children?.map(token=>token.type === "softbreak" ? " " : token.content).join("").trim();
      if (text) return text;
    }
  }
  return fallback;
}

/** Image caption derives from body prose unless explicitly supplied. */
export function imagePostCaption(raw: string, explicit?: string): string {
  if (explicit !== undefined) return explicit.trim();
  return parseSource(raw).body.split("\n")
    .filter((line) => !/^\s*!\[\[|^\s*!\[/.test(line)).join("\n").trim();
}

/** Summary generation is shared by all draft clients. */
export function publicationDigest(raw: string, options: PublicationOptions): string {
  if (options.digest !== undefined) return options.digest;
  const body = parseSource(raw).body;
  const text = options.format === "cards" ? options.caption ?? body.split(/^##\s*(?:cover|point|list|ending)\s*$/m)[0]
    : options.format === "image" ? imagePostCaption(raw, options.caption)
    : body.split(/\n{2,}/).map(b=>b.trim()).find(b=>b && !b.startsWith("#") && !b.startsWith("!") && !b.startsWith("---")) ?? "";
  return text.replace(/!\[\[[^\]]*\]\]/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#>*`~_]/g, "").replace(/\s+/g, " ").trim().slice(0,120);
}
