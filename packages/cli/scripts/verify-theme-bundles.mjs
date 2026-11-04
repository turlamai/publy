#!/usr/bin/env node
// Synthetic theme lifecycle: never touches an existing vault or user config.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "publy-theme-fixture-"));
const env = { ...process.env, PUBLY_THEME_DIR: path.join(tmp, "themes"), PUBLY_CONFIG: path.join(tmp, "config.json") };
let previewDir;
function cli(...args) {
  const preload = env.PUBLY_FETCH_FIXTURE ? ["--import", pathToFileURL(env.PUBLY_FETCH_FIXTURE).href] : [];
  const result = spawnSync(process.execPath, [...preload, path.join(root, "dist", "index.js"), "theme", ...args, "--json"], { env, encoding: "utf8" });
  assert.equal(result.signal, null); assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout); return { status: result.status, output };
}
function bundle(version, css) {
  const file = path.join(tmp, "bundle.json");
  const data = { format: "publy-theme-v1", id: "fixture", version, name: "Fixture", license: "MIT", css, cssSha256: crypto.createHash("sha256").update(css).digest("hex") };
  fs.writeFileSync(file, JSON.stringify(data)); return file;
}
try {
  const discover = spawnSync(process.execPath, [path.join(root, "dist", "index.js"), "capabilities", "--json"], { env, encoding: "utf8" });
  assert.equal(discover.status, 0); const commands = JSON.parse(discover.stdout).commands;
  for (const name of ["theme pack", "theme add", "theme update", "theme remove"]) {
    const command = commands.find(item => item.name === name);
    assert.equal(command.requiresUserApproval, true); assert.ok(command.usage);
  }
  const cssFile = path.join(tmp, "source.css"), packedFile = path.join(tmp, "packed.json");
  fs.writeFileSync(cssFile, "#publy p { color: #123456; margin: 1px 2px }");
  const pack = cli("pack", cssFile, "--id", "fixture", "--theme-version", "1.0.0", "--name", "Fixture", "--license", "MIT", "--output", packedFile);
  assert.equal(pack.output.ok, true); assert.equal(pack.output.sha256, crypto.createHash("sha256").update(fs.readFileSync(packedFile)).digest("hex"));
  assert.equal(cli("pack", cssFile, "--id", "fixture", "--theme-version", "1.0.0", "--name", "Fixture", "--license", "MIT", "--output", packedFile).output.ok, false);
  let source = packedFile;
  assert.equal(cli("add", source).output.ok, true);
  assert.equal(cli("add", source).output.ok, false);
  assert.equal(cli("ls").output.installedArticleThemes[0].id, "fixture");
  const preview = cli("preview", "fixture"); assert.equal(preview.output.ok, true);
  previewDir = path.dirname(preview.output.output);
  assert.match(fs.readFileSync(preview.output.output, "utf8"), /#123456/i);
  source = bundle("1.0.1", "#publy p { color: blue }");
  assert.equal(cli("update", source).output.ok, true);
  assert.equal(cli("update", source, "--sha256", "0".repeat(64)).output.ok, false);
  assert.equal(cli("add", "https://example.test/theme.json").output.ok, false); // Requires pin before network.
  assert.equal(cli("remove", "fixture").output.ok, true);
  assert.deepEqual(fs.readdirSync(env.PUBLY_THEME_DIR), []);
  const hook = path.join(tmp, "fetch-fixture.mjs");
  fs.writeFileSync(hook, `globalThis.fetch = async (_url, options) => { if (options.redirect !== "manual") throw Error("redirect policy"); return new Response(Buffer.from(process.env.PUBLY_FETCH_BYTES, "base64"), { status: Number(process.env.PUBLY_FETCH_STATUS || 200) }); };`);
  env.PUBLY_FETCH_FIXTURE = hook;
  env.PUBLY_FETCH_BYTES = fs.readFileSync(packedFile).toString("base64");
  const digest = crypto.createHash("sha256").update(fs.readFileSync(packedFile)).digest("hex");
  assert.equal(cli("add", "https://themes.example.test/a", "--sha256", "0".repeat(64)).output.ok, false);
  env.PUBLY_FETCH_STATUS = "302";
  assert.equal(cli("add", "https://themes.example.test/a", "--sha256", digest).output.ok, false);
  env.PUBLY_FETCH_STATUS = "200";
  const remote = cli("add", "https://themes.example.test/a", "--sha256", digest.toUpperCase()).output;
  assert.equal(remote.ok, true); assert.equal(remote.networkUsed, true);
  fs.writeFileSync(path.join(env.PUBLY_THEME_DIR, "fixture.json"), "corrupt");
  const invalidList = cli("ls"); assert.equal(invalidList.status, 2); assert.equal(invalidList.output.code, "THEME_LIST_FAILED");
  assert.equal(cli("remove", "fixture").output.ok, true);
  console.log("Theme bundle lifecycle passed");
} finally {
  if (previewDir) fs.rmSync(previewDir, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}
