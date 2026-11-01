// Obsidian syntax preprocessing: image embeds and wikilinks → standard markdown.
// The source file is never modified; transforms happen in memory.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Resolve a referenced file name against media dirs and the source dir. */
export function resolveAsset(name: string, searchDirs: string[]): string | null {
  for (const dir of searchDirs) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
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

/**
 * Obsidian links in Markdown code examples are literal text, not embeds.
 * Preserve fenced/indented blocks and paired inline backtick spans before
 * resolving any files. This also avoids false missing-media publication gates.
 * Source bytes are never rewritten; this operates on an in-memory string.
 */
function rewriteOutsideMarkdownCode(source: string, rewrite: (text: string) => string): string {
  const rewriteInline = (text: string): string => {
    let out = "";
    let from = 0;
    const ticks = /`+/g;
    let opener: RegExpExecArray | null;
    const escaped = (index: number): boolean => {
      let count = 0;
      for (let i = index - 1; i >= 0 && text[i] === "\\\\"; i--) count++;
      return count % 2 !== 0;
    };
    while ((opener = ticks.exec(text)) !== null) {
      if (escaped(opener.index)) continue;
      const search = /`+/g;
      search.lastIndex = ticks.lastIndex;
      let closer: RegExpExecArray | null = null;
      let candidate: RegExpExecArray | null;
      while ((candidate = search.exec(text)) !== null) {
        if (!escaped(candidate.index) && candidate[0].length === opener[0].length) {
          closer = candidate;
          break;
        }
      }
      if (!closer) continue; // unmatched backticks are ordinary Markdown text
      out += rewrite(text.slice(from, opener.index));
      const end = closer.index + closer[0].length;
      out += text.slice(opener.index, end);
      from = end;
      ticks.lastIndex = end;
    }
    return out + rewrite(text.slice(from));
  };

  let out = "";
  let plain = "";
  let fence: { marker: string; length: number } | null = null;
  const flush = (): void => {
    if (plain) {
      out += rewriteInline(plain);
      plain = "";
    }
  };
  for (const line of source.split(/(?<=\n)/)) {
    const content = line.replace(/\r?\n$/, "");
    if (fence) {
      out += line;
      const closing = new RegExp("^ {0,3}" + fence.marker + "{" + fence.length + ",}[ \\t]*$");
      if (closing.test(content)) fence = null;
      continue;
    }
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
    if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
      flush();
      fence = { marker: opening[1][0], length: opening[1].length };
      out += line;
    } else if (/^(?: {4}|\t)/.test(content)) {
      // Indented code blocks cannot contain active Obsidian embeds.
      flush();
      out += line;
    } else {
      plain += line;
    }
  }
  flush();
  return out;
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
    const embedded = text.replace(embedPattern, (_m, nameRaw: string, rest?: string) => {
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

    return embedded.replace(linkPattern, (_m, target: string, alias?: string) => {
      return (alias ?? target).trim();
    });
  };

  return { body: rewriteOutsideMarkdownCode(body, rewrite), assets, missing };
}
