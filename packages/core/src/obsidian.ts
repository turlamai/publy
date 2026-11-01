// Obsidian syntax preprocessing: image embeds and wikilinks → standard markdown.
// The source file is never modified; transforms happen in memory.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

  let out = body.replace(embedPattern, (_m, nameRaw: string, rest?: string) => {
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

  return { body: out, assets, missing };
}
