// Resolve image/cover paths from any file-based Markdown editor, without
// modifying the user's source or guessing based on a shared basename.
// Obsidian ![[embeds]] have a separate vault lookup in obsidian.ts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveAsset } from "./obsidian.js";

export interface EditorAssetOptions {
  baseDir: string;
  mediaDirs?: string[];
  /** Typora's optional YAML typora-root-url, e.g. /path/to/project. */
  typoraRootUrl?: string;
}

function existingFile(candidate: string): string | null {
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Standard Markdown paths are relative to the source document first. This
 * preserves namespaced assets like assets/a/logo.png vs assets/b/logo.png.
 *
 * For Typora's /assets/image.png with a local typora-root-url, that explicit
 * root takes precedence over OS-absolute paths. We do not download remote
 * assets or silently replace missing nested paths with same-name files.
 */
/**
 * Typora's optional "Auto escape image URL when insert" setting historically
 * emits %uXXXX for Unicode filename characters, including Chinese names.
 * Markdown HTML parsing may also normalize that to %25uXXXX. Decode one URL
 * layer and one legacy %u layer without repeatedly unescaping %252F into "/".
 *
 * A literal '%' is valid in a filename. If a path is not valid URI-encoded
 * UTF-8, prefer its exact spelling to destructive or lossy replacement.
 */
export function decodeTyporaImagePath(reference: string): string {
  const legacyUnicode = (value: string): string => value.replace(
    /%u([0-9a-f]{4})/gi,
    (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
  );
  const first = legacyUnicode(reference.trim());
  let decoded: string;
  try {
    decoded = decodeURIComponent(first);
  } catch {
    decoded = first;
  }
  return legacyUnicode(decoded);
}

export function resolveEditorAsset(reference: string, opts: EditorAssetOptions): string | null {
  // Decode file URLs exactly once. Decoding the path first would turn %23
  // into a URL fragment and %25 into a stray percent before fileURLToPath.
  const raw = reference.trim();
  // Fail closed only when decoding INTRODUCES a slash or backslash.
  // %252F becomes the literal filename text %2F (safe); %25u002F
  // becomes '/' (unsafe). Comparing separators also catches encoded
  // spellings of the legacy %u escape without rejecting literal '%' names.
  const source = decodeTyporaImagePath(raw);
  const separators = (value: string): number => (value.match(/[/\\]/g) ?? []).length;
  if (separators(source) > separators(raw)) return null;
  if (/^file:\/\//i.test(raw)) {
    try {
      return existingFile(fileURLToPath(raw));
    } catch {
      return null;
    }
  }
  if (!source || /^(?:https?:|data:|attachment:)/i.test(source)) return null;

  if (source.startsWith("/") && typeof opts.typoraRootUrl === "string") {
    let root = opts.typoraRootUrl.trim();
    if (/^file:\/\//i.test(root)) {
      try { root = fileURLToPath(root); } catch { root = ""; }
    }
    // A Typora root must refer to a local filesystem path. Never fetch HTTP
    // URLs or allow a remote URL to influence local file resolution.
    if (root && !/^(?:https?:|data:|ftp:)/i.test(root)) {
      const rootDir = path.resolve(opts.baseDir, root);
      const relative = source.replace(/^\/+/, "");
      const target = path.resolve(rootDir, relative);
      // Treat this as a rooted namespace, not arbitrary path traversal.
      if (target.startsWith(rootDir + path.sep) || target === rootDir) {
        return existingFile(target);
      }
    }
    // A document declares this root for slash-prefixed Typora images.
    // Missing files or invalid/remote roots MUST NOT fall back to an
    // unrelated OS-absolute file with the same pathname.
    return null;
  }

  if (path.isAbsolute(source)) return existingFile(source);

  const searchDirs = [opts.baseDir, ...(opts.mediaDirs ?? [])];
  for (const dir of searchDirs) {
    const file = existingFile(path.resolve(dir, source));
    if (file) return file;
  }
  // Bare basenames remain compatible with old Obsidian/media-dir layouts.
  // Explicit nested paths should NEVER resolve to a different same-name file.
  if (path.basename(source) === source) {
    return resolveAsset(source, searchDirs);
  }
  return null;
}
