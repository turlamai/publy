// Content-only article themes. Bundles are data, never npm packages or code.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as cssTree from "css-tree/dist/csstree.esm";

export interface ThemeSignature { alg: "ed25519"; publicKey: string; signature: string }
export interface ThemeBundle {
  format: "publy-theme-v1" | "publy-theme-v2";
  id: string; version: string; name: string; license: string; css: string; cssSha256: string;
  /** v2 only: detached Ed25519 signature over the metadata and CSS hash. */
  signature?: ThemeSignature;
}
const MAX_BYTES = 256 * 1024;
const ID = /^[a-z][a-z0-9-]{0,47}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SAFE_PROPERTIES = new Set(["color", "background-color", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "text-align", "text-decoration", "text-indent", "white-space", "word-break", "overflow-wrap", "margin", "margin-top", "margin-right", "margin-bottom", "margin-left", "padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "border-style", "border-width", "border-radius", "width", "max-width", "min-width", "height", "max-height", "min-height", "display", "vertical-align", "list-style-type", "box-sizing"]);
const VALUE_NODES = new Set(["Value", "Identifier", "Number", "Dimension", "Percentage", "Hash", "String", "Operator", "Function"]);
const SAFE_FUNCTIONS = new Set(["rgb", "rgba", "hsl", "hsla"]);
function invalid(code = "THEME_INVALID_BUNDLE"): never { throw new Error(code); }
export function themeBundleDirectory(): string { return process.env.PUBLY_THEME_DIR || path.join(os.homedir(), ".publy", "themes"); }
const BASE_KEYS = ["format", "id", "version", "name", "license", "css", "cssSha256"] as const;
const PUBLIC_KEY_BYTES = 44;
const SIGNATURE_BYTES = 64;

/** Canonical bytes a theme publisher signs; deliberately excludes the
 *  signature itself and any HTML/markup. Both sides must build it identically
 *  or verification fails closed. */
export function themeSignaturePayload(bundle: Pick<ThemeBundle, "format" | "id" | "version" | "name" | "license" | "cssSha256">): Buffer {
  return Buffer.from(
    ["publy-theme", bundle.format, bundle.id, bundle.version, bundle.name, bundle.license, bundle.cssSha256].join("\n"),
    "utf8",
  );
}

function canonicalBase64(value: unknown, expectedBytes: number): Buffer | null {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, "base64");
  if (bytes.length !== expectedBytes || bytes.toString("base64") !== value) return null;
  return bytes;
}

/** Decode a trusted Ed25519 public key (base64 SPKI DER). Shared with the CLI
 *  so a pin is rejected before any download happens. */
export function decodeThemePublicKey(value: string): crypto.KeyObject {
  const der = canonicalBase64(value, PUBLIC_KEY_BYTES);
  if (!der) throw new Error("THEME_SIGNING_KEY_INVALID");
  let key: crypto.KeyObject;
  try { key = crypto.createPublicKey({ key: der, format: "der", type: "spki" }); }
  catch { return handleInvalidKey(); }
  if (key.asymmetricKeyType !== "ed25519") return handleInvalidKey();
  return key;
}

function handleInvalidKey(): never { throw new Error("THEME_SIGNING_KEY_INVALID"); }

function verifySignature(bundle: ThemeBundle): void {
  const signature = bundle.signature;
  if (!signature || typeof signature !== "object" || Array.isArray(signature)) invalid("THEME_SIGNATURE_INVALID");
  const keys = Object.keys(signature);
  if (keys.length !== 3 || keys.some((key) => !["alg", "publicKey", "signature"].includes(key))) invalid("THEME_SIGNATURE_INVALID");
  if (signature.alg !== "ed25519") invalid("THEME_SIGNATURE_INVALID");
  const publicDer = canonicalBase64(signature.publicKey, PUBLIC_KEY_BYTES);
  const signatureBytes = canonicalBase64(signature.signature, SIGNATURE_BYTES);
  if (!publicDer || !signatureBytes) invalid("THEME_SIGNATURE_INVALID");
  let key: crypto.KeyObject;
  try { key = crypto.createPublicKey({ key: publicDer, format: "der", type: "spki" }); }
  catch { return invalid("THEME_SIGNATURE_INVALID"); }
  if (key.asymmetricKeyType !== "ed25519") invalid("THEME_SIGNATURE_INVALID");
  if (!crypto.verify(null, themeSignaturePayload(bundle), key, signatureBytes)) invalid("THEME_SIGNATURE_INVALID");
}

export function validateThemeBundle(raw: string): ThemeBundle {
  if (Buffer.byteLength(raw, "utf8") > MAX_BYTES) invalid();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return invalid(); }
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const b = value as Record<string, unknown>;
  const signed = b.format === "publy-theme-v2";
  const keys = signed ? [...BASE_KEYS, "signature"] : [...BASE_KEYS];
  if (Object.keys(b).length !== keys.length || keys.some(k => !Object.hasOwn(b, k))) invalid();
  if ((b.format !== "publy-theme-v1" && b.format !== "publy-theme-v2") || typeof b.id !== "string" || !ID.test(b.id) || typeof b.version !== "string" || b.version.length > 40 || !VERSION.test(b.version) ||
      typeof b.name !== "string" || b.name.trim() !== b.name || !b.name.length || b.name.length > 80 || /[\x00-\x1f<>]/.test(b.name) ||
      typeof b.license !== "string" || !/^[A-Za-z0-9.+-]{1,80}$/.test(b.license) || typeof b.css !== "string" ||
      typeof b.cssSha256 !== "string" || !/^[a-f0-9]{64}$/.test(b.cssSha256)) invalid();
  if (crypto.createHash("sha256").update(b.css as string, "utf8").digest("hex") !== b.cssSha256) invalid("THEME_CSS_HASH_MISMATCH");
  const css = b.css as string;
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
  if (signed) verifySignature(b as unknown as ThemeBundle);
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
export interface ThemeInstallOptions {
  /** When set, the bundle must be v2 and signed by exactly this key. */
  trustedKey?: string;
}

export function installThemeBundle(raw: string, mode: "add" | "update", reserved: readonly string[] = [], options: ThemeInstallOptions = {}): ThemeBundle {
  const bundle = validateThemeBundle(raw);
  if (reserved.includes(bundle.id)) throw new Error("THEME_RESERVED_ID");
  if (options.trustedKey !== undefined) {
    let expected: crypto.KeyObject;
    try { expected = decodeThemePublicKey(options.trustedKey); }
    catch { throw new Error("THEME_SIGNING_KEY_INVALID"); }
    if (!bundle.signature || bundle.signature.publicKey !== options.trustedKey) throw new Error("THEME_UNTRUSTED_SIGNER");
    // Re-decode and compare the actual DER to the pin; canonical base64 equality
    // above already prevents alternate spellings of the same key.
    if (expected.asymmetricKeyType !== "ed25519") throw new Error("THEME_SIGNING_KEY_INVALID");
  }
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
