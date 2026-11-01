// Theme loading. Built-in themes ship as CSS files scoped under #publy.
// CSS variables are resolved to literal values because the WeChat editor
// strips <style> blocks and does not support var().
//
// Embedding note: CSS may also be provided directly as text (themeCss option
// / resolveVars export) — required for CJS-embedded environments (the Obsidian
// plugin) where import.meta-based self-path resolution is unavailable.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export interface Theme {
  id: string;
  css: string;
}

export const BUILTIN_THEMES = [
  "claude",
  "medium",
  "wechat",
  "ink",
  "tech",
  "rose",
  "official",
  "fortune",
  "terminal",
  "news",
] as const;

/** require relative to this module — works in real ESM (import.meta) and in
 *  esbuild-cjs bundles (__dirname); returns null when neither is available
 *  (e.g. sandboxed plugin bundles that must not touch disk anyway). */
function requireHere(): NodeRequire | null {
  try {
    return createRequire(fileURLToPath(import.meta.url));
  } catch {
    try {
      if (typeof __dirname !== "undefined") return createRequire(__dirname);
    } catch {
      /* fall through */
    }
    return null;
  }
}

export function resolveVars(css: string): string {
  // strip comments first: a trailing comment line would otherwise swallow the
  // first variable that follows it (bit both claude and medium backgrounds)
  const vars = new Map<string, string>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rootMatch = clean.match(/:root\s*{([^}]*)}/);
  if (rootMatch) {
    for (const line of rootMatch[1].split(";")) {
      const m = line.trim().match(/^(--[\w-]+)\s*:\s*(.+)$/);
      if (m) vars.set(m[1], m[2].trim());
    }
  }
  let out = css;
  // resolve simple var(--x) references (no fallback syntax needed by builtin themes)
  for (const [name, value] of vars) {
    out = out.replaceAll(`var(${name})`, value);
  }
  // drop the :root block entirely
  out = out.replace(/:root\s*{[^}]*}\s*/g, "");
  return out;
}

function builtinThemesDir(): string | null {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dir = path.resolve(here, "../themes");
    return fs.existsSync(path.join(dir, "claude.css")) ? dir : null;
  } catch {
    return null;
  }
}

export function loadTheme(id: string): Theme {
  // The caller may pass a theme from untrusted Markdown frontmatter.
  // Built-in IDs must never be interpreted as filesystem paths. Custom CSS
  // is an explicit separate operation via loadThemeFromCss.
  if (!(BUILTIN_THEMES as readonly string[]).includes(id)) {
    throw new Error(`Unknown theme id. Built-in themes: ${BUILTIN_THEMES.join(", ")}`);
  }
  const dir = builtinThemesDir();
  const file = dir ? path.join(dir, `${id}.css`) : null;
  if (!file || !fs.existsSync(file)) {
    throw new Error(`Unknown theme "${id}". Built-in themes: ${BUILTIN_THEMES.join(", ")}`);
  }
  return { id, css: resolveVars(fs.readFileSync(file, "utf-8")) };
}

/** Load a user-supplied CSS file as a one-off theme (same variable resolution). */
export function loadThemeFromCss(cssFile: string): Theme {
  return { id: "custom", css: resolveVars(fs.readFileSync(cssFile, "utf-8")) };
}

/** highlight.js theme css, with the base .hljs block background removed so the
 *  article theme's code block styling stays authoritative.
 *  Throws a friendly error where the styles directory cannot be located
 *  (e.g. CJS-embedded plugin) — callers should pass highlightCss instead. */
export function loadHighlightCss(id: string): string {
  // Highlight IDs are filenames, never paths. Reject separators before
  // joining to prevent reading CSS outside highlight.js/styles.
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) {
    throw new Error("Invalid highlight theme id: expected a theme filename without path separators");
  }
  const req = requireHere();
  if (!req) {
    throw new Error(`Cannot locate highlight.js styles in this environment — pass highlightCss as text instead (theme: ${id})`);
  }
  const hljsRoot = path.dirname(req.resolve("highlight.js/package.json"));
  const cssPath = path.join(hljsRoot, "styles", `${id}.css`);
  if (!fs.existsSync(cssPath)) {
    const available = fs
      .readdirSync(path.join(hljsRoot, "styles"))
      .filter((f) => f.endsWith(".css") && !f.includes(".min."))
      .map((f) => f.replace(/\.css$/, ""));
    throw new Error(`Unknown highlight theme "${id}". Available: ${available.join(", ")}`);
  }
  let css = fs.readFileSync(cssPath, "utf-8");
  css = css.replace(/(^|\n)\s*\.hljs\s*\{[^}]*\}/g, "$1");
  return css;
}
