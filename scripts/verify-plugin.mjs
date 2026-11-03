// Plugin acceptance: loads the BUILT plugin from a vault-like layout with a
// stubbed obsidian/electron environment, runs onload + the main command paths,
// and asserts the observable effects. Run after `pnpm -r build`:
//
//   node scripts/verify-plugin.mjs [vault-plugin-dir]
//
// With an argument, the prepared plugin dir is used as-is (vault layout).

import fs from "node:fs";
import Module from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const distDir = path.join(repoRoot, "packages", "obsidian-plugin", "dist");
const communityOnly = process.argv.includes("--community-only");
// An isolated simulated Community Directory install must use ONLY the three
// files fetched by Obsidian. Side-loaded ZIPs are a different contract.
const args = process.argv.slice(2).filter((x) => x !== "--community-only");
if (args.length > 1) throw new Error("usage: verify-plugin.mjs [--community-only] [plugin-directory]");
const suppliedPluginDir = args[0];
// A supplied directory represents an already-prepared install. Never replace
// its files with local dist output or remove its sidecars: doing so could make
// a broken release appear to pass, and would mutate the caller's vault.
const pluginDir = suppliedPluginDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "publy-plugin-verify-"));
const communityFiles = ["main.js", "manifest.json", "styles.css"];

if (suppliedPluginDir === undefined) {
  // Only synthesize an installation when no directory was supplied.
  for (const f of (communityOnly
    ? communityFiles
    : [...communityFiles, "versions.json"])) {
    fs.copyFileSync(path.join(distDir, f), path.join(pluginDir, f));
  }
  if (!communityOnly) {
    for (const dir of ["node_modules", "fonts"]) {
      if (fs.existsSync(path.join(distDir, dir))) {
        fs.cpSync(path.join(distDir, dir), path.join(pluginDir, dir), { recursive: true });
      }
    }
  }
}
if (communityOnly) {
  // The Community Directory downloads exactly three release files. Reject
  // extra files/directories rather than silently deleting or ignoring them.
  const actual = fs.readdirSync(pluginDir);
  const missing = communityFiles.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !communityFiles.includes(name));
  if (missing.length || unexpected.length) {
    throw new Error(
      "Community Directory install must contain exactly main.js, manifest.json, styles.css" +
      "; missing: " + (missing.join(", ") || "none") +
      "; unexpected: " + (unexpected.join(", ") || "none"),
    );
  }
}

// --- stubs -------------------------------------------------------------------

const calls = [];
let lastSubmitted = null;
let nextPublishResponse = null;
let nextQueryResponse = null;
let lastPreviewHtml = "";

class Component {
  replaceChildren(...children) { this.children = children; }
  empty() { this.children = []; }
  createEl() { return { children: [], style: {} }; }
  appendChild() {}
}

class ItemView {
  constructor() { this.contentEl = new Component(); }
  getViewType() { return "publy-preview"; }
  getDisplayText() { return "Publy 预览"; }
  getIcon() { return "send"; }
  async onOpen() {}
  async onClose() {}
  setHtml(html) { lastPreviewHtml = html; calls.push("view.setHtml(" + html.length + " chars)"); }
  beginCards() { this.cards = []; calls.push("view.beginCards"); }
  appendCard(b64) { if (typeof b64 !== "string" || b64.length === 0) throw new Error("empty rendered card"); this.cards.push(b64); }
  finishCards(caption) { calls.push("view.setCards(" + this.cards.length + " cards)"); }
  setPublishing(state) { calls.push("view.setPublishing:" + state); }
  setCards(cards, caption) { calls.push("view.setCards(" + cards.length + " cards)"); }
  renderMessage(text) { calls.push("view.renderMessage:" + String(text).slice(0, 40)); }
  renderLoading() { calls.push("view.renderLoading"); }
  renderHistory(jobs, entries) { calls.push("view.renderHistory(jobs=" + jobs.length + ",entries=" + entries.length + ")"); }
}
class WorkspaceLeaf {
  constructor() { this.view = null; }
  async setViewState(state) {
    this.view = new ItemView(this);
    this.view.getViewType = () => state.type;
  }
}
class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; }
  async loadData() { return {}; }
  async saveData() {}
  addRibbonIcon() { calls.push("ribbon"); }
  addCommand(cmd) { calls.push("command:" + cmd.id); this.app.commands.commands[cmd.id] = { callback: cmd.callback }; }
  addSettingTab() { calls.push("settingsTab"); }
  registerView() {}
  registerEvent() {}
  addStatusBarItem() { calls.push("statusbar"); return { setText: (t) => calls.push("status:" + t) }; }
}
class Notice {
  constructor(msg) { calls.push("notice:" + String(msg).slice(0, 140)); }
  setMessage(msg) { return this; }
  hide() {}
}
class PluginSettingTab {
  constructor() { this.containerEl = new Component(); }
  display() {}
}
class App {
  constructor(vaultContentByPath) {
    this.vaultContentByPath = vaultContentByPath;
    this.commands = { commands: {} };
    this.workspace = {
      activeFile: null,
      getActiveFile: () => this.workspace.activeFile,
      setActiveFile: (f) => { this.workspace.activeFile = f; },
      getLeavesOfType: () => [],
      on: () => {},
      getRightLeaf: () => this.leaf,
      revealLeaf: () => {},
      cachedRead: async (file) => this.vaultContentByPath[file.path] ?? "",
      adapter: { getBasePath: () => os.tmpdir() },
    };
    this.vault = this.workspace;
    this.leaf = new WorkspaceLeaf();
    this.leaf.view = new ItemView(this.leaf);
  }
}
class Setting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addDropdown() { return this; }
  addButton() { return this; }
}
class Modal {
  constructor() { this.contentEl = new Component(); }
  open() {
    calls.push("modal.open");
    // simulate the user confirming the dialog's default choice (the auto
    // title card for the cover picker) — the real onOpen renders a DOM the
    // stub does not model
    if (typeof this.onPick === "function") {
      this.picked = true;
      this.onPick("auto");
    }
    this.close();
  }
  close() {}
  onOpen() {}
  onClose() {}
}
class TFile { path = ""; }
const stub = { Plugin, ItemView, WorkspaceLeaf, Notice, PluginSettingTab, App, Setting, TFile, Modal, sanitizeHTMLToDom: (html) => ({ html }), requestUrl: async (req) => {
  calls.push("server-request:" + req.method + ":" + new URL(req.url).pathname);
  if (req.method === "POST" && new URL(req.url).pathname === "/v1/publish") {
    lastSubmitted = JSON.parse(req.body);
    calls.push("request:publish");
    const response = nextPublishResponse ?? { mediaId: "SYNTHETIC-DRAFT", account: lastSubmitted.account, title: lastSubmitted.title, requestId: lastSubmitted.idempotencyKey };
    nextPublishResponse = null;
    return { json: response, status: 200 };
  }
  if (new URL(req.url).pathname.startsWith("/v1/publish-result/")) {
    const response = nextQueryResponse ?? { status: "unknown" };
    nextQueryResponse = null;
    return { json: response, status: 200 };
  }
  return { json: {}, status: 200 };
} };

// intercept module loading for obsidian/electron
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "obsidian") return stub;
  if (request === "electron") return { shell: { openPath: async (p) => { calls.push("shell.openPath:" + p); return ""; } } };
  if (communityOnly && !Module.isBuiltin(request) &&
      path.resolve(request) !== path.join(pluginDir, "main.js")) {
    throw new Error("unexpected runtime package require: " + request);
  }
  return origLoad.apply(this, arguments);
};

// --- drive the plugin --------------------------------------------------------

// Deny network from bundle evaluation through onload and local rendering.
const realFetch = globalThis.fetch;
let renderNetworkAttempts = 0;
globalThis.fetch = async (url) => {
  // Satori decodes its embedded Yoga WASM through a data URL. This is
  // bundle-local bytes, not a network or filesystem resource.
  if (typeof url === "string" && url.startsWith("data:")) return realFetch(url);
  renderNetworkAttempts++;
  throw new Error("offline Obsidian rendering attempted a network fetch");
};
// Obsidian may already have loaded its own incompatible MathJax. The
// bundled renderer must neither call its loader nor replace its state.
const hostMathJax = Object.freeze({ version: "host-mathjax", loader: Object.freeze({}) });
globalThis.MathJax = hostMathJax;
const mainJs = path.join(pluginDir, "main.js");
const req = createRequire(import.meta.url);
const mod = req(path.resolve(mainJs));
const PluginCls = mod.default;
if (typeof PluginCls !== "function") throw new Error("no default export");

const articleSample = fs.readFileSync(path.join(repoRoot, "packages", "cli", "samples", "article-sample.md"), "utf8");
const cardSample = fs.readFileSync(path.join(repoRoot, "packages", "cli", "samples", "card-sample.md"), "utf8");
const app = new App({
  "samples/article-sample.md": articleSample,
  "samples/card-sample.md": cardSample,
});
const inst = new PluginCls(app, { dir: pluginDir, id: "publy", name: "Publy", version: "0.1.0" });

const fail = (msg) => { console.error("FAIL:", msg); console.error("calls:", calls.join(" | ")); process.exit(1); };

await inst.onload();
if (!calls.includes("ribbon")) fail("ribbon not registered");
if (!calls.some((c) => c.startsWith("command:"))) fail("commands not registered");

// Clipboard preflight must never report success with unresolved attachment://
// references or unrendered formulas. No remote account or OS clipboard touched.
{
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalClipboardItem = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  const writes = [];
  Object.defineProperty(globalThis, "navigator", {
    configurable: true, value: { clipboard: { write: async (items) => { writes.push(items); } } },
  });
  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true, value: class ClipboardItem { constructor(data) { this.data = data; } },
  });
  const imageName = "publy-clipboard-smoke-" + process.pid + ".png";
  const imagePath = path.join(os.tmpdir(), imageName);
  fs.writeFileSync(imagePath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ));
  const copy = async (file, source) => {
    const filePath = "samples/" + file + ".md";
    app.vaultContentByPath[filePath] = source;
    await inst.copyRenderedHtml({ path: filePath, basename: file, extension: "md" });
  };
  try {
    await copy("copy-plain", "# A safe note\n\nHello **world**.");
    if (writes.length !== 1) fail("plain text-only copy should use clipboard exactly once");
    const copiedHtml = await writes[0][0].data["text/html"].text();
    if (!copiedHtml.includes("Hello") || !/<strong\b[^>]*>world<\/strong>/.test(copiedHtml)) {
      fail("successful text-only copy lost the rendered content");
    }
    await copy("copy-valid-formula", "# Formula\n\nInline $E=mc^2$.");
    if (writes.length !== 1) fail("rendered formula attachments must not copy unresolved links");
    await copy("copy-invalid-formula", String.raw`Bad formula $\frac{$ should not silently become pasted text.`);
    if (writes.length !== 1) fail("invalid formula must not modify clipboard");
    await copy("copy-image", "# Attachment\n\n![tiny](" + imageName + ")");
    if (writes.length !== 1) fail("image attachments must not copy unusable attachment:// URLs");
    await copy("copy-missing-image", "# Missing\n\n![lost](missing-publy-clipboard.png)");
    if (writes.length !== 1) fail("missing images must not modify clipboard");
  } finally {
    fs.rmSync(imagePath, { force: true });
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    if (originalClipboardItem) Object.defineProperty(globalThis, "ClipboardItem", originalClipboardItem);
    else delete globalThis.ClipboardItem;
  }
}


// article render into the in-app preview view
app.workspace.activeFile = { path: "samples/article-sample.md", basename: "article-sample", extension: "md" };
await inst.previewCurrentNote(); // smart dispatch -> article
if (!calls.some((c) => c.startsWith("view.setHtml("))) fail("article preview did not render — calls: " + calls.join(" | "));

// Valid TeX must become real PNGs, not a raw-TeX fallback that merely makes
// article preview appear successful when MathJax is absent.
app.vaultContentByPath["samples/math.md"] = "# Math\n\nInline $E=mc^2$.\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n";
app.workspace.activeFile = { path: "samples/math.md", basename: "math", extension: "md" };
await inst.previewCurrentNote();
const mathPngs = [...lastPreviewHtml.matchAll(/src="data:image\/png;base64,([^"\s]+)"/g)];
if (mathPngs.length !== 2) fail("inline and block math must render two PNGs without sidecars");
for (const [, data] of mathPngs) {
  const bytes = Buffer.from(data, "base64");
  if (bytes.length < 500 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    fail("formula output is not a nonempty PNG");
  }
}
if (calls.some((c) => c.startsWith("server-request:"))) fail("local preview contacted the server");

// card deck render into the in-app preview view (wasm + satori + harfbuzzjs)
app.workspace.activeFile = { path: "samples/card-sample.md", basename: "card-sample", extension: "md" };
try {
  await inst.previewCurrentNote(); // smart dispatch -> card deck
  // Resvg retains module state across disable/enable. A second onload must
  // accept already-initialized WASM and still render formula PNGs.
  delete req.cache[req.resolve(path.resolve(mainJs))];
  const ReloadedPlugin = req(path.resolve(mainJs)).default;
  const reloaded = new ReloadedPlugin(app, inst.manifest);
  await reloaded.onload();
  lastPreviewHtml = "";
  app.workspace.activeFile = { path: "samples/math.md", basename: "math", extension: "md" };
  await reloaded.previewCurrentNote();
  if ([...lastPreviewHtml.matchAll(/src="data:image\/png;base64,/g)].length !== 2) {
    fail("math preview failed after plugin reload");
  }
} finally {
  globalThis.fetch = realFetch;
}
if (globalThis.MathJax !== hostMathJax) fail("plugin replaced the host MathJax instance");
if (renderNetworkAttempts !== 0) fail("offline initialization/preview attempted a network fetch");
if (!calls.some((c) => c.startsWith("view.setCards("))) fail("card preview did not render — calls: " + calls.join(" | "));

// history view renders from the (stub) server API
inst.settings = { ...inst.settings, server: "https://stub.test", apiKey: "k", account: "a" };
await inst.openHistory();
if (!calls.some((c) => c.startsWith("view.renderHistory("))) fail("history did not render — calls: " + calls.join(" | "));

// publish path: stub server 200s → success toast with title + duration
app.workspace.activeFile = { path: "samples/article-sample.md", basename: "article-sample", extension: "md", stat: { mtime: Date.now() } };
await inst.publishCurrentNote();
if (!calls.some((c) => c.includes("WeChat drafts"))) fail("publish success toast missing — calls: " + calls.join(" | "));
const dupes = calls.filter((c) => c.includes("WeChat drafts")).length;
if (dupes !== 1) fail("unexpected publish toast count: " + dupes);

// A bare HTTP 200 or a confirmation without a media ID is not proof.
const confirmedBefore = calls.filter((c) => c.startsWith("notice:✅")).length;
nextPublishResponse = {};
await inst.publishCurrentNote();
const ambiguousKey = lastSubmitted?.idempotencyKey;
if (!ambiguousKey || inst.lastAttempt?.key !== ambiguousKey) fail("empty acknowledgement must remain unknown");
if (calls.filter((c) => c.startsWith("notice:✅")).length !== confirmedBefore) fail("empty acknowledgement was treated as confirmed");
nextQueryResponse = { status: "confirmed" };
await inst.queryLastAttempt();
if (inst.lastAttempt?.key !== ambiguousKey) fail("confirmation without a media ID must remain unknown");

// The broken image may be previewed locally, but must never be submitted.
const beforeBlocked = calls.filter((c) => c === "request:publish").length;
const brokenAsset = "publy-verified-missing-image-unique-20261030.png";
app.vaultContentByPath["samples/broken-media.md"] = "# Broken media\n\n![unavailable](" + brokenAsset + ")";
app.workspace.activeFile = {
  path: "samples/broken-media.md", basename: "broken-media", extension: "md",
  stat: { mtime: Date.now() },
};
await inst.publishCurrentNote();
if (calls.filter((c) => c === "request:publish").length !== beforeBlocked) {
  fail("missing image must block WeChat draft submission");
}
if (!calls.some((c) => c.includes("素材未就绪") || c.includes("Media not ready"))) {
  fail("missing-image user-facing error not displayed");
}

// Frontmatter cover need not be present in the article body. A valid PNG
// must be attached to the submitted draft without reopening a cover picker.
const coverPath = path.join(os.tmpdir(), "publy-cover-synthetic-" + process.pid + ".png");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
fs.writeFileSync(coverPath, png);
try {
  app.vaultContentByPath["samples/standalone-cover.md"] =
    "---\ntitle: Explicit Cover\ncover: " + coverPath.split(path.sep).join("/") + "\n---\n\n# Article with a cover not in body";
  app.workspace.activeFile = {
    path: "samples/standalone-cover.md", basename: "standalone-cover", extension: "md",
    stat: { mtime: Date.now() },
  };
  const previousPostCount = calls.filter((c) => c === "request:publish").length;
  await inst.publishCurrentNote();
  if (calls.filter((c) => c === "request:publish").length !== previousPostCount + 1) {
    fail("frontmatter-only cover did not submit a draft");
  }
  if (!lastSubmitted?.cover) fail("frontmatter-only cover not selected");
  const matched = lastSubmitted.images?.find((img) => img.name === lastSubmitted.cover);
  if (!matched || matched.contentType !== "image/png" || matched.data !== png.toString("base64")) {
    fail("frontmatter-only cover was not included as exact PNG material");
  }
} finally {
  fs.rmSync(coverPath, { force: true });
}

// Card mode must submit generated PNGs, not just preview them. A successful
// toast with an empty images array would be a severe user-facing regression.
app.workspace.activeFile = {
  path: "samples/card-sample.md", basename: "card-sample", extension: "md",
  stat: { mtime: Date.now() },
};
const beforeCards = calls.filter((c) => c === "request:publish").length;
await inst.publishCurrentNote();
if (calls.filter((c) => c === "request:publish").length !== beforeCards + 1) {
  fail("card mode did not send the WeChat image-post draft");
}
if (lastSubmitted?.type !== "image_post" || lastSubmitted.images?.length !== 4) {
  fail("card draft must include four PNG files and image_post type");
}
if (lastSubmitted.cover !== lastSubmitted.images[0].name) {
  fail("card draft cover should be the first generated card");
}
for (const img of lastSubmitted.images) {
  if (img.contentType !== "image/png" || !Buffer.from(img.data, "base64").subarray(0, 4)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    fail("card image-post payload includes a non-PNG attachment");
  }
}
if (!lastSubmitted.html?.includes("Publy")) {
  fail("card image post caption was not included in draft HTML");
}

// Re-submitting byte-identical content has the same retry identity. A
// same-length edit to an existing note (unchanged path and mtime) must have
// a different identity, otherwise WeChat's server could silently dedupe it.
const idCover = path.join(os.tmpdir(), "publy-id-identity-" + process.pid + ".png");
fs.writeFileSync(idCover, png);
try {
  const identityPath = "samples/idempotency.md";
  const identitySource = (headline) =>
    "---\ncover: " + idCover.split(path.sep).join("/") + "\n---\n\n# " + headline;
  app.vaultContentByPath[identityPath] = identitySource("Alpha");
  app.workspace.activeFile = {
    path: identityPath, basename: "idempotency", extension: "md",
    stat: { mtime: 1700000000000 },
  };
  await inst.publishCurrentNote();
  const first = lastSubmitted;
  if (!first?.idempotencyKey || !first.html?.includes("Alpha")) {
    fail("first identity draft not submitted");
  }
  await inst.publishCurrentNote();
  if (lastSubmitted?.idempotencyKey !== first.idempotencyKey) {
    fail("identical draft retry changed identity");
  }
  app.vaultContentByPath[identityPath] = identitySource("Omega");
  await inst.publishCurrentNote();
  if (!lastSubmitted?.html?.includes("Omega") ||
      lastSubmitted.html.length !== first.html.length) {
    fail("identity fixture must render same-length different HTML");
  }
  if (lastSubmitted.idempotencyKey === first.idempotencyKey) {
    fail("same-length edited note was wrongly deduped");
  }
} finally {
  fs.rmSync(idCover, { force: true });
}

console.log(`PASS — ${communityOnly ? "simulated Community Directory three-file install" : "side-loaded development bundle"}: onload, offline article/math/card preview, history, simulated publish`);
