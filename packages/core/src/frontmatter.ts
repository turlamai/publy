// Frontmatter parsing for publy markdown sources.

import matter from "gray-matter";

export interface SourceMeta {
  title?: string;
  cover?: string;
  /** "article" (default) | "image" | "image_post" */
  type?: string;
  theme?: string;
  author?: string;
  digest?: string;
  /** image-post caption (image posts) */
  caption?: string;
  /** image-post hashtags, rendered as #tag in the caption */
  tags?: string[];
  /** image-post card mode: "cards" implies an image post */
  mode?: string;
  /** Typora local image root for Markdown references such as /images/photo.png. */
  "typora-root-url"?: string;
}

export interface ParsedSource {
  meta: SourceMeta;
  body: string;
}

export type PublicationFormat = "article" | "image" | "cards";

/** Resolve one publishing operation without mutating the source metadata. */
export function resolvePublication(meta: SourceMeta, choice?: PublicationFormat): {
  format: PublicationFormat;
  type: "article" | "image_post";
  source: "choice" | "frontmatter" | "default";
} {
  if (choice !== undefined && !["article", "image", "cards"].includes(choice)) {
    throw new Error("Unsupported publication format");
  }
  const type = typeof meta.type === "string" ? meta.type.toLowerCase() : "";
  const mode = typeof meta.mode === "string" ? meta.mode.toLowerCase() : "";
  const metadataFormat: PublicationFormat = type
    ? (type === "image" || type === "image_post" ? (mode === "cards" ? "cards" : "image") : "article")
    : (mode === "cards" ? "cards" : "article");
  const format = choice ?? metadataFormat;
  return { format, type: format === "article" ? "article" : "image_post",
    source: choice ? "choice" : type || mode === "cards" ? "frontmatter" : "default" };
}

export function parseSource(raw: string): ParsedSource {
  const { data, content } = matter(raw);
  return { meta: data as SourceMeta, body: content };
}

/** The text accompanying an image post, using the same rules for all clients. */
export function imagePostCaption(raw: string): string {
  return parseSource(raw).body.split("\n")
    .filter((line) => !/^\s*!\[\[|^\s*!\[/.test(line))
    .join("\n").trim();
}

export function publishType(meta: SourceMeta): "article" | "image_post" {
  return resolvePublication(meta).type;
}
