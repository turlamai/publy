// Obsidian syntax preprocessing: image embeds and wikilinks → standard markdown.
// The source file is never modified; transforms happen in memory.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";

/** Resolve a referenced file name against media dirs and the source dir. */
export function resolveAsset(name: string, searchDirs: string[]): string | null {
  for (const dir of searchDirs) {
    const candidate = path.join(dir, name);
    // A vault folder (or a symlink to one) is not an image attachment.
    // existsSync alone would incorrectly mark ![[folder]] as resolved, hiding
    // the missing-asset warning and passing a directory to later renderers.
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Missing/unreadable candidates can still be found in other media dirs.
    }
    // Obsidian resolves bare names anywhere in the vault; we approximate with a
    // recursive scan of the media dirs (bounded, media dirs are flat in practice).
    const found = findRecursive(dir, name, 0);
    if (found) return found;
  }
  return null;
}

function findRecursive(dir: string, name: string, depth: number): string | null {
  if (depth > 3 || !fs.existsSync(dir)) return null;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name === name) return full;
    if (e.isDirectory() && !e.name.startsWith(".")) {
      const found = findRecursive(full, name, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// Ask the Markdown parser which lines are actually code blocks: a four-space
// line continuing a paragraph is not necessarily an indented code block.
const markdownBlocks = new MarkdownIt();
function rewriteOutsideCode(source: string, rewrite: (text: string) => string): string {
  const lines = source.split(/(?<=\n)/);
  const protectedLines = new Set<number>();
  const inlineStarts = new Set<number>(), inlineEnds = new Set<number>();
  for (const token of markdownBlocks.parse(source, {})) {
    if (token.type === "inline" && token.map) {
      inlineStarts.add(token.map[0]);
      inlineEnds.add(token.map[1]);
    }
    if ((token.type === "fence" || token.type === "code_block") && token.map) {
      for (let line = token.map[0]; line < token.map[1]; line++) protectedLines.add(line);
    }
  }
  const inline = (text: string): string => {
    const ticks = /`+/g;
    let cursor = 0, out = "", opener: RegExpExecArray | null;
    while ((opener = ticks.exec(text)) !== null) {
      let slashCount = 0;
      for (let i = opener.index - 1; i >= 0 && text[i] === "\\"; i--) slashCount++;
      if (slashCount % 2) continue;
      const search = /`+/g;
      search.lastIndex = ticks.lastIndex;
      let closing: RegExpExecArray | null;
      do { closing = search.exec(text); } while (closing && closing[0].length !== opener[0].length);
      if (!closing) continue;
      const end = closing.index + closing[0].length;
      out += rewrite(text.slice(cursor, opener.index)) + text.slice(opener.index, end);
      cursor = end;
      ticks.lastIndex = end;
    }
    return out + rewrite(text.slice(cursor));
  };
  let plain = "", result = "";
  const flush = () => { if (plain) { result += inline(plain); plain = ""; } };
  lines.forEach((line, index) => {
    if (inlineStarts.has(index)) flush();
    if (protectedLines.has(index) || /^\s*$/.test(line)) { flush(); result += line; }
    else plain += line;
    if (inlineEnds.has(index + 1)) flush();
  });
  flush();
  return result;
}

/**
 * Rewrite `![[name.png|alt|650]]` → `![alt](resolved path)` and
 * `[[link|alias]]` → alias. Returns the transformed body plus every
 * referenced asset path (for attachment collection).
 */
export function preprocessObsidian(
  body: string,
  searchDirs: string[],
): { body: string; assets: string[]; missing: string[] } {
  const assets: string[] = [];
  const missing: string[] = [];

  const embedPattern = /!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;
  const linkPattern = /\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

  const rewrite = (text: string): string => {
    let out = text.replace(embedPattern, (_m, nameRaw: string, rest?: string) => {
    const name = nameRaw.trim();
    const parts = (rest ?? "").split("|").map((s) => s.trim());
    const alt = parts[0] && !/^\d+$/.test(parts[0]) ? parts[0] : path.basename(name, path.extname(name));
    const resolved = resolveAsset(name, searchDirs);
    if (!resolved) {
      missing.push(name);
      return `![${alt}](${name})`;
    }
    assets.push(resolved);
    // Markdown destinations cannot contain raw spaces, parentheses or URL delimiters.
    // A local file URL preserves the exact path until the attachment pass.
    const fileUrl = pathToFileURL(resolved).href.replace(/\(/g, "%28").replace(/\)/g, "%29");
    const safeAlt = alt.replace(/[\\[\]]/g, "\\$&");
    return `![${safeAlt}](${fileUrl})`;
  });

    out = out.replace(linkPattern, (_m, target: string, alias?: string) => {
    return (alias ?? target).trim();
  });

    return out;
  };
  return { body: rewriteOutsideCode(body, rewrite), assets, missing };
}
