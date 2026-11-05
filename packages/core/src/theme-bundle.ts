// Content-only article themes. Bundles are data, never npm packages or code.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as cssTree from "css-tree/dist/csstree.esm";

export interface ThemeBundle { format: "publy-theme-v1"; id: string; version: string; name: string; license: string; css: string; cssSha256: string }
const MAX_BYTES = 256 * 1024;
const ID = /^[a-z][a-z0-9-]{0,47}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SAFE_PROPERTIES = new Set(["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-decoration", "text-indent", "white-space", "word-break", "overflow-wrap", "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-style", "border-width", "border-radius", "width", "max-width", "min-width", "height", "max-height", "min-height", "display", "vertical-align", "list-style-type", "box-sizing"]);
const VALUE_NODES = new Set(["Value", "Identifier", "Number", "Dimension", "Percentage", "Hash", "String", "Operator", "Function"]);
const SAFE_FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla"]);
function invalid(code = "THEME_INVALID_BUNDLE"): never { throw new Error(code); }
export function themeBundleDirectory(): string { return process.env.PUBLY_THEME_DIR || path.join(os.homedir(), ".publy", "themes"); }
export function validateThemeBundle(raw: string): ThemeBundle {
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) invalid();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return invalid(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const b = value as Record<string, unknown>;
  const keys = ["format", "id", "version", "name", "license", "css", "cssSha256"];
  if (Object.keys(b).length !== keys.length || keys.some(k => !Object.hasOwn(b, k))) invalid();
  if (b.format !== "publy-theme-v1" || typeof b.id !== "string" || !ID.test(b.id) || typeof b.version !== "string" || b.version.length > 40 || !VERSION.test(b.version) ||
      typeof b.name !== "string" || b.name.trim() !== b.name || !b.name.length || b.name.length > 80 || /[\x00-\x1f<>]/.test(b.name) ||
      typeof b.license !== "string" || !/^[A-Za-z0-9.+-]{1,80}$/.test(b.license) || typeof b.css !== "string" ||
      typeof b.cssSha256 !== "string" || !/^[a-f0-9]{64}$/.test(b.cssSha256)) invalid();
  if (crypto.createHash("sha256").update(b.css as string, "utf8").digest("hex") !== b.cssSha256) invalid("THEME_CSS_HASH_MISMATCH");
  const css = b.css as string;
  // Reject escaping and markup before parsing: they can disguise resource URLs
  // or terminate a style element when rendered into an HTML preview.
  if (!css.trim() || /[\\<>@\x00-\x08\x0b\x0c\x0e-\x1f]/.test(css) || css.includes("/*")) invalid("THEME_UNSAFE_CSS");
  let ast: cssTree.CssNode;
  try { ast = cssTree.parse(css, { onParseError: () => invalid("THEME_UNSAFE_CSS") }); } catch { return invalid("THEME_UNSAFE_CSS"); }
  if (ast.type !== "StyleSheet" || ast.children.isEmpty) invalid("THEME_UNSAFE_CSS");
  ast.children.forEach(rule => {
    if (rule.type !== "Rule" || rule.prelude.type !== "SelectorList") invalid("THEME_UNSAFE_CSS");
    rule.prelude.children.forEach(selector => {
      if (selector.type !== "Selector" || selector.children.isEmpty) invalid("THEME_UNSAFE_CSS");
      let first = true;
      selector.children.forEach(node => {
        if (first) { if (node.type !== "IdSelector" || node.name !== "publy") invalid("THEME_UNSAFE_CSS"); first = false; }
        else if (!(["Combinator", "TypeSelector", "ClassSelector"] as string[]).includes(node.type) ||
          (node.type === "Combinator" && ![" ", ">"].includes(node.name))) invalid("THEME_UNSAFE_CSS");
      });
    });
    if (rule.block.children.isEmpty) invalid("THEME_UNSAFE_CSS");
    rule.block.children.forEach(decl => {
      if (decl.type !== "Declaration" || !SAFE_PROPERTIES.has(decl.property.toLowerCase()) || decl.important || decl.value.type !== "Value") invalid("THEME_UNSAFE_CSS");
      cssTree.walk(decl.value, node => {
        if (!VALUE_NODES.has(node.type) || (node.type === "Function" && !SAFE_FUNCTIONS.has(node.name.toLowerCase()))) invalid("THEME_UNSAFE_CSS");
      });
      if (cssTree.lexer.matchProperty(decl.property, decl.value).error) invalid("THEME_UNSAFE_CSS");
    });
  });
  return b as unknown as ThemeBundle;
}
export function readInstalledTheme(id: string): ThemeBundle {
  if (!ID.test(id)) return invalid();
  const file = path.join(themeBundleDirectory(), `${id}.json`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) invalid();
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size > MAX_BYTES || opened.dev !== stat.dev || opened.ino !== stat.ino) invalid();
    const bytes = Buffer.alloc(MAX_BYTES + 1); const length = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (length > MAX_BYTES) invalid();
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length));
    const bundle = validateThemeBundle(raw);
    if (bundle.id !== id) invalid();
    return bundle;
  } finally { fs.closeSync(fd); }
}

/** Install only after full validation. A user-provided bundle is never executed. */
export function installThemeBundle(raw: string, mode: "add" | "update", reserved: readonly string[] = []): ThemeBundle {
  const bundle = validateThemeBundle(raw);
  if (reserved.includes(bundle.id)) throw new Error("THEME_RESERVED_ID");
  const dir = themeBundleDirectory();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = path.join(dir, `${bundle.id}.json`);
  if (mode === "update") {
    const previous = readInstalledTheme(bundle.id);
    if (previous.version === bundle.version) throw new Error("THEME_VERSION_UNCHANGED");
  }
  const temporary = path.join(dir, `.theme-${crypto.randomBytes(16).toString("hex")}.tmp`);
  try {
    fs.writeFileSync(temporary, raw, { flag: "wx", mode: 0o600 });
    if (mode === "add") { fs.linkSync(temporary, target); }
    else { fs.renameSync(temporary, target); }
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return bundle;
}
export function listInstalledThemes(): ThemeBundle[] {
  let names: string[];
  try { names = fs.readdirSync(themeBundleDirectory()); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return names.filter(name => /^[a-z][a-z0-9-]{0,47}\.json$/.test(name)).sort().map(name => readInstalledTheme(name.slice(0, -5)));
}
export function removeInstalledTheme(id: string): void {
  if (!ID.test(id)) invalid();
  const file = path.join(themeBundleDirectory(), `${id}.json`);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) invalid();
  fs.unlinkSync(file);
}
